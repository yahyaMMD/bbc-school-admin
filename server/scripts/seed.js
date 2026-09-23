import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, query } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seedUsers() {
  const directorPass = process.env.DIRECTOR_PASSWORD || "Director2026";
  const adminPass = process.env.ADMIN_PASSWORD || "AdminBBC2026";
  const whatsappPass = process.env.WHATSAPP_PASSWORD || "WhatsApp2026";
  const directorHash = await bcrypt.hash(directorPass, 10);
  const adminHash = await bcrypt.hash(adminPass, 10);
  const whatsappHash = await bcrypt.hash(whatsappPass, 10);
  await query(
    `INSERT INTO app_users (role, password_hash) VALUES ($1, $2)
     ON CONFLICT (role) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
    ["director", directorHash]
  );
  await query(
    `INSERT INTO app_users (role, password_hash) VALUES ($1, $2)
     ON CONFLICT (role) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
    ["admin", adminHash]
  );
  await query(
    `INSERT INTO app_users (role, password_hash) VALUES ($1, $2)
     ON CONFLICT (role) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
    ["whatsapp", whatsappHash]
  );
  console.log("Users seeded (director / admin / whatsapp)");
}

async function seedFromJson(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

  await query("TRUNCATE students, classes, teachers, operations_issues, school_meta RESTART IDENTITY CASCADE");
  await query(
    `INSERT INTO school_meta (id, data) VALUES (1, $1::jsonb)`,
    [
      JSON.stringify({
        school: raw.school,
        primaryModules: raw.primaryModules,
        middleModules: raw.middleModules,
        meta: raw.meta,
        primary: {
          id: raw.primary.id,
          name: raw.primary.name,
          label: raw.primary.label,
          description: raw.primary.description,
          image: raw.primary.image,
          levels: raw.primary.levels.map((l) => ({
            id: l.id,
            name: l.name,
            nameAr: l.nameAr,
            subtitle: l.subtitle,
          })),
        },
        middle: {
          id: raw.middle.id,
          name: raw.middle.name,
          label: raw.middle.label,
          description: raw.middle.description,
          image: raw.middle.image,
          levels: raw.middle.levels.map((l) => ({
            id: l.id,
            name: l.name,
            nameAr: l.nameAr,
            subtitle: l.subtitle,
          })),
        },
      }),
    ]
  );

  for (const t of raw.teachers || []) {
    await query(
      `INSERT INTO teachers (id, first_name, last_name, name_latin, first_name_latin, last_name_latin, phone, wilaya, commune, modules, departments, class_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb)`,
      [
        t.id,
        t.firstName || "",
        t.lastName || "",
        t.nameLatin || "",
        t.firstNameLatin || "",
        t.lastNameLatin || "",
        t.phone || "",
        t.wilaya || "",
        t.commune || "",
        JSON.stringify(t.modules || []),
        JSON.stringify(t.departments || []),
        JSON.stringify(t.classIds || []),
      ]
    );
  }

  async function insertDept(dept) {
    for (const level of dept.levels || []) {
      for (const c of level.classes || []) {
        await query(
          `INSERT INTO classes (
            id, department_id, level_id, name, name_ar, code, year, floor, floor_raw,
            floor_number, class_on_floor, section, source_image, source_excel, modules, teacher_ids, stats
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb)`,
          [
            c.id,
            dept.id,
            level.id,
            c.name || c.code || "",
            c.nameAr || "",
            c.code,
            c.year,
            c.floor || "",
            c.floorRaw || "",
            c.floorNumber ?? null,
            c.classOnFloor ?? null,
            c.section ?? null,
            c.sourceImage || "",
            c.sourceExcel || "",
            JSON.stringify(c.modules || []),
            JSON.stringify(c.teacherIds || []),
            JSON.stringify(c.stats || {}),
          ]
        );
        for (const s of c.students || []) {
          await query(
            `INSERT INTO students (
              id, class_id, department_id, number, first_name, last_name, full_name,
              first_name_latin, last_name_latin, full_name_latin,
              date_of_birth, gender, notes, search_name, previous_year_details
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
            [
              s.id,
              c.id,
              dept.id,
              s.number || 0,
              s.firstName || "",
              s.lastName || "",
              s.fullName || "",
              s.firstNameLatin || "",
              s.lastNameLatin || "",
              s.fullNameLatin || "",
              s.dateOfBirth || "",
              s.gender || "",
              s.notes || "",
              s.searchName || s.fullName || "",
              s.previousYearDetails ? JSON.stringify(s.previousYearDetails) : null,
            ]
          );
        }
      }
    }
  }

  await insertDept(raw.primary);
  await insertDept(raw.middle);

  for (const issue of raw.operationsIssues || []) {
    await query(
      `INSERT INTO operations_issues (
        id, status, severity, title, title_ar, area, updated, summary,
        current_process, impact, goal, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)`,
      [
        issue.id,
        issue.status || "open",
        issue.severity || "medium",
        issue.title,
        issue.titleAr || "",
        issue.area || "",
        issue.updated || "",
        issue.summary || "",
        JSON.stringify(issue.currentProcess || []),
        JSON.stringify(issue.impact || []),
        issue.goal || "",
        issue.notes || "",
      ]
    );
  }

  console.log(
    `Seeded teachers=${(raw.teachers || []).length} students primary+middle from JSON`
  );
}

/** Refresh bilingual names from seed JSON without wiping other edits. */
async function backfillLatinNames(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let updatedStudents = 0;
  let updatedTeachers = 0;
  for (const dept of [raw.primary, raw.middle]) {
    for (const level of dept?.levels || []) {
      for (const c of level.classes || []) {
        for (const s of c.students || []) {
          const r = await query(
            `UPDATE students SET
              first_name = COALESCE(NULLIF($2, ''), first_name),
              last_name = COALESCE(NULLIF($3, ''), last_name),
              full_name = COALESCE(NULLIF($4, ''), full_name),
              first_name_latin = COALESCE(NULLIF($5, ''), first_name_latin),
              last_name_latin = COALESCE(NULLIF($6, ''), last_name_latin),
              full_name_latin = COALESCE(NULLIF($7, ''), full_name_latin),
              search_name = COALESCE(NULLIF($8, ''), search_name)
             WHERE id = $1`,
            [
              s.id,
              s.firstName || "",
              s.lastName || "",
              s.fullName || "",
              s.firstNameLatin || "",
              s.lastNameLatin || "",
              s.fullNameLatin || "",
              s.searchName || "",
            ]
          );
          updatedStudents += r.rowCount || 0;
        }
      }
    }
  }
  for (const t of raw.teachers || []) {
    const r = await query(
      `UPDATE teachers SET
        first_name = COALESCE(NULLIF($2, ''), first_name),
        last_name = COALESCE(NULLIF($3, ''), last_name),
        name_latin = COALESCE(NULLIF($4, ''), name_latin),
        first_name_latin = COALESCE(NULLIF($5, ''), first_name_latin),
        last_name_latin = COALESCE(NULLIF($6, ''), last_name_latin)
       WHERE id = $1`,
      [
        t.id,
        (t.firstName || "").trim(),
        (t.lastName || "").trim(),
        t.nameLatin || "",
        t.firstNameLatin || "",
        t.lastNameLatin || "",
      ]
    );
    updatedTeachers += r.rowCount || 0;
  }
  if (raw.school) {
    await query(
      `UPDATE school_meta SET data = jsonb_set(
         COALESCE(data, '{}'::jsonb), '{school}',
         COALESCE(data->'school', '{}'::jsonb) || $1::jsonb
       ) WHERE id = 1`,
      [JSON.stringify({ name: raw.school.name, nameShort: raw.school.nameShort || "Q.E.A" })]
    );
  }
  console.log(
    `Refreshed bilingual names: students=${updatedStudents} teachers=${updatedTeachers}`
  );
}

async function main() {
  const dataPath =
    process.env.SEED_JSON ||
    path.resolve(__dirname, "../../data/school_data.json");
  const force = process.env.FORCE_SEED === "1";
  await migrate();
  await seedUsers();
  const count = await query("SELECT COUNT(*)::int AS n FROM students");
  if (!force && count.rows[0].n > 0) {
    console.log(`DB already has ${count.rows[0].n} students — skip roster seed`);
    if (fs.existsSync(dataPath)) await backfillLatinNames(dataPath);
  } else if (fs.existsSync(dataPath)) {
    await seedFromJson(dataPath);
  } else {
    console.warn("No seed JSON at", dataPath);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

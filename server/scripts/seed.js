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
  const directorHash = await bcrypt.hash(directorPass, 10);
  const adminHash = await bcrypt.hash(adminPass, 10);
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
  console.log("Users seeded (director / admin)");
}

async function seedFromJson(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

  await query("DELETE FROM students");
  await query("DELETE FROM classes");
  await query("DELETE FROM teachers");
  await query("DELETE FROM operations_issues");
  await query("DELETE FROM school_meta");

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
      `INSERT INTO teachers (id, first_name, last_name, name_latin, phone, wilaya, commune, modules, departments, class_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)`,
      [
        t.id,
        t.firstName || "",
        t.lastName || "",
        t.nameLatin || "",
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
              date_of_birth, gender, notes, search_name, previous_year_details
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
            [
              s.id,
              c.id,
              dept.id,
              s.number || 0,
              s.firstName || "",
              s.lastName || "",
              s.fullName || "",
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

import { Router } from "express";
import crypto from "crypto";
import { query } from "./db.js";
import { authRequired } from "./auth.js";
import { buildSchoolData, mapTeacher, mapStudent, mapClass, mapIssue } from "./schoolData.js";

const router = Router();

function sid(prefix = "S") {
  return prefix + crypto.randomBytes(5).toString("hex").toUpperCase();
}

router.get("/health", (_req, res) => res.json({ ok: true }));

router.get("/school-data", authRequired(["director", "admin"]), async (_req, res) => {
  try {
    const data = await buildSchoolData();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load data" });
  }
});

// ——— Teachers ———
router.get("/teachers", authRequired(["director", "admin"]), async (_req, res) => {
  const r = await query("SELECT * FROM teachers ORDER BY last_name, first_name");
  res.json(r.rows.map(mapTeacher));
});

router.post("/teachers", authRequired(["admin"]), async (req, res) => {
  const b = req.body || {};
  const id = b.id || sid("T");
  await query(
    `INSERT INTO teachers (id, first_name, last_name, name_latin, phone, wilaya, commune, modules, departments, class_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)`,
    [
      id,
      b.firstName || "",
      b.lastName || "",
      b.nameLatin || "",
      b.phone || "",
      b.wilaya || "",
      b.commune || "",
      JSON.stringify(b.modules || []),
      JSON.stringify(b.departments || []),
      JSON.stringify(b.classIds || []),
    ]
  );
  const r = await query("SELECT * FROM teachers WHERE id = $1", [id]);
  res.status(201).json(mapTeacher(r.rows[0]));
});

router.put("/teachers/:id", authRequired(["admin"]), async (req, res) => {
  const b = req.body || {};
  const old = await query("SELECT class_ids FROM teachers WHERE id = $1", [req.params.id]);
  if (!old.rows.length) return res.status(404).json({ error: "Not found" });

  const r = await query(
    `UPDATE teachers SET
      first_name = COALESCE($2, first_name),
      last_name = COALESCE($3, last_name),
      name_latin = COALESCE($4, name_latin),
      phone = COALESCE($5, phone),
      wilaya = COALESCE($6, wilaya),
      commune = COALESCE($7, commune),
      modules = COALESCE($8::jsonb, modules),
      departments = COALESCE($9::jsonb, departments),
      class_ids = COALESCE($10::jsonb, class_ids)
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      b.firstName,
      b.lastName,
      b.nameLatin,
      b.phone,
      b.wilaya,
      b.commune,
      b.modules != null ? JSON.stringify(b.modules) : null,
      b.departments != null ? JSON.stringify(b.departments) : null,
      b.classIds != null ? JSON.stringify(b.classIds) : null,
    ]
  );

  // Keep class.teacher_ids in sync when classIds are updated
  if (b.classIds != null) {
    const tid = req.params.id;
    const next = new Set(b.classIds || []);
    const prev = new Set(old.rows[0].class_ids || []);
    for (const cid of prev) {
      if (!next.has(cid)) {
        await query(
          `UPDATE classes SET teacher_ids = (
             SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)
             FROM jsonb_array_elements_text(teacher_ids) AS x
             WHERE x <> $2
           ) WHERE id = $1`,
          [cid, tid]
        );
      }
    }
    for (const cid of next) {
      if (!prev.has(cid)) {
        await query(
          `UPDATE classes SET teacher_ids = (
             CASE WHEN teacher_ids ? $2 THEN teacher_ids
             ELSE COALESCE(teacher_ids, '[]'::jsonb) || to_jsonb($2::text) END
           ) WHERE id = $1`,
          [cid, tid]
        );
      }
    }
  }

  res.json(mapTeacher(r.rows[0]));
});

router.post("/students/:id/transfer", authRequired(["admin"]), async (req, res) => {
  const classId = req.body?.classId;
  if (!classId) return res.status(400).json({ error: "classId required" });
  const cls = await query("SELECT id, department_id FROM classes WHERE id = $1", [classId]);
  if (!cls.rows.length) return res.status(404).json({ error: "Target class not found" });
  const existing = await query("SELECT * FROM students WHERE id = $1", [req.params.id]);
  if (!existing.rows.length) return res.status(404).json({ error: "Student not found" });
  const oldClassId = existing.rows[0].class_id;
  const number = req.body?.number != null ? Number(req.body.number) : existing.rows[0].number;
  const r = await query(
    `UPDATE students SET class_id = $2, department_id = $3, number = $4 WHERE id = $1 RETURNING *`,
    [req.params.id, classId, cls.rows[0].department_id, number]
  );
  for (const cid of new Set([oldClassId, classId])) {
    await query(
      `UPDATE classes SET stats = jsonb_set(
         COALESCE(stats, '{}'::jsonb), '{total}',
         to_jsonb((SELECT COUNT(*)::int FROM students WHERE class_id = $1))
       ) WHERE id = $1`,
      [cid]
    );
  }
  res.json(mapStudent(r.rows[0]));
});

router.delete("/teachers/:id", authRequired(["admin"]), async (req, res) => {
  await query(
    `UPDATE classes SET teacher_ids = (
       SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)
       FROM jsonb_array_elements_text(teacher_ids) AS x
       WHERE x <> $1
     )`,
    [req.params.id]
  );
  const r = await query("DELETE FROM teachers WHERE id = $1 RETURNING id", [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ——— Classes ———
router.get("/classes", authRequired(["director", "admin"]), async (_req, res) => {
  const classes = await query("SELECT * FROM classes ORDER BY department_id, year, code");
  const students = await query("SELECT * FROM students");
  const byClass = new Map();
  for (const s of students.rows) {
    if (!byClass.has(s.class_id)) byClass.set(s.class_id, []);
    byClass.get(s.class_id).push(mapStudent(s));
  }
  res.json(classes.rows.map((c) => mapClass(c, byClass.get(c.id) || [])));
});

router.post("/classes", authRequired(["admin"]), async (req, res) => {
  const b = req.body || {};
  if (!b.departmentId || !b.code || !b.levelId || !b.year) {
    return res.status(400).json({ error: "departmentId, levelId, year, code required" });
  }
  const id = b.id || `${b.departmentId === "primary" ? "P" : "M"}-Y${b.levelId}-C${String(b.code).slice(-2)}`;
  await query(
    `INSERT INTO classes (
      id, department_id, level_id, name, name_ar, code, year, floor, floor_raw,
      floor_number, class_on_floor, section, modules, teacher_ids, stats
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb)`,
    [
      id,
      b.departmentId,
      b.levelId,
      b.name || b.code,
      b.nameAr || "",
      b.code,
      b.year,
      b.floor || "",
      b.floorRaw || "",
      b.floorNumber ?? null,
      b.classOnFloor ?? null,
      b.section ?? null,
      JSON.stringify(b.modules || []),
      JSON.stringify(b.teacherIds || []),
      JSON.stringify(b.stats || { total: 0 }),
    ]
  );
  const r = await query("SELECT * FROM classes WHERE id = $1", [id]);
  res.status(201).json(mapClass(r.rows[0], []));
});

router.put("/classes/:id", authRequired(["admin"]), async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `UPDATE classes SET
      name = COALESCE($2, name),
      name_ar = COALESCE($3, name_ar),
      code = COALESCE($4, code),
      year = COALESCE($5, year),
      floor = COALESCE($6, floor),
      floor_raw = COALESCE($7, floor_raw),
      floor_number = COALESCE($8, floor_number),
      class_on_floor = COALESCE($9, class_on_floor),
      section = COALESCE($10, section),
      modules = COALESCE($11::jsonb, modules),
      teacher_ids = COALESCE($12::jsonb, teacher_ids),
      stats = COALESCE($13::jsonb, stats),
      level_id = COALESCE($14, level_id)
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      b.name,
      b.nameAr,
      b.code,
      b.year,
      b.floor,
      b.floorRaw,
      b.floorNumber,
      b.classOnFloor,
      b.section,
      b.modules != null ? JSON.stringify(b.modules) : null,
      b.teacherIds != null ? JSON.stringify(b.teacherIds) : null,
      b.stats != null ? JSON.stringify(b.stats) : null,
      b.levelId,
    ]
  );
  if (!r.rows.length) return res.status(404).json({ error: "Not found" });
  const stu = await query("SELECT * FROM students WHERE class_id = $1 ORDER BY number", [
    req.params.id,
  ]);
  res.json(mapClass(r.rows[0], stu.rows.map(mapStudent)));
});

router.delete("/classes/:id", authRequired(["admin"]), async (req, res) => {
  const r = await query("DELETE FROM classes WHERE id = $1 RETURNING id", [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ——— Students ———
router.get("/students", authRequired(["director", "admin"]), async (req, res) => {
  const { classId, q } = req.query;
  let sql = "SELECT * FROM students WHERE 1=1";
  const params = [];
  if (classId) {
    params.push(classId);
    sql += ` AND class_id = $${params.length}`;
  }
  if (q) {
    params.push(`%${String(q).toLowerCase()}%`);
    sql += ` AND lower(full_name) LIKE $${params.length}`;
  }
  sql += " ORDER BY class_id, number, full_name";
  const r = await query(sql, params);
  res.json(r.rows.map(mapStudent));
});

router.post("/students", authRequired(["admin"]), async (req, res) => {
  const b = req.body || {};
  if (!b.classId || !b.departmentId) {
    return res.status(400).json({ error: "classId and departmentId required" });
  }
  const fullName =
    b.fullName || `${b.lastName || ""} ${b.firstName || ""}`.trim();
  const fullNameLatin =
    b.fullNameLatin ||
    `${b.firstNameLatin || ""} ${b.lastNameLatin || ""}`.trim();
  const id = b.id || sid("S");
  await query(
    `INSERT INTO students (
      id, class_id, department_id, number, first_name, last_name, full_name,
      first_name_latin, last_name_latin, full_name_latin,
      date_of_birth, gender, notes, search_name, previous_year_details
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
    [
      id,
      b.classId,
      b.departmentId,
      b.number || 0,
      b.firstName || "",
      b.lastName || "",
      fullName,
      b.firstNameLatin || "",
      b.lastNameLatin || "",
      fullNameLatin,
      b.dateOfBirth || "",
      b.gender || "",
      b.notes || "",
      b.searchName || `${fullName} ${fullNameLatin}`.trim(),
      b.previousYearDetails ? JSON.stringify(b.previousYearDetails) : null,
    ]
  );
  await query(
    `UPDATE classes SET stats = jsonb_set(
       COALESCE(stats, '{}'::jsonb), '{total}',
       to_jsonb((SELECT COUNT(*)::int FROM students WHERE class_id = $1))
     ) WHERE id = $1`,
    [b.classId]
  );
  const r = await query("SELECT * FROM students WHERE id = $1", [id]);
  res.status(201).json(mapStudent(r.rows[0]));
});

router.put("/students/:id", authRequired(["admin"]), async (req, res) => {
  const b = req.body || {};
  const existing = await query("SELECT * FROM students WHERE id = $1", [req.params.id]);
  if (!existing.rows.length) return res.status(404).json({ error: "Not found" });
  const old = existing.rows[0];
  const fullName =
    b.fullName != null
      ? b.fullName
      : `${b.lastName != null ? b.lastName : old.last_name} ${
          b.firstName != null ? b.firstName : old.first_name
        }`.trim();
  const fullNameLatin =
    b.fullNameLatin != null
      ? b.fullNameLatin
      : `${b.firstNameLatin != null ? b.firstNameLatin : old.first_name_latin || ""} ${
          b.lastNameLatin != null ? b.lastNameLatin : old.last_name_latin || ""
        }`.trim();
  const newClassId = b.classId || old.class_id;
  const searchName = `${fullName} ${fullNameLatin}`.trim();
  const r = await query(
    `UPDATE students SET
      class_id = $2,
      department_id = COALESCE($3, department_id),
      number = COALESCE($4, number),
      first_name = COALESCE($5, first_name),
      last_name = COALESCE($6, last_name),
      full_name = $7,
      first_name_latin = COALESCE($8, first_name_latin),
      last_name_latin = COALESCE($9, last_name_latin),
      full_name_latin = COALESCE($10, full_name_latin),
      date_of_birth = COALESCE($11, date_of_birth),
      gender = COALESCE($12, gender),
      notes = COALESCE($13, notes),
      search_name = $14,
      previous_year_details = COALESCE($15::jsonb, previous_year_details)
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      newClassId,
      b.departmentId,
      b.number,
      b.firstName,
      b.lastName,
      fullName,
      b.firstNameLatin,
      b.lastNameLatin,
      fullNameLatin || null,
      b.dateOfBirth,
      b.gender,
      b.notes,
      searchName,
      b.previousYearDetails != null ? JSON.stringify(b.previousYearDetails) : null,
    ]
  );
  for (const cid of new Set([old.class_id, newClassId])) {
    await query(
      `UPDATE classes SET stats = jsonb_set(
         COALESCE(stats, '{}'::jsonb), '{total}',
         to_jsonb((SELECT COUNT(*)::int FROM students WHERE class_id = $1))
       ) WHERE id = $1`,
      [cid]
    );
  }
  res.json(mapStudent(r.rows[0]));
});

router.delete("/students/:id", authRequired(["admin"]), async (req, res) => {
  const existing = await query("SELECT class_id FROM students WHERE id = $1", [req.params.id]);
  if (!existing.rows.length) return res.status(404).json({ error: "Not found" });
  const classId = existing.rows[0].class_id;
  await query("DELETE FROM students WHERE id = $1", [req.params.id]);
  await query(
    `UPDATE classes SET stats = jsonb_set(
       COALESCE(stats, '{}'::jsonb), '{total}',
       to_jsonb((SELECT COUNT(*)::int FROM students WHERE class_id = $1))
     ) WHERE id = $1`,
    [classId]
  );
  res.json({ ok: true });
});

// ——— Issues ———
router.get("/issues", authRequired(["director", "admin"]), async (_req, res) => {
  const r = await query("SELECT * FROM operations_issues ORDER BY id");
  res.json(r.rows.map(mapIssue));
});

router.post("/issues", authRequired(["admin"]), async (req, res) => {
  const b = req.body || {};
  const id = b.id || sid("ISSUE-");
  await query(
    `INSERT INTO operations_issues (
      id, status, severity, title, title_ar, area, updated, summary,
      current_process, impact, goal, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)`,
    [
      id,
      b.status || "open",
      b.severity || "medium",
      b.title || "Untitled",
      b.titleAr || "",
      b.area || "",
      b.updated || new Date().toISOString().slice(0, 10),
      b.summary || "",
      JSON.stringify(b.currentProcess || []),
      JSON.stringify(b.impact || []),
      b.goal || "",
      b.notes || "",
    ]
  );
  const r = await query("SELECT * FROM operations_issues WHERE id = $1", [id]);
  res.status(201).json(mapIssue(r.rows[0]));
});

router.put("/issues/:id", authRequired(["admin"]), async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `UPDATE operations_issues SET
      status = COALESCE($2, status),
      severity = COALESCE($3, severity),
      title = COALESCE($4, title),
      title_ar = COALESCE($5, title_ar),
      area = COALESCE($6, area),
      updated = COALESCE($7, updated),
      summary = COALESCE($8, summary),
      current_process = COALESCE($9::jsonb, current_process),
      impact = COALESCE($10::jsonb, impact),
      goal = COALESCE($11, goal),
      notes = COALESCE($12, notes)
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      b.status,
      b.severity,
      b.title,
      b.titleAr,
      b.area,
      b.updated,
      b.summary,
      b.currentProcess != null ? JSON.stringify(b.currentProcess) : null,
      b.impact != null ? JSON.stringify(b.impact) : null,
      b.goal,
      b.notes,
    ]
  );
  if (!r.rows.length) return res.status(404).json({ error: "Not found" });
  res.json(mapIssue(r.rows[0]));
});

router.delete("/issues/:id", authRequired(["admin"]), async (req, res) => {
  const r = await query("DELETE FROM operations_issues WHERE id = $1 RETURNING id", [
    req.params.id,
  ]);
  if (!r.rows.length) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;

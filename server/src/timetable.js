import crypto from "crypto";
import { query } from "./db.js";
import { mapTeacher, mapClass } from "./schoolData.js";

const DAYS = ["sun", "mon", "tue", "wed", "thu"];
const DAY_LABELS = {
  sun: { en: "Sunday", fr: "Dimanche", ar: "الأحد" },
  mon: { en: "Monday", fr: "Lundi", ar: "الإثنين" },
  tue: { en: "Tuesday", fr: "Mardi", ar: "الثلاثاء" },
  wed: { en: "Wednesday", fr: "Mercredi", ar: "الأربعاء" },
  thu: { en: "Thursday", fr: "Jeudi", ar: "الخميس" },
};

function sid(prefix = "TT") {
  return prefix + crypto.randomBytes(5).toString("hex").toUpperCase();
}

function mapSlot(row, teachersById = new Map()) {
  const teacher = row.teacher_id ? teachersById.get(row.teacher_id) : null;
  return {
    id: row.id,
    schoolYear: row.school_year,
    classId: row.class_id,
    teacherId: row.teacher_id || "",
    teacherName: row.teacher_name || "",
    teacher: teacher || null,
    module: row.module || "",
    dayOfWeek: row.day_of_week,
    shift: row.shift,
    role: row.role,
    notes: row.notes || "",
  };
}

async function loadTeachersMap(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;
  const r = await query(`SELECT * FROM teachers WHERE id = ANY($1::text[])`, [uniq]);
  for (const row of r.rows) map.set(row.id, mapTeacher(row));
  return map;
}

async function loadClassesMap(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;
  const r = await query(`SELECT * FROM classes WHERE id = ANY($1::text[])`, [uniq]);
  for (const row of r.rows) map.set(row.id, mapClass(row));
  return map;
}

function enrichPayload(slots, teachersById, classesById) {
  const mapped = slots.map((s) => {
    const base = mapSlot(s, teachersById);
    return {
      ...base,
      class: classesById.get(s.class_id) || null,
    };
  });
  return {
    days: DAYS,
    dayLabels: DAY_LABELS,
    shifts: ["morning", "evening"],
    slots: mapped,
  };
}

export async function getTeacherTimetable(req, res) {
  try {
    let teacherId = req.params.id || req.user?.teacherId;
    if (req.user?.role === "teacher" && req.user?.teacherId) {
      teacherId = req.user.teacherId;
    }
    if (!teacherId) return res.status(400).json({ error: "teacherId required" });
    const year = String(req.query.year || "2026-2027");
    const classId = String(req.query.classId || "").trim();
    const params = [year, teacherId];
    let sql = `SELECT * FROM timetable_slots
       WHERE school_year = $1 AND teacher_id = $2`;
    if (classId) {
      params.push(classId);
      sql += ` AND class_id = $${params.length}`;
    }
    sql += ` ORDER BY
         CASE day_of_week
           WHEN 'sun' THEN 0 WHEN 'mon' THEN 1 WHEN 'tue' THEN 2
           WHEN 'wed' THEN 3 WHEN 'thu' THEN 4 ELSE 5 END,
         shift, module, role`;
    const r = await query(sql, params);
    const teachersById = await loadTeachersMap([teacherId, ...r.rows.map((x) => x.teacher_id)]);
    const classesById = await loadClassesMap(r.rows.map((x) => x.class_id));
    let rolesSql = `SELECT * FROM class_module_teachers WHERE school_year = $1 AND teacher_id = $2`;
    const rolesParams = [year, teacherId];
    if (classId) {
      rolesParams.push(classId);
      rolesSql += ` AND class_id = $${rolesParams.length}`;
    }
    const roles = await query(rolesSql, rolesParams);

    // If filtering by class and no slots by teacher_id, still return class module-teacher rows
    // and any class slots that mention this teacher's name (fallback).
    let slots = r.rows;
    let moduleTeachers = [];
    if (classId) {
      const mt = await query(
        `SELECT * FROM class_module_teachers WHERE school_year = $1 AND class_id = $2`,
        [year, classId]
      );
      moduleTeachers = mt.rows;
      if (!slots.length) {
        const clsSlots = await query(
          `SELECT * FROM timetable_slots WHERE school_year = $1 AND class_id = $2`,
          [year, classId]
        );
        const t = teachersById.get(teacherId);
        const nameBits = [
          t?.first_name || t?.firstName,
          t?.last_name || t?.lastName,
          // mapTeacher uses camelCase
        ].filter(Boolean);
        // reload mapped teacher
        const mapped = teachersById.get(teacherId);
        const ar = mapped
          ? `${mapped.firstName || ""} ${mapped.lastName || ""}`.trim()
          : "";
        const norm = (s) =>
          String(s || "")
            .replace(/^أ\.\s*|^ا\.\s*/g, "")
            .replace(/\s+/g, " ")
            .trim();
        slots = clsSlots.rows.filter((row) => {
          if (row.teacher_id === teacherId) return true;
          const tn = norm(row.teacher_name);
          if (!tn || !ar) return false;
          return tn.includes(norm(ar)) || norm(ar).includes(tn) || tn.includes(norm(mapped?.firstName));
        });
      }
    }

    res.json({
      ...enrichPayload(slots, teachersById, classesById),
      teacherId,
      classId: classId || undefined,
      moduleRoles: roles.rows.map((row) => ({
        classId: row.class_id,
        module: row.module,
        role: row.role,
        teacherId: row.teacher_id,
        teacherName: row.teacher_name,
      })),
      moduleTeachers: moduleTeachers.map((row) => ({
        classId: row.class_id,
        module: row.module,
        role: row.role,
        teacherId: row.teacher_id || "",
        teacherName: row.teacher_name || "",
        teacher: row.teacher_id ? teachersById.get(row.teacher_id) || null : null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed" });
  }
}

export async function getMyTimetable(req, res) {
  req.params.id = req.user?.teacherId;
  return getTeacherTimetable(req, res);
}

export async function getClassTimetable(req, res) {
  try {
    const classId = req.params.id;
    const year = String(req.query.year || "2026-2027");
    const role = req.user?.role;

    // Teachers may only open timetables for their assigned classes
    if (role === "teacher") {
      const teacherId = req.user?.teacherId;
      const t = await query(`SELECT class_ids FROM teachers WHERE id = $1`, [teacherId]);
      const ids = t.rows[0]?.class_ids || [];
      if (!ids.includes(classId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    // Year managers may only open classes in their department + year
    if (role === "floor") {
      const floorId = req.user?.floorManagerId || req.user?.id;
      const m = await query(`SELECT * FROM floor_managers WHERE id = $1`, [floorId]);
      if (!m.rows.length) return res.status(403).json({ error: "Forbidden" });
      const manager = m.rows[0];
      const cls = await query(`SELECT * FROM classes WHERE id = $1`, [classId]);
      if (!cls.rows.length) return res.status(404).json({ error: "Class not found" });
      const classRow = cls.rows[0];
      const expectedYear = Number(manager.floor_number) + 1;
      if (
        classRow.department_id !== manager.department_id ||
        Number(classRow.year) !== expectedYear
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const r = await query(
      `SELECT * FROM timetable_slots
       WHERE school_year = $1 AND class_id = $2
       ORDER BY
         CASE day_of_week
           WHEN 'sun' THEN 0 WHEN 'mon' THEN 1 WHEN 'tue' THEN 2
           WHEN 'wed' THEN 3 WHEN 'thu' THEN 4 ELSE 5 END,
         shift, module, role`,
      [year, classId]
    );
    const teachersById = await loadTeachersMap(r.rows.map((x) => x.teacher_id));
    const classesById = await loadClassesMap([classId]);
    const roles = await query(
      `SELECT * FROM class_module_teachers WHERE school_year = $1 AND class_id = $2`,
      [year, classId]
    );
    const cls = classesById.get(classId);
    res.json({
      ...enrichPayload(r.rows, teachersById, classesById),
      classId,
      class: cls || null,
      defaultShift: cls?.defaultShift || "",
      moduleTeachers: roles.rows.map((row) => ({
        classId: row.class_id,
        module: row.module,
        role: row.role,
        teacherId: row.teacher_id || "",
        teacherName: row.teacher_name || "",
        teacher: row.teacher_id ? teachersById.get(row.teacher_id) || null : null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed" });
  }
}

export async function getDirectorTimetable(req, res) {
  try {
    const year = String(req.query.year || "2026-2027");
    const dept = String(req.query.dept || "primary");
    const level = req.query.level ? Number(req.query.level) : null;

    let sql = `
      SELECT c.*,
             (SELECT COUNT(*)::int FROM timetable_slots ts
              WHERE ts.class_id = c.id AND ts.school_year = $1) AS slot_count
      FROM classes c
      WHERE c.department_id = $2`;
    const params = [year, dept];
    if (Number.isFinite(level)) {
      params.push(level);
      sql += ` AND c.level_id = $${params.length}`;
    }
    sql += ` ORDER BY c.level_id, c.section NULLS LAST, c.code`;
    const classes = await query(sql, params);

    const classIds = classes.rows.map((c) => c.id);
    let slots = [];
    let moduleTeachers = [];
    if (classIds.length) {
      const sr = await query(
        `SELECT * FROM timetable_slots WHERE school_year = $1 AND class_id = ANY($2::text[])`,
        [year, classIds]
      );
      slots = sr.rows;
      const mr = await query(
        `SELECT * FROM class_module_teachers WHERE school_year = $1 AND class_id = ANY($2::text[])`,
        [year, classIds]
      );
      moduleTeachers = mr.rows;
    }

    const teachersById = await loadTeachersMap(slots.map((s) => s.teacher_id));
    const classesById = new Map(classes.rows.map((c) => [c.id, mapClass(c)]));

    res.json({
      schoolYear: year,
      departmentId: dept,
      days: DAYS,
      dayLabels: DAY_LABELS,
      classes: classes.rows.map((c) => ({
        ...mapClass(c),
        slotCount: c.slot_count || 0,
        defaultShift: c.default_shift || "",
      })),
      slots: slots.map((s) => ({
        ...mapSlot(s, teachersById),
        class: classesById.get(s.class_id) || null,
      })),
      moduleTeachers: moduleTeachers.map((row) => ({
        classId: row.class_id,
        module: row.module,
        role: row.role,
        teacherId: row.teacher_id || "",
        teacherName: row.teacher_name || "",
        teacher: row.teacher_id ? teachersById.get(row.teacher_id) || null : null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed" });
  }
}

/** Admin import helper used by scripts via HTTP if needed — also supports direct replace. */
export async function replaceYearSlots(schoolYear, slots) {
  await query(`DELETE FROM timetable_slots WHERE school_year = $1`, [schoolYear]);
  const seen = new Set();
  for (const s of slots) {
    const key = [
      schoolYear,
      s.classId,
      s.dayOfWeek,
      s.shift || "morning",
      s.module || "",
      s.role || "general",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    await query(
      `INSERT INTO timetable_slots
         (id, school_year, class_id, teacher_id, teacher_name, module, day_of_week, shift, role, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        s.id || sid(),
        schoolYear,
        s.classId,
        s.teacherId || null,
        s.teacherName || "",
        s.module || "",
        s.dayOfWeek,
        s.shift || "morning",
        s.role || "general",
        s.notes || "",
      ]
    );
  }
}

export async function upsertModuleTeachers(schoolYear, rows) {
  for (const r of rows) {
    await query(
      `INSERT INTO class_module_teachers
         (class_id, module, teacher_id, teacher_name, role, school_year)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (class_id, module, role, school_year)
       DO UPDATE SET teacher_id = EXCLUDED.teacher_id, teacher_name = EXCLUDED.teacher_name`,
      [
        r.classId,
        r.module,
        r.teacherId || null,
        r.teacherName || "",
        r.role || "principal",
        schoolYear,
      ]
    );
  }
}

export async function postImportTimetable(req, res) {
  try {
    const year = String(req.body?.schoolYear || "2026-2027");
    const slots = Array.isArray(req.body?.slots) ? req.body.slots : [];
    const moduleTeachers = Array.isArray(req.body?.moduleTeachers) ? req.body.moduleTeachers : [];
    const classShifts = Array.isArray(req.body?.classShifts) ? req.body.classShifts : [];
    const teacherUpdates = Array.isArray(req.body?.teacherUpdates) ? req.body.teacherUpdates : [];

    if (slots.length) await replaceYearSlots(year, slots);
    if (moduleTeachers.length) await upsertModuleTeachers(year, moduleTeachers);

    for (const cs of classShifts) {
      if (!cs.classId) continue;
      await query(`UPDATE classes SET default_shift = $2 WHERE id = $1`, [
        cs.classId,
        cs.defaultShift || "",
      ]);
    }

    for (const tu of teacherUpdates) {
      if (!tu.teacherId) continue;
      const existing = await query(`SELECT modules, class_ids FROM teachers WHERE id = $1`, [
        tu.teacherId,
      ]);
      if (!existing.rows.length) continue;
      const mods = new Set(existing.rows[0].modules || []);
      for (const m of tu.modules || []) if (m) mods.add(m);
      const classIds = new Set(existing.rows[0].class_ids || []);
      for (const c of tu.classIds || []) if (c) classIds.add(c);
      await query(`UPDATE teachers SET modules = $2::jsonb, class_ids = $3::jsonb WHERE id = $1`, [
        tu.teacherId,
        JSON.stringify([...mods]),
        JSON.stringify([...classIds]),
      ]);
      for (const cid of tu.classIds || []) {
        await query(
          `UPDATE classes SET
             teacher_ids = (
               SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb)
               FROM jsonb_array_elements_text(COALESCE(teacher_ids, '[]'::jsonb) || to_jsonb($2::text)) t(x)
             ),
             modules = (
               SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb)
               FROM jsonb_array_elements_text(
                 COALESCE(modules, '[]'::jsonb) || COALESCE($3::jsonb, '[]'::jsonb)
               ) t(x)
             )
           WHERE id = $1`,
          [cid, tu.teacherId, JSON.stringify(tu.modules || [])]
        );
      }
    }

    res.json({
      ok: true,
      slots: slots.length,
      moduleTeachers: moduleTeachers.length,
      classShifts: classShifts.length,
      teacherUpdates: teacherUpdates.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Import failed" });
  }
}

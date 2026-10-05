import crypto from "crypto";
import { query } from "./db.js";
import { mapStudent, mapClass } from "./schoolData.js";

const STATUSES = new Set(["present", "absent", "late"]);

function newId(prefix) {
  return prefix + crypto.randomBytes(5).toString("hex").toUpperCase();
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeDate(raw) {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return todayIso();
}

function normalizeSubject(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function normalizeStatus(raw) {
  const s = String(raw || "present").trim().toLowerCase();
  return STATUSES.has(s) ? s : "present";
}

async function teacherOwnsClass(teacherId, classId) {
  const t = await query("SELECT class_ids FROM teachers WHERE id = $1", [teacherId]);
  if (!t.rows.length) return false;
  const ids = t.rows[0].class_ids || [];
  return ids.includes(classId);
}

function classSummary(row, studentCount) {
  const mapped = mapClass(row, Array(studentCount).fill(null));
  return {
    id: mapped.id,
    name: mapped.name,
    nameAr: mapped.nameAr,
    code: mapped.code,
    year: mapped.year,
    floor: mapped.floor,
    departmentId: row.department_id,
    levelId: row.level_id,
    studentCount,
    modules: mapped.modules || [],
  };
}

function mapSession(row) {
  return {
    id: row.id,
    classId: row.class_id,
    teacherId: row.teacher_id,
    date: row.session_date
      ? String(row.session_date).slice(0, 10)
      : row.session_date,
    subject: row.subject || "",
    homework: row.homework || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function loadSessionWithEntries(sessionId) {
  const s = await query("SELECT * FROM class_sessions WHERE id = $1", [sessionId]);
  if (!s.rows.length) return null;
  const entries = await query(
    `SELECT student_id, status, remark
     FROM class_session_entries
     WHERE session_id = $1`,
    [sessionId]
  );
  return {
    ...mapSession(s.rows[0]),
    entries: entries.rows.map((e) => ({
      studentId: e.student_id,
      status: e.status,
      remark: e.remark || "",
    })),
  };
}

/** GET /me/classes/:id/session?date=&subject= */
export async function getMyClassSession(req, res) {
  try {
    const teacherId = req.user?.teacherId;
    const classId = String(req.params.id || "");
    if (!(await teacherOwnsClass(teacherId, classId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const date = normalizeDate(req.query.date);
    const subject = normalizeSubject(req.query.subject);

    const cls = await query("SELECT * FROM classes WHERE id = $1", [classId]);
    if (!cls.rows.length) return res.status(404).json({ error: "Class not found" });

    const teacher = await query("SELECT modules, class_ids FROM teachers WHERE id = $1", [
      teacherId,
    ]);
    const modules = Array.isArray(teacher.rows[0]?.modules) ? teacher.rows[0].modules : [];
    const classIds = teacher.rows[0]?.class_ids || [];

    const students = await query(
      "SELECT * FROM students WHERE class_id = $1 ORDER BY number, full_name",
      [classId]
    );

    let session = null;
    if (subject) {
      const found = await query(
        `SELECT id FROM class_sessions
         WHERE class_id = $1 AND teacher_id = $2 AND session_date = $3::date AND subject = $4`,
        [classId, teacherId, date, subject]
      );
      if (found.rows.length) {
        session = await loadSessionWithEntries(found.rows[0].id);
      }
    }

    const recent = await query(
      `SELECT id, session_date, subject, updated_at
       FROM class_sessions
       WHERE class_id = $1 AND teacher_id = $2
       ORDER BY session_date DESC, updated_at DESC
       LIMIT 40`,
      [classId, teacherId]
    );

    let siblingClasses = [];
    if (classIds.length) {
      const siblings = await query(
        `SELECT * FROM classes
         WHERE id = ANY($1::text[]) AND year = $2 AND id <> $3
         ORDER BY code`,
        [classIds, cls.rows[0].year, classId]
      );
      siblingClasses = siblings.rows.map((c) => ({
        id: c.id,
        name: c.name,
        nameAr: c.name_ar,
        code: c.code,
        year: c.year,
      }));
    }

    res.json({
      class: classSummary(cls.rows[0], students.rows.length),
      date,
      subject,
      subjects: modules.map((m) => String(m)).filter(Boolean),
      session,
      students: students.rows.map(mapStudent),
      recentSessions: recent.rows.map((r) => ({
        id: r.id,
        date: String(r.session_date).slice(0, 10),
        subject: r.subject || "",
        updatedAt: r.updated_at || null,
      })),
      siblingClasses,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load session" });
  }
}

/** PUT /me/classes/:id/session — upsert attendance, remarks, homework */
export async function putMyClassSession(req, res) {
  try {
    const teacherId = req.user?.teacherId;
    const classId = String(req.params.id || "");
    if (!(await teacherOwnsClass(teacherId, classId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const body = req.body || {};
    const date = normalizeDate(body.date);
    const subject = normalizeSubject(body.subject);
    if (!subject) {
      return res.status(400).json({ error: "subject required" });
    }

    const homework = String(body.homework ?? "").trim().slice(0, 4000);
    const rawEntries = Array.isArray(body.entries) ? body.entries : [];
    const copyTo = Array.isArray(body.copyHomeworkToClassIds)
      ? body.copyHomeworkToClassIds.map((id) => String(id)).filter(Boolean)
      : [];

    const cls = await query("SELECT id, year FROM classes WHERE id = $1", [classId]);
    if (!cls.rows.length) return res.status(404).json({ error: "Class not found" });

    const roster = await query("SELECT id FROM students WHERE class_id = $1", [classId]);
    const rosterSet = new Set(roster.rows.map((r) => r.id));

    const entryMap = new Map();
    for (const e of rawEntries) {
      const studentId = String(e.studentId || e.student_id || "");
      if (!rosterSet.has(studentId)) continue;
      entryMap.set(studentId, {
        studentId,
        status: normalizeStatus(e.status),
        remark: String(e.remark || "").trim().slice(0, 1000),
      });
    }
    // Ensure every roster student has a row (default present)
    for (const sid of rosterSet) {
      if (!entryMap.has(sid)) {
        entryMap.set(sid, { studentId: sid, status: "present", remark: "" });
      }
    }

    const existing = await query(
      `SELECT id FROM class_sessions
       WHERE class_id = $1 AND teacher_id = $2 AND session_date = $3::date AND subject = $4`,
      [classId, teacherId, date, subject]
    );

    let sessionId;
    if (existing.rows.length) {
      sessionId = existing.rows[0].id;
      await query(
        `UPDATE class_sessions
         SET homework = $2, updated_at = NOW()
         WHERE id = $1`,
        [sessionId, homework]
      );
    } else {
      sessionId = newId("CS");
      await query(
        `INSERT INTO class_sessions (id, class_id, teacher_id, session_date, subject, homework)
         VALUES ($1, $2, $3, $4::date, $5, $6)`,
        [sessionId, classId, teacherId, date, subject, homework]
      );
    }

    await query("DELETE FROM class_session_entries WHERE session_id = $1", [sessionId]);
    for (const e of entryMap.values()) {
      await query(
        `INSERT INTO class_session_entries (session_id, student_id, status, remark)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, e.studentId, e.status, e.remark]
      );
    }

    const copiedTo = [];
    if (homework && copyTo.length) {
      const year = cls.rows[0].year;
      for (const targetClassId of copyTo) {
        if (targetClassId === classId) continue;
        if (!(await teacherOwnsClass(teacherId, targetClassId))) continue;
        const target = await query("SELECT id, year FROM classes WHERE id = $1", [targetClassId]);
        if (!target.rows.length || target.rows[0].year !== year) continue;

        const other = await query(
          `SELECT id FROM class_sessions
           WHERE class_id = $1 AND teacher_id = $2 AND session_date = $3::date AND subject = $4`,
          [targetClassId, teacherId, date, subject]
        );
        if (other.rows.length) {
          await query(
            `UPDATE class_sessions SET homework = $2, updated_at = NOW() WHERE id = $1`,
            [other.rows[0].id, homework]
          );
          copiedTo.push(targetClassId);
        } else {
          const nid = newId("CS");
          await query(
            `INSERT INTO class_sessions (id, class_id, teacher_id, session_date, subject, homework)
             VALUES ($1, $2, $3, $4::date, $5, $6)`,
            [nid, targetClassId, teacherId, date, subject, homework]
          );
          // Seed present entries for target roster so the day exists
          const targetStudents = await query("SELECT id FROM students WHERE class_id = $1", [
            targetClassId,
          ]);
          for (const st of targetStudents.rows) {
            await query(
              `INSERT INTO class_session_entries (session_id, student_id, status, remark)
               VALUES ($1, $2, 'present', '')`,
              [nid, st.id]
            );
          }
          copiedTo.push(targetClassId);
        }
      }
    }

    const session = await loadSessionWithEntries(sessionId);
    res.json({ ok: true, session, copiedHomeworkTo: copiedTo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to save session" });
  }
}

/** GET /me/classes/:id/sessions — recent days for this teacher+class */
export async function listMyClassSessions(req, res) {
  try {
    const teacherId = req.user?.teacherId;
    const classId = String(req.params.id || "");
    if (!(await teacherOwnsClass(teacherId, classId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const rows = await query(
      `SELECT id, session_date, subject, homework, updated_at,
              (SELECT COUNT(*)::int FROM class_session_entries e
               WHERE e.session_id = class_sessions.id AND e.status = 'absent') AS absent_count,
              (SELECT COUNT(*)::int FROM class_session_entries e
               WHERE e.session_id = class_sessions.id AND e.status = 'late') AS late_count
       FROM class_sessions
       WHERE class_id = $1 AND teacher_id = $2
       ORDER BY session_date DESC, subject ASC
       LIMIT $3`,
      [classId, teacherId, limit]
    );
    res.json({
      sessions: rows.rows.map((r) => ({
        id: r.id,
        date: String(r.session_date).slice(0, 10),
        subject: r.subject || "",
        homework: r.homework || "",
        absentCount: r.absent_count || 0,
        lateCount: r.late_count || 0,
        updatedAt: r.updated_at || null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to list sessions" });
  }
}

import bcrypt from "bcryptjs";
import { query } from "./db.js";
import { mapTeacher, mapStudent, mapClass } from "./schoolData.js";
import { saveProfilePhoto, deleteProfilePhoto } from "./uploads.js";

const SALT_ROUNDS = 10;

export function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D+/g, "");
}

/** Match Algerian numbers stored as 05…, 213…, or with spaces. */
export function phonesMatch(a, b) {
  const na = normalizePhoneDigits(a);
  const nb = normalizePhoneDigits(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.slice(-9);
  const tb = nb.slice(-9);
  return ta.length >= 9 && tb.length >= 9 && ta === tb;
}

async function loadTeacherOr404(teacherId, res) {
  const r = await query("SELECT * FROM teachers WHERE id = $1", [teacherId]);
  if (!r.rows.length) {
    res.status(404).json({ error: "Teacher not found" });
    return null;
  }
  return r.rows[0];
}

async function teacherOwnsClass(teacherId, classId) {
  const t = await query("SELECT class_ids FROM teachers WHERE id = $1", [teacherId]);
  if (!t.rows.length) return false;
  const ids = t.rows[0].class_ids || [];
  return ids.includes(classId);
}

async function studentInTeacherClasses(teacherId, studentId) {
  const t = await query("SELECT class_ids FROM teachers WHERE id = $1", [teacherId]);
  if (!t.rows.length) return null;
  const ids = t.rows[0].class_ids || [];
  if (!ids.length) return null;
  const s = await query("SELECT * FROM students WHERE id = $1", [studentId]);
  if (!s.rows.length) return null;
  if (!ids.includes(s.rows[0].class_id)) return null;
  return s.rows[0];
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

export async function getMe(req, res) {
  try {
    const teacherId = req.user?.teacherId;
    const row = await loadTeacherOr404(teacherId, res);
    if (!row) return;
    const acc = await query(
      "SELECT must_change_password FROM teacher_accounts WHERE teacher_id = $1",
      [teacherId]
    );
    res.json({
      teacher: mapTeacher(row),
      mustChangePassword: Boolean(acc.rows[0]?.must_change_password),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load profile" });
  }
}

export async function getMyClasses(req, res) {
  try {
    const teacherId = req.user?.teacherId;
    const row = await loadTeacherOr404(teacherId, res);
    if (!row) return;
    const classIds = row.class_ids || [];
    if (!classIds.length) return res.json({ classes: [] });

    const classes = await query(
      `SELECT * FROM classes WHERE id = ANY($1::text[]) ORDER BY department_id, year, code`,
      [classIds]
    );
    const counts = await query(
      `SELECT class_id, COUNT(*)::int AS n FROM students WHERE class_id = ANY($1::text[]) GROUP BY class_id`,
      [classIds]
    );
    const countMap = new Map(counts.rows.map((r) => [r.class_id, r.n]));
    res.json({
      classes: classes.rows.map((c) => classSummary(c, countMap.get(c.id) || 0)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load classes" });
  }
}

export async function getMyClassStudents(req, res) {
  try {
    const teacherId = req.user?.teacherId;
    const classId = String(req.params.id || "");
    if (!(await teacherOwnsClass(teacherId, classId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const cls = await query("SELECT * FROM classes WHERE id = $1", [classId]);
    if (!cls.rows.length) return res.status(404).json({ error: "Class not found" });
    const students = await query(
      "SELECT * FROM students WHERE class_id = $1 ORDER BY number, full_name",
      [classId]
    );
    res.json({
      class: classSummary(cls.rows[0], students.rows.length),
      students: students.rows.map(mapStudent),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load students" });
  }
}

export async function getMyStudent(req, res) {
  try {
    const teacherId = req.user?.teacherId;
    const studentId = String(req.params.id || "");
    const row = await studentInTeacherClasses(teacherId, studentId);
    if (!row) return res.status(404).json({ error: "Student not found" });
    const cls = await query("SELECT * FROM classes WHERE id = $1", [row.class_id]);
    res.json({
      student: mapStudent(row),
      class: cls.rows[0]
        ? classSummary(cls.rows[0], 0)
        : { id: row.class_id, name: "", code: "", year: 0, departmentId: row.department_id },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load student" });
  }
}

export async function updateMyPhoto(req, res) {
  try {
    const teacherId = req.user?.teacherId;
    const dataUrl = req.body?.dataUrl;
    if (!dataUrl) return res.status(400).json({ error: "dataUrl required" });
    const found = await query("SELECT id FROM teachers WHERE id = $1", [teacherId]);
    if (!found.rows.length) return res.status(404).json({ error: "Teacher not found" });
    const url = saveProfilePhoto({ entity: "teachers", id: teacherId, dataUrl });
    await query("UPDATE teachers SET photo = $2 WHERE id = $1", [teacherId, url]);
    res.json({ ok: true, url, photo: url });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Upload failed" });
  }
}

export async function removeMyPhoto(req, res) {
  try {
    const teacherId = req.user?.teacherId;
    const found = await query("SELECT id FROM teachers WHERE id = $1", [teacherId]);
    if (!found.rows.length) return res.status(404).json({ error: "Teacher not found" });
    deleteProfilePhoto("teachers", teacherId);
    await query("UPDATE teachers SET photo = '' WHERE id = $1", [teacherId]);
    res.json({ ok: true, photo: "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Remove failed" });
  }
}

export async function changeMyPassword(req, res) {
  try {
    const teacherId = req.user?.teacherId;
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const acc = await query(
      "SELECT password_hash FROM teacher_accounts WHERE teacher_id = $1",
      [teacherId]
    );
    if (!acc.rows.length) return res.status(404).json({ error: "Account not found" });
    const ok = await bcrypt.compare(currentPassword, acc.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await query(
      `UPDATE teacher_accounts
       SET password_hash = $2, must_change_password = FALSE, updated_at = NOW()
       WHERE teacher_id = $1`,
      [teacherId, hash]
    );
    res.json({ ok: true, mustChangePassword: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Password change failed" });
  }
}

/** Admin: portal status for one teacher */
export async function getTeacherPortal(req, res) {
  try {
    const id = req.params.id;
    const t = await query("SELECT id, phone FROM teachers WHERE id = $1", [id]);
    if (!t.rows.length) return res.status(404).json({ error: "Not found" });
    const acc = await query(
      "SELECT must_change_password, updated_at FROM teacher_accounts WHERE teacher_id = $1",
      [id]
    );
    res.json({
      teacherId: id,
      phone: t.rows[0].phone || "",
      enabled: acc.rows.length > 0,
      mustChangePassword: Boolean(acc.rows[0]?.must_change_password),
      updatedAt: acc.rows[0]?.updated_at || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed" });
  }
}

/** Admin: set / reset portal password (creates account if missing) */
export async function setTeacherPortal(req, res) {
  try {
    const id = req.params.id;
    const password = String(req.body?.password || "");
    const mustChange =
      req.body?.mustChangePassword === undefined ? true : Boolean(req.body.mustChangePassword);
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const t = await query("SELECT id, phone FROM teachers WHERE id = $1", [id]);
    if (!t.rows.length) return res.status(404).json({ error: "Teacher not found" });
    if (!normalizePhoneDigits(t.rows[0].phone)) {
      return res.status(400).json({ error: "Teacher needs a phone number before enabling the portal" });
    }
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await query(
      `INSERT INTO teacher_accounts (teacher_id, password_hash, must_change_password, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (teacher_id) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         must_change_password = EXCLUDED.must_change_password,
         updated_at = NOW()`,
      [id, hash, mustChange]
    );
    res.json({
      ok: true,
      teacherId: id,
      enabled: true,
      mustChangePassword: mustChange,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to set portal password" });
  }
}

/** Admin: disable portal account */
export async function deleteTeacherPortal(req, res) {
  try {
    const id = req.params.id;
    const r = await query(
      "DELETE FROM teacher_accounts WHERE teacher_id = $1 RETURNING teacher_id",
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Portal not enabled" });
    res.json({ ok: true, enabled: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to disable portal" });
  }
}

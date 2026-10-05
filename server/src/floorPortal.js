import crypto from "crypto";
import bcrypt from "bcryptjs";
import { query } from "./db.js";
import { mapStudent, mapClass } from "./schoolData.js";

const WA_BRIDGE_URL = (process.env.WA_BRIDGE_URL || "http://127.0.0.1:3847").replace(/\/$/, "");
const SALT_ROUNDS = 10;

function newId(prefix) {
  return prefix + crypto.randomBytes(5).toString("hex").toUpperCase();
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeDate(raw) {
  const s = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : todayIso();
}

function mapFloorManager(row) {
  return {
    id: row.id,
    loginCode: row.login_code,
    departmentId: row.department_id,
    floorNumber: row.floor_number,
    floorLabel: row.floor_label || "",
    floorLabelAr: row.floor_label_ar || "",
    mustChangePassword: Boolean(row.must_change_password),
  };
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
    floorNumber: row.floor_number,
    departmentId: row.department_id,
    levelId: row.level_id,
    studentCount,
  };
}

function extractParentPhones(profile) {
  if (!profile || typeof profile !== "object") return [];
  const out = [];
  const push = (role, person) => {
    if (!person || typeof person !== "object") return;
    const phone = String(person.phone || "").trim();
    if (!phone) return;
    const name = [person.firstName || person.first_name, person.lastName || person.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    out.push({ role, phone, name: name || role });
  };
  push("father", profile.father);
  push("mother", profile.mother);
  const backup = String(profile.contact?.phoneBackup || "").trim();
  if (backup && !out.some((p) => p.phone === backup)) {
    out.push({ role: "backup", phone: backup, name: "backup" });
  }
  return out;
}

async function loadManager(req, res) {
  const id = req.user?.floorManagerId;
  if (!id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const r = await query("SELECT * FROM floor_managers WHERE id = $1", [id]);
  if (!r.rows.length) {
    res.status(404).json({ error: "Floor manager not found" });
    return null;
  }
  return r.rows[0];
}

async function floorClasses(manager) {
  const r = await query(
    `SELECT * FROM classes
     WHERE department_id = $1 AND floor_number = $2
     ORDER BY year, code`,
    [manager.department_id, manager.floor_number]
  );
  return r.rows;
}

function waSessionId(manager) {
  return String(manager.login_code || manager.id || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

async function bridgeFetch(sessionId, path, options = {}) {
  const url = `${WA_BRIDGE_URL}/s/${encodeURIComponent(sessionId)}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || res.statusText };
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || "WhatsApp bridge error");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function getFloorMe(req, res) {
  try {
    const row = await loadManager(req, res);
    if (!row) return;
    const classes = await floorClasses(row);
    const counts = await query(
      `SELECT class_id, COUNT(*)::int AS n FROM students
       WHERE class_id = ANY($1::text[]) GROUP BY class_id`,
      [classes.map((c) => c.id)]
    );
    const countMap = new Map(counts.rows.map((r) => [r.class_id, r.n]));
    res.json({
      manager: mapFloorManager(row),
      classes: classes.map((c) => classSummary(c, countMap.get(c.id) || 0)),
      waSession: waSessionId(row),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load floor manager" });
  }
}

export async function changeFloorPassword(req, res) {
  try {
    const row = await loadManager(req, res);
    if (!row) return;
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await query(
      `UPDATE floor_managers
       SET password_hash = $2, must_change_password = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [row.id, hash]
    );
    res.json({ ok: true, mustChangePassword: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Password change failed" });
  }
}

/** Day board: all teacher sessions on this floor for a date */
export async function getFloorDayBoard(req, res) {
  try {
    const row = await loadManager(req, res);
    if (!row) return;
    const date = normalizeDate(req.query.date);
    const classes = await floorClasses(row);
    if (!classes.length) {
      return res.json({ date, classes: [], sessions: [], summary: { absent: 0, late: 0, remarks: 0, homework: 0 } });
    }
    const classIds = classes.map((c) => c.id);
    const counts = await query(
      `SELECT class_id, COUNT(*)::int AS n FROM students
       WHERE class_id = ANY($1::text[]) GROUP BY class_id`,
      [classIds]
    );
    const countMap = new Map(counts.rows.map((r) => [r.class_id, r.n]));

    const sessions = await query(
      `SELECT cs.*,
              c.code AS class_code, c.name AS class_name, c.name_ar AS class_name_ar, c.year AS class_year,
              t.first_name AS teacher_first, t.last_name AS teacher_last, t.login_code AS teacher_login,
              (SELECT COUNT(*)::int FROM class_session_entries e WHERE e.session_id = cs.id AND e.status = 'absent') AS absent_count,
              (SELECT COUNT(*)::int FROM class_session_entries e WHERE e.session_id = cs.id AND e.status = 'late') AS late_count,
              (SELECT COUNT(*)::int FROM class_session_entries e WHERE e.session_id = cs.id AND BTRIM(e.remark) <> '') AS remark_count
       FROM class_sessions cs
       JOIN classes c ON c.id = cs.class_id
       JOIN teachers t ON t.id = cs.teacher_id
       WHERE cs.class_id = ANY($1::text[]) AND cs.session_date = $2::date
       ORDER BY c.code, cs.subject`,
      [classIds, date]
    );

    const summary = { absent: 0, late: 0, remarks: 0, homework: 0 };
    const mappedSessions = sessions.rows.map((s) => {
      summary.absent += s.absent_count || 0;
      summary.late += s.late_count || 0;
      summary.remarks += s.remark_count || 0;
      if (String(s.homework || "").trim()) summary.homework += 1;
      return {
        id: s.id,
        classId: s.class_id,
        classCode: s.class_code,
        className: s.class_name,
        classNameAr: s.class_name_ar,
        classYear: s.class_year,
        teacherId: s.teacher_id,
        teacherName: [s.teacher_first, s.teacher_last].filter(Boolean).join(" ").trim() || s.teacher_login || s.teacher_id,
        subject: s.subject,
        homework: s.homework || "",
        date: String(s.session_date).slice(0, 10),
        absentCount: s.absent_count || 0,
        lateCount: s.late_count || 0,
        remarkCount: s.remark_count || 0,
        updatedAt: s.updated_at,
      };
    });

    res.json({
      date,
      manager: mapFloorManager(row),
      classes: classes.map((c) => classSummary(c, countMap.get(c.id) || 0)),
      sessions: mappedSessions,
      summary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load day board" });
  }
}

/** Full class day detail with student entries + parent phones */
export async function getFloorClassDay(req, res) {
  try {
    const row = await loadManager(req, res);
    if (!row) return;
    const classId = String(req.params.id || "");
    const date = normalizeDate(req.query.date);
    const cls = await query(
      `SELECT * FROM classes
       WHERE id = $1 AND department_id = $2 AND floor_number = $3`,
      [classId, row.department_id, row.floor_number]
    );
    if (!cls.rows.length) return res.status(404).json({ error: "Class not found on this floor" });

    const students = await query(
      "SELECT * FROM students WHERE class_id = $1 ORDER BY number, full_name",
      [classId]
    );
    const sessions = await query(
      `SELECT cs.*,
              t.first_name AS teacher_first, t.last_name AS teacher_last, t.login_code AS teacher_login
       FROM class_sessions cs
       JOIN teachers t ON t.id = cs.teacher_id
       WHERE cs.class_id = $1 AND cs.session_date = $2::date
       ORDER BY cs.subject`,
      [classId, date]
    );

    const detailed = [];
    for (const s of sessions.rows) {
      const entries = await query(
        `SELECT e.student_id, e.status, e.remark
         FROM class_session_entries e
         WHERE e.session_id = $1`,
        [s.id]
      );
      detailed.push({
        id: s.id,
        subject: s.subject,
        homework: s.homework || "",
        teacherId: s.teacher_id,
        teacherName:
          [s.teacher_first, s.teacher_last].filter(Boolean).join(" ").trim() ||
          s.teacher_login ||
          s.teacher_id,
        entries: entries.rows.map((e) => ({
          studentId: e.student_id,
          status: e.status,
          remark: e.remark || "",
        })),
      });
    }

    res.json({
      date,
      class: classSummary(cls.rows[0], students.rows.length),
      students: students.rows.map((st) => {
        const mapped = mapStudent(st);
        return {
          ...mapped,
          parentPhones: extractParentPhones(mapped.parentProfile),
        };
      }),
      sessions: detailed,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load class day" });
  }
}

export async function getFloorWaStatus(req, res) {
  try {
    const row = await loadManager(req, res);
    if (!row) return;
    const sid = waSessionId(row);
    try {
      await bridgeFetch(sid, "/ensure", { method: "POST", body: "{}" });
    } catch {
      /* ensure optional */
    }
    const status = await bridgeFetch(sid, "/health");
    res.json({
      ...status,
      sessionId: sid,
      qrUrl: status.qrReady ? `/api/floor/wa/qr?t=${Date.now()}` : null,
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({
      ready: false,
      error: err.message || "WhatsApp bridge unreachable",
      sessionId: null,
    });
  }
}

export async function getFloorWaQr(req, res) {
  try {
    const row = await loadManager(req, res);
    if (!row) return;
    const sid = waSessionId(row);
    const url = `${WA_BRIDGE_URL}/s/${encodeURIComponent(sid)}/qr`;
    const bridgeRes = await fetch(url);
    if (!bridgeRes.ok) {
      return res.status(bridgeRes.status).json({ error: "QR not ready" });
    }
    const buf = Buffer.from(await bridgeRes.arrayBuffer());
    res.type("png").send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "QR failed" });
  }
}

export async function postFloorWaLogout(req, res) {
  try {
    const row = await loadManager(req, res);
    if (!row) return;
    const sid = waSessionId(row);
    const data = await bridgeFetch(sid, "/logout", { method: "POST", body: "{}" });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Logout failed" });
  }
}

/**
 * Send WhatsApp messages to parents.
 * Body: { text, recipients: [{ phone, studentId?, name? }], actionType?, classId?, sessionId?, studentId? }
 */
export async function postFloorWaSend(req, res) {
  try {
    const row = await loadManager(req, res);
    if (!row) return;
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "text required" });
    const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    if (!recipients.length) return res.status(400).json({ error: "recipients required" });

    const sid = waSessionId(row);
    const results = [];
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i] || {};
      const phone = String(r.phone || "").trim();
      if (!phone) {
        results.push({ phone: "", ok: false, error: "missing phone" });
        continue;
      }
      try {
        const sent = await bridgeFetch(sid, "/send-dm", {
          method: "POST",
          body: JSON.stringify({ phone, text }),
        });
        results.push({ phone, ok: true, chatId: sent.chatId || null, studentId: r.studentId || null });
      } catch (err) {
        results.push({ phone, ok: false, error: err.message || "send failed", studentId: r.studentId || null });
      }
      if (i < recipients.length - 1) {
        await new Promise((r) => setTimeout(r, 1800));
      }
    }

    const actionId = newId("FA");
    await query(
      `INSERT INTO floor_action_logs
         (id, floor_manager_id, class_id, student_id, session_id, action_type, channel, message, recipients, result)
       VALUES ($1,$2,$3,$4,$5,$6,'whatsapp',$7,$8::jsonb,$9::jsonb)`,
      [
        actionId,
        row.id,
        req.body?.classId || null,
        req.body?.studentId || null,
        req.body?.sessionId || null,
        String(req.body?.actionType || "custom").slice(0, 60),
        text,
        JSON.stringify(recipients),
        JSON.stringify({ results }),
      ]
    );

    const okCount = results.filter((r) => r.ok).length;
    res.json({
      ok: okCount > 0,
      sent: okCount,
      failed: results.length - okCount,
      results,
      actionId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Send failed" });
  }
}

/** Admin/director: list floor managers + reset password */
export async function listFloorManagers(req, res) {
  try {
    const r = await query(
      `SELECT id, login_code, department_id, floor_number, floor_label, floor_label_ar, must_change_password, updated_at
       FROM floor_managers
       ORDER BY department_id, floor_number`
    );
    res.json({
      managers: r.rows.map((row) => ({
        ...mapFloorManager(row),
        updatedAt: row.updated_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed" });
  }
}

export async function resetFloorManagerPassword(req, res) {
  try {
    const id = String(req.params.id || "");
    const password = String(req.body?.password || "");
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const mustChange =
      req.body?.mustChangePassword === undefined ? true : Boolean(req.body.mustChangePassword);
    const r = await query(
      `UPDATE floor_managers
       SET password_hash = $2, must_change_password = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, hash, mustChange]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, manager: mapFloorManager(r.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Reset failed" });
  }
}

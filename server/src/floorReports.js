import crypto from "crypto";
import { query } from "./db.js";

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

function mapManager(row) {
  const floorNumber = Number(row.floor_number);
  const managedYear = Number.isFinite(floorNumber) ? floorNumber + 1 : null;
  return {
    id: row.id,
    loginCode: row.login_code,
    departmentId: row.department_id || "primary",
    floorNumber,
    managedYear,
    floorLabel: row.floor_label || "",
    floorLabelAr: row.floor_label_ar || "",
  };
}

function emptyFormData() {
  return {
    timeFrom: "08:00",
    timeTo: "16:00",
    complaints: [""],
    problemsSolved: 0,
    actionsTaken: "",
    parentResponded: null,
    adminEscalation: "",
    floorNeeds: "",
    staffAbsences: [{ name: "", role: "", substitute: "" }],
    teacherLates: [{ teacherId: "", teacherName: "", duration: "", substitute: "" }],
    incident: "",
    cameraReview: null,
  };
}

function yn(v) {
  if (v === true || v === "yes" || v === "true" || v === 1 || v === "1") return "yes";
  if (v === false || v === "no" || v === "false" || v === 0 || v === "0") return "no";
  return null;
}

function clampStr(v, max = 4000) {
  return String(v ?? "").slice(0, max);
}

function normalizeFormData(raw) {
  const base = emptyFormData();
  if (!raw || typeof raw !== "object") return base;

  const complaints = Array.isArray(raw.complaints)
    ? raw.complaints.map((c) => clampStr(c, 2000)).filter((c, i, arr) => c || arr.length === 1)
    : base.complaints;
  if (!complaints.length) complaints.push("");

  const staffAbsences = Array.isArray(raw.staffAbsences)
    ? raw.staffAbsences
        .map((r) => ({
          name: clampStr(r?.name, 200),
          role: clampStr(r?.role, 80),
          substitute: clampStr(r?.substitute, 200),
        }))
        .filter((r) => r.name || r.role || r.substitute)
    : [];
  if (!staffAbsences.length) staffAbsences.push({ name: "", role: "", substitute: "" });

  const teacherLates = Array.isArray(raw.teacherLates)
    ? raw.teacherLates
        .map((r) => ({
          teacherId: clampStr(r?.teacherId, 64),
          teacherName: clampStr(r?.teacherName, 200),
          duration: clampStr(r?.duration, 80),
          substitute: clampStr(r?.substitute, 200),
        }))
        .filter((r) => r.teacherId || r.teacherName || r.duration || r.substitute)
    : [];
  if (!teacherLates.length) teacherLates.push({ teacherId: "", teacherName: "", duration: "", substitute: "" });

  const problemsSolved = Number(raw.problemsSolved);
  return {
    timeFrom: /^\d{2}:\d{2}$/.test(String(raw.timeFrom || "")) ? String(raw.timeFrom) : base.timeFrom,
    timeTo: /^\d{2}:\d{2}$/.test(String(raw.timeTo || "")) ? String(raw.timeTo) : base.timeTo,
    complaints: complaints.slice(0, 20),
    problemsSolved: Number.isFinite(problemsSolved) ? Math.max(0, Math.min(99, Math.round(problemsSolved))) : 0,
    actionsTaken: clampStr(raw.actionsTaken, 4000),
    parentResponded: yn(raw.parentResponded),
    adminEscalation: clampStr(raw.adminEscalation, 4000),
    floorNeeds: clampStr(raw.floorNeeds, 2000),
    staffAbsences: staffAbsences.slice(0, 20),
    teacherLates: teacherLates.slice(0, 20),
    incident: clampStr(raw.incident, 4000),
    cameraReview: yn(raw.cameraReview),
  };
}

function formPreviewText(form) {
  const bits = [];
  const complaints = (form.complaints || []).map((c) => String(c || "").trim()).filter(Boolean);
  if (complaints.length) bits.push(complaints[0]);
  if (String(form.incident || "").trim()) bits.push(String(form.incident).trim());
  if (String(form.actionsTaken || "").trim()) bits.push(String(form.actionsTaken).trim());
  if (String(form.adminEscalation || "").trim()) bits.push(String(form.adminEscalation).trim());
  if (form.cameraReview === "yes") bits.push("كاميرات");
  return bits.join(" · ").slice(0, 160);
}

function mapReport(row) {
  if (!row) {
    return {
      id: null,
      notes: "",
      form: emptyFormData(),
      status: "draft",
      submittedAt: null,
      updatedAt: null,
    };
  }
  return {
    id: row.id,
    notes: row.notes || "",
    form: normalizeFormData(row.form_data),
    status: row.status || "draft",
    submittedAt: row.submitted_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function loadFloorManager(id) {
  const r = await query("SELECT * FROM floor_managers WHERE id = $1", [id]);
  return r.rows[0] || null;
}

async function classesForManager(manager) {
  const year = Number(manager.floor_number) + 1;
  const r = await query(
    `SELECT * FROM classes
     WHERE department_id = $1 AND year = $2
     ORDER BY COALESCE(class_on_floor, 999), code`,
    [manager.department_id, year]
  );
  return r.rows;
}

/** Teachers assigned to any class in this manager's year (for dropdowns) */
async function teachersForManager(manager) {
  const classes = await classesForManager(manager);
  if (!classes.length) return [];
  const classIds = classes.map((c) => c.id);
  const r = await query(
    `SELECT DISTINCT t.id, t.first_name, t.last_name, t.name_latin, t.login_code
     FROM teachers t
     WHERE EXISTS (
       SELECT 1
       FROM jsonb_array_elements_text(COALESCE(t.class_ids, '[]'::jsonb)) AS cid(val)
       WHERE cid.val = ANY($1::text[])
     )
     ORDER BY t.last_name NULLS LAST, t.first_name NULLS LAST, t.login_code`,
    [classIds]
  );
  return r.rows.map((t) => {
    const name =
      [t.first_name, t.last_name].filter(Boolean).join(" ").trim() ||
      t.name_latin ||
      t.login_code ||
      t.id;
    return { id: t.id, name, loginCode: t.login_code || "" };
  });
}

/** Live absences / late / remarks / homework from teacher registers for a manager's year */
export async function buildLiveSnapshot(manager, date) {
  const classes = await classesForManager(manager);
  const empty = {
    date,
    classes: classes.map((c) => ({
      id: c.id,
      code: c.code || "",
      name: c.name || "",
      nameAr: c.name_ar || "",
      year: c.year,
    })),
    summary: { absent: 0, late: 0, remarks: 0, homework: 0, sessions: 0 },
    absences: [],
    late: [],
    remarks: [],
    homework: [],
  };
  if (!classes.length) return empty;

  const classIds = classes.map((c) => c.id);
  const classMap = new Map(classes.map((c) => [c.id, c]));

  const sessions = await query(
    `SELECT cs.id, cs.class_id, cs.subject, cs.homework, cs.teacher_id,
            t.first_name AS teacher_first, t.last_name AS teacher_last, t.login_code AS teacher_login
     FROM class_sessions cs
     JOIN teachers t ON t.id = cs.teacher_id
     WHERE cs.class_id = ANY($1::text[]) AND cs.session_date = $2::date
     ORDER BY cs.subject`,
    [classIds, date]
  );

  const absences = [];
  const late = [];
  const remarks = [];
  const homework = [];
  const summary = { absent: 0, late: 0, remarks: 0, homework: 0, sessions: sessions.rows.length };

  for (const s of sessions.rows) {
    const cls = classMap.get(s.class_id);
    const teacherName =
      [s.teacher_first, s.teacher_last].filter(Boolean).join(" ").trim() ||
      s.teacher_login ||
      s.teacher_id;
    const classMeta = {
      classId: s.class_id,
      classCode: cls?.code || "",
      className: cls?.name || "",
      classNameAr: cls?.name_ar || "",
      subject: s.subject || "",
      teacherName,
      sessionId: s.id,
    };

    if (String(s.homework || "").trim()) {
      summary.homework += 1;
      homework.push({ ...classMeta, homework: s.homework });
    }

    const entries = await query(
      `SELECT e.student_id, e.status, e.remark,
              st.full_name, st.full_name_latin, st.first_name, st.last_name, st.number
       FROM class_session_entries e
       LEFT JOIN students st ON st.id = e.student_id
       WHERE e.session_id = $1
         AND (e.status IN ('absent', 'late') OR BTRIM(COALESCE(e.remark, '')) <> '')`,
      [s.id]
    );

    for (const e of entries.rows) {
      const studentName =
        e.full_name ||
        [e.first_name, e.last_name].filter(Boolean).join(" ").trim() ||
        e.full_name_latin ||
        e.student_id;
      const item = {
        ...classMeta,
        studentId: e.student_id,
        studentName,
        studentNumber: e.number,
        status: e.status,
        remark: e.remark || "",
      };
      if (e.status === "absent") {
        summary.absent += 1;
        absences.push(item);
      } else if (e.status === "late") {
        summary.late += 1;
        late.push(item);
      }
      if (String(e.remark || "").trim()) {
        summary.remarks += 1;
        remarks.push(item);
      }
    }
  }

  const byCode = (a, b) =>
    String(a.classCode || "").localeCompare(String(b.classCode || ""), "en") ||
    String(a.studentName || "").localeCompare(String(b.studentName || ""), "ar");

  absences.sort(byCode);
  late.sort(byCode);
  remarks.sort(byCode);
  homework.sort((a, b) => String(a.classCode || "").localeCompare(String(b.classCode || ""), "en"));

  return {
    date,
    classes: empty.classes,
    summary,
    absences,
    late,
    remarks,
    homework,
  };
}

async function getReportRow(managerId, date) {
  const r = await query(
    `SELECT * FROM floor_daily_reports
     WHERE floor_manager_id = $1 AND report_date = $2::date`,
    [managerId, date]
  );
  return r.rows[0] || null;
}

/** Floor Manager: live day data + their notes/status for one date */
export async function getFloorReportDay(req, res) {
  try {
    const managerId = req.user?.floorManagerId;
    if (!managerId) return res.status(401).json({ error: "Unauthorized" });
    const manager = await loadFloorManager(managerId);
    if (!manager) return res.status(404).json({ error: "Floor manager not found" });

    const date = normalizeDate(req.query.date);
    const [live, reportRow, teachers] = await Promise.all([
      buildLiveSnapshot(manager, date),
      getReportRow(managerId, date),
      teachersForManager(manager),
    ]);

    res.json({
      date,
      manager: mapManager(manager),
      report: mapReport(reportRow),
      teachers,
      ...live,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load report" });
  }
}

/** Floor Manager: save structured form + notes; optionally mark sent */
export async function putFloorReportDay(req, res) {
  try {
    const managerId = req.user?.floorManagerId;
    if (!managerId) return res.status(401).json({ error: "Unauthorized" });
    const manager = await loadFloorManager(managerId);
    if (!manager) return res.status(404).json({ error: "Floor manager not found" });

    const date = normalizeDate(req.body?.date);
    const notes = String(req.body?.notes ?? "").slice(0, 8000);
    const form = normalizeFormData(req.body?.form ?? req.body?.formData);
    const send = Boolean(req.body?.send);
    const existing = await getReportRow(managerId, date);

    let row;
    if (existing) {
      const r = await query(
        `UPDATE floor_daily_reports
         SET notes = $2,
             form_data = $3::jsonb,
             status = CASE WHEN $4 THEN 'sent' ELSE status END,
             submitted_at = CASE
               WHEN $4 THEN NOW()
               ELSE submitted_at
             END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [existing.id, notes, JSON.stringify(form), send]
      );
      row = r.rows[0];
    } else {
      const id = newId("FDR");
      const r = await query(
        `INSERT INTO floor_daily_reports
           (id, floor_manager_id, report_date, notes, form_data, status, submitted_at, updated_at)
         VALUES ($1, $2, $3::date, $4, $5::jsonb, $6, $7, NOW())
         RETURNING *`,
        [id, managerId, date, notes, JSON.stringify(form), send ? "sent" : "draft", send ? new Date() : null]
      );
      row = r.rows[0];
    }

    const [live, teachers] = await Promise.all([
      buildLiveSnapshot(manager, date),
      teachersForManager(manager),
    ]);
    res.json({
      ok: true,
      date,
      manager: mapManager(manager),
      report: mapReport(row),
      teachers,
      ...live,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to save report" });
  }
}

/** Director: inbox of all floor managers for a date */
export async function listDirectorFloorReports(req, res) {
  try {
    const available = await query(
      `SELECT report_date::text AS date,
              COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
              COUNT(*)::int AS total
       FROM floor_daily_reports
       GROUP BY report_date
       ORDER BY report_date DESC
       LIMIT 120`
    );
    const availableDates = available.rows.map((r) => ({
      date: r.date,
      sent: r.sent || 0,
      total: r.total || 0,
    }));
    const today = todayIso();
    // Prefer the newest submitted day that is not in the future (OCR can invent later dates)
    const latestSent =
      availableDates.find((d) => d.sent > 0 && d.date <= today)?.date ||
      availableDates.find((d) => d.sent > 0)?.date ||
      null;

    const rawDate = String(req.query.date || "").trim();
    const date = rawDate ? normalizeDate(rawDate) : latestSent || today;

    const managers = await query(
      `SELECT fm.*,
              (
                SELECT COUNT(*)::int FROM classes c
                WHERE c.department_id = fm.department_id
                  AND c.year = (fm.floor_number + 1)
              ) AS class_count
       FROM floor_managers fm
       ORDER BY fm.department_id, fm.floor_number`
    );

    const reports = await query(
      `SELECT * FROM floor_daily_reports WHERE report_date = $1::date`,
      [date]
    );
    const reportByManager = new Map(reports.rows.map((r) => [r.floor_manager_id, r]));

    const items = [];
    for (const m of managers.rows) {
      const live = await buildLiveSnapshot(m, date);
      const reportRow = reportByManager.get(m.id);
      const report = mapReport(reportRow);
      const form = report.form || {};
      const complaints = (form.complaints || []).map((c) => String(c || "").trim()).filter(Boolean);
      const preview =
        report.status === "sent"
          ? formPreviewText(form) || String(report.notes || "").slice(0, 160)
          : "";
      items.push({
        manager: { ...mapManager(m), classCount: m.class_count || 0 },
        report,
        summary: live.summary,
        notesPreview: preview,
        formMeta: {
          complaints: complaints.length,
          problemsSolved: Number(form.problemsSolved) || 0,
          hasIncident: Boolean(String(form.incident || "").trim()),
          cameraReview: form.cameraReview || null,
          parentResponded: form.parentResponded || null,
          staffAbsences: (form.staffAbsences || []).filter((r) => r?.name || r?.role).length,
          teacherLates: (form.teacherLates || []).filter((r) => r?.teacherName || r?.duration).length,
          hasFloorNeeds: Boolean(String(form.floorNeeds || "").trim()),
        },
      });
    }

    const totals = items.reduce(
      (acc, it) => {
        acc.absent += it.summary.absent || 0;
        acc.late += it.summary.late || 0;
        acc.remarks += it.summary.remarks || 0;
        acc.homework += it.summary.homework || 0;
        if (it.report.status === "sent") acc.sent += 1;
        else acc.pending += 1;
        return acc;
      },
      { absent: 0, late: 0, remarks: 0, homework: 0, sent: 0, pending: 0 }
    );

    res.json({
      date,
      suggestedDate: latestSent,
      availableDates,
      totals,
      items,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load reports" });
  }
}

/** Director: full report for one floor manager + date */
export async function getDirectorFloorReport(req, res) {
  try {
    const managerId = String(req.params.managerId || "");
    const date = normalizeDate(req.query.date);
    const manager = await loadFloorManager(managerId);
    if (!manager) return res.status(404).json({ error: "Floor manager not found" });

    const [live, reportRow, teachers] = await Promise.all([
      buildLiveSnapshot(manager, date),
      getReportRow(managerId, date),
      teachersForManager(manager),
    ]);

    res.json({
      date,
      manager: mapManager(manager),
      report: mapReport(reportRow),
      teachers,
      ...live,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load report" });
  }
}

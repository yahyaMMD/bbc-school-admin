import crypto from "crypto";
import { query } from "./db.js";

function sid() {
  return "PF" + crypto.randomBytes(6).toString("hex").toUpperCase();
}

function clean(v, max = 2000) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

function mapRow(r) {
  return {
    id: r.id,
    studentLastName: r.student_last_name || "",
    studentFirstName: r.student_first_name || "",
    className: r.class_name || "",
    homeAddress: r.home_address || "",
    phonePrimary: r.phone_primary || "",
    phoneSecondary: r.phone_secondary || "",
    maritalStatus: r.marital_status || "",
    familySituation: r.family_situation || "",
    healthNotes: r.health_notes || "",
    emergencyName: r.emergency_name || "",
    emergencyPhone: r.emergency_phone || "",
    emergencyRelation: r.emergency_relation || "",
    status: r.status || "new",
    createdAt: r.created_at,
  };
}

/** Public: class list for a simple dropdown */
export async function listFormMeta(_req, res) {
  try {
    const r = await query(
      `SELECT id, code, name, name_ar, department_id, year
       FROM classes
       ORDER BY department_id, year, code`
    );
    res.json({
      academicYear: "2026 — 2027",
      classes: r.rows.map((c) => ({
        id: c.id,
        code: c.code,
        label: c.code,
        labelAr: c.name_ar || c.name || c.code,
        departmentId: c.department_id,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed" });
  }
}

/** Public: submit parent form */
export async function submitForm(req, res) {
  try {
    const b = req.body || {};
    const studentLastName = clean(b.studentLastName, 120);
    const studentFirstName = clean(b.studentFirstName, 120);
    const className = clean(b.className, 80);
    const homeAddress = clean(b.homeAddress, 1000);
    const phonePrimary = clean(b.phonePrimary, 40);
    const phoneSecondary = clean(b.phoneSecondary, 40);
    const maritalStatus = clean(b.maritalStatus, 40);
    const familySituation = clean(b.familySituation, 1000);
    const healthNotes = clean(b.healthNotes, 1000);
    const emergencyName = clean(b.emergencyName, 120);
    const emergencyPhone = clean(b.emergencyPhone, 40);
    const emergencyRelation = clean(b.emergencyRelation, 80);

    if (!studentLastName || !studentFirstName) {
      return res.status(400).json({ error: "اسم ولقب التلميذ مطلوبان / Nom et prénom requis" });
    }
    if (!homeAddress) {
      return res.status(400).json({ error: "العنوان مطلوب / Adresse requise" });
    }
    if (!phonePrimary || phonePrimary.replace(/\D/g, "").length < 8) {
      return res.status(400).json({ error: "رقم هاتف صحيح مطلوب / Téléphone valide requis" });
    }
    if (!emergencyName || !emergencyPhone) {
      return res
        .status(400)
        .json({ error: "جهة اتصال الطوارئ مطلوبة / Contact d'urgence requis" });
    }

    const id = sid();
    await query(
      `INSERT INTO parent_form_submissions (
        id, student_last_name, student_first_name, class_name,
        home_address, phone_primary, phone_secondary,
        marital_status, family_situation, health_notes,
        emergency_name, emergency_phone, emergency_relation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        studentLastName,
        studentFirstName,
        className,
        homeAddress,
        phonePrimary,
        phoneSecondary,
        maritalStatus,
        familySituation,
        healthNotes,
        emergencyName,
        emergencyPhone,
        emergencyRelation,
      ]
    );
    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Échec de l'envoi" });
  }
}

/** Admin: list submissions */
export async function listSubmissions(req, res) {
  try {
    const status = String(req.query.status || "").trim();
    let r;
    if (status) {
      r = await query(
        `SELECT * FROM parent_form_submissions WHERE status = $1 ORDER BY created_at DESC LIMIT 500`,
        [status]
      );
    } else {
      r = await query(
        `SELECT * FROM parent_form_submissions ORDER BY created_at DESC LIMIT 500`
      );
    }
    res.json({ submissions: r.rows.map(mapRow) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed" });
  }
}

/** Admin: one submission */
export async function getSubmission(req, res) {
  try {
    const r = await query(`SELECT * FROM parent_form_submissions WHERE id = $1`, [
      req.params.id,
    ]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(mapRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed" });
  }
}

/** Admin: update status (new / reviewed / linked) */
export async function updateSubmissionStatus(req, res) {
  try {
    const status = clean(req.body?.status, 40) || "reviewed";
    if (!["new", "reviewed", "linked"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const r = await query(
      `UPDATE parent_form_submissions SET status = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, status]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(mapRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed" });
  }
}

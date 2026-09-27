import crypto from "crypto";
import { query } from "./db.js";

function sid() {
  return "PF" + crypto.randomBytes(6).toString("hex").toUpperCase();
}

function clean(v, max = 4000) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

function cleanObj(obj, max = 2000) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = cleanObj(v, max);
    } else {
      out[k] = clean(v, max);
    }
  }
  return out;
}

function mapRow(r) {
  const formData = r.form_data && typeof r.form_data === "object" ? r.form_data : {};
  return {
    id: r.id,
    studentLastName: r.student_last_name || "",
    studentFirstName: r.student_first_name || "",
    dateOfBirth: r.date_of_birth || "",
    className: r.class_name || "",
    homeAddress: r.home_address || "",
    phonePrimary: r.phone_primary || "",
    phoneSecondary: r.phone_secondary || "",
    email: r.email || "",
    maritalStatus: r.marital_status || "",
    familySituation: r.family_situation || "",
    healthNotes: r.health_notes || "",
    emergencyName: r.emergency_name || "",
    emergencyPhone: r.emergency_phone || "",
    emergencyRelation: r.emergency_relation || "",
    formData,
    formVersion: r.form_version || 1,
    status: r.status || "new",
    createdAt: r.created_at,
  };
}

/** Public: lightweight meta */
export async function listFormMeta(_req, res) {
  res.json({
    academicYear: "2026 — 2027",
    formTitle: "استمارة جمع المعلومات واكتشاف المواهب",
    formTitleFr: "Fiche de collecte d'informations et détection des talents",
  });
}

/** Public: submit parent form (full school fiche) */
export async function submitForm(req, res) {
  try {
    const b = req.body || {};
    const formData = cleanObj(b.formData || b, 4000);

    const student = formData.student || {};
    const father = formData.father || {};
    const mother = formData.mother || {};
    const contact = formData.contact || {};

    const studentLastName = clean(student.lastName || b.studentLastName, 120);
    const studentFirstName = clean(student.firstName || b.studentFirstName, 120);
    const dateOfBirth = clean(student.dateOfBirth || b.dateOfBirth, 20);
    const homeAddress = clean(contact.address || b.homeAddress, 1000);
    const phonePrimary = clean(father.phone || contact.phoneFather || b.phonePrimary, 40);
    const phoneSecondary = clean(mother.phone || contact.phoneMother || b.phoneSecondary, 40);
    const email = clean(contact.email || b.email, 200);
    const phoneBackup = clean(contact.phoneBackup, 40);

    if (!studentLastName || !studentFirstName) {
      return res.status(400).json({ error: "اسم ولقب التلميذ مطلوبان / Nom et prénom requis" });
    }
    if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return res
        .status(400)
        .json({ error: "تاريخ الميلاد مطلوب / Date de naissance requise" });
    }
    if (!homeAddress) {
      return res.status(400).json({ error: "العنوان مطلوب / Adresse requise" });
    }
    if (!phonePrimary || phonePrimary.replace(/\D/g, "").length < 8) {
      return res.status(400).json({ error: "هاتف الأب مطلوب / Téléphone du père requis" });
    }
    if (!phoneSecondary || phoneSecondary.replace(/\D/g, "").length < 8) {
      return res.status(400).json({ error: "هاتف الأم مطلوب / Téléphone de la mère requis" });
    }
    if (!phoneBackup || phoneBackup.replace(/\D/g, "").length < 8) {
      return res
        .status(400)
        .json({ error: "رقم هاتف احتياطي مطلوب / Numéro de secours requis" });
    }

    // Ensure nested student basics are consistent
    formData.student = {
      ...(formData.student || {}),
      lastName: studentLastName,
      firstName: studentFirstName,
      dateOfBirth,
    };
    formData.contact = {
      ...(formData.contact || {}),
      address: homeAddress,
      email,
      phoneBackup,
    };
    formData.father = { ...(formData.father || {}), phone: phonePrimary };
    formData.mother = { ...(formData.mother || {}), phone: phoneSecondary };

    const id = sid();
    await query(
      `INSERT INTO parent_form_submissions (
        id, student_last_name, student_first_name, date_of_birth, class_name,
        home_address, phone_primary, phone_secondary, email,
        form_data, form_version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [
        id,
        studentLastName,
        studentFirstName,
        dateOfBirth,
        "",
        homeAddress,
        phonePrimary,
        phoneSecondary,
        email,
        JSON.stringify(formData),
        2,
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

/** Admin: update status */
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

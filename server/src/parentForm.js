import crypto from "crypto";
import fs from "fs";
import path from "path";
import { query } from "./db.js";
import { saveParentFormIdDocument, absoluteUploadPath } from "./uploads.js";

const FORM_VERSION = 6;

const ENROLLMENT_YEARS = [
  "2026-2027",
  "2025-2026",
  "2024-2025",
  "2023-2024",
  "2022-2023",
  "2021-2022",
  "2020-2021",
  "2019-2020",
  "2018-2019",
];

function sid() {
  return "PF" + crypto.randomBytes(6).toString("hex").toUpperCase();
}

function clean(v, max = 4000) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

/** Rebuild payload in the exact public-form field order (sections 1→3 + photo consent). */
export function normalizeFormData(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const student = r.student || {};
  const father = r.father || {};
  const mother = r.mother || {};
  const contact = r.contact || {};
  const family = r.family || {};
  const medical = r.medical || {};
  const consents = r.consents || {};

  return {
    student: {
      lastName: clean(student.lastName, 120),
      firstName: clean(student.firstName, 120),
      sex: clean(student.sex, 20),
      dateOfBirth: clean(student.dateOfBirth, 20),
      placeOfBirth: clean(student.placeOfBirth, 120),
      nationality: clean(student.nationality, 80),
      enrollmentYear: clean(student.enrollmentYear, 20),
      level: clean(student.level, 120),
      repeatedYear: clean(student.repeatedYear, 10),
      studiedAbroad: clean(student.studiedAbroad, 10),
    },
    father: {
      name: clean(father.name, 120),
      profession: clean(father.profession, 120),
      nationality: clean(father.nationality, 80),
      phone: clean(father.phone, 40),
    },
    mother: {
      name: clean(mother.name, 120),
      profession: clean(mother.profession, 120),
      nationality: clean(mother.nationality, 80),
      phone: clean(mother.phone, 40),
    },
    contact: {
      phoneBackup: clean(contact.phoneBackup, 40),
      address: clean(contact.address, 1000),
      email: clean(contact.email, 200),
    },
    family: {
      parentsStatus: clean(family.parentsStatus, 40),
      custody: clean(family.custody, 40),
      hasStepFather: clean(family.hasStepFather, 10),
      hasStepMother: clean(family.hasStepMother, 10),
      fatherDeceased: clean(family.fatherDeceased, 10),
      motherDeceased: clean(family.motherDeceased, 10),
      siblingsCount: clean(family.siblingsCount, 10),
      brothersCount: clean(family.brothersCount, 10),
      sistersCount: clean(family.sistersCount, 10),
      siblingRank: clean(family.siblingRank, 40),
      hasHalfSiblings: clean(family.hasHalfSiblings, 10),
      tutorNameRole: clean(family.tutorNameRole, 200),
      tutorPhone: clean(family.tutorPhone, 40),
      adopted: clean(family.adopted, 10),
      adoptedExplain: clean(family.adoptedExplain, 1000),
    },
    medical: {
      bloodType: clean(medical.bloodType, 20),
      disability: clean(medical.disability, 10),
      disabilityExplain: clean(medical.disabilityExplain, 1000),
      vaccinations: clean(medical.vaccinations, 500),
      hereditary: clean(medical.hereditary, 10),
      hereditaryOrigin: clean(medical.hereditaryOrigin, 40),
      hereditaryExplain: clean(medical.hereditaryExplain, 1000),
      acutePast: clean(medical.acutePast, 1000),
      organicCurrent: clean(medical.organicCurrent, 1000),
      allergy: clean(medical.allergy, 1000),
      glasses: clean(medical.glasses, 200),
      behavior: clean(medical.behavior, 1000),
      learningDifficulty: clean(medical.learningDifficulty, 1000),
      treatment: clean(medical.treatment, 1000),
      psychologist: clean(medical.psychologist, 200),
      incident: clean(medical.incident, 1000),
      other: clean(medical.other, 1000),
    },
    consents: {
      departureMode: clean(consents.departureMode, 40),
      companionRole: clean(consents.companionRole, 120),
      companionName: clean(consents.companionName, 120),
      companionPhone: clean(consents.companionPhone, 40),
      driverName: clean(consents.driverName, 120),
      driverPhone: clean(consents.driverPhone, 40),
      companionIdUrl: clean(consents.companionIdUrl, 400),
      companionIdName: clean(consents.companionIdName, 200),
      outings: clean(consents.outings, 10),
      sports: clean(consents.sports, 10),
      photoMedia: clean(consents.photoMedia, 10),
    },
  };
}

function mapRow(r) {
  const raw =
    r.form_data && typeof r.form_data === "object" ? r.form_data : {};
  const formData = normalizeFormData(raw);
  return {
    id: r.id,
    studentLastName: r.student_last_name || formData.student.lastName || "",
    studentFirstName: r.student_first_name || formData.student.firstName || "",
    dateOfBirth: r.date_of_birth || formData.student.dateOfBirth || "",
    enrollmentYear: r.enrollment_year || formData.student.enrollmentYear || "",
    studentLevel: r.student_level || formData.student.level || "",
    repeatedYear: r.repeated_year || formData.student.repeatedYear || "",
    studiedAbroad: r.studied_abroad || formData.student.studiedAbroad || "",
    homeAddress: r.home_address || formData.contact.address || "",
    phonePrimary: r.phone_primary || formData.father.phone || "",
    phoneSecondary: r.phone_secondary || formData.mother.phone || "",
    phoneBackup: r.phone_backup || formData.contact.phoneBackup || "",
    email: r.email || formData.contact.email || "",
    photoMedia: r.photo_media || formData.consents.photoMedia || "",
    companionIdUrl: r.companion_id_url || formData.consents.companionIdUrl || "",
    companionIdName: formData.consents.companionIdName || "",
    hasCompanionId: Boolean(r.companion_id_url || formData.consents.companionIdUrl),
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
    formTitle: "استمارة جمع المعلومات",
    formTitleEn: "Information collection form",
    formVersion: FORM_VERSION,
    sections: [
      "student",
      "father",
      "mother",
      "contact",
      "family",
      "medical",
      "consents",
    ],
  });
}

/** Public: submit parent form (current shortened fiche) */
export async function submitForm(req, res) {
  try {
    const b = req.body || {};
    const formData = normalizeFormData(b.formData || b);

    const { student, father, mother, contact, consents } = formData;

    if (!student.lastName || !student.firstName) {
      return res.status(400).json({ error: "اسم ولقب التلميذ مطلوبان / Surname and name required" });
    }
    if (!student.sex) {
      return res.status(400).json({ error: "الجنس مطلوب / Sex required" });
    }
    if (!student.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(student.dateOfBirth)) {
      return res.status(400).json({ error: "تاريخ الميلاد مطلوب / Date of birth required" });
    }
    if (!student.placeOfBirth) {
      return res.status(400).json({ error: "مكان الميلاد مطلوب / Place of birth required" });
    }
    if (!ENROLLMENT_YEARS.includes(student.enrollmentYear)) {
      return res
        .status(400)
        .json({ error: "تاريخ الالتحاق بالمدرسة مطلوب / Enrollment year required" });
    }
    if (!student.level) {
      return res.status(400).json({ error: "المستوى مطلوب / Level required" });
    }
    if (!["yes", "no"].includes(student.repeatedYear)) {
      return res
        .status(400)
        .json({ error: "إعادة السنة مطلوبة / Repeated year answer required" });
    }
    if (!["yes", "no"].includes(student.studiedAbroad)) {
      return res
        .status(400)
        .json({ error: "التمدرس بالخارج مطلوب / Studied abroad answer required" });
    }
    if (!father.name || father.phone.replace(/\D/g, "").length < 8) {
      return res.status(400).json({ error: "هاتف الأب مطلوب / Father's phone required" });
    }
    if (!mother.name || mother.phone.replace(/\D/g, "").length < 8) {
      return res.status(400).json({ error: "هاتف الأم مطلوب / Mother's phone required" });
    }
    if (contact.phoneBackup.replace(/\D/g, "").length < 8) {
      return res.status(400).json({ error: "رقم هاتف احتياطي مطلوب / Backup phone required" });
    }
    if (!contact.address) {
      return res.status(400).json({ error: "العنوان مطلوب / Address required" });
    }
    if (!["withParent", "alone", "companion", "driver"].includes(consents.departureMode)) {
      return res
        .status(400)
        .json({ error: "اختيار المغادرة مطلوب / Departure permission required" });
    }
    if (consents.departureMode === "companion") {
      if (!consents.companionRole || !consents.companionName || consents.companionPhone.replace(/\D/g, "").length < 8) {
        return res
          .status(400)
          .json({ error: "بيانات المرافق مطلوبة / Companion details required" });
      }
    }
    if (consents.departureMode === "driver") {
      if (!consents.driverName || consents.driverPhone.replace(/\D/g, "").length < 8) {
        return res
          .status(400)
          .json({ error: "بيانات السائق مطلوبة / Driver details required" });
      }
    }
    const needsId =
      consents.departureMode === "companion" || consents.departureMode === "driver";
    const idDataUrl = String(b.companionIdDataUrl || b.idDocumentDataUrl || "").trim();
    const idFileName = clean(b.companionIdFileName || b.idDocumentName || "", 200);
    if (needsId && !idDataUrl) {
      return res.status(400).json({
        error: "صورة بطاقة الهوية مطلوبة للحالة 3/4 / ID card copy required for options 3/4",
      });
    }
    if (!["yes", "no"].includes(consents.outings)) {
      return res
        .status(400)
        .json({ error: "موافقة الخرجات مطلوبة / Outings consent required" });
    }
    if (!["yes", "no"].includes(consents.sports)) {
      return res
        .status(400)
        .json({ error: "موافقة الرياضة مطلوبة / Sports consent required" });
    }
    if (!["yes", "no"].includes(consents.photoMedia)) {
      return res
        .status(400)
        .json({ error: "موافقة التصوير مطلوبة / Photo consent required" });
    }

    const id = sid();
    if (needsId) {
      const saved = saveParentFormIdDocument({ submissionId: id, dataUrl: idDataUrl });
      formData.consents.companionIdUrl = saved.url;
      formData.consents.companionIdName = idFileName || saved.filename;
    }

    await query(
      `INSERT INTO parent_form_submissions (
        id,
        student_last_name, student_first_name, date_of_birth,
        enrollment_year, student_level, repeated_year, studied_abroad,
        home_address, phone_primary, phone_secondary, phone_backup, email,
        photo_media, companion_id_url, form_data, form_version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)`,
      [
        id,
        student.lastName,
        student.firstName,
        student.dateOfBirth,
        student.enrollmentYear,
        student.level,
        student.repeatedYear,
        student.studiedAbroad,
        contact.address,
        father.phone,
        mother.phone,
        contact.phoneBackup,
        contact.email,
        consents.photoMedia,
        formData.consents.companionIdUrl || "",
        JSON.stringify(formData),
        FORM_VERSION,
      ]
    );
    res.status(201).json({
      ok: true,
      id,
      formVersion: FORM_VERSION,
      hasCompanionId: Boolean(formData.consents.companionIdUrl),
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Submit failed" });
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
    res.json({ submissions: r.rows.map(mapRow), formVersion: FORM_VERSION });
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

/** Admin: download companion/driver ID document from VPS volume */
export async function getCompanionIdDocument(req, res) {
  try {
    const r = await query(`SELECT * FROM parent_form_submissions WHERE id = $1`, [
      req.params.id,
    ]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    const row = mapRow(r.rows[0]);
    const url = row.companionIdUrl || "";
    if (!url) return res.status(404).json({ error: "No ID document" });
    const abs = absoluteUploadPath(url);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ error: "File missing on server" });
    }
    const ext = path.extname(abs).toLowerCase();
    const mime =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : "image/jpeg";
    const downloadName =
      row.companionIdName ||
      `id-${row.id}${ext || ".bin"}`;
    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(downloadName).replace(/"/g, "")}"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    fs.createReadStream(abs).pipe(res);
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

import crypto from "crypto";
import { query } from "./db.js";

function newId(prefix) {
  return prefix + crypto.randomBytes(5).toString("hex").toUpperCase();
}

const FORM_TYPES = new Set(["printing", "concern", "filming", "followup"]);
const STATUSES = new Set(["new", "seen", "in_progress", "done", "rejected"]);

function clamp(s, n = 4000) {
  return String(s ?? "").slice(0, n);
}

function youtubeIdFromUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  const m =
    s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/) ||
    s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : "";
}

function mapSubmission(row) {
  return {
    id: row.id,
    formType: row.form_type,
    payload: row.payload || {},
    status: row.status,
    teacherName: row.teacher_name || "",
    classCode: row.class_code || "",
    managerNote: row.manager_note || "",
    unread: Boolean(row.unread),
    createdAt: row.created_at,
    seenAt: row.seen_at,
    resolvedAt: row.resolved_at,
    updatedAt: row.updated_at,
  };
}

function mapContent(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title || "",
    body: row.body || "",
    youtubeUrl: row.youtube_url || "",
    youtubeId: row.youtube_id || "",
    audience: row.audience || "both",
    published: Boolean(row.published),
    sortOrder: row.sort_order || 0,
    meta: row.meta || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePayload(type, raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const base = {
    teacherName: clamp(p.teacherName || p.teacher || "", 200),
    classCode: clamp(p.classCode || p.class || "", 40),
    notes: clamp(p.notes || "", 4000),
  };
  if (type === "printing") {
    return {
      ...base,
      title: clamp(p.title || p.documentTitle || "", 300),
      copies: Math.max(1, Math.min(500, Number(p.copies) || 1)),
      color: ["bw", "color"].includes(String(p.color || "")) ? String(p.color) : "bw",
      neededBy: clamp(p.neededBy || "", 40),
      description: clamp(p.description || "", 2000),
    };
  }
  if (type === "concern") {
    return {
      ...base,
      concern: clamp(p.concern || p.description || "", 4000),
      discussed: p.discussed === true || p.discussed === "yes" || p.discussed === "true",
      discussedWith: clamp(p.discussedWith || "", 200),
      urgency: ["low", "normal", "high"].includes(String(p.urgency || ""))
        ? String(p.urgency)
        : "normal",
    };
  }
  if (type === "filming") {
    return {
      ...base,
      activityTitle: clamp(p.activityTitle || p.title || "", 300),
      proposedAt: clamp(p.proposedAt || p.datetime || "", 80),
      cognitiveObjectives: clamp(p.cognitiveObjectives || p.objectives || "", 4000),
      materialsReadyBy: clamp(p.materialsReadyBy || "", 80),
      location: clamp(p.location || "", 200),
      duration: clamp(p.duration || "", 80),
    };
  }
  // followup
  const areas = Array.isArray(p.areas)
    ? p.areas.map((a) => clamp(a, 120)).filter(Boolean).slice(0, 30)
    : [];
  return {
    ...base,
    observationDate: clamp(p.observationDate || p.date || "", 40),
    studentName: clamp(p.studentName || "", 200),
    areas,
    observation: clamp(p.observation || p.description || "", 4000),
    supportGiven: clamp(p.supportGiven || "", 2000),
    followUpNeeded: clamp(p.followUpNeeded || "", 2000),
  };
}

/** Public: published content for a hub */
export async function getPublicContent(req, res) {
  try {
    const audience = String(req.query.audience || "teachers");
    const aud = audience === "parents" ? "parents" : "teachers";
    const r = await query(
      `SELECT * FROM preschool_content
       WHERE published = TRUE
         AND (audience = 'both' OR audience = $1)
       ORDER BY kind, sort_order, created_at DESC`,
      [aud]
    );
    const items = r.rows.map(mapContent);
    const byKind = {
      announcement: items.filter((x) => x.kind === "announcement"),
      drama: items.filter((x) => x.kind === "drama"),
      curriculum: items.filter((x) => x.kind === "curriculum"),
      contact: items.filter((x) => x.kind === "contact"),
    };
    res.json({ audience: aud, ...byKind });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load content" });
  }
}

/** Public: submit a form */
export async function submitForm(req, res) {
  try {
    const formType = String(req.body?.formType || req.body?.type || "").trim();
    if (!FORM_TYPES.has(formType)) {
      return res.status(400).json({ error: "Invalid form type" });
    }
    const payload = normalizePayload(formType, req.body?.payload || req.body);
    if (formType === "printing" && !payload.title && !payload.description) {
      return res.status(400).json({ error: "Title or description required" });
    }
    if (formType === "concern" && !payload.concern) {
      return res.status(400).json({ error: "Concern text required" });
    }
    if (formType === "filming" && !payload.activityTitle) {
      return res.status(400).json({ error: "Activity title required" });
    }
    if (formType === "followup" && !payload.observation && !payload.areas.length) {
      return res.status(400).json({ error: "Observation or areas required" });
    }

    const id = newId("PSF");
    const r = await query(
      `INSERT INTO preschool_form_submissions
         (id, form_type, payload, status, teacher_name, class_code, unread, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'new', $4, $5, TRUE, NOW(), NOW())
       RETURNING *`,
      [
        id,
        formType,
        JSON.stringify(payload),
        payload.teacherName || "",
        payload.classCode || "",
      ]
    );
    res.json({ ok: true, id, submission: mapSubmission(r.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to submit" });
  }
}

/** Manager: dashboard counts */
export async function getDashboard(req, res) {
  try {
    const counts = await query(
      `SELECT form_type,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
              COUNT(*) FILTER (WHERE unread)::int AS unread_count,
              COUNT(*) FILTER (WHERE status IN ('new','seen','in_progress'))::int AS open_count
       FROM preschool_form_submissions
       GROUP BY form_type`
    );
    const unread = await query(
      `SELECT COUNT(*)::int AS n FROM preschool_form_submissions WHERE unread = TRUE`
    );
    const recent = await query(
      `SELECT * FROM preschool_form_submissions
       ORDER BY created_at DESC LIMIT 12`
    );
    res.json({
      unread: unread.rows[0]?.n || 0,
      byType: Object.fromEntries(
        counts.rows.map((r) => [
          r.form_type,
          {
            total: r.total,
            new: r.new_count,
            unread: r.unread_count,
            open: r.open_count,
          },
        ])
      ),
      recent: recent.rows.map(mapSubmission),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load dashboard" });
  }
}

/** Manager: list submissions */
export async function listSubmissions(req, res) {
  try {
    const type = String(req.query.type || "").trim();
    const status = String(req.query.status || "").trim();
    const params = [];
    const where = [];
    if (FORM_TYPES.has(type)) {
      params.push(type);
      where.push(`form_type = $${params.length}`);
    }
    if (STATUSES.has(status)) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    const sql = `SELECT * FROM preschool_form_submissions
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT 200`;
    const r = await query(sql, params);
    res.json({ items: r.rows.map(mapSubmission) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to list" });
  }
}

export async function getSubmission(req, res) {
  try {
    const id = String(req.params.id || "");
    const r = await query(`SELECT * FROM preschool_form_submissions WHERE id = $1`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    const row = r.rows[0];
    if (row.unread) {
      await query(
        `UPDATE preschool_form_submissions
         SET unread = FALSE,
             status = CASE WHEN status = 'new' THEN 'seen' ELSE status END,
             seen_at = COALESCE(seen_at, NOW()),
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
      const r2 = await query(`SELECT * FROM preschool_form_submissions WHERE id = $1`, [id]);
      return res.json({ submission: mapSubmission(r2.rows[0]) });
    }
    res.json({ submission: mapSubmission(row) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load" });
  }
}

export async function patchSubmission(req, res) {
  try {
    const id = String(req.params.id || "");
    const status = String(req.body?.status || "").trim();
    const note = req.body?.managerNote != null ? clamp(req.body.managerNote, 4000) : null;
    if (status && !STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const existing = await query(`SELECT * FROM preschool_form_submissions WHERE id = $1`, [id]);
    if (!existing.rows.length) return res.status(404).json({ error: "Not found" });

    const r = await query(
      `UPDATE preschool_form_submissions
       SET status = COALESCE($2, status),
           manager_note = COALESCE($3, manager_note),
           unread = FALSE,
           seen_at = COALESCE(seen_at, NOW()),
           resolved_at = CASE
             WHEN $2 IN ('done', 'rejected') THEN NOW()
             ELSE resolved_at
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status || null, note]
    );
    res.json({ ok: true, submission: mapSubmission(r.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to update" });
  }
}

/** Manager: list all content (incl. unpublished) */
export async function listContent(req, res) {
  try {
    const kind = String(req.query.kind || "").trim();
    const params = [];
    let sql = `SELECT * FROM preschool_content`;
    if (["announcement", "drama", "curriculum", "contact"].includes(kind)) {
      params.push(kind);
      sql += ` WHERE kind = $1`;
    }
    sql += ` ORDER BY kind, sort_order, created_at DESC`;
    const r = await query(sql, params);
    res.json({ items: r.rows.map(mapContent) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to list content" });
  }
}

export async function upsertContent(req, res) {
  try {
    const kind = String(req.body?.kind || "").trim();
    if (!["announcement", "drama", "curriculum", "contact"].includes(kind)) {
      return res.status(400).json({ error: "Invalid kind" });
    }
    const id = String(req.body?.id || "").trim() || newId("PSK");
    const title = clamp(req.body?.title, 300);
    const body = clamp(req.body?.body, 12000);
    const youtubeUrl = clamp(req.body?.youtubeUrl, 500);
    const youtubeId = youtubeIdFromUrl(youtubeUrl) || clamp(req.body?.youtubeId, 20);
    const audience = ["teachers", "parents", "both"].includes(String(req.body?.audience || ""))
      ? String(req.body.audience)
      : "both";
    const published = req.body?.published !== false && req.body?.published !== "false";
    const sortOrder = Number(req.body?.sortOrder) || 0;

    const r = await query(
      `INSERT INTO preschool_content
         (id, kind, title, body, youtube_url, youtube_id, audience, published, sort_order, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (id) DO UPDATE SET
         kind = EXCLUDED.kind,
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         youtube_url = EXCLUDED.youtube_url,
         youtube_id = EXCLUDED.youtube_id,
         audience = EXCLUDED.audience,
         published = EXCLUDED.published,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()
       RETURNING *`,
      [id, kind, title, body, youtubeUrl, youtubeId, audience, published, sortOrder]
    );
    res.json({ ok: true, item: mapContent(r.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to save content" });
  }
}

export async function deleteContent(req, res) {
  try {
    const id = String(req.params.id || "");
    await query(`DELETE FROM preschool_content WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to delete" });
  }
}

/** Public meta: class list for form dropdowns */
export async function getPublicMeta(_req, res) {
  try {
    const r = await query(
      `SELECT code, name, name_ar FROM classes
       WHERE department_id = 'preschool'
       ORDER BY class_on_floor NULLS LAST, code`
    );
    res.json({
      classes: r.rows.map((c) => ({
        code: c.code,
        name: c.name,
        nameAr: c.name_ar,
      })),
      followupAreas: [
        "Difficulty following instructions",
        "Difficulty maintaining attention",
        "Very high level of physical activity",
        "Limited participation",
        "Difficulty remaining engaged in an activity",
        "Limited verbal communication",
        "Difficulty completing age-appropriate classroom tasks",
        "Frequent refusal or resistance to instructions",
        "Frequently seeking attention",
        "Strong dependence on adult assistance",
        "Physical aggression toward classmates or adults",
        "Verbal aggression or threatening language",
        "Difficulty understanding simple tasks",
        "Difficulty recalling previously learned information",
        "Difficulty identifying patterns, similarities, or differences",
        "Very slow progress",
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load meta" });
  }
}

import crypto from "crypto";
import fs from "fs";
import { query } from "./db.js";
import { saveAnnouncementImage, absoluteUploadPath } from "./uploads.js";
import { generatePosterFromText } from "./posterHtml.js";

const WA_BRIDGE_URL = (process.env.WA_BRIDGE_URL || "http://127.0.0.1:3847").replace(/\/$/, "");
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

let schedulerStarted = false;
let schedulerBusy = false;

function sid(prefix = "ANN") {
  return prefix + crypto.randomBytes(5).toString("hex").toUpperCase();
}

function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(String(text || ""));
}

function mapAnnouncement(r) {
  return {
    id: r.id,
    text: r.text || "",
    imagePath: r.image_path || "",
    groupIds: r.group_ids || [],
    groupNames: r.group_names || [],
    status: r.status || "draft",
    sendResults: r.send_results || [],
    scheduledAt: r.scheduled_at || null,
    sentAt: r.sent_at || null,
    createdBy: r.created_by || "admin",
    createdAt: r.created_at,
  };
}

async function bridgeFetch(path, options = {}) {
  const url = `${WA_BRIDGE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Bridge error ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function parseScheduleInput(body) {
  const delayMinutes = Number(body?.delayMinutes);
  if (Number.isFinite(delayMinutes) && delayMinutes > 0) {
    const ms = Math.min(delayMinutes, 60 * 24 * 30) * 60 * 1000;
    return new Date(Date.now() + ms);
  }
  const raw = String(body?.scheduleAt || body?.scheduledAt || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("Invalid schedule time");
    err.status = 400;
    throw err;
  }
  if (d.getTime() <= Date.now() + 15_000) {
    const err = new Error("Schedule time must be at least ~30 seconds in the future");
    err.status = 400;
    throw err;
  }
  return d;
}

async function deliverImageToGroups({ imageUrl, groupIds, groupNames, text, createdBy, announcementId }) {
  const abs = absoluteUploadPath(imageUrl);
  if (!abs || !fs.existsSync(abs)) {
    const err = new Error("Image file not found on server");
    err.status = 400;
    throw err;
  }

  const buffer = fs.readFileSync(abs);
  const ext = String(abs).split(".").pop()?.toLowerCase() || "png";
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/png";

  // Image only — never attach announcement text as WhatsApp caption
  const bridgeResult = await bridgeFetch("/send-image", {
    method: "POST",
    body: JSON.stringify({
      groupIds,
      base64: buffer.toString("base64"),
      mime,
      filename: `announcement.${ext}`,
    }),
  });

  const status =
    bridgeResult.failed === 0 ? "sent" : bridgeResult.sent > 0 ? "partial" : "failed";

  if (announcementId) {
    await query(
      `UPDATE announcements
       SET status = $2,
           send_results = $3::jsonb,
           scheduled_at = NULL,
           sent_at = NOW()
       WHERE id = $1`,
      [announcementId, status, JSON.stringify(bridgeResult.results || [])]
    );
    const row = await query("SELECT * FROM announcements WHERE id = $1", [announcementId]);
    return { bridgeResult, status, announcement: mapAnnouncement(row.rows[0]) };
  }

  const id = sid("ANN");
  await query(
    `INSERT INTO announcements (
      id, text, image_path, group_ids, group_names, status, send_results, created_by, scheduled_at, sent_at
    ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8,NULL,NOW())`,
    [
      id,
      text || "",
      imageUrl,
      JSON.stringify(groupIds),
      JSON.stringify(groupNames || []),
      status,
      JSON.stringify(bridgeResult.results || []),
      createdBy || "whatsapp",
    ]
  );
  const row = await query("SELECT * FROM announcements WHERE id = $1", [id]);
  return { bridgeResult, status, announcement: mapAnnouncement(row.rows[0]) };
}

export async function listAnnouncements(_req, res) {
  try {
    const r = await query(
      `SELECT * FROM announcements
       ORDER BY
         CASE WHEN status = 'scheduled' THEN 0 ELSE 1 END,
         COALESCE(scheduled_at, created_at) DESC
       LIMIT 200`
    );
    res.json(r.rows.map(mapAnnouncement));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to list announcements" });
  }
}

export async function getAnnouncement(req, res) {
  try {
    const r = await query("SELECT * FROM announcements WHERE id = $1", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(mapAnnouncement(r.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed" });
  }
}

export async function waStatus(_req, res) {
  try {
    const status = await bridgeFetch("/health");
    res.json({
      ok: true,
      ...status,
      qrUrl: status.qrReady ? "/api/announcements/wa/qr" : null,
      bridge: WA_BRIDGE_URL,
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      ready: false,
      qrReady: false,
      error: err.message || "WhatsApp bridge unreachable",
    });
  }
}

export async function waQr(_req, res) {
  try {
    const url = `${WA_BRIDGE_URL}/qr`;
    const r = await fetch(url);
    if (!r.ok) {
      return res.status(r.status).json({ error: "QR not ready" });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.type("png").send(buf);
  } catch (err) {
    res.status(503).json({ error: err.message || "Bridge unreachable" });
  }
}

export async function waGroups(_req, res) {
  try {
    const data = await bridgeFetch("/groups");
    res.json(data);
  } catch (err) {
    res.status(err.status || 503).json({ ok: false, error: err.message || "Failed to load groups" });
  }
}

export async function waLogout(_req, res) {
  try {
    const data = await bridgeFetch("/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 503).json({
      ok: false,
      ready: false,
      qrReady: false,
      error: err.message || "Failed to disconnect WhatsApp",
    });
  }
}

export async function generateImage(req, res) {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "text required" });
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY not configured on server" });
    }

    const poster = await generatePosterFromText(text);
    const saved = saveAnnouncementImage({
      buffer: poster.buffer,
      mime: poster.mime,
      id: sid("IMG"),
    });
    res.json({
      ok: true,
      url: saved.url,
      text,
      model: poster.model,
      method: poster.method,
      provider: "openrouter+html",
      arabic: poster.arabic,
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Image generation failed" });
  }
}

export async function uploadImage(req, res) {
  try {
    const dataUrl = req.body?.dataUrl;
    if (!dataUrl) return res.status(400).json({ error: "dataUrl required" });
    const saved = saveAnnouncementImage({ dataUrl, id: sid("IMG") });
    res.json({ ok: true, url: saved.url });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Upload failed" });
  }
}

export async function sendAnnouncement(req, res) {
  try {
    const text = String(req.body?.text || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim();
    const groupIds = Array.isArray(req.body?.groupIds) ? req.body.groupIds.filter(Boolean) : [];
    const groupNames = Array.isArray(req.body?.groupNames) ? req.body.groupNames : [];
    const scheduleAt = parseScheduleInput(req.body || {});

    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
    if (!groupIds.length) return res.status(400).json({ error: "Select at least one group" });

    const abs = absoluteUploadPath(imageUrl);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(400).json({ error: "Image file not found on server" });
    }

    if (scheduleAt) {
      const id = sid("ANN");
      await query(
        `INSERT INTO announcements (
          id, text, image_path, group_ids, group_names, status, send_results, created_by, scheduled_at
        ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,'scheduled','[]'::jsonb,$6,$7)`,
        [
          id,
          text,
          imageUrl,
          JSON.stringify(groupIds),
          JSON.stringify(groupNames),
          req.user?.role || "whatsapp",
          scheduleAt.toISOString(),
        ]
      );
      const row = await query("SELECT * FROM announcements WHERE id = $1", [id]);
      return res.status(201).json({
        ok: true,
        scheduled: true,
        announcement: mapAnnouncement(row.rows[0]),
      });
    }

    const result = await deliverImageToGroups({
      imageUrl,
      groupIds,
      groupNames,
      text,
      createdBy: req.user?.role || "whatsapp",
    });

    res.status(201).json({
      ok: result.bridgeResult.ok,
      scheduled: false,
      announcement: result.announcement,
      send: result.bridgeResult,
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({
      error: err.message || "Send failed",
      details: err.data || undefined,
    });
  }
}

export async function cancelAnnouncement(req, res) {
  try {
    const id = String(req.params.id || "");
    const r = await query("SELECT * FROM announcements WHERE id = $1", [id]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    if (r.rows[0].status !== "scheduled") {
      return res.status(400).json({ error: "Only scheduled announcements can be cancelled" });
    }
    await query(
      `UPDATE announcements SET status = 'cancelled', scheduled_at = NULL WHERE id = $1`,
      [id]
    );
    const updated = await query("SELECT * FROM announcements WHERE id = $1", [id]);
    res.json({ ok: true, announcement: mapAnnouncement(updated.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Cancel failed" });
  }
}

async function processDueSchedules() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    const due = await query(
      `SELECT * FROM announcements
       WHERE status = 'scheduled'
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT 5`
    );
    for (const row of due.rows) {
      try {
        // Claim row so parallel workers don't double-send
        const claim = await query(
          `UPDATE announcements SET status = 'sending'
           WHERE id = $1 AND status = 'scheduled'
           RETURNING id`,
          [row.id]
        );
        if (!claim.rows.length) continue;

        await deliverImageToGroups({
          imageUrl: row.image_path,
          groupIds: row.group_ids || [],
          groupNames: row.group_names || [],
          text: row.text || "",
          createdBy: row.created_by,
          announcementId: row.id,
        });
        console.log("Scheduled announcement sent:", row.id);
      } catch (err) {
        console.error("Scheduled send failed", row.id, err);
        await query(
          `UPDATE announcements
           SET status = 'failed',
               send_results = $2::jsonb,
               scheduled_at = NULL
           WHERE id = $1`,
          [
            row.id,
            JSON.stringify([{ ok: false, error: err.message || String(err) }]),
          ]
        );
      }
    }
  } catch (err) {
    console.error("Scheduler tick failed", err);
  } finally {
    schedulerBusy = false;
  }
}

export function startAnnouncementScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const ms = Number(process.env.ANN_SCHEDULER_MS || 20000);
  setInterval(() => {
    processDueSchedules().catch(() => {});
  }, Math.max(5000, ms));
  // Run once shortly after boot
  setTimeout(() => {
    processDueSchedules().catch(() => {});
  }, 4000);
  console.log(`Announcement scheduler started (every ${Math.max(5000, ms)}ms)`);
}

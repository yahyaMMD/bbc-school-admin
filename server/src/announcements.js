import crypto from "crypto";
import fs from "fs";
import { query } from "./db.js";
import { saveAnnouncementImage, absoluteUploadPath } from "./uploads.js";

const WA_BRIDGE_URL = (process.env.WA_BRIDGE_URL || "http://127.0.0.1:3847").replace(/\/$/, "");
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_IMAGE_MODEL =
  process.env.OPENROUTER_IMAGE_MODEL || "sourceful/riverflow-v2-fast";

function sid(prefix = "ANN") {
  return prefix + crypto.randomBytes(5).toString("hex").toUpperCase();
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

export async function listAnnouncements(_req, res) {
  try {
    const r = await query("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 200");
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

export async function generateImage(req, res) {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "text required" });
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY not configured on server" });
    }

    const prompt = [
      "Create a clean, professional school announcement poster image.",
      "Brand: Quality education Algerie (Q.E.A), orange accent, modern, readable typography.",
      "Arabic and/or French text on the poster when the announcement is in those languages.",
      "No QR codes, no watermarks, no extra logos unless simple.",
      "Announcement content:",
      text,
    ].join("\n");

    // Prefer fast models first; fall back if a model is unavailable on the key
    const models = [
      OPENROUTER_IMAGE_MODEL,
      "sourceful/riverflow-v2-fast",
      "google/gemini-2.5-flash-image",
      "black-forest-labs/flux.2-flex",
    ].filter((m, i, arr) => m && arr.indexOf(m) === i);

    let imageItem = null;
    let usedModel = null;
    let lastError = "";

    for (const model of models) {
      const orRes = await fetch("https://openrouter.ai/api/v1/images", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://qea.local",
          "X-Title": process.env.OPENROUTER_APP_NAME || "QEA Announcements",
        },
        body: JSON.stringify({
          model,
          prompt: prompt.slice(0, 3900),
          aspect_ratio: "1:1",
          output_format: "png",
        }),
      });
      const orText = await orRes.text();
      let parsed = null;
      try {
        parsed = JSON.parse(orText);
      } catch {
        parsed = null;
      }
      if (orRes.ok && parsed?.data?.[0]) {
        imageItem = parsed.data[0];
        usedModel = model;
        break;
      }
      lastError =
        parsed?.error?.message ||
        parsed?.error ||
        `OpenRouter image generation failed (${orRes.status}) for ${model}`;
      const msg = String(lastError).toLowerCase();
      if (
        msg.includes("not found") ||
        msg.includes("no endpoints") ||
        msg.includes("does not exist") ||
        orRes.status === 404
      ) {
        continue;
      }
      break;
    }

    if (!imageItem) {
      return res.status(502).json({ error: String(lastError || "Image generation failed") });
    }

    let buffer = null;
    let mime = imageItem.media_type || "image/png";
    const b64 = imageItem.b64_json;
    const remoteUrl = imageItem.url;

    if (b64) {
      // OpenRouter may return raw base64 or a data URL
      const raw = String(b64).includes(",") ? String(b64).split(",").pop() : String(b64);
      buffer = Buffer.from(raw, "base64");
    } else if (remoteUrl) {
      if (String(remoteUrl).startsWith("data:")) {
        const m = String(remoteUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!m) return res.status(502).json({ error: "Invalid data URL from OpenRouter" });
        mime = m[1];
        buffer = Buffer.from(m[2], "base64");
      } else {
        const imgRes = await fetch(remoteUrl);
        if (!imgRes.ok) {
          return res.status(502).json({ error: "Failed to download generated image" });
        }
        buffer = Buffer.from(await imgRes.arrayBuffer());
        const ct = imgRes.headers.get("content-type") || mime;
        mime = ct.split(";")[0].trim();
      }
    } else {
      return res.status(502).json({ error: "No image in OpenRouter response" });
    }

    const saved = saveAnnouncementImage({
      buffer,
      mime,
      id: sid("IMG"),
    });
    res.json({ ok: true, url: saved.url, text, model: usedModel, provider: "openrouter" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Image generation failed" });
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
    const caption = String(req.body?.caption || text || "").trim();

    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
    if (!groupIds.length) return res.status(400).json({ error: "Select at least one group" });

    const abs = absoluteUploadPath(imageUrl);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(400).json({ error: "Image file not found on server" });
    }

    // Pass base64 to the bridge — more reliable than cross-container file paths
    // with current whatsapp-web.js media send bugs.
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

    const bridgeResult = await bridgeFetch("/send-image", {
      method: "POST",
      body: JSON.stringify({
        groupIds,
        base64: buffer.toString("base64"),
        mime,
        filename: `announcement.${ext}`,
        caption: caption || undefined,
      }),
    });

    const id = sid("ANN");
    const status =
      bridgeResult.failed === 0 ? "sent" : bridgeResult.sent > 0 ? "partial" : "failed";

    await query(
      `INSERT INTO announcements (
        id, text, image_path, group_ids, group_names, status, send_results, created_by
      ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8)`,
      [
        id,
        text,
        imageUrl,
        JSON.stringify(groupIds),
        JSON.stringify(groupNames),
        status,
        JSON.stringify(bridgeResult.results || []),
        req.user?.role || "whatsapp",
      ]
    );

    const row = await query("SELECT * FROM announcements WHERE id = $1", [id]);
    res.status(201).json({
      ok: bridgeResult.ok,
      announcement: mapAnnouncement(row.rows[0]),
      send: bridgeResult,
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({
      error: err.message || "Send failed",
      details: err.data || undefined,
    });
  }
}

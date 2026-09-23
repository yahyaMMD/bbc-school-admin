import crypto from "crypto";
import fs from "fs";
import { query } from "./db.js";
import { saveAnnouncementImage, absoluteUploadPath } from "./uploads.js";

const WA_BRIDGE_URL = (process.env.WA_BRIDGE_URL || "http://127.0.0.1:3847").replace(/\/$/, "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

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
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not configured on server" });
    }

    const prompt = [
      "Create a clean, professional school announcement poster image.",
      "Brand: Quality education Algerie (Q.E.A), orange accent, modern, readable typography.",
      "No QR codes, no watermarks, no extra logos unless simple.",
      "Announcement content:",
      text,
    ].join("\n");

    // dall-e-3 retired May 2026 — use GPT Image models (try newest first)
    const models = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"];
    let oaData = null;
    let usedModel = null;
    let lastError = "";

    for (const model of models) {
      const body = {
        model,
        prompt: prompt.slice(0, 3900),
        size: "1024x1024",
        n: 1,
      };
      // gpt-image-* uses low|medium|high|auto — not DALL·E quality enums
      if (model.startsWith("gpt-image")) {
        body.quality = "medium";
      }

      const oa = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const oaText = await oa.text();
      let parsed = null;
      try {
        parsed = JSON.parse(oaText);
      } catch {
        parsed = null;
      }
      if (oa.ok && parsed) {
        oaData = parsed;
        usedModel = model;
        break;
      }
      lastError =
        parsed?.error?.message ||
        parsed?.error ||
        `OpenAI image generation failed (${oa.status}) for ${model}`;
      // Try next model if this one is missing / unauthorized for org
      const msg = String(lastError).toLowerCase();
      if (
        msg.includes("does not exist") ||
        msg.includes("not found") ||
        msg.includes("not available") ||
        msg.includes("model_not_found") ||
        oa.status === 404
      ) {
        continue;
      }
      // Other errors (billing, moderation, etc.) — stop
      break;
    }

    if (!oaData) {
      return res.status(502).json({ error: String(lastError || "Image generation failed") });
    }

    const b64 = oaData?.data?.[0]?.b64_json;
    const remoteUrl = oaData?.data?.[0]?.url;
    let buffer = null;
    let mime = "image/png";

    if (b64) {
      buffer = Buffer.from(b64, "base64");
    } else if (remoteUrl) {
      const imgRes = await fetch(remoteUrl);
      if (!imgRes.ok) {
        return res.status(502).json({ error: "Failed to download generated image" });
      }
      buffer = Buffer.from(await imgRes.arrayBuffer());
      const ct = imgRes.headers.get("content-type") || "image/png";
      mime = ct.split(";")[0].trim();
    } else {
      return res.status(502).json({ error: "No image in OpenAI response" });
    }

    const saved = saveAnnouncementImage({
      buffer,
      mime,
      id: sid("IMG"),
    });
    res.json({ ok: true, url: saved.url, text, model: usedModel });
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
    const caption = String(req.body?.caption || "").trim();

    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
    if (!groupIds.length) return res.status(400).json({ error: "Select at least one group" });

    const abs = absoluteUploadPath(imageUrl);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(400).json({ error: "Image file not found on server" });
    }

    const bridgeResult = await bridgeFetch("/send-image", {
      method: "POST",
      body: JSON.stringify({
        groupIds,
        imagePath: abs,
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
    res.status(err.status || 500).json({ error: err.message || "Send failed" });
  }
}

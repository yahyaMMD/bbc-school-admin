/**
 * WhatsApp bulk / personalized DM campaigns.
 * Sends one-by-one with randomized intervals so pacing looks human.
 */
import crypto from "crypto";
import { query } from "./db.js";

const WA_BRIDGE_URL = (process.env.WA_BRIDGE_URL || "http://127.0.0.1:3847").replace(
  /\/$/,
  ""
);

const MAX_RECIPIENTS = Number(process.env.WA_CAMPAIGN_MAX || 500);
const MIN_INTERVAL_MS = 2500;
const MAX_INTERVAL_MS = 120000;

let schedulerStarted = false;
let workerBusy = false;

function sid(prefix = "WAC") {
  return prefix + crypto.randomBytes(5).toString("hex").toUpperCase();
}

function rid(prefix = "WAR") {
  return prefix + crypto.randomBytes(5).toString("hex").toUpperCase();
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

function clampInterval(ms, fallback) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(n)));
}

function randomBetween(minMs, maxMs) {
  const a = Math.min(minMs, maxMs);
  const b = Math.max(minMs, maxMs);
  return a + Math.floor(Math.random() * (b - a + 1));
}

function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length >= 9) digits = `213${digits.slice(1)}`;
  else if (digits.length === 9 && /^[567]/.test(digits)) digits = `213${digits}`;
  return digits;
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
  if (d.getTime() <= Date.now() + 30_000) {
    const err = new Error("Schedule time must be at least 30 seconds in the future");
    err.status = 400;
    throw err;
  }
  return d;
}

/** Replace {{col}}, {{Col Name}}, {{1}}, {{phone}} in template. */
export function renderTemplate(template, vars = {}) {
  const map = {};
  for (const [k, v] of Object.entries(vars || {})) {
    map[String(k).trim().toLowerCase()] = String(v ?? "");
  }
  return String(template || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const k = String(key).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(map, k)) return map[k];
    return "";
  });
}

function mapCampaign(r, extras = {}) {
  return {
    id: r.id,
    name: r.name || "",
    template: r.template || "",
    columns: r.columns || [],
    status: r.status || "draft",
    intervalMinMs: r.interval_min_ms,
    intervalMaxMs: r.interval_max_ms,
    maxConsecutiveFails: Number(r.max_consecutive_fails || 0),
    scheduledAt: r.scheduled_at || null,
    nextSendAt: r.next_send_at || null,
    startedAt: r.started_at || null,
    finishedAt: r.finished_at || null,
    createdBy: r.created_by || "whatsapp",
    createdAt: r.created_at,
    total: Number(r.total_count || extras.total || 0),
    sent: Number(r.sent_count || extras.sent || 0),
    failed: Number(r.failed_count || extras.failed || 0),
    pending: Number(r.pending_count || extras.pending || 0),
    skipped: Number(r.skipped_count || extras.skipped || 0),
  };
}

function mapRecipient(r) {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    phone: r.phone || "",
    chatId: r.chat_id || "",
    variables: r.variables || {},
    renderedText: r.rendered_text || "",
    status: r.status || "pending",
    error: r.error || "",
    rowIndex: r.row_index,
    sentAt: r.sent_at || null,
  };
}

async function loadCampaignStats(campaignId) {
  const r = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped
     FROM wa_campaign_recipients
     WHERE campaign_id = $1`,
    [campaignId]
  );
  return r.rows[0] || { total: 0, sent: 0, failed: 0, pending: 0, skipped: 0 };
}

async function getCampaignRow(id) {
  const r = await query(`SELECT * FROM wa_campaigns WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

export async function listCampaigns(_req, res) {
  try {
    const r = await query(
      `SELECT c.*,
         (SELECT COUNT(*)::int FROM wa_campaign_recipients x WHERE x.campaign_id = c.id) AS total_count,
         (SELECT COUNT(*)::int FROM wa_campaign_recipients x WHERE x.campaign_id = c.id AND x.status = 'sent') AS sent_count,
         (SELECT COUNT(*)::int FROM wa_campaign_recipients x WHERE x.campaign_id = c.id AND x.status = 'failed') AS failed_count,
         (SELECT COUNT(*)::int FROM wa_campaign_recipients x WHERE x.campaign_id = c.id AND x.status = 'pending') AS pending_count,
         (SELECT COUNT(*)::int FROM wa_campaign_recipients x WHERE x.campaign_id = c.id AND x.status = 'skipped') AS skipped_count
       FROM wa_campaigns c
       ORDER BY
         CASE
           WHEN c.status IN ('sending','queued') THEN 0
           WHEN c.status = 'scheduled' THEN 1
           WHEN c.status = 'paused' THEN 2
           ELSE 3
         END,
         c.created_at DESC
       LIMIT 100`
    );
    res.json({ ok: true, campaigns: r.rows.map((row) => mapCampaign(row)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to list campaigns" });
  }
}

export async function getCampaign(req, res) {
  try {
    const row = await getCampaignRow(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    const stats = await loadCampaignStats(row.id);
    const rec = await query(
      `SELECT * FROM wa_campaign_recipients
       WHERE campaign_id = $1
       ORDER BY row_index ASC
       LIMIT 2000`,
      [row.id]
    );
    res.json({
      ok: true,
      campaign: mapCampaign(row, stats),
      recipients: rec.rows.map(mapRecipient),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed" });
  }
}

export async function createCampaign(req, res) {
  try {
    const body = req.body || {};
    const name = String(body.name || "Bulk campaign").trim().slice(0, 120) || "Bulk campaign";
    const template = String(body.template || "").trim();
    if (!template) return res.status(400).json({ error: "Message template required" });

    const columns = Array.isArray(body.columns)
      ? body.columns.map((c) => String(c || "").trim()).filter(Boolean).slice(0, 20)
      : [];

    const recipientsIn = Array.isArray(body.recipients) ? body.recipients : [];
    if (!recipientsIn.length) {
      return res.status(400).json({ error: "At least one recipient required" });
    }
    if (recipientsIn.length > MAX_RECIPIENTS) {
      return res.status(400).json({
        error: `Too many recipients (max ${MAX_RECIPIENTS})`,
      });
    }

    const intervalMinMs = clampInterval(body.intervalMinMs ?? body.delayMs ?? 8000, 8000);
    const intervalMaxMs = clampInterval(
      body.intervalMaxMs ?? body.delayMaxMs ?? intervalMinMs + 4000,
      intervalMinMs + 4000
    );
    const scheduleAt = parseScheduleInput(body);
    const sendNow = !scheduleAt && body.sendNow !== false;
    const shuffle = body.shuffle === true || body.shuffle === "true";
    let maxConsecutiveFails = Number(body.maxConsecutiveFails ?? 0);
    if (!Number.isFinite(maxConsecutiveFails) || maxConsecutiveFails < 0) {
      maxConsecutiveFails = 0;
    }
    maxConsecutiveFails = Math.min(50, Math.round(maxConsecutiveFails));

    const prepared = [];
    const seen = new Set();
    for (let i = 0; i < recipientsIn.length; i++) {
      const row = recipientsIn[i] || {};
      const phone = normalizePhone(row.phone || row.to || row.number || "");
      if (!phone || phone.length < 8) continue;
      if (seen.has(phone)) continue;
      seen.add(phone);

      const variables = { ...(row.variables || row.vars || {}) };
      // Ensure phone aliases
      variables.phone = variables.phone || phone;
      variables.Phone = variables.Phone || phone;
      if (columns[0]) variables[columns[0]] = variables[columns[0]] || phone;

      // Numeric aliases {{1}} {{2}} …
      columns.forEach((col, idx) => {
        const key = String(idx + 1);
        if (variables[col] != null && variables[key] == null) {
          variables[key] = variables[col];
        }
      });

      const rendered = renderTemplate(template, variables).trim();
      if (!rendered) continue;
      prepared.push({
        phone,
        chatId: `${phone}@c.us`,
        variables,
        rendered,
        rowIndex: i,
      });
    }

    if (shuffle && prepared.length > 1) {
      for (let i = prepared.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [prepared[i], prepared[j]] = [prepared[j], prepared[i]];
      }
      prepared.forEach((rec, idx) => {
        rec.rowIndex = idx;
      });
    }

    if (!prepared.length) {
      return res.status(400).json({ error: "No valid phone numbers / messages after parsing" });
    }

    const id = sid("WAC");
    const status = scheduleAt ? "scheduled" : sendNow ? "queued" : "draft";

    await query(
      `INSERT INTO wa_campaigns (
         id, name, template, columns, status,
         interval_min_ms, interval_max_ms, max_consecutive_fails,
         scheduled_at, next_send_at, created_by
       ) VALUES (
         $1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11
       )`,
      [
        id,
        name,
        template,
        JSON.stringify(columns),
        status,
        Math.min(intervalMinMs, intervalMaxMs),
        Math.max(intervalMinMs, intervalMaxMs),
        maxConsecutiveFails,
        scheduleAt ? scheduleAt.toISOString() : null,
        sendNow && !scheduleAt ? new Date().toISOString() : null,
        req.user?.role || "whatsapp",
      ]
    );

    for (const rec of prepared) {
      await query(
        `INSERT INTO wa_campaign_recipients (
           id, campaign_id, phone, chat_id, variables, rendered_text, status, row_index
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,'pending',$7)`,
        [
          rid("WAR"),
          id,
          rec.phone,
          rec.chatId,
          JSON.stringify(rec.variables),
          rec.rendered,
          rec.rowIndex,
        ]
      );
    }

    const row = await getCampaignRow(id);
    const stats = await loadCampaignStats(id);
    res.status(201).json({
      ok: true,
      campaign: mapCampaign(row, stats),
      scheduled: Boolean(scheduleAt),
      queued: status === "queued",
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Create failed" });
  }
}

export async function testSend(req, res) {
  try {
    const phone = normalizePhone(req.body?.phone || "");
    const text = String(req.body?.text || "").trim();
    if (!phone) return res.status(400).json({ error: "phone required" });
    if (!text) return res.status(400).json({ error: "text required" });

    const result = await bridgeFetch("/send-dm", {
      method: "POST",
      body: JSON.stringify({ phone, text }),
    });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || "Test send failed",
      details: err.data || undefined,
    });
  }
}

export async function previewTemplate(req, res) {
  try {
    const template = String(req.body?.template || "");
    const variables = req.body?.variables || {};
    res.json({ ok: true, text: renderTemplate(template, variables) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Preview failed" });
  }
}

export async function pauseCampaign(req, res) {
  try {
    const r = await query(
      `UPDATE wa_campaigns SET status = 'paused'
       WHERE id = $1 AND status IN ('queued','sending','scheduled')
       RETURNING *`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(400).json({ error: "Cannot pause this campaign" });
    const stats = await loadCampaignStats(req.params.id);
    res.json({ ok: true, campaign: mapCampaign(r.rows[0], stats) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Pause failed" });
  }
}

export async function resumeCampaign(req, res) {
  try {
    const r = await query(
      `UPDATE wa_campaigns
       SET status = 'queued', next_send_at = NOW()
       WHERE id = $1 AND status = 'paused'
       RETURNING *`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(400).json({ error: "Cannot resume this campaign" });
    const stats = await loadCampaignStats(req.params.id);
    res.json({ ok: true, campaign: mapCampaign(r.rows[0], stats) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Resume failed" });
  }
}

export async function cancelCampaign(req, res) {
  try {
    const id = req.params.id;
    const claim = await query(
      `UPDATE wa_campaigns
       SET status = 'cancelled', finished_at = COALESCE(finished_at, NOW()), next_send_at = NULL
       WHERE id = $1 AND status IN ('queued','sending','scheduled','paused','draft')
       RETURNING *`,
      [id]
    );
    if (!claim.rows.length) {
      return res.status(400).json({ error: "Cannot cancel this campaign" });
    }
    await query(
      `UPDATE wa_campaign_recipients
       SET status = 'skipped', error = 'cancelled'
       WHERE campaign_id = $1 AND status = 'pending'`,
      [id]
    );
    const stats = await loadCampaignStats(id);
    res.json({ ok: true, campaign: mapCampaign(claim.rows[0], stats) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Cancel failed" });
  }
}

async function sendOneRecipient(campaign, recipient) {
  const result = await bridgeFetch("/send-dm", {
    method: "POST",
    body: JSON.stringify({
      phone: recipient.phone,
      chatId: recipient.chat_id,
      text: recipient.rendered_text,
    }),
  });
  return result;
}

async function finalizeIfDone(campaignId) {
  const stats = await loadCampaignStats(campaignId);
  if (Number(stats.pending) > 0) return stats;
  await query(
    `UPDATE wa_campaigns
     SET status = CASE
           WHEN $2::int > 0 AND $3::int = 0 THEN 'sent'
           WHEN $2::int > 0 AND $3::int > 0 THEN 'partial'
           WHEN $2::int = 0 AND $3::int > 0 THEN 'failed'
           ELSE 'sent'
         END,
         finished_at = NOW(),
         next_send_at = NULL
     WHERE id = $1 AND status IN ('sending','queued')`,
    [campaignId, stats.sent, stats.failed]
  );
  return stats;
}

async function processCampaignQueue() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    // Promote due scheduled campaigns
    await query(
      `UPDATE wa_campaigns
       SET status = 'queued', next_send_at = NOW()
       WHERE status = 'scheduled'
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= NOW()`
    );

    const due = await query(
      `SELECT * FROM wa_campaigns
       WHERE status IN ('queued','sending')
         AND (next_send_at IS NULL OR next_send_at <= NOW())
       ORDER BY COALESCE(next_send_at, created_at) ASC
       LIMIT 1`
    );
    if (!due.rows.length) return;
    const campaign = due.rows[0];

    // Claim sending state
    await query(
      `UPDATE wa_campaigns
       SET status = 'sending',
           started_at = COALESCE(started_at, NOW())
       WHERE id = $1 AND status IN ('queued','sending')`,
      [campaign.id]
    );

    // Recover recipients stuck in 'sending' after a crash / restart
    await query(
      `UPDATE wa_campaign_recipients
       SET status = 'pending'
       WHERE campaign_id = $1 AND status = 'sending'`,
      [campaign.id]
    );

    const next = await query(
      `SELECT * FROM wa_campaign_recipients
       WHERE campaign_id = $1 AND status = 'pending'
       ORDER BY row_index ASC
       LIMIT 1`,
      [campaign.id]
    );
    if (!next.rows.length) {
      await finalizeIfDone(campaign.id);
      return;
    }

    const recipient = next.rows[0];
    // Lock recipient row
    const locked = await query(
      `UPDATE wa_campaign_recipients
       SET status = 'sending'
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [recipient.id]
    );
    if (!locked.rows.length) return;

    try {
      const result = await sendOneRecipient(campaign, locked.rows[0]);
      await query(
        `UPDATE wa_campaign_recipients
         SET status = 'sent', error = '', sent_at = NOW(), chat_id = COALESCE(NULLIF($2,''), chat_id)
         WHERE id = $1`,
        [recipient.id, result?.chatId || ""]
      );
    } catch (err) {
      await query(
        `UPDATE wa_campaign_recipients
         SET status = 'failed', error = $2, sent_at = NOW()
         WHERE id = $1`,
        [recipient.id, String(err.message || err).slice(0, 500)]
      );

      const maxFails = Number(campaign.max_consecutive_fails || 0);
      if (maxFails > 0) {
        const recent = await query(
          `SELECT status FROM wa_campaign_recipients
           WHERE campaign_id = $1 AND status IN ('sent','failed')
           ORDER BY COALESCE(sent_at, NOW()) DESC, row_index DESC
           LIMIT $2`,
          [campaign.id, maxFails]
        );
        if (
          recent.rows.length >= maxFails &&
          recent.rows.every((r) => r.status === "failed")
        ) {
          await query(
            `UPDATE wa_campaigns SET status = 'paused', next_send_at = NULL
             WHERE id = $1 AND status = 'sending'`,
            [campaign.id]
          );
          return;
        }
      }
    }

    const stats = await finalizeIfDone(campaign.id);
    if (Number(stats.pending) > 0) {
      // Still running? check not paused/cancelled
      const cur = await getCampaignRow(campaign.id);
      if (cur && (cur.status === "sending" || cur.status === "queued")) {
        const wait = randomBetween(campaign.interval_min_ms, campaign.interval_max_ms);
        await query(
          `UPDATE wa_campaigns
           SET status = 'sending',
               next_send_at = NOW() + ($2::double precision * INTERVAL '1 millisecond')
           WHERE id = $1 AND status = 'sending'`,
          [campaign.id, wait]
        );
      }
    }
  } catch (err) {
    console.error("Campaign worker tick failed", err);
  } finally {
    workerBusy = false;
  }
}

export function startCampaignScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const ms = Number(process.env.WA_CAMPAIGN_TICK_MS || 2000);
  setInterval(() => {
    processCampaignQueue().catch(() => {});
  }, Math.max(1000, ms));
  setTimeout(() => {
    processCampaignQueue().catch(() => {});
  }, 3500);
  console.log(`WhatsApp campaign worker started (every ${Math.max(1000, ms)}ms)`);
}

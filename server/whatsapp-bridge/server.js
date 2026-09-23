/**
 * WhatsApp Web bridge for Q.E.A announcements.
 * QR link → list groups → send images (with delay between groups).
 */
const fs = require("fs");
const path = require("path");
const express = require("express");
const qrcode = require("qrcode");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const PORT = Number(process.env.WA_BRIDGE_PORT || 3847);
const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(__dirname, ".auth");
const DATA_DIR = process.env.WA_DATA_DIR || path.join(__dirname, ".data");
const STATUS_FILE = path.join(DATA_DIR, "status.json");
const QR_FILE = path.join(DATA_DIR, "qr.png");
const SEND_DELAY_MS = Number(process.env.WA_SEND_DELAY_MS || 2500);

fs.mkdirSync(AUTH_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function writeStatus(patch) {
  let prev = {};
  try {
    prev = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch {
    /* empty */
  }
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(next, null, 2));
  return next;
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch {
    return { ready: false };
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const chromePath =
  process.env.CHROME_PATH ||
  (fs.existsSync("/usr/bin/chromium")
    ? "/usr/bin/chromium"
    : fs.existsSync("/usr/bin/chromium-browser")
      ? "/usr/bin/chromium-browser"
      : fs.existsSync("/usr/bin/google-chrome-stable")
        ? "/usr/bin/google-chrome-stable"
        : undefined);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
  puppeteer: {
    headless: true,
    executablePath: chromePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ],
  },
});

writeStatus({
  ready: false,
  qrReady: false,
  info: "Starting WhatsApp client… Scan QR when ready.",
});

client.on("qr", async (qr) => {
  try {
    await qrcode.toFile(QR_FILE, qr, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    writeStatus({
      ready: false,
      qrReady: true,
      info: "Scan this QR with WhatsApp → Linked devices → Link a device",
    });
    console.log("QR ready");
  } catch (err) {
    console.error("QR write failed:", err);
    writeStatus({ ready: false, qrReady: false, error: String(err) });
  }
});

client.on("authenticated", () => {
  writeStatus({ authenticated: true, info: "Authenticated. Waiting for ready…" });
  console.log("Authenticated");
});

client.on("ready", () => {
  const wid = client.info?.wid?.user || null;
  const pushname = client.info?.pushname || null;
  writeStatus({
    ready: true,
    qrReady: false,
    authenticated: true,
    phone: wid,
    pushname,
    info: `Connected as ${pushname || wid}`,
  });
  console.log("WhatsApp ready as", wid, pushname);
});

client.on("auth_failure", (msg) => {
  writeStatus({ ready: false, authenticated: false, error: `Auth failure: ${msg}` });
  console.error("Auth failure", msg);
});

client.on("disconnected", (reason) => {
  writeStatus({ ready: false, qrReady: false, info: `Disconnected: ${reason}` });
  console.warn("Disconnected", reason);
});

const app = express();
app.use(express.json({ limit: "12mb" }));

app.get("/health", (_req, res) => {
  res.json(readStatus());
});

app.get("/qr", (_req, res) => {
  if (!fs.existsSync(QR_FILE)) {
    return res.status(404).json({ error: "QR not ready yet" });
  }
  res.type("png").sendFile(QR_FILE);
});

app.get("/groups", async (_req, res) => {
  try {
    if (!client.info) {
      return res.status(503).json({ ok: false, error: "WhatsApp not connected yet" });
    }
    const chats = await client.getChats();
    const groups = chats
      .filter((c) => c.isGroup)
      .map((c) => ({
        id: c.id._serialized,
        name: c.name || c.id.user || "Group",
        participants: c.participants?.length || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    res.json({ ok: true, groups });
  } catch (err) {
    console.error("groups failed", err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.post("/send-image", async (req, res) => {
  try {
    if (!client.info) {
      return res.status(503).json({ ok: false, error: "WhatsApp not connected yet" });
    }
    const groupIds = Array.isArray(req.body.groupIds) ? req.body.groupIds : [];
    const caption = String(req.body.caption || "").trim();
    let media = null;

    if (req.body.imagePath && fs.existsSync(req.body.imagePath)) {
      media = MessageMedia.fromFilePath(req.body.imagePath);
    } else if (req.body.dataUrl) {
      const m = String(req.body.dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!m) {
        return res.status(400).json({ ok: false, error: "Invalid dataUrl" });
      }
      const mime = m[1];
      const data = m[2];
      const ext = mime.split("/")[1] || "jpg";
      media = new MessageMedia(mime, data, `announcement.${ext}`);
    } else if (req.body.base64 && req.body.mime) {
      media = new MessageMedia(req.body.mime, req.body.base64, "announcement.jpg");
    }

    if (!media) {
      return res.status(400).json({ ok: false, error: "imagePath, dataUrl, or base64+mime required" });
    }
    if (!groupIds.length) {
      return res.status(400).json({ ok: false, error: "groupIds required" });
    }

    const results = [];
    for (let i = 0; i < groupIds.length; i++) {
      const gid = String(groupIds[i] || "").trim();
      try {
        if (!gid.includes("@g.us") && !gid.includes("@c.us")) {
          results.push({ groupId: gid, ok: false, error: "Invalid group id" });
          continue;
        }
        const result = await client.sendMessage(gid, media, caption ? { caption } : undefined);
        results.push({
          groupId: gid,
          ok: true,
          id: result?.id?._serialized || null,
        });
      } catch (err) {
        results.push({ groupId: gid, ok: false, error: err.message || String(err) });
      }
      if (i < groupIds.length - 1) await sleep(SEND_DELAY_MS);
    }

    const okCount = results.filter((r) => r.ok).length;
    res.json({
      ok: okCount > 0,
      sent: okCount,
      failed: results.length - okCount,
      results,
    });
  } catch (err) {
    console.error("send-image failed", err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`WhatsApp bridge listening on 0.0.0.0:${PORT}`);
  writeStatus({ server: `0.0.0.0:${PORT}` });
});

client.initialize().catch((err) => {
  console.error("Initialize failed", err);
  writeStatus({ ready: false, error: String(err) });
});

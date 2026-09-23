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

/** Clear stale Chromium profile locks left by previous container crashes. */
function clearChromeLocks(rootDir) {
  try {
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        let st;
        try {
          st = fs.lstatSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) walk(full);
        else if (/^Singleton/i.test(name) || /\.lock$/i.test(name)) {
          try {
            fs.unlinkSync(full);
            console.log("Removed lock", full);
          } catch {
            /* ignore */
          }
        }
      }
    };
    walk(rootDir);
  } catch (err) {
    console.warn("clearChromeLocks", err.message || err);
  }
}
clearChromeLocks(AUTH_DIR);

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

    let groups = [];

    // Primary: library API
    try {
      const chats = await client.getChats();
      groups = (chats || [])
        .filter((c) => c && (c.isGroup || String(c.id?._serialized || "").endsWith("@g.us")))
        .map((c) => ({
          id: c.id._serialized,
          name: c.name || c.id?.user || "Group",
        }));
    } catch (err) {
      console.warn("getChats failed, using Store fallback:", err?.message || err);
    }

    // Fallback: read plain group list inside the page (avoids Puppeteer clone errors like "r: r")
    if (!groups.length && client.pupPage) {
      try {
        await client.pupPage.waitForFunction(
          () => Boolean(window.Store?.Chat || window.WWebJS?.getChats),
          { timeout: 15000 }
        );
      } catch {
        /* continue anyway */
      }

      const fromStore = await client.pupPage.evaluate(async () => {
        const out = [];
        const seen = new Set();
        const push = (id, name) => {
          const sid = id == null ? "" : String(id);
          if (!sid.endsWith("@g.us") || seen.has(sid)) return;
          seen.add(sid);
          out.push({ id: sid, name: String(name || sid) });
        };

        // Prefer WWebJS helper if present, but only keep plain fields
        try {
          if (window.WWebJS && typeof window.WWebJS.getChats === "function") {
            const chats = await window.WWebJS.getChats();
            for (const c of chats || []) {
              const id = c?.id?._serialized || c?.id || "";
              const isGroup =
                Boolean(c?.isGroup) ||
                String(id).endsWith("@g.us") ||
                c?.id?.server === "g.us";
              if (!isGroup) continue;
              push(id, c.name || c.formattedTitle || c.contact?.name);
            }
          }
        } catch (_) {
          /* next */
        }

        try {
          const Store = window.Store;
          const collection = Store?.Chat;
          const models =
            (collection?.getModelsArray && collection.getModelsArray()) ||
            (typeof collection?.map === "function"
              ? collection.map((c) => c)
              : null) ||
            collection?.models ||
            collection?._models ||
            [];
          for (const c of models || []) {
            const id = c?.id?._serialized || "";
            const isGroup =
              Boolean(c?.isGroup) ||
              c?.id?.server === "g.us" ||
              String(id).endsWith("@g.us");
            if (!isGroup) continue;
            push(id, c.name || c.formattedTitle || c.contact?.name || c.id?.user);
          }
        } catch (_) {
          /* next */
        }

        return out;
      });

      if (Array.isArray(fromStore) && fromStore.length) {
        groups = fromStore;
      }
    }

    groups.sort((a, b) =>
      String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" })
    );

    res.json({ ok: true, groups, count: groups.length });
  } catch (err) {
    console.error("groups failed", err);
    res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
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

    if (req.body.base64 && req.body.mime) {
      const filename = req.body.filename || `announcement.${String(req.body.mime).split("/")[1] || "jpg"}`;
      media = new MessageMedia(req.body.mime, req.body.base64, filename);
    } else if (req.body.dataUrl) {
      const m = String(req.body.dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!m) {
        return res.status(400).json({ ok: false, error: "Invalid dataUrl" });
      }
      media = new MessageMedia(m[1], m[2], `announcement.${m[1].split("/")[1] || "jpg"}`);
    } else if (req.body.imagePath && fs.existsSync(req.body.imagePath)) {
      media = MessageMedia.fromFilePath(req.body.imagePath);
    }

    if (!media || !media.data) {
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
        const sent = await sendMediaToGroup(client, gid, media, caption);
        results.push({
          groupId: gid,
          ok: true,
          id: sent?.id?._serialized || sent?.id || null,
        });
      } catch (err) {
        console.error("send to", gid, err);
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

app.post("/send-text", async (req, res) => {
  try {
    if (!client.info) {
      return res.status(503).json({ ok: false, error: "WhatsApp not connected yet" });
    }
    const groupIds = Array.isArray(req.body.groupIds) ? req.body.groupIds : [];
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ ok: false, error: "text required" });
    if (!groupIds.length) return res.status(400).json({ ok: false, error: "groupIds required" });

    const results = [];
    for (let i = 0; i < groupIds.length; i++) {
      const gid = String(groupIds[i] || "").trim();
      try {
        const sent = await sendTextToGroup(client, gid, text);
        results.push({ groupId: gid, ok: true, id: sent?.id?._serialized || sent?.id || null });
      } catch (err) {
        results.push({ groupId: gid, ok: false, error: err.message || String(err) });
      }
      if (i < groupIds.length - 1) await sleep(SEND_DELAY_MS);
    }
    const okCount = results.filter((r) => r.ok).length;
    res.json({ ok: okCount > 0, sent: okCount, failed: results.length - okCount, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

async function ensureChat(client, chatId) {
  try {
    const chat = await client.getChatById(chatId);
    if (chat) return chat;
  } catch (_) {
    /* continue */
  }
  if (client.pupPage) {
    try {
      await client.pupPage.evaluate(async (id) => {
        if (window.WWebJS?.getChat) {
          await window.WWebJS.getChat(id, { getAsModel: true });
          return true;
        }
        if (window.Store?.Chat?.find) {
          await window.Store.Chat.find(id);
          return true;
        }
        return false;
      }, chatId);
    } catch (_) {
      /* ignore */
    }
  }
  try {
    return await client.getChatById(chatId);
  } catch {
    return null;
  }
}

async function sendTextToGroup(client, chatId, text) {
  const chat = await ensureChat(client, chatId);
  if (chat) {
    try {
      return await chat.sendMessage(text);
    } catch (err) {
      console.warn("chat.sendMessage text failed:", err.message || err);
    }
  }
  try {
    return await client.sendMessage(chatId, text);
  } catch (err) {
    console.warn("client.sendMessage text failed:", err.message || err);
  }
  if (!client.pupPage) throw new Error("Unable to send text");
  const ok = await client.pupPage.evaluate(async (id, body) => {
    if (!window.WWebJS?.sendMessage) throw new Error("WWebJS.sendMessage missing");
    const sent = await window.WWebJS.sendMessage(id, body, {}, true);
    return { id: sent?.id?._serialized || null };
  }, chatId, text);
  return ok;
}

async function sendMediaToGroup(client, chatId, media, caption) {
  const options = caption ? { caption } : {};

  // Strategy 1: resolve chat model then send (avoids memoize id errors)
  const chat = await ensureChat(client, chatId);
  if (chat) {
    try {
      return await chat.sendMessage(media, options);
    } catch (err) {
      console.warn("chat.sendMessage media failed:", err.message || err);
    }
    try {
      return await chat.sendMessage(media, { ...options, sendMediaAsDocument: true });
    } catch (err) {
      console.warn("chat.sendMessage as document failed:", err.message || err);
    }
  }

  // Strategy 2: client.sendMessage with chat id string
  try {
    return await client.sendMessage(chatId, media, options);
  } catch (err) {
    console.warn("client.sendMessage media failed:", err.message || err);
  }

  // Strategy 3: page-level WWebJS send with plain base64 payload
  if (!client.pupPage) throw new Error("Unable to send media");
  const payload = {
    mimetype: media.mimetype,
    data: media.data,
    filename: media.filename || "announcement.jpg",
  };
  const ok = await client.pupPage.evaluate(
    async (id, mediaObj, captionText) => {
      if (!window.WWebJS?.sendMessage) throw new Error("WWebJS.sendMessage missing");
      const opts = {};
      if (captionText) opts.caption = captionText;
      const sent = await window.WWebJS.sendMessage(id, mediaObj, opts, true);
      return { id: sent?.id?._serialized || null };
    },
    chatId,
    payload,
    caption || ""
  );
  return ok;
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`WhatsApp bridge listening on 0.0.0.0:${PORT}`);
  writeStatus({ server: `0.0.0.0:${PORT}` });
});

client.initialize().catch((err) => {
  console.error("Initialize failed", err);
  writeStatus({ ready: false, error: String(err) });
});

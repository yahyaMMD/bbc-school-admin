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
          () =>
            Boolean(
              window.require?.("WAWebCollections")?.Chat ||
                window.Store?.Chat ||
                window.WWebJS?.getChat
            ),
          { timeout: 15000 }
        );
      } catch {
        /* continue anyway */
      }

      const fromStore = await client.pupPage.evaluate(() => {
        const out = [];
        const seen = new Set();
        const push = (id, name) => {
          const sid = id == null ? "" : String(id);
          if (!sid.endsWith("@g.us") || seen.has(sid)) return;
          seen.add(sid);
          out.push({ id: sid, name: String(name || sid) });
        };

        const readModels = (models) => {
          for (const c of models || []) {
            try {
              const id =
                c?.id?._serialized ||
                (typeof c?.id === "string" ? c.id : "") ||
                "";
              const isGroup =
                Boolean(c?.isGroup) ||
                c?.id?.server === "g.us" ||
                (typeof c?.id?.isGroup === "function" && c.id.isGroup()) ||
                String(id).endsWith("@g.us");
              if (!isGroup) continue;
              push(
                id,
                c.name || c.formattedTitle || c.contact?.name || c.id?.user
              );
            } catch (_) {
              /* skip one */
            }
          }
        };

        try {
          const coll = window.require?.("WAWebCollections")?.Chat;
          if (coll?.getModelsArray) readModels(coll.getModelsArray());
        } catch (_) {
          /* next */
        }

        try {
          const collection = window.Store?.Chat;
          const models =
            (collection?.getModelsArray && collection.getModelsArray()) ||
            (typeof collection?.map === "function"
              ? collection.map((c) => c)
              : null) ||
            collection?.models ||
            collection?._models ||
            [];
          readModels(models);
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

/** Temporary diagnostic for media pipeline (safe to keep; returns step results only). */
app.post("/debug-media", async (req, res) => {
  try {
    if (!client.info || !client.pupPage) {
      return res.status(503).json({ ok: false, error: "WhatsApp not connected yet" });
    }
    const chatId = String(req.body.groupId || "").trim();
    if (!chatId) return res.status(400).json({ ok: false, error: "groupId required" });
    const mediaObj = normalizeMediaPayload({
      mimetype: req.body.mime || "image/png",
      data: req.body.base64,
      filename: req.body.filename || "diag.png",
    });
    const steps = await client.pupPage.evaluate(async (id, media) => {
      const out = { steps: [] };
      const step = (name, ok, extra = {}) => out.steps.push({ name, ok, ...extra });
      try {
        const chat = await window.WWebJS.getChat(id, { getAsModel: false });
        step("getChat", !!chat, {
          hasId: !!chat?.id,
          id: chat?.id?._serialized || null,
        });
        if (!chat) return out;

        try {
          const file = window.WWebJS.mediaInfoToFile(media);
          step("mediaInfoToFile", true, {
            size: file?.size,
            type: file?.type,
            name: file?.name,
          });
        } catch (e) {
          step("mediaInfoToFile", false, { error: String(e?.message || e) });
          return out;
        }

        let mediaOptions = null;
        try {
          mediaOptions = await window.WWebJS.processMediaData(media, {
            forceDocument: false,
          });
          step("processMediaData", true, {
            type: mediaOptions?.type,
            mimetype: mediaOptions?.mimetype,
            keys: Object.keys(mediaOptions || {}).slice(0, 20),
          });
        } catch (e) {
          step("processMediaData", false, {
            error: String(e?.message || e),
            stack: String(e?.stack || "").slice(0, 500),
          });
          return out;
        }

        try {
          const { getMaybeMeLidUser, getMaybeMePnUser } = window.require(
            "WAWebUserPrefsMeUser"
          );
          const lidUser = getMaybeMeLidUser();
          const meUser = getMaybeMePnUser();
          step("identity", true, {
            lid: lidUser?._serialized || null,
            me: meUser?._serialized || null,
            chatIsLid:
              typeof chat.id?.isLid === "function" ? chat.id.isLid() : null,
            chatIsGroup:
              typeof chat.id?.isGroup === "function" ? chat.id.isGroup() : null,
          });
        } catch (e) {
          step("identity", false, { error: String(e?.message || e) });
        }

        try {
          const sent = await window.WWebJS.sendMessage(chat, "", {
            media,
            caption: "diag",
          });
          step("sendMessage", true, {
            id: sent?.id?._serialized || null,
          });
        } catch (e) {
          step("sendMessage", false, {
            error: String(e?.message || e),
            stack: String(e?.stack || "").slice(0, 600),
          });
        }

        // Fallback: addAndSendMsgToChat with already-processed media
        if (mediaOptions) {
          try {
            const { getMaybeMeLidUser, getMaybeMePnUser } = window.require(
              "WAWebUserPrefsMeUser"
            );
            const lidUser = getMaybeMeLidUser();
            const meUser = getMaybeMePnUser();
            let from =
              typeof chat.id?.isLid === "function" && chat.id.isLid()
                ? lidUser
                : meUser;
            let participant;
            if (typeof chat.id?.isGroup === "function" && chat.id.isGroup()) {
              from =
                chat.groupMetadata && chat.groupMetadata.isLidAddressingMode
                  ? lidUser
                  : meUser;
              participant = window
                .require("WAWebWidFactory")
                .asUserWidOrThrow(from);
            }
            const newId = await window.require("WAWebMsgKey").newId();
            const newMsgKey = new (window.require("WAWebMsgKey"))({
              from,
              to: chat.id,
              id: newId,
              participant,
              selfDir: "out",
            });
            const ephemeralFields = window
              .require("WAWebGetEphemeralFieldsMsgActionsUtils")
              .getEphemeralFields(chat);
            const message = {
              id: newMsgKey,
              ack: 0,
              body: mediaOptions.preview,
              from,
              to: chat.id,
              local: true,
              self: "out",
              t: parseInt(new Date().getTime() / 1000, 10),
              isNewMsg: true,
              type: "chat",
              ...ephemeralFields,
              ...mediaOptions,
              ...(mediaOptions.toJSON ? mediaOptions.toJSON() : {}),
              caption: "diag-fallback",
            };
            const [msgPromise, sendMsgResultPromise] = window
              .require("WAWebSendMsgChatAction")
              .addAndSendMsgToChat(chat, message);
            await msgPromise;
            try {
              await sendMsgResultPromise;
            } catch (_) {
              /* optional */
            }
            step("addAndSendMsgToChat", true, {
              id: newMsgKey?._serialized || null,
            });
          } catch (e) {
            step("addAndSendMsgToChat", false, {
              error: String(e?.message || e),
              stack: String(e?.stack || "").slice(0, 600),
            });
          }
        }
      } catch (e) {
        step("fatal", false, { error: String(e?.message || e) });
      }
      return out;
    }, chatId, mediaObj);
    res.json({ ok: true, ...steps });
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

function normalizeMediaPayload(media) {
  let data = String(media?.data || "").replace(/\s/g, "");
  if (data.includes(",")) data = data.split(",").pop();
  const mimetype = media?.mimetype || "image/png";
  const filename =
    media?.filename ||
    `announcement.${String(mimetype).split("/")[1] || "png"}`;
  if (!data) throw new Error("Empty media data");
  return { mimetype, data, filename };
}

/**
 * whatsapp-web.js ≥1.34: WWebJS.sendMessage(chatObject, content, options)
 * Media must be in options.media — not as content / not a chatId string.
 * Msg.get(newMsgKey) after send can throw the memoize error even when the
 * message was delivered, so we recover via addAndSendMsgToChat when needed.
 */
async function pageSend(client, chatId, content, options = {}) {
  if (!client.pupPage) throw new Error("WhatsApp page not ready");
  return client.pupPage.evaluate(
    async (id, body, opts) => {
      if (!window.WWebJS?.getChat || !window.WWebJS?.sendMessage) {
        throw new Error("WWebJS helpers missing");
      }
      let chat = await window.WWebJS.getChat(id, { getAsModel: false });
      if (!chat) {
        try {
          const wid = window.require("WAWebWidFactory").createWid(id);
          chat =
            (
              await window
                .require("WAWebFindChatAction")
                .findOrCreateLatestChat(wid)
            )?.chat || null;
        } catch (_) {
          /* ignore */
        }
      }
      if (!chat) throw new Error("Chat not found: " + id);

      try {
        const sent = await window.WWebJS.sendMessage(chat, body, { ...opts });
        return {
          ok: true,
          id: sent?.id?._serialized || sent?.id || null,
        };
      } catch (err) {
        const msg = String(err?.message || err || "");
        // Message often lands; only the post-send Msg.get lookup fails.
        if (/memoize|id property/i.test(msg) && !opts?.media) {
          return { ok: true, id: null, note: "memoize_after_text" };
        }
        throw err;
      }
    },
    chatId,
    content,
    options
  );
}

async function pageSendMedia(client, chatId, media, caption, asDocument) {
  const payload = normalizeMediaPayload(media);
  if (!client.pupPage) throw new Error("WhatsApp page not ready");

  return client.pupPage.evaluate(
    async (id, mediaObj, captionText, forceDocument) => {
      const chat = await window.WWebJS.getChat(id, { getAsModel: false });
      if (!chat) throw new Error("Chat not found: " + id);

      const mediaOptions = await window.WWebJS.processMediaData(mediaObj, {
        forceDocument: Boolean(forceDocument),
      });
      if (captionText) mediaOptions.caption = captionText;

      const MeUser = window.require("WAWebUserPrefsMeUser");
      const WidFactory = window.require("WAWebWidFactory");
      const MsgKey = window.require("WAWebMsgKey");

      const lidUser = MeUser.getMaybeMeLidUser?.() || null;
      const meUser = MeUser.getMaybeMePnUser?.() || null;
      let deviceLid = null;
      try {
        deviceLid = MeUser.getMeDeviceLidOrThrow?.() || null;
      } catch (_) {
        deviceLid = null;
      }

      const isGroup =
        typeof chat.id?.isGroup === "function" ? chat.id.isGroup() : false;

      // LID-era WhatsApp: media send validates sender via getSender().
      // Group media needs device LID as `from` and user LID as `participant`/`author`.
      let from = deviceLid || lidUser || meUser;
      let participant = null;
      let author = null;
      if (isGroup) {
        from = deviceLid || lidUser || meUser;
        participant = lidUser || meUser;
        if (participant) {
          try {
            participant = WidFactory.asUserWidOrThrow(participant);
          } catch (_) {
            /* keep as-is */
          }
        }
        author = participant;
      }
      if (!from) throw new Error("Unable to resolve sender identity (LID/PN)");

      const newId = await MsgKey.newId();
      let newMsgKey;
      try {
        newMsgKey = new MsgKey({
          fromMe: true,
          remote: chat.id,
          id: newId,
          participant: participant || undefined,
        });
      } catch (_) {
        newMsgKey = new MsgKey({
          from,
          to: chat.id,
          id: newId,
          participant: participant || undefined,
          selfDir: "out",
        });
      }

      const ephemeralFields = window
        .require("WAWebGetEphemeralFieldsMsgActionsUtils")
        .getEphemeralFields(chat);

      const message = {
        id: newMsgKey,
        ack: 0,
        body: mediaOptions.preview,
        from,
        to: chat.id,
        author: author || undefined,
        local: true,
        self: "out",
        t: parseInt(new Date().getTime() / 1000, 10),
        isNewMsg: true,
        type: "chat",
        ...ephemeralFields,
        ...mediaOptions,
        ...(mediaOptions.toJSON ? mediaOptions.toJSON() : {}),
      };

      const [msgPromise, sendMsgResultPromise] = window
        .require("WAWebSendMsgChatAction")
        .addAndSendMsgToChat(chat, message);
      await msgPromise;
      try {
        await sendMsgResultPromise;
      } catch (_) {
        /* delivery ack optional */
      }

      return {
        ok: true,
        id: newMsgKey?._serialized || null,
      };
    },
    chatId,
    payload,
    caption || "",
    Boolean(asDocument)
  );
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
    const sent = await client.sendMessage(chatId, text, { sendSeen: false });
    if (sent) return sent;
  } catch (err) {
    console.warn("client.sendMessage text failed:", err.message || err);
  }
  const ok = await pageSend(client, chatId, text, {});
  if (!ok?.ok) throw new Error("Unable to send text");
  return ok;
}

async function sendMediaToGroup(client, chatId, media, caption) {
  const payload = normalizeMediaPayload(media);
  const mm = new MessageMedia(payload.mimetype, payload.data, payload.filename);
  const options = {
    caption: caption || undefined,
    sendSeen: false,
  };

  // Strategy 1: official client API
  try {
    const sent = await client.sendMessage(chatId, mm, options);
    if (sent) return sent;
  } catch (err) {
    console.warn("client.sendMessage media failed:", err.message || err);
  }

  // Strategy 2: as document via client API
  try {
    const sent = await client.sendMessage(chatId, mm, {
      ...options,
      sendMediaAsDocument: true,
    });
    if (sent) return sent;
  } catch (err) {
    console.warn("client.sendMessage document failed:", err.message || err);
  }

  // Strategy 3: direct page send (skips buggy Msg.get after upload)
  try {
    const sent = await pageSendMedia(client, chatId, payload, caption, false);
    if (sent?.ok) return sent;
  } catch (err) {
    console.warn("pageSendMedia image failed:", err.message || err);
  }

  // Strategy 4: page send as document
  try {
    const sent = await pageSendMedia(client, chatId, payload, caption, true);
    if (sent?.ok) return sent;
  } catch (err) {
    console.warn("pageSendMedia document failed:", err.message || err);
  }

  // Strategy 5: correct WWebJS.sendMessage(chat, '', { media })
  try {
    const sent = await pageSend(client, chatId, "", {
      media: payload,
      caption: caption || undefined,
    });
    if (sent?.ok) return sent;
  } catch (err) {
    console.warn("pageSend media failed:", err.message || err);
  }

  throw new Error("Unable to send media to " + chatId);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`WhatsApp bridge listening on 0.0.0.0:${PORT}`);
  writeStatus({ server: `0.0.0.0:${PORT}` });
});

client.initialize().catch((err) => {
  console.error("Initialize failed", err);
  writeStatus({ ready: false, error: String(err) });
});

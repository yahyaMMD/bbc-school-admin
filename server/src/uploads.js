import fs from "fs";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve("data/uploads");

const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

export function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(path.join(UPLOAD_DIR, "students"), { recursive: true });
  fs.mkdirSync(path.join(UPLOAD_DIR, "teachers"), { recursive: true });
  fs.mkdirSync(path.join(UPLOAD_DIR, "announcements"), { recursive: true });
  fs.mkdirSync(path.join(UPLOAD_DIR, "parent-forms"), { recursive: true });
  return UPLOAD_DIR;
}

export function getUploadDir() {
  return UPLOAD_DIR;
}

function safeId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || "");
  const m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!MIME_EXT[mime]) return null;
  let buffer;
  try {
    buffer = Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  return { mime, buffer, ext: MIME_EXT[mime] };
}

function clearEntityFiles(entity, id) {
  const dir = path.join(UPLOAD_DIR, entity);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === id || name.startsWith(`${id}.`) || name.startsWith(`${id}-`)) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Save a profile photo from a data URL. Returns public URL path.
 */
export function saveProfilePhoto({ entity, id, dataUrl }) {
  if (entity !== "students" && entity !== "teachers") {
    throw Object.assign(new Error("entity must be students or teachers"), { status: 400 });
  }
  const cleanId = safeId(id);
  if (!cleanId) {
    throw Object.assign(new Error("id required"), { status: 400 });
  }
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw Object.assign(
      new Error("Invalid image. Use JPG, PNG, WEBP or GIF under 4 MB."),
      { status: 400 }
    );
  }

  ensureUploadDir();
  clearEntityFiles(entity, cleanId);

  const stamp = crypto.randomBytes(3).toString("hex");
  const filename = `${cleanId}-${stamp}.${parsed.ext}`;
  const abs = path.join(UPLOAD_DIR, entity, filename);
  fs.writeFileSync(abs, parsed.buffer);

  return `/uploads/${entity}/${filename}`;
}

export function deleteProfilePhoto(entity, id) {
  const cleanId = safeId(id);
  if (!cleanId) return;
  ensureUploadDir();
  clearEntityFiles(entity, cleanId);
}

/**
 * Save an announcement image (from data URL or raw buffer). Returns public URL path.
 */
export function saveAnnouncementImage({ dataUrl, buffer, mime, id }) {
  ensureUploadDir();
  const cleanId = safeId(id) || `ann-${Date.now()}`;
  let parsed = null;
  if (dataUrl) {
    parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      throw Object.assign(
        new Error("Invalid image. Use JPG, PNG, WEBP or GIF under 4 MB."),
        { status: 400 }
      );
    }
  } else if (buffer && mime) {
    const ext = MIME_EXT[mime.toLowerCase()];
    if (!ext) {
      throw Object.assign(new Error("Unsupported image type"), { status: 400 });
    }
    if (!buffer.length || buffer.length > MAX_BYTES * 2) {
      throw Object.assign(new Error("Image too large"), { status: 400 });
    }
    parsed = { buffer, ext, mime };
  } else {
    throw Object.assign(new Error("No image provided"), { status: 400 });
  }

  const stamp = crypto.randomBytes(3).toString("hex");
  const filename = `${cleanId}-${stamp}.${parsed.ext}`;
  const abs = path.join(UPLOAD_DIR, "announcements", filename);
  fs.writeFileSync(abs, parsed.buffer);
  return {
    url: `/uploads/announcements/${filename}`,
    absPath: abs,
    filename,
  };
}

export function absoluteUploadPath(publicUrl) {
  const rel = String(publicUrl || "").replace(/^\/uploads\//, "");
  if (!rel || rel.includes("..")) return null;
  return path.join(UPLOAD_DIR, rel);
}

const DOC_MIME_EXT = {
  ...MIME_EXT,
  "image/jpg": "jpg",
  "application/pdf": "pdf",
};

const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB

function parseDocDataUrl(dataUrl) {
  const raw = String(dataUrl || "");
  let m = raw.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
  // Phones sometimes omit MIME — treat as JPEG
  if (!m) {
    m = raw.match(/^data:;base64,(.+)$/);
    if (m) m = ["", "image/jpeg", m[1]];
  }
  if (!m) return null;
  const mime = String(m[1] || "image/jpeg").toLowerCase();
  const ext = DOC_MIME_EXT[mime] || (mime === "image/jpg" ? "jpg" : null);
  if (!ext) return null;
  let buffer;
  try {
    buffer = Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
  if (!buffer.length || buffer.length > MAX_DOC_BYTES) return null;
  return { mime: mime === "image/jpg" ? "image/jpeg" : mime, buffer, ext };
}

/**
 * Save companion/driver ID scan for a parent-form submission (VPS volume).
 * Returns public-style path used only via authenticated API.
 */
export function saveParentFormIdDocument({ submissionId, dataUrl }) {
  const cleanId = safeId(submissionId);
  if (!cleanId) {
    throw Object.assign(new Error("submission id required"), { status: 400 });
  }
  const parsed = parseDocDataUrl(dataUrl);
  if (!parsed) {
    throw Object.assign(
      new Error("Invalid ID file. Use JPG, PNG, WEBP, GIF or PDF under 5 MB."),
      { status: 400 }
    );
  }
  ensureUploadDir();
  const stamp = crypto.randomBytes(4).toString("hex");
  const filename = `${cleanId}-${stamp}.${parsed.ext}`;
  const abs = path.join(UPLOAD_DIR, "parent-forms", filename);
  fs.writeFileSync(abs, parsed.buffer);
  return {
    url: `/uploads/parent-forms/${filename}`,
    filename,
    mime: parsed.mime,
    absPath: abs,
  };
}

export { parseDataUrl, parseDocDataUrl };

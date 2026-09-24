import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "./db.js";
import { normalizePhoneDigits, phonesMatch } from "./teacherPortal.js";

const JWT_SECRET = process.env.JWT_SECRET || "bbc-school-change-me";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function authRequired(roles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  };
}

async function findTeacherAccountByPhone(phone) {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 8) return null;
  const r = await query(
    `SELECT t.id, t.phone, ta.password_hash, ta.must_change_password
     FROM teachers t
     INNER JOIN teacher_accounts ta ON ta.teacher_id = t.id
     WHERE regexp_replace(COALESCE(t.phone, ''), '[^0-9]', '', 'g') <> ''`
  );
  for (const row of r.rows) {
    if (phonesMatch(row.phone, digits)) return row;
  }
  return null;
}

export async function loginHandler(req, res) {
  const password = String(req.body?.password || "");
  if (!password) {
    return res.status(400).json({ error: "password required" });
  }

  const phone = String(req.body?.phone || "").trim();
  if (phone) {
    const row = await findTeacherAccountByPhone(phone);
    if (!row) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = signToken({ role: "teacher", teacherId: row.id });
    return res.json({
      token,
      role: "teacher",
      teacherId: row.id,
      mustChangePassword: Boolean(row.must_change_password),
    });
  }

  // Optional role for backward compatibility; if omitted, password alone decides access.
  const roleHint = String(req.body?.role || "").trim();
  const rolesToTry =
    roleHint && ["director", "admin", "whatsapp"].includes(roleHint)
      ? [roleHint]
      : ["admin", "director", "whatsapp"];

  for (const role of rolesToTry) {
    const result = await query("SELECT password_hash FROM app_users WHERE role = $1", [role]);
    if (!result.rows.length) continue;
    const ok = await bcrypt.compare(password, result.rows[0].password_hash);
    if (ok) {
      const token = signToken({ role });
      return res.json({ token, role });
    }
  }
  return res.status(401).json({ error: "Invalid credentials" });
}

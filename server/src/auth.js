import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "./db.js";

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

export async function loginHandler(req, res) {
  const password = String(req.body?.password || "");
  if (!password) {
    return res.status(400).json({ error: "password required" });
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

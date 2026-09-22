import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { migrate } from "./migrate.js";
import { loginHandler } from "./auth.js";
import apiRoutes from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const WEB_ROOT = process.env.WEB_ROOT || path.resolve(__dirname, "../../");

async function main() {
  await migrate();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "bbc-school" }));
  app.post("/api/auth/login", loginHandler);
  app.use("/api", apiRoutes);

  app.use(express.static(WEB_ROOT, { index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(WEB_ROOT, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BBC School API listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});

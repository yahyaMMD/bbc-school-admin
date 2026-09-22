import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { migrate } from "./migrate.js";
import { loginHandler } from "./auth.js";
import apiRoutes from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

function resolveWebRoot() {
  const candidates = [
    process.env.WEB_ROOT,
    path.resolve(__dirname, "../../"),
    path.resolve(__dirname, "../web"),
    "/web",
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return candidates[0] || path.resolve(__dirname, "../../");
}

async function main() {
  await migrate();

  const WEB_ROOT = resolveWebRoot();
  const indexPath = path.join(WEB_ROOT, "index.html");
  const appJs = path.join(WEB_ROOT, "js/app.js");
  console.log("WEB_ROOT=", WEB_ROOT);
  console.log("index.html exists=", fs.existsSync(indexPath));
  console.log("js/app.js exists=", fs.existsSync(appJs));

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      service: "bbc-school",
      webRoot: WEB_ROOT,
      hasIndex: fs.existsSync(indexPath),
      hasAppJs: fs.existsSync(appJs),
    })
  );
  app.post("/api/auth/login", loginHandler);
  app.use("/api", apiRoutes);

  app.use(
    express.static(WEB_ROOT, {
      index: false,
      fallthrough: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith(".js")) {
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        } else if (filePath.endsWith(".css")) {
          res.setHeader("Content-Type", "text/css; charset=utf-8");
        }
      },
    })
  );

  // SPA fallback ONLY for extension-less routes (never for .js/.css/.png…)
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (path.extname(req.path)) {
      return res.status(404).type("text").send(`Not found: ${req.path}`);
    }
    if (!fs.existsSync(indexPath)) {
      return res
        .status(500)
        .type("text")
        .send("index.html missing in WEB_ROOT=" + WEB_ROOT);
    }
    res.sendFile(indexPath);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BBC School API listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});

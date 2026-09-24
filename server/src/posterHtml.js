/**
 * Announcement posters via structured AI understanding → trusted HTML/CSS → JPEG.
 * Category-themed brand frames; exact source text; no logos/icons unless in source.
 */
import crypto from "crypto";
import puppeteer from "puppeteer-core";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_TEXT_MODEL =
  process.env.OPENROUTER_TEXT_MODEL || "openai/gpt-4.1-mini";
const TEXT_MODEL_FALLBACKS = [
  "openai/gpt-4.1-mini",
  "google/gemini-2.5-flash",
  "anthropic/claude-sonnet-4",
];
const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/chromium";

export const POSTER_CATEGORIES = {
  announcement: {
    id: "announcement",
    labelAr: "اعلان",
    labelEn: "Announcement",
    labelFr: "Annonce",
    accent: "#f26522",
    accentDeep: "#d94f14",
    soft: "#fff3ec",
    canvas: "#fff8f3",
    ink: "#111111",
  },
  important: {
    id: "important",
    labelAr: "هام",
    labelEn: "Important",
    labelFr: "Important",
    accent: "#c62828",
    accentDeep: "#8e1b1b",
    soft: "#fdecea",
    canvas: "#fff5f4",
    ink: "#1a1010",
  },
  notice: {
    id: "notice",
    labelAr: "تبليغ",
    labelEn: "Notice",
    labelFr: "Avis",
    accent: "#e6a100",
    accentDeep: "#b87d00",
    soft: "#fff8e6",
    canvas: "#fffbf0",
    ink: "#1a1608",
  },
  instruction: {
    id: "instruction",
    labelAr: "تعليمة",
    labelEn: "Instruction",
    labelFr: "Instruction",
    accent: "#0d7a6f",
    accentDeep: "#085850",
    soft: "#e8f6f4",
    canvas: "#f2faf9",
    ink: "#0c1a18",
  },
  reminder: {
    id: "reminder",
    labelAr: "تذكير",
    labelEn: "Reminder",
    labelFr: "Rappel",
    accent: "#c9a227",
    accentDeep: "#9a7a12",
    soft: "#fff9e8",
    canvas: "#fffcef",
    ink: "#1a160a",
  },
  info: {
    id: "info",
    labelAr: "اعلام",
    labelEn: "Information",
    labelFr: "Information",
    accent: "#455a64",
    accentDeep: "#2e3d44",
    soft: "#eceff1",
    canvas: "#f5f7f8",
    ink: "#12181b",
  },
};

export function resolveCategory(raw) {
  const key = String(raw || "announcement")
    .trim()
    .toLowerCase();
  return POSTER_CATEGORIES[key] || POSTER_CATEGORIES.announcement;
}

function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(String(text || ""));
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openRouterHeaders() {
  return {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://qea.local",
    "X-Title": process.env.OPENROUTER_APP_NAME || "QEA Announcements",
  };
}

function buildStructurePrompt(text, category) {
  const cat = resolveCategory(category);
  return `You convert a school announcement into a clean JSON layout for a printable poster.

Category selected by staff: ${cat.id} (${cat.labelAr} / ${cat.labelEn}).
Do NOT invent a category label in the JSON — the template already shows it.

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "title": "string — short orange headline from the source (empty if none)",
  "intro": "string — main body / introductory paragraph",
  "table": {
    "headers": ["col1","col2","col3"],
    "rows": [["c1","c2","c3"], ...]
  } | null,
  "notesTitle": "string — e.g. ملاحظات هامة: (empty if none)",
  "notes": ["bullet 1", "bullet 2"]
}

Rules:
- Preserve EVERY Arabic/French/English word and digit EXACTLY from the source (letter-perfect). Do not invent content.
- Never translate: if the source is English, keep English; if Arabic, keep Arabic.
- If the text is RTL Arabic, keep Arabic strings as-is.
- Detect schedule/table data even when columns are listed vertically or jumbled; rebuild logical rows.
- Typical schedule columns (RTL display order): الأقسام المعنية | اليوم | التوقيت — put headers in the order that reads correctly right-to-left when rendered.
- If times are split across lines (e.g. "من 08:30 إلى" then "12:00"), join them into one cell: "من 08:30 إلى 12:00".
- Put the orange banner/title FIRST even if it appears later in the pasted text (e.g. "خاص بأقسام الإبتدائي").
- intro = the paragraph starting with في إطار / يسرنا / etc., OR the full short notice body.
- Short free-text notices (1–3 sentences, no schedule): set "title" to "" (empty) and put the whole message in "intro". Do not invent a headline.
- If there is no table, set "table" to null and put remaining body into intro and/or notes.
- No logos, icons, school names, phone numbers, or QR unless present in the source text.
- title should be the orange banner line (e.g. خاص بأقسام الإبتدائي) when present in the source.

SOURCE ANNOUNCEMENT:
"""
${String(text || "").trim()}
"""`;
}

function extractJsonObject(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeSpec(raw, fallbackText) {
  const text = String(fallbackText || "").trim();
  const spec = raw && typeof raw === "object" ? raw : {};
  const title = String(spec.title || "").trim();
  const intro = String(spec.intro || "").trim();
  const notesTitle = String(spec.notesTitle || "").trim();
  const notes = Array.isArray(spec.notes)
    ? spec.notes.map((n) => String(n || "").trim()).filter(Boolean)
    : [];

  let table = null;
  if (spec.table && typeof spec.table === "object") {
    const headers = Array.isArray(spec.table.headers)
      ? spec.table.headers.map((h) => String(h || "").trim())
      : [];
    const rows = Array.isArray(spec.table.rows)
      ? spec.table.rows
          .map((row) =>
            Array.isArray(row) ? row.map((c) => String(c || "").trim()) : null
          )
          .filter((row) => row && row.some(Boolean))
      : [];
    if (headers.length || rows.length) {
      const width = Math.max(headers.length, ...rows.map((r) => r.length), 1);
      table = {
        headers: Array.from({ length: width }, (_, i) => headers[i] || ""),
        rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] || "")),
      };
    }
  }

  if (!title && !intro && !table && !notes.length) {
    return {
      title: "",
      intro: text,
      table: null,
      notesTitle: "",
      notes: [],
    };
  }

  return { title, intro, table, notesTitle, notes };
}

/** Heuristic fallback when the LLM is unavailable — still usable for common paste shapes. */
function heuristicSpec(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const titleIdx = lines.findIndex((l) => /خاص|إعلان|annonce|notice/i.test(l) && l.length < 80);
  const title = titleIdx >= 0 ? lines[titleIdx] : "";
  const notesTitleIdx = lines.findIndex((l) => /ملاحظات|notes/i.test(l));
  const notes =
    notesTitleIdx >= 0
      ? lines
          .slice(notesTitleIdx + 1)
          .map((l) => l.replace(/^[•\-\*\u2022]\s*/, "").trim())
          .filter(Boolean)
      : [];
  const notesTitle = notesTitleIdx >= 0 ? lines[notesTitleIdx].replace(/[:：]\s*$/, "") + ":" : "";

  const bodyLines = lines.filter(
    (l, i) => i !== titleIdx && (notesTitleIdx < 0 || i < notesTitleIdx)
  );
  const introParts = [];
  const tableRows = [];
  let i = 0;
  while (i < bodyLines.length) {
    const a = bodyLines[i];
    const b = bodyLines[i + 1];
    const c = bodyLines[i + 2];
    const d = bodyLines[i + 3];

    let time = null;
    let day = null;
    let klass = null;
    let consumed = 0;

    if (a && /من\s*\d/.test(a) && b && /^\d{1,2}:\d{2}/.test(b) && c && /(الإثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد|سبتمبر|أكتوبر|202\d)/.test(c) && d && /(سنة|ابتدائي|متوسط)/i.test(d)) {
      time = `${a} ${b}`;
      day = c;
      klass = d;
      consumed = 4;
    } else if (a && /من\s*\d|^\d{1,2}:\d{2}|إلى/.test(a) && b && /(الإثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد|سبتمبر|أكتوبر|202\d)/.test(b) && c && /(سنة|ابتدائي|متوسط)/i.test(c)) {
      time = a;
      day = b;
      klass = c;
      consumed = 3;
    }

    if (time && day && klass) {
      tableRows.push([klass, day, time]);
      i += consumed;
      continue;
    }
    if (a && !/^(التوقيت|اليوم|الأقسام المعنية)$/.test(a)) introParts.push(a);
    i += 1;
  }

  // Short single-block notices: no invented title
  const introJoined = introParts
    .filter((l) => !/^(التوقيت|اليوم|الأقسام المعنية)$/.test(l))
    .join(hasArabic(text) ? " " : " ")
    .trim();

  return normalizeSpec(
    {
      title: tableRows.length ? title : title || "",
      intro: introJoined || (!tableRows.length && !notes.length ? String(text || "").trim() : ""),
      table: tableRows.length
        ? {
            headers: ["الأقسام المعنية", "اليوم", "التوقيت"],
            rows: tableRows,
          }
        : null,
      notesTitle,
      notes,
    },
    text
  );
}

async function chatJson(prompt) {
  if (!OPENROUTER_API_KEY) {
    const err = new Error("OPENROUTER_API_KEY not configured on server");
    err.status = 500;
    throw err;
  }
  const models = [OPENROUTER_TEXT_MODEL, ...TEXT_MODEL_FALLBACKS].filter(
    (m, i, arr) => m && arr.indexOf(m) === i
  );
  let lastError = "";
  for (const model of models) {
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: openRouterHeaders(),
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You are a careful school-office assistant. Output only JSON. Never invent announcement text. Never translate languages.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    const orText = await orRes.text();
    let parsed = null;
    try {
      parsed = JSON.parse(orText);
    } catch {
      parsed = null;
    }
    if (!orRes.ok) {
      lastError =
        parsed?.error?.message ||
        parsed?.error ||
        `OpenRouter chat failed (${orRes.status}) for ${model}`;
      continue;
    }
    const content =
      parsed?.choices?.[0]?.message?.content ||
      parsed?.choices?.[0]?.message?.reasoning ||
      "";
    const json = extractJsonObject(content);
    if (json) return { json, model };
    lastError = `Model ${model} did not return JSON`;
  }
  const err = new Error(String(lastError || "Failed to structure announcement"));
  err.status = 502;
  throw err;
}

export function buildPosterHtml(specInput, sourceText = "", categoryInput = "announcement") {
  const spec = normalizeSpec(specInput, sourceText);
  const theme = resolveCategory(categoryInput);
  const rtl = hasArabic(
    [spec.title, spec.intro, spec.notesTitle, ...(spec.notes || [])]
      .concat(spec.table ? [...(spec.table.headers || []), ...(spec.table.rows || []).flat()] : [])
      .join("\n")
  ) || hasArabic(theme.labelAr);
  const dir = rtl ? "rtl" : "ltr";
  const pillLabel = rtl ? theme.labelAr : theme.labelEn;

  const isShortNotice = !spec.table && !spec.notes?.length && !spec.title && Boolean(spec.intro);

  const tableHtml = spec.table
    ? `<table class="sched" dir="${dir}">
        <thead><tr>${spec.table.headers
          .map((h) => `<th>${escHtml(h)}</th>`)
          .join("")}</tr></thead>
        <tbody>
          ${spec.table.rows
            .map(
              (row) =>
                `<tr>${row.map((c) => `<td>${escHtml(c).replace(/\n/g, "<br/>")}</td>`).join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>`
    : "";

  const notesHtml =
    spec.notes?.length || spec.notesTitle
      ? `<section class="notes">
          ${spec.notesTitle ? `<h2>${escHtml(spec.notesTitle)}</h2>` : ""}
          <ul>
            ${spec.notes.map((n) => `<li>${escHtml(n)}</li>`).join("")}
          </ul>
        </section>`
      : "";

  const bodyClass = isShortNotice ? "intro intro-hero" : "intro";

  return `<!DOCTYPE html>
<html lang="${rtl ? "ar" : "en"}" dir="${dir}">
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: ${theme.canvas};
  }
  body {
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", "Amiri", "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
    color: ${theme.ink};
  }
  #poster {
    width: 1080px;
    min-height: 1080px;
    padding: 48px;
    background:
      radial-gradient(ellipse 90% 60% at 50% -10%, ${theme.soft} 0%, transparent 55%),
      linear-gradient(180deg, ${theme.canvas} 0%, #ffffff 42%, ${theme.canvas} 100%);
    display: flex;
    align-items: stretch;
    justify-content: center;
  }
  .card {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border: 3px solid ${theme.accent};
    border-radius: 28px;
    overflow: hidden;
    box-shadow: 0 18px 48px rgba(17, 17, 17, 0.08);
    position: relative;
  }
  .card::before {
    content: "";
    display: block;
    height: 14px;
    background: linear-gradient(90deg, ${theme.accentDeep}, ${theme.accent}, ${theme.accentDeep});
  }
  .card-inner {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 40px 52px 52px;
  }
  .pill-row {
    display: flex;
    justify-content: center;
    margin: 0 0 28px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 10px 28px;
    border-radius: 999px;
    background: ${theme.soft};
    border: 2px solid ${theme.accent};
    color: ${theme.accentDeep};
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }
  .pill-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${theme.accent};
  }
  h1 {
    margin: 0 0 26px;
    text-align: center;
    color: ${theme.accent};
    font-size: 52px;
    font-weight: 800;
    line-height: 1.3;
  }
  .intro {
    margin: 0 0 32px;
    text-align: center;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.75;
    color: ${theme.ink};
  }
  .intro-hero {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 12px 0 8px;
    padding: 36px 28px;
    font-size: 36px;
    line-height: 1.7;
    background: ${theme.soft};
    border-radius: 20px;
    border: 1px solid ${theme.accent}33;
  }
  table.sched {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 36px;
    table-layout: fixed;
  }
  table.sched th,
  table.sched td {
    border: 2px solid #1a1a1a;
    padding: 16px 12px;
    text-align: center;
    vertical-align: middle;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.45;
    word-wrap: break-word;
  }
  table.sched th {
    background: ${theme.soft};
    color: ${theme.accentDeep};
    font-size: 26px;
  }
  .notes h2 {
    margin: 0 0 18px;
    color: ${theme.accent};
    font-size: 30px;
    font-weight: 800;
    display: inline-block;
    border-bottom: 3px solid ${theme.accent};
    padding-bottom: 4px;
  }
  .notes ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .notes li {
    position: relative;
    margin: 0 0 16px;
    padding-inline-start: 1.6em;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.65;
  }
  .notes li::before {
    content: "";
    position: absolute;
    inset-inline-start: 0;
    top: 0.55em;
    width: 0.55em;
    height: 0.55em;
    border-radius: 50%;
    background: ${theme.accent};
  }
  .footer-rule {
    margin-top: auto;
    padding-top: 28px;
    display: flex;
    justify-content: center;
  }
  .footer-rule span {
    width: 120px;
    height: 4px;
    border-radius: 4px;
    background: ${theme.accent};
    opacity: 0.55;
  }
</style>
</head>
<body>
  <div id="poster">
    <div class="card">
      <div class="card-inner">
        <div class="pill-row">
          <span class="pill"><span class="pill-dot"></span>${escHtml(pillLabel)}</span>
        </div>
        ${spec.title ? `<h1>${escHtml(spec.title)}</h1>` : ""}
        ${spec.intro ? `<p class="${bodyClass}">${escHtml(spec.intro).replace(/\n/g, "<br/>")}</p>` : ""}
        ${tableHtml}
        ${notesHtml}
        <div class="footer-rule"><span></span></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function renderHtmlToJpeg(html) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
      "--hide-scrollbars",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1600, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.evaluateHandle("document.fonts.ready");
    const el = await page.$("#poster");
    if (!el) {
      throw new Error("Poster root #poster missing");
    }
    const buffer = await el.screenshot({
      type: "jpeg",
      quality: 92,
      omitBackground: false,
    });
    return Buffer.from(buffer);
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function generatePosterFromText(text, options = {}) {
  const source = String(text || "").trim();
  const category = resolveCategory(options.category).id;
  if (!source) {
    const err = new Error("text required");
    err.status = 400;
    throw err;
  }

  let model = "heuristic";
  let spec;
  try {
    const structured = await chatJson(buildStructurePrompt(source, category));
    model = structured.model;
    spec = normalizeSpec(structured.json, source);
  } catch (err) {
    console.warn("poster structure via AI failed, using heuristic:", err.message);
    spec = heuristicSpec(source);
  }

  if (!spec.title && !spec.table && !spec.notes.length && spec.intro === source) {
    const h = heuristicSpec(source);
    if (h.table || h.notes.length) spec = h;
  }

  const html = buildPosterHtml(spec, source, category);
  const buffer = await renderHtmlToJpeg(html);
  return {
    buffer,
    mime: "image/jpeg",
    model,
    method: "html-css",
    arabic: hasArabic(source),
    category,
    spec,
    htmlPreviewId: crypto.randomBytes(3).toString("hex"),
  };
}

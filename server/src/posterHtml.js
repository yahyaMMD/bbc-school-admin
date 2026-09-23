/**
 * Announcement posters via structured AI understanding → trusted HTML/CSS → JPEG.
 * Exact Arabic text, no logos/icons — matches the clean Q.E.A school style.
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

function buildStructurePrompt(text) {
  return `You convert a school announcement into a clean JSON layout for a printable poster.

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "title": "string — short orange headline",
  "intro": "string — introductory paragraph (empty if none)",
  "table": {
    "headers": ["col1","col2","col3"],
    "rows": [["c1","c2","c3"], ...]
  } | null,
  "notesTitle": "string — e.g. ملاحظات هامة: (empty if none)",
  "notes": ["bullet 1", "bullet 2"]
}

Rules:
- Preserve EVERY Arabic/French/English word and digit EXACTLY from the source (letter-perfect). Do not invent content.
- If the text is RTL Arabic, keep Arabic strings as-is.
- Detect schedule/table data even when columns are listed vertically or jumbled; rebuild logical rows.
- Typical schedule columns (RTL display order): الأقسام المعنية | اليوم | التوقيت — put headers in the order that reads correctly right-to-left when rendered.
- If there is no table, set "table" to null and put remaining body into intro and/or notes.
- No logos, icons, school names, phone numbers, or QR unless present in the source text.
- title should be the orange banner line (e.g. خاص بأقسام الإبتدائي) when present.

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
  const title = titleIdx >= 0 ? lines[titleIdx] : lines[0] || "";
  const notesTitleIdx = lines.findIndex((l) => /ملاحظات|notes/i.test(l));
  const notes =
    notesTitleIdx >= 0
      ? lines
          .slice(notesTitleIdx + 1)
          .map((l) => l.replace(/^[•\-\*\u2022]\s*/, "").trim())
          .filter(Boolean)
      : [];
  const notesTitle = notesTitleIdx >= 0 ? lines[notesTitleIdx].replace(/[:：]\s*$/, "") + ":" : "";

  // Try to detect 3-column schedule blocks: time / day / classes repeating
  const bodyLines = lines.filter(
    (l, i) => i !== titleIdx && (notesTitleIdx < 0 || i < notesTitleIdx)
  );
  // Detect schedule rows even when time spans two lines: "من 08:30 إلى" + "12:00"
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

  return normalizeSpec(
    {
      title,
      intro: introParts
        .filter((l) => !/^(التوقيت|اليوم|الأقسام المعنية)$/.test(l))
        .join(" ")
        .trim(),
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
              "You are a careful school-office assistant. Output only JSON. Never invent announcement text.",
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

export function buildPosterHtml(specInput, sourceText = "") {
  const spec = normalizeSpec(specInput, sourceText);
  const rtl = hasArabic(
    [spec.title, spec.intro, spec.notesTitle, ...(spec.notes || [])]
      .concat(spec.table ? [...(spec.table.headers || []), ...(spec.table.rows || []).flat()] : [])
      .join("\n")
  );
  const dir = rtl ? "rtl" : "ltr";

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
            ${spec.notes
              .map((n) => {
                // Soft-highlight day names already in the text without inventing markup from AI
                return `<li>${escHtml(n)}</li>`;
              })
              .join("")}
          </ul>
        </section>`
      : "";

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
    background: #ffffff;
  }
  body {
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", "Amiri", "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
    color: #111111;
  }
  #poster {
    width: 1080px;
    min-height: 1080px;
    padding: 72px 64px 80px;
    background: #ffffff;
  }
  h1 {
    margin: 0 0 28px;
    text-align: center;
    color: #f26522;
    font-size: 54px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: 0;
  }
  .intro {
    margin: 0 0 36px;
    text-align: center;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.75;
    color: #111;
  }
  table.sched {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 40px;
    table-layout: fixed;
  }
  table.sched th,
  table.sched td {
    border: 2px solid #1a1a1a;
    padding: 18px 14px;
    text-align: center;
    vertical-align: middle;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.45;
    word-wrap: break-word;
  }
  table.sched th {
    background: #fff3ec;
    font-size: 26px;
  }
  .notes h2 {
    margin: 0 0 18px;
    color: #f26522;
    font-size: 30px;
    font-weight: 800;
    display: inline-block;
    border-bottom: 3px solid #f26522;
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
    background: #f26522;
  }
</style>
</head>
<body>
  <div id="poster">
    ${spec.title ? `<h1>${escHtml(spec.title)}</h1>` : ""}
    ${spec.intro ? `<p class="intro">${escHtml(spec.intro)}</p>` : ""}
    ${tableHtml}
    ${notesHtml}
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

export async function generatePosterFromText(text) {
  const source = String(text || "").trim();
  if (!source) {
    const err = new Error("text required");
    err.status = 400;
    throw err;
  }

  let model = "heuristic";
  let spec;
  try {
    const structured = await chatJson(buildStructurePrompt(source));
    model = structured.model;
    spec = normalizeSpec(structured.json, source);
  } catch (err) {
    console.warn("poster structure via AI failed, using heuristic:", err.message);
    spec = heuristicSpec(source);
  }

  // If AI returned almost empty, merge heuristic
  if (!spec.title && !spec.table && !spec.notes.length && spec.intro === source) {
    const h = heuristicSpec(source);
    if (h.table || h.notes.length) spec = h;
  }

  const html = buildPosterHtml(spec, source);
  const buffer = await renderHtmlToJpeg(html);
  return {
    buffer,
    mime: "image/jpeg",
    model,
    method: "html-css",
    arabic: hasArabic(source),
    spec,
    htmlPreviewId: crypto.randomBytes(3).toString("hex"),
  };
}

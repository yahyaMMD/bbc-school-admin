/**
 * WhatsApp Bulk Campaign Studio — CSV/sheet upload, personalized messages,
 * human-like intervals, send now or schedule.
 */
const WaCampaignsUI = (() => {
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function t(key, vars) {
    return I18n.t(key, vars);
  }

  function formatTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return String(iso);
    }
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "sent") return "ok";
    if (s === "partial" || s === "scheduled" || s === "sending" || s === "queued" || s === "paused")
      return "warn";
    if (s === "failed" || s === "cancelled") return "err";
    return "";
  }

  /** Parse CSV / TSV / pasted Excel into { headers, rows }. */
  function parseSheetText(text) {
    const raw = String(text || "").replace(/^\uFEFF/, "");
    if (!raw.trim()) return { headers: [], rows: [] };

    const lines = [];
    let i = 0;
    let cur = "";
    let inQ = false;
    while (i < raw.length) {
      const ch = raw[i];
      if (inQ) {
        if (ch === '"') {
          if (raw[i + 1] === '"') {
            cur += '"';
            i += 2;
            continue;
          }
          inQ = false;
          i++;
          continue;
        }
        cur += ch;
        i++;
        continue;
      }
      if (ch === '"') {
        inQ = true;
        i++;
        continue;
      }
      if (ch === "\n") {
        lines.push(cur);
        cur = "";
        i++;
        continue;
      }
      if (ch === "\r") {
        i++;
        continue;
      }
      cur += ch;
      i++;
    }
    if (cur.length || lines.length) lines.push(cur);

    const nonEmpty = lines.filter((l) => String(l).trim().length);
    if (!nonEmpty.length) return { headers: [], rows: [] };

    const delim = (() => {
      const sample = nonEmpty[0];
      const commas = (sample.match(/,/g) || []).length;
      const semis = (sample.match(/;/g) || []).length;
      const tabs = (sample.match(/\t/g) || []).length;
      if (tabs >= commas && tabs >= semis) return "\t";
      if (semis > commas) return ";";
      return ",";
    })();

    function splitLine(line) {
      if (delim === "\t") return line.split("\t").map((c) => c.trim());
      const out = [];
      let cell = "";
      let q = false;
      for (let j = 0; j < line.length; j++) {
        const c = line[j];
        if (q) {
          if (c === '"') {
            if (line[j + 1] === '"') {
              cell += '"';
              j++;
            } else q = false;
          } else cell += c;
          continue;
        }
        if (c === '"') {
          q = true;
          continue;
        }
        if (c === delim) {
          out.push(cell.trim());
          cell = "";
          continue;
        }
        cell += c;
      }
      out.push(cell.trim());
      return out;
    }

    const table = nonEmpty.map(splitLine);
    const width = Math.max(...table.map((r) => r.length), 1);
    const normalized = table.map((r) => {
      const copy = r.slice();
      while (copy.length < width) copy.push("");
      return copy.slice(0, Math.min(width, 12));
    });

    let headers = normalized[0].map((h, idx) => h || `Column ${idx + 1}`);
    // If first cell looks like a phone, treat first row as data
    const firstLooksPhone = /^[\d+\s().-]{6,}$/.test(String(normalized[0][0] || ""));
    let dataRows = normalized.slice(1);
    if (firstLooksPhone) {
      headers = normalized[0].map((_, idx) =>
        idx === 0 ? "phone" : `col${idx + 1}`
      );
      dataRows = normalized;
    } else {
      headers[0] = headers[0] || "phone";
    }

    const rows = dataRows
      .filter((r) => r.some((c) => String(c).trim()))
      .map((r) => {
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = r[idx] || "";
        });
        return obj;
      });

    return { headers, rows };
  }

  function renderTemplate(template, vars) {
    const map = {};
    Object.entries(vars || {}).forEach(([k, v]) => {
      map[String(k).trim().toLowerCase()] = String(v ?? "");
    });
    return String(template || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
      const k = String(key).trim().toLowerCase();
      return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : "";
    });
  }

  function estimateDuration(count, minMs, maxMs) {
    const avg = (Number(minMs) + Number(maxMs)) / 2;
    const sec = Math.round(((count - 1) * avg) / 1000);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)} min`;
    return `${(sec / 3600).toFixed(1)} h`;
  }

  function viewList() {
    return `
      <div class="admin-toolbar wa-bulk-toolbar">
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/whatsapp/hub">← ${esc(t("waAutomations"))}</button>
        <button type="button" class="btn btn-primary" data-nav="#/whatsapp/bulk/new">${esc(t("waBulkNew"))}</button>
      </div>

      <section class="wa-bulk-hero">
        <div class="wa-bulk-hero-copy">
          <p class="wa-bulk-kicker">${esc(t("waBulkKicker"))}</p>
          <h2>${esc(t("waBulkTitle"))}</h2>
          <p>${esc(t("waBulkLede"))}</p>
          <ul class="wa-bulk-pillars">
            <li>${esc(t("waBulkPillar1"))}</li>
            <li>${esc(t("waBulkPillar2"))}</li>
            <li>${esc(t("waBulkPillar3"))}</li>
          </ul>
        </div>
        <div class="wa-bulk-hero-visual" aria-hidden="true">
          <div class="wa-bulk-orbit">
            <span></span><span></span><span></span>
          </div>
          <div class="wa-bulk-hero-card">
            <strong>{{name}}</strong>
            <em>{{class}}</em>
            <small>+213 · paced · personalized</small>
          </div>
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <div class="admin-panel-label">${esc(t("waBulkHistory"))}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-wa-bulk-refresh>${esc(t("waRefresh"))}</button>
        </div>
        <div class="wa-bulk-list" data-wa-bulk-list>
          <div class="admin-empty">${esc(t("loading"))}</div>
        </div>
      </section>
    `;
  }

  function viewStudio() {
    return `
      <div class="admin-toolbar wa-bulk-toolbar">
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/whatsapp/bulk">← ${esc(t("waBulkHistory"))}</button>
      </div>

      <div class="wa-studio" data-wa-studio>
        <nav class="wa-studio-steps" data-wa-steps>
          <button type="button" class="wa-studio-step is-active" data-wa-step-btn="1"><span>1</span>${esc(t("waBulkStepUpload"))}</button>
          <button type="button" class="wa-studio-step" data-wa-step-btn="2"><span>2</span>${esc(t("waBulkStepCompose"))}</button>
          <button type="button" class="wa-studio-step" data-wa-step-btn="3"><span>3</span>${esc(t("waBulkStepLaunch"))}</button>
        </nav>

        <div class="wa-studio-panels">
          <!-- STEP 1 -->
          <section class="wa-studio-panel is-active" data-wa-panel="1">
            <div class="wa-studio-grid">
              <div class="admin-panel">
                <div class="admin-panel-label">${esc(t("waBulkUploadTitle"))}</div>
                <p class="admin-field-hint">${esc(t("waBulkUploadHint"))}</p>
                <label class="wa-dropzone" data-wa-dropzone>
                  <input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden data-wa-file />
                  <strong>${esc(t("waBulkDrop"))}</strong>
                  <span>${esc(t("waBulkDropSub"))}</span>
                </label>
                <div class="wa-studio-or">${esc(t("waBulkOrPaste"))}</div>
                <textarea class="wa-paste" data-wa-paste rows="6" placeholder="phone,name,class&#10;0555123456,Amira,3P02&#10;0661789012,Yacine,5P01"></textarea>
                <div class="ann-actions">
                  <button type="button" class="btn btn-primary" data-wa-parse>${esc(t("waBulkParse"))}</button>
                  <button type="button" class="btn btn-ghost" data-wa-sample>${esc(t("waBulkSample"))}</button>
                </div>
                <p class="ann-status" data-wa-upload-status hidden></p>
              </div>
              <div class="admin-panel">
                <div class="admin-panel-head">
                  <div class="admin-panel-label">${esc(t("waBulkPreviewSheet"))}</div>
                  <span class="ann-group-count" data-wa-row-count></span>
                </div>
                <div class="wa-sheet-wrap" data-wa-sheet>
                  <div class="admin-empty">${esc(t("waBulkNoSheet"))}</div>
                </div>
                <button type="button" class="btn btn-primary" data-wa-to-step="2" disabled>${esc(t("waBulkContinueCompose"))} →</button>
              </div>
            </div>
          </section>

          <!-- STEP 2 -->
          <section class="wa-studio-panel" data-wa-panel="2" hidden>
            <div class="wa-studio-grid">
              <div class="admin-panel">
                <div class="admin-panel-label">${esc(t("waBulkComposeTitle"))}</div>
                <p class="admin-field-hint">${esc(t("waBulkComposeHint"))}</p>
                <div class="wa-token-bar" data-wa-tokens></div>
                <textarea class="ann-text wa-template" data-wa-template rows="8" placeholder="${esc(t("waBulkTemplatePh"))}"></textarea>
                <div class="wa-compose-presets">
                  <button type="button" class="btn btn-ghost btn-sm" data-wa-preset="welcome">${esc(t("waBulkPresetWelcome"))}</button>
                  <button type="button" class="btn btn-ghost btn-sm" data-wa-preset="reminder">${esc(t("waBulkPresetReminder"))}</button>
                  <button type="button" class="btn btn-ghost btn-sm" data-wa-preset="meeting">${esc(t("waBulkPresetMeeting"))}</button>
                </div>
                <label class="admin-field" style="margin-top:1rem">
                  <span>${esc(t("waBulkCampaignName"))}</span>
                  <input type="text" data-wa-name maxlength="120" placeholder="${esc(t("waBulkCampaignNamePh"))}" />
                </label>
                <div class="ann-actions">
                  <button type="button" class="btn btn-ghost" data-wa-to-step="1">← ${esc(t("waBulkBack"))}</button>
                  <button type="button" class="btn btn-primary" data-wa-to-step="3">${esc(t("waBulkContinueLaunch"))} →</button>
                </div>
              </div>
              <div class="admin-panel wa-live-preview-panel">
                <div class="admin-panel-label">${esc(t("waBulkLivePreview"))}</div>
                <p class="admin-field-hint">${esc(t("waBulkLivePreviewHint"))}</p>
                <div class="wa-preview-phone">
                  <div class="wa-preview-bubble" data-wa-live-preview dir="auto">…</div>
                </div>
                <div class="wa-preview-nav">
                  <button type="button" class="btn btn-ghost btn-sm" data-wa-prev-row>‹</button>
                  <span data-wa-preview-idx>1 / 1</span>
                  <button type="button" class="btn btn-ghost btn-sm" data-wa-next-row>›</button>
                </div>
                <div class="wa-test-send">
                  <div class="admin-panel-label">${esc(t("waBulkTestSend"))}</div>
                  <div class="wa-test-row">
                    <input type="text" data-wa-test-phone placeholder="0555…" />
                    <button type="button" class="btn btn-ghost btn-sm" data-wa-test-send>${esc(t("waBulkSendTest"))}</button>
                  </div>
                  <p class="ann-status" data-wa-test-status hidden></p>
                </div>
              </div>
            </div>
          </section>

          <!-- STEP 3 -->
          <section class="wa-studio-panel" data-wa-panel="3" hidden>
            <div class="wa-studio-grid">
              <div class="admin-panel">
                <div class="admin-panel-label">${esc(t("waBulkPacingTitle"))}</div>
                <p class="admin-field-hint">${esc(t("waBulkPacingHint"))}</p>
                <div class="wa-pacing">
                  <label class="admin-field">
                    <span>${esc(t("waBulkIntervalMin"))}</span>
                    <input type="range" min="3" max="60" value="8" data-wa-min-sec />
                    <em data-wa-min-label>8s</em>
                  </label>
                  <label class="admin-field">
                    <span>${esc(t("waBulkIntervalMax"))}</span>
                    <input type="range" min="4" max="90" value="14" data-wa-max-sec />
                    <em data-wa-max-label>14s</em>
                  </label>
                </div>
                <div class="wa-eta" data-wa-eta></div>

                <div class="wa-adv-options">
                  <label class="wa-check">
                    <input type="checkbox" data-wa-shuffle />
                    <span>${esc(t("waBulkShuffle"))}</span>
                  </label>
                  <label class="admin-field">
                    <span>${esc(t("waBulkAutoPause"))}</span>
                    <select data-wa-max-fails>
                      <option value="0">${esc(t("waBulkAutoPauseOff"))}</option>
                      <option value="3">3</option>
                      <option value="5" selected>5</option>
                      <option value="10">10</option>
                    </select>
                  </label>
                </div>

                <div class="admin-panel-label" style="margin-top:1.25rem">${esc(t("scheduleTitle"))}</div>
                <div class="ann-schedule" data-wa-schedule>
                  <label class="ann-schedule-option">
                    <input type="radio" name="wa-sched-mode" value="now" checked data-wa-sched-mode />
                    <span>${esc(t("sendNow"))}</span>
                  </label>
                  <label class="ann-schedule-option">
                    <input type="radio" name="wa-sched-mode" value="later" data-wa-sched-mode />
                    <span>${esc(t("scheduleLater"))}</span>
                  </label>
                  <div class="ann-schedule-fields" data-wa-sched-fields hidden>
                    <div class="ann-schedule-presets">
                      <button type="button" class="btn btn-ghost btn-sm" data-wa-delay="5">+5 ${esc(t("minutesShort"))}</button>
                      <button type="button" class="btn btn-ghost btn-sm" data-wa-delay="15">+15 ${esc(t("minutesShort"))}</button>
                      <button type="button" class="btn btn-ghost btn-sm" data-wa-delay="60">+60 ${esc(t("minutesShort"))}</button>
                    </div>
                    <label class="admin-field">
                      <span>${esc(t("scheduleAt"))}</span>
                      <input type="datetime-local" data-wa-sched-at />
                    </label>
                  </div>
                </div>

                <div class="ann-actions" style="margin-top:1.25rem">
                  <button type="button" class="btn btn-ghost" data-wa-to-step="2">← ${esc(t("waBulkBack"))}</button>
                  <button type="button" class="btn btn-primary btn-lg" data-wa-launch>${esc(t("waBulkLaunch"))}</button>
                </div>
                <p class="ann-status" data-wa-launch-status hidden></p>
              </div>

              <div class="admin-panel">
                <div class="admin-panel-label">${esc(t("waBulkSummary"))}</div>
                <dl class="wa-summary" data-wa-summary></dl>
                <div class="wa-safety">
                  <h4>${esc(t("waBulkSafetyTitle"))}</h4>
                  <ul>
                    <li>${esc(t("waBulkSafety1"))}</li>
                    <li>${esc(t("waBulkSafety2"))}</li>
                    <li>${esc(t("waBulkSafety3"))}</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function viewDetail(id) {
    return `
      <div class="admin-toolbar wa-bulk-toolbar">
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/whatsapp/bulk">← ${esc(t("waBulkHistory"))}</button>
        <div class="wa-detail-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-wa-detail-refresh>${esc(t("waRefresh"))}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-wa-detail-export>${esc(t("waBulkExport"))}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-wa-detail-pause hidden>${esc(t("waBulkPause"))}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-wa-detail-resume hidden>${esc(t("waBulkResume"))}</button>
          <button type="button" class="btn btn-ghost btn-sm wa-disconnect-btn" data-wa-detail-cancel hidden>${esc(t("waBulkCancel"))}</button>
        </div>
      </div>
      <section class="admin-panel wa-detail" data-wa-detail data-campaign-id="${esc(id)}">
        <div class="admin-empty">${esc(t("loading"))}</div>
      </section>
    `;
  }

  async function loadList(root) {
    const box = root.querySelector("[data-wa-bulk-list]");
    if (!box) return;
    try {
      const data = await BBC_API.get("/wa/campaigns");
      const list = data.campaigns || [];
      if (!list.length) {
        box.innerHTML = `<div class="admin-empty">${esc(t("waBulkEmpty"))}</div>`;
        return;
      }
      box.innerHTML = `
        <div class="wa-bulk-cards">
          ${list
            .map((c) => {
              const pct = c.total ? Math.round((c.sent / c.total) * 100) : 0;
              return `
              <button type="button" class="wa-bulk-card" data-nav="#/whatsapp/bulk/${esc(c.id)}">
                <div class="wa-bulk-card-top">
                  <strong dir="auto">${esc(c.name || c.id)}</strong>
                  <span class="ann-status-pill ${statusClass(c.status)}">${esc(c.status)}</span>
                </div>
                <div class="wa-bulk-progress"><i style="width:${pct}%"></i></div>
                <div class="wa-bulk-card-meta">
                  <span>${c.sent}/${c.total} ${esc(t("waBulkSent"))}</span>
                  ${c.failed ? `<span class="err">${c.failed} ${esc(t("waBulkFailed"))}</span>` : ""}
                  <span class="muted">${esc(formatTime(c.createdAt))}</span>
                </div>
              </button>`;
            })
            .join("")}
        </div>`;
    } catch (err) {
      box.innerHTML = `<div class="admin-empty err">${esc(err.message || "Failed")}</div>`;
    }
  }

  function bindList(root) {
    loadList(root);
    root.querySelector("[data-wa-bulk-refresh]")?.addEventListener("click", () => loadList(root));
  }

  function bindStudio(root, go) {
    const state = {
      headers: [],
      rows: [],
      previewIdx: 0,
      step: 1,
    };

    const drop = root.querySelector("[data-wa-dropzone]");
    const fileInput = root.querySelector("[data-wa-file]");
    const paste = root.querySelector("[data-wa-paste]");
    const statusEl = root.querySelector("[data-wa-upload-status]");
    const sheetEl = root.querySelector("[data-wa-sheet]");
    const rowCount = root.querySelector("[data-wa-row-count]");
    const toComposeBtn = root.querySelector('[data-wa-to-step="2"]');

    function setStatus(el, msg, kind) {
      if (!el) return;
      el.hidden = !msg;
      el.textContent = msg || "";
      el.classList.toggle("err", kind === "err");
      el.classList.toggle("ok", kind === "ok");
    }

    function applyParsed(parsed, note) {
      state.headers = parsed.headers;
      state.rows = parsed.rows;
      state.previewIdx = 0;
      if (!state.rows.length) {
        sheetEl.innerHTML = `<div class="admin-empty">${esc(t("waBulkNoSheet"))}</div>`;
        rowCount.textContent = "";
        toComposeBtn.disabled = true;
        setStatus(statusEl, t("waBulkParseEmpty"), "err");
        return;
      }
      rowCount.textContent = `${state.rows.length} ${t("waBulkRows")}`;
      const head = state.headers
        .map((h) => `<th>${esc(h)}</th>`)
        .join("");
      const body = state.rows
        .slice(0, 40)
        .map(
          (r) =>
            `<tr>${state.headers.map((h) => `<td dir="auto">${esc(r[h] || "")}</td>`).join("")}</tr>`
        )
        .join("");
      sheetEl.innerHTML = `<table class="wa-sheet"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
        ${state.rows.length > 40 ? `<p class="admin-field-hint">${esc(t("waBulkShowingFirst", { n: 40 }))}</p>` : ""}`;
      toComposeBtn.disabled = false;
      setStatus(statusEl, note || t("waBulkParsed", { n: state.rows.length }), "ok");
      rebuildTokens();
      updateLivePreview();
      updateSummary();
    }

    function rebuildTokens() {
      const bar = root.querySelector("[data-wa-tokens]");
      if (!bar) return;
      const tokens = ["phone", ...state.headers.filter((h) => h.toLowerCase() !== "phone")];
      // also numeric
      state.headers.forEach((_, i) => tokens.push(String(i + 1)));
      const uniq = [...new Set(tokens)];
      bar.innerHTML = uniq
        .map(
          (tok) =>
            `<button type="button" class="wa-token" data-wa-insert="{{${esc(tok)}}}">{{${esc(tok)}}}</button>`
        )
        .join("");
    }

    function currentVars() {
      const row = state.rows[state.previewIdx] || {};
      const vars = { ...row };
      const phoneKey = state.headers[0] || "phone";
      vars.phone = row[phoneKey] || row.phone || "";
      state.headers.forEach((h, i) => {
        vars[String(i + 1)] = row[h] || "";
      });
      return vars;
    }

    function updateLivePreview() {
      const tpl = root.querySelector("[data-wa-template]")?.value || "";
      const bubble = root.querySelector("[data-wa-live-preview]");
      const idxEl = root.querySelector("[data-wa-preview-idx]");
      if (!bubble) return;
      if (!state.rows.length) {
        bubble.textContent = "…";
        if (idxEl) idxEl.textContent = "—";
        return;
      }
      bubble.textContent = renderTemplate(tpl, currentVars()) || "…";
      if (idxEl) idxEl.textContent = `${state.previewIdx + 1} / ${state.rows.length}`;
    }

    function updateSummary() {
      const minSec = Number(root.querySelector("[data-wa-min-sec]")?.value || 8);
      const maxSec = Number(root.querySelector("[data-wa-max-sec]")?.value || 14);
      const minMs = Math.min(minSec, maxSec) * 1000;
      const maxMs = Math.max(minSec, maxSec) * 1000;
      const eta = root.querySelector("[data-wa-eta]");
      if (eta) {
        eta.innerHTML = `<strong>${esc(t("waBulkEta"))}:</strong> ${esc(
          estimateDuration(state.rows.length || 1, minMs, maxMs)
        )} · ${state.rows.length} ${esc(t("waBulkRecipients"))}`;
      }
      const sum = root.querySelector("[data-wa-summary]");
      if (sum) {
        const mode =
          root.querySelector('[data-wa-sched-mode][value="later"]')?.checked ||
          root.querySelector('input[name="wa-sched-mode"]:checked')?.value === "later"
            ? t("scheduleLater")
            : t("sendNow");
        sum.innerHTML = `
          <div><dt>${esc(t("waBulkRecipients"))}</dt><dd>${state.rows.length}</dd></div>
          <div><dt>${esc(t("waBulkColumns"))}</dt><dd>${esc(state.headers.join(", ") || "—")}</dd></div>
          <div><dt>${esc(t("waBulkIntervalMin"))}</dt><dd>${Math.min(minSec, maxSec)}s – ${Math.max(minSec, maxSec)}s</dd></div>
          <div><dt>${esc(t("scheduleTitle"))}</dt><dd>${esc(mode)}</dd></div>
          <div><dt>${esc(t("waBulkEta"))}</dt><dd>${esc(estimateDuration(state.rows.length || 1, minMs, maxMs))}</dd></div>
        `;
      }
      const minLabel = root.querySelector("[data-wa-min-label]");
      const maxLabel = root.querySelector("[data-wa-max-label]");
      if (minLabel) minLabel.textContent = `${Math.min(minSec, maxSec)}s`;
      if (maxLabel) maxLabel.textContent = `${Math.max(minSec, maxSec)}s`;
    }

    function goStep(n) {
      state.step = n;
      root.querySelectorAll("[data-wa-panel]").forEach((p) => {
        const on = Number(p.getAttribute("data-wa-panel")) === n;
        p.hidden = !on;
        p.classList.toggle("is-active", on);
      });
      root.querySelectorAll("[data-wa-step-btn]").forEach((b) => {
        const sn = Number(b.getAttribute("data-wa-step-btn"));
        b.classList.toggle("is-active", sn === n);
        b.classList.toggle("is-done", sn < n);
      });
      if (n >= 2) updateLivePreview();
      if (n >= 3) updateSummary();
    }

    drop?.addEventListener("click", () => fileInput?.click());
    drop?.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("is-drag");
    });
    drop?.addEventListener("dragleave", () => drop.classList.remove("is-drag"));
    drop?.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.classList.remove("is-drag");
      const f = e.dataTransfer?.files?.[0];
      if (f) readFile(f);
    });
    fileInput?.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (f) readFile(f);
    });

    function readFile(f) {
      const name = String(f.name || "").toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        setStatus(statusEl, t("waBulkXlsxHint"), "err");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        if (text.includes("\u0000")) {
          setStatus(statusEl, t("waBulkXlsxHint"), "err");
          return;
        }
        const parsed = parseSheetText(text);
        applyParsed(parsed, t("waBulkParsedFile", { name: f.name, n: parsed.rows.length }));
      };
      reader.onerror = () => setStatus(statusEl, t("waBulkFileError"), "err");
      reader.readAsText(f);
    }

    root.querySelector("[data-wa-parse]")?.addEventListener("click", () => {
      const parsed = parseSheetText(paste?.value || "");
      applyParsed(parsed);
    });

    root.querySelector("[data-wa-sample]")?.addEventListener("click", () => {
      if (paste) {
        paste.value =
          "phone,name,class\n0555123456,Amira Benali,3P02\n0661789012,Yacine Haddad,5P01\n0770456789,Lina Mansouri,1P06";
      }
      applyParsed(parseSheetText(paste.value), t("waBulkSampleLoaded"));
    });

    root.querySelectorAll("[data-wa-to-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = Number(btn.getAttribute("data-wa-to-step"));
        if (n >= 2 && !state.rows.length) {
          setStatus(statusEl, t("waBulkNeedSheet"), "err");
          return;
        }
        if (n >= 3) {
          const tpl = root.querySelector("[data-wa-template]")?.value?.trim();
          if (!tpl) {
            alert(t("waBulkNeedTemplate"));
            return;
          }
        }
        goStep(n);
      });
    });
    root.querySelectorAll("[data-wa-step-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = Number(btn.getAttribute("data-wa-step-btn"));
        if (n > 1 && !state.rows.length) return;
        goStep(n);
      });
    });

    root.querySelector("[data-wa-tokens]")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-wa-insert]");
      if (!btn) return;
      const ta = root.querySelector("[data-wa-template]");
      if (!ta) return;
      const token = btn.getAttribute("data-wa-insert");
      const start = ta.selectionStart || ta.value.length;
      const end = ta.selectionEnd || ta.value.length;
      ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + token.length;
      updateLivePreview();
    });

    root.querySelector("[data-wa-template]")?.addEventListener("input", updateLivePreview);

    root.querySelectorAll("[data-wa-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.getAttribute("data-wa-preset");
        const nameTok = state.headers[1] ? `{{${state.headers[1]}}}` : "{{name}}";
        const classTok = state.headers[2] ? `{{${state.headers[2]}}}` : "{{class}}";
        const ta = root.querySelector("[data-wa-template]");
        if (!ta) return;
        if (kind === "welcome") {
          ta.value = `السلام عليكم ${nameTok} 👋\n\nمرحبا بكم في Quality Education Algerie.\nالقسم: ${classTok}\n\nلأي استفسار نحن في خدمتكم.`;
        } else if (kind === "reminder") {
          ta.value = `تذكير لأولياء أمور ${nameTok}\n\nيرجى عدم نسيان المستندات المطلوبة غدا.\nالقسم: ${classTok}`;
        } else if (kind === "meeting") {
          ta.value = `دعوة اجتماع — ${nameTok}\n\nنرجو حضوركم إلى اجتماع الأولياء الخاص بالقسم ${classTok}.\nالتفاصيل لاحقا عبر الإدارة.`;
        }
        updateLivePreview();
      });
    });

    root.querySelector("[data-wa-prev-row]")?.addEventListener("click", () => {
      if (!state.rows.length) return;
      state.previewIdx = (state.previewIdx - 1 + state.rows.length) % state.rows.length;
      updateLivePreview();
    });
    root.querySelector("[data-wa-next-row]")?.addEventListener("click", () => {
      if (!state.rows.length) return;
      state.previewIdx = (state.previewIdx + 1) % state.rows.length;
      updateLivePreview();
    });

    root.querySelector("[data-wa-min-sec]")?.addEventListener("input", updateSummary);
    root.querySelector("[data-wa-max-sec]")?.addEventListener("input", updateSummary);

    root.querySelectorAll("[data-wa-sched-mode]").forEach((r) => {
      r.addEventListener("change", () => {
        const later = root.querySelector('input[name="wa-sched-mode"]:checked')?.value === "later";
        const fields = root.querySelector("[data-wa-sched-fields]");
        if (fields) fields.hidden = !later;
        updateSummary();
      });
    });
    root.querySelectorAll("[data-wa-delay]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mins = Number(btn.getAttribute("data-wa-delay") || 0);
        const input = root.querySelector("[data-wa-sched-at]");
        if (!input) return;
        const d = new Date(Date.now() + mins * 60 * 1000);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        input.value = local;
        const later = root.querySelector('input[name="wa-sched-mode"][value="later"]');
        if (later) {
          later.checked = true;
          later.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    });

    root.querySelector("[data-wa-test-send]")?.addEventListener("click", async () => {
      const phone = root.querySelector("[data-wa-test-phone]")?.value?.trim();
      const tpl = root.querySelector("[data-wa-template]")?.value || "";
      const text = renderTemplate(tpl, currentVars());
      const st = root.querySelector("[data-wa-test-status]");
      if (!phone || !text) {
        setStatus(st, t("waBulkTestNeed"), "err");
        return;
      }
      setStatus(st, t("waBulkTesting"), "");
      try {
        await BBC_API.post("/wa/campaigns/test-send", { phone, text });
        setStatus(st, t("waBulkTestOk"), "ok");
      } catch (err) {
        setStatus(st, err.message || t("waBulkTestFail"), "err");
      }
    });

    root.querySelector("[data-wa-launch]")?.addEventListener("click", async () => {
      const launchStatus = root.querySelector("[data-wa-launch-status]");
      const tpl = root.querySelector("[data-wa-template]")?.value?.trim();
      if (!state.rows.length || !tpl) {
        setStatus(launchStatus, t("waBulkNeedTemplate"), "err");
        return;
      }
      const phoneKey = state.headers[0];
      const recipients = state.rows.map((row) => {
        const variables = { ...row };
        variables.phone = row[phoneKey] || row.phone || "";
        state.headers.forEach((h, i) => {
          variables[String(i + 1)] = row[h] || "";
        });
        return {
          phone: variables.phone,
          variables,
        };
      });

      let minSec = Number(root.querySelector("[data-wa-min-sec]")?.value || 8);
      let maxSec = Number(root.querySelector("[data-wa-max-sec]")?.value || 14);
      if (maxSec < minSec) [minSec, maxSec] = [maxSec, minSec];

      const later = root.querySelector('input[name="wa-sched-mode"]:checked')?.value === "later";
      const payload = {
        name:
          root.querySelector("[data-wa-name]")?.value?.trim() ||
          `Campaign ${new Date().toLocaleString()}`,
        template: tpl,
        columns: state.headers,
        recipients,
        intervalMinMs: minSec * 1000,
        intervalMaxMs: maxSec * 1000,
        sendNow: !later,
        shuffle: !!root.querySelector("[data-wa-shuffle]")?.checked,
        maxConsecutiveFails: Number(root.querySelector("[data-wa-max-fails]")?.value || 0),
      };
      if (later) {
        const at = root.querySelector("[data-wa-sched-at]")?.value;
        if (!at) {
          setStatus(launchStatus, t("waBulkNeedSchedule"), "err");
          return;
        }
        payload.scheduleAt = new Date(at).toISOString();
      }

      const btn = root.querySelector("[data-wa-launch]");
      if (btn) btn.disabled = true;
      setStatus(launchStatus, t("waBulkLaunching"), "");
      try {
        const res = await BBC_API.post("/wa/campaigns", payload);
        setStatus(launchStatus, t("waBulkLaunchOk"), "ok");
        const id = res.campaign?.id;
        if (id) go(`/whatsapp/bulk/${id}`);
        else go("/whatsapp/bulk");
      } catch (err) {
        setStatus(launchStatus, err.message || t("waBulkLaunchFail"), "err");
        if (btn) btn.disabled = false;
      }
    });
  }

  async function loadDetail(root) {
    const host = root.querySelector("[data-wa-detail]");
    const id = host?.getAttribute("data-campaign-id");
    if (!host || !id) return;
    try {
      const data = await BBC_API.get(`/wa/campaigns/${id}`);
      const c = data.campaign;
      const recipients = data.recipients || [];
      host._lastCampaign = { campaign: c, recipients };
      const pct = c.total ? Math.round((c.sent / c.total) * 100) : 0;

      const pauseBtn = root.querySelector("[data-wa-detail-pause]");
      const resumeBtn = root.querySelector("[data-wa-detail-resume]");
      const cancelBtn = root.querySelector("[data-wa-detail-cancel]");
      if (pauseBtn)
        pauseBtn.hidden = !["queued", "sending", "scheduled"].includes(c.status);
      if (resumeBtn) resumeBtn.hidden = c.status !== "paused";
      if (cancelBtn)
        cancelBtn.hidden = !["queued", "sending", "scheduled", "paused", "draft"].includes(
          c.status
        );

      host.innerHTML = `
        <div class="wa-detail-head">
          <div>
            <h2 dir="auto">${esc(c.name)}</h2>
            <span class="ann-status-pill ${statusClass(c.status)}">${esc(c.status)}</span>
          </div>
          <div class="wa-detail-stats">
            <div><strong>${c.sent}</strong><span>${esc(t("waBulkSent"))}</span></div>
            <div><strong>${c.failed}</strong><span>${esc(t("waBulkFailed"))}</span></div>
            <div><strong>${c.pending}</strong><span>${esc(t("waBulkPending"))}</span></div>
            <div><strong>${c.total}</strong><span>${esc(t("waBulkRecipients"))}</span></div>
          </div>
        </div>
        <div class="wa-bulk-progress wa-bulk-progress-lg"><i style="width:${pct}%"></i></div>
        <dl class="wa-summary">
          <div><dt>${esc(t("waBulkIntervalMin"))}</dt><dd>${Math.round(c.intervalMinMs / 1000)}s – ${Math.round(c.intervalMaxMs / 1000)}s</dd></div>
          <div><dt>${esc(t("annCreatedAt"))}</dt><dd>${esc(formatTime(c.createdAt))}</dd></div>
          ${c.scheduledAt ? `<div><dt>${esc(t("scheduledFor"))}</dt><dd>${esc(formatTime(c.scheduledAt))}</dd></div>` : ""}
          ${c.nextSendAt && ["sending", "queued"].includes(c.status) ? `<div><dt>${esc(t("waBulkNextSend"))}</dt><dd>${esc(formatTime(c.nextSendAt))}</dd></div>` : ""}
          ${c.finishedAt ? `<div><dt>${esc(t("waBulkFinished"))}</dt><dd>${esc(formatTime(c.finishedAt))}</dd></div>` : ""}
        </dl>
        <details class="wa-template-details" open>
          <summary>${esc(t("waBulkTemplateLabel"))}</summary>
          <pre class="ann-detail-text" dir="auto">${esc(c.template)}</pre>
        </details>
        <div class="wa-recip-table-wrap">
          <table class="wa-sheet wa-recip-table">
            <thead>
              <tr>
                <th>#</th>
                <th>${esc(t("phone"))}</th>
                <th>${esc(t("announcementStatus"))}</th>
                <th>${esc(t("waBulkMessage"))}</th>
              </tr>
            </thead>
            <tbody>
              ${recipients
                .map(
                  (r, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td dir="ltr">${esc(r.phone)}</td>
                  <td><span class="ann-status-pill ${statusClass(r.status)}">${esc(r.status)}${r.error ? ` — ${esc(r.error)}` : ""}</span></td>
                  <td dir="auto" class="wa-msg-cell">${esc(r.renderedText)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      host.innerHTML = `<div class="admin-empty err">${esc(err.message || "Failed")}</div>`;
    }
  }

  function bindDetail(root) {
    const host = root.querySelector("[data-wa-detail]");
    const id = host?.getAttribute("data-campaign-id");
    loadDetail(root);

    let timer = setInterval(() => {
      if (!document.body.contains(host)) {
        clearInterval(timer);
        return;
      }
      loadDetail(root);
    }, 3000);

    root.querySelector("[data-wa-detail-refresh]")?.addEventListener("click", () => loadDetail(root));
    root.querySelector("[data-wa-detail-export]")?.addEventListener("click", () => {
      const snap = host?._lastCampaign;
      if (!snap?.recipients?.length) return;
      const lines = [["phone", "status", "error", "message", "sent_at"].join(",")];
      snap.recipients.forEach((r) => {
        const cells = [r.phone, r.status, r.error || "", r.renderedText || "", r.sentAt || ""].map(
          (v) => `"${String(v).replace(/"/g, '""')}"`
        );
        lines.push(cells.join(","));
      });
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `campaign-${id}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    root.querySelector("[data-wa-detail-pause]")?.addEventListener("click", async () => {
      try {
        await BBC_API.post(`/wa/campaigns/${id}/pause`, {});
        loadDetail(root);
      } catch (err) {
        alert(err.message || "Pause failed");
      }
    });
    root.querySelector("[data-wa-detail-resume]")?.addEventListener("click", async () => {
      try {
        await BBC_API.post(`/wa/campaigns/${id}/resume`, {});
        loadDetail(root);
      } catch (err) {
        alert(err.message || "Resume failed");
      }
    });
    root.querySelector("[data-wa-detail-cancel]")?.addEventListener("click", async () => {
      if (!confirm(t("waBulkCancelConfirm"))) return;
      try {
        await BBC_API.post(`/wa/campaigns/${id}/cancel`, {});
        loadDetail(root);
      } catch (err) {
        alert(err.message || "Cancel failed");
      }
    });

    return () => clearInterval(timer);
  }

  return {
    viewList,
    viewStudio,
    viewDetail,
    bindList,
    bindStudio,
    bindDetail,
  };
})();

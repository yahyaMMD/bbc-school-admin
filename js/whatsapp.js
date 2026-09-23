/**
 * WhatsApp portal — connect account first (mandatory), then automation options.
 * Session persists via bridge LocalAuth (Docker volume bbc_wa_auth).
 */
const WhatsAppApp = (() => {
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function layout(active, title, lede, body) {
    const nav = [
      { id: "connect", href: "#/whatsapp", label: I18n.t("waConnectNav"), icon: "◎" },
      { id: "hub", href: "#/whatsapp/hub", label: I18n.t("waAutomations"), icon: "◆" },
      { id: "announcements", href: "#/whatsapp/announcements", label: I18n.t("announcements"), icon: "✦" },
    ];
    return `
      <div class="admin-shell wa-shell" data-wa-shell>
        <aside class="admin-nav">
          <div class="admin-nav-brand">
            <span class="admin-nav-mark">WA</span>
            <span>${esc(I18n.t("whatsappConsole"))}</span>
          </div>
          <nav class="admin-nav-links" data-wa-nav>
            ${nav
              .map(
                (n) =>
                  `<button type="button" class="admin-nav-link${active === n.id ? " active" : ""}" data-nav="${esc(n.href)}" data-wa-nav-item="${esc(n.id)}"><span class="admin-nav-ico" aria-hidden="true">${n.icon}</span>${esc(n.label)}</button>`
              )
              .join("")}
          </nav>
          <div class="wa-nav-status" data-wa-nav-status></div>
        </aside>
        <div class="admin-main">
          <div class="page-header admin-page-header">
            <h1>${esc(title)}</h1>
            ${lede ? `<p class="lede">${lede}</p>` : ""}
          </div>
          ${body}
        </div>
      </div>
    `;
  }

  function formatAnnouncementTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return String(iso);
    }
  }

  function announcementStatusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "sent") return "ok";
    if (s === "partial" || s === "scheduled" || s === "sending") return "warn";
    if (s === "failed" || s === "cancelled") return "err";
    return "";
  }

  function ensureAnnDetailModal() {
    let overlay = document.getElementById("ann-detail-modal");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "ann-detail-modal";
    overlay.className = "ann-detail-modal";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="ann-detail-card" role="dialog" aria-modal="true" aria-labelledby="ann-detail-title">
        <button type="button" class="ann-detail-close" data-ann-detail-close aria-label="${esc(I18n.t("close"))}">×</button>
        <h2 id="ann-detail-title" class="ann-detail-title">${esc(I18n.t("annDetails"))}</h2>
        <div class="ann-detail-body" data-ann-detail-body></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-ann-detail-close]")) {
        overlay.hidden = true;
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) overlay.hidden = true;
    });
    return overlay;
  }

  function openAnnDetail(a) {
    const overlay = ensureAnnDetailModal();
    const body = overlay.querySelector("[data-ann-detail-body]");
    const names = (a.groupNames || []).filter(Boolean);
    const ids = a.groupIds || [];
    const groupLines = names.length
      ? names
          .map(
            (n, i) =>
              `<li><strong dir="auto">${esc(n)}</strong>${
                ids[i] ? `<span class="muted"> · ${esc(ids[i])}</span>` : ""
              }</li>`
          )
          .join("")
      : ids.length
        ? ids.map((id) => `<li><code>${esc(id)}</code></li>`).join("")
        : `<li>—</li>`;

    const results = Array.isArray(a.sendResults) ? a.sendResults : [];
    const resultRows = results.length
      ? results
          .map((r) => {
            const idx = (a.groupIds || []).indexOf(r.groupId);
            const label = (a.groupNames || [])[idx] || r.groupId || "—";
            const ok = !!r.ok;
            return `<li>
              <span dir="auto">${esc(label)}</span>
              <span class="ann-status-pill ${ok ? "ok" : "err"}">${esc(
                ok ? I18n.t("annDeliveryOk") : I18n.t("annDeliveryFail")
              )}${r.error ? ` — ${esc(r.error)}` : ""}</span>
            </li>`;
          })
          .join("")
      : "";

    const sentDisplay = a.sentAt
      ? formatAnnouncementTime(a.sentAt)
      : ["sent", "partial", "failed"].includes(String(a.status || "").toLowerCase())
        ? formatAnnouncementTime(a.createdAt)
        : "—";

    body.innerHTML = `
      <div class="ann-detail-grid">
        ${
          a.imagePath
            ? `<button type="button" class="ann-detail-thumb" data-photo-view="${esc(a.imagePath)}" data-photo-label="${esc(I18n.t("annImage"))}">
                <img src="${esc(a.imagePath)}" alt="" />
              </button>`
            : ""
        }
        <dl class="ann-detail-facts">
          <div><dt>${esc(I18n.t("announcementStatus"))}</dt><dd><span class="ann-status-pill ${announcementStatusClass(a.status)}">${esc(a.status || "—")}</span></dd></div>
          <div><dt>${esc(I18n.t("annCreatedAt"))}</dt><dd>${esc(formatAnnouncementTime(a.createdAt))}</dd></div>
          ${
            a.scheduledAt
              ? `<div><dt>${esc(I18n.t("scheduledFor"))}</dt><dd>${esc(formatAnnouncementTime(a.scheduledAt))}</dd></div>`
              : ""
          }
          <div><dt>${esc(I18n.t("annSentAt"))}</dt><dd>${esc(sentDisplay)}</dd></div>
        </dl>
      </div>
      <section class="ann-detail-section">
        <h3>${esc(I18n.t("annGroups"))}</h3>
        <ul class="ann-detail-list">${groupLines}</ul>
      </section>
      ${
        resultRows
          ? `<section class="ann-detail-section">
              <h3>${esc(I18n.t("annSendResults"))}</h3>
              <ul class="ann-detail-list ann-detail-delivery">${resultRows}</ul>
            </section>`
          : ""
      }
      <section class="ann-detail-section">
        <h3>${esc(I18n.t("annMessageText"))}</h3>
        <pre class="ann-detail-text" dir="auto">${esc(a.text || "—")}</pre>
      </section>
    `;
    overlay.hidden = false;
    if (window.QEAPhoto && typeof window.QEAPhoto.bind === "function") {
      window.QEAPhoto.bind(body);
    }
  }

  function viewConnect() {
    return layout(
      "connect",
      I18n.t("whatsappConnection"),
      I18n.t("waConnectLede"),
      `
      <section class="admin-panel wa-connect-panel">
        <div class="admin-panel-head">
          <div class="admin-panel-label">${esc(I18n.t("waConnectTitle"))}</div>
          <div class="wa-connect-head-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-wa-refresh>${esc(I18n.t("waRefresh"))}</button>
            <button type="button" class="btn btn-ghost btn-sm wa-disconnect-btn" data-wa-disconnect hidden>${esc(I18n.t("waDisconnect"))}</button>
          </div>
        </div>
        <p class="admin-field-hint">${esc(I18n.t("waConnectMandatory"))}</p>
        <div class="ann-wa wa-connect-body" data-wa-panel>
          <p class="admin-empty">${esc(I18n.t("waWaiting"))}</p>
        </div>
        <div class="wa-connect-actions" data-wa-connect-actions hidden>
          <button type="button" class="btn btn-primary btn-lg" data-nav="#/whatsapp/hub">${esc(I18n.t("waContinue"))}</button>
        </div>
      </section>
    `
    );
  }

  function viewHub() {
    return layout(
      "hub",
      I18n.t("waAutomations"),
      I18n.t("waAutomationsLede"),
      `
      <div class="admin-action-grid">
        <button type="button" class="admin-action-card" data-nav="#/whatsapp/announcements">
          <span class="admin-action-tag">WhatsApp</span>
          <h3>${esc(I18n.t("announcements"))}</h3>
          <p>${esc(I18n.t("announcementsLede"))}</p>
          <span class="cta">${esc(I18n.t("createAnnouncement"))} →</span>
        </button>
      </div>
      <p class="admin-field-hint" style="margin-top:1.25rem">${esc(I18n.t("waSessionHint"))}</p>
    `
    );
  }

  function viewAnnouncements() {
    return layout(
      "announcements",
      I18n.t("announcements"),
      I18n.t("announcementsLede"),
      `
      <div class="admin-toolbar" style="margin-bottom:1rem">
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/whatsapp/hub">← ${esc(I18n.t("waAutomations"))}</button>
        <button type="button" class="btn btn-primary" data-nav="#/whatsapp/announcements/new">${esc(I18n.t("createAnnouncement"))}</button>
      </div>
      <section class="admin-panel">
        <div class="admin-panel-label">${esc(I18n.t("announcementHistory"))}</div>
        <div class="ann-history" data-ann-history>
          <div class="admin-empty">${esc(I18n.t("loading"))}</div>
        </div>
      </section>
    `
    );
  }

  function viewCreate() {
    return layout(
      "announcements",
      I18n.t("createAnnouncement"),
      I18n.t("announcementsLede"),
      `
      <div class="admin-toolbar" style="margin-bottom:1rem">
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/whatsapp/announcements">← ${esc(I18n.t("announcementHistory"))}</button>
      </div>
      <div class="ann-create" data-ann-create>
        <section class="admin-panel" style="margin-bottom:1rem">
          <div class="admin-panel-label">${esc(I18n.t("announcementText"))}</div>
          <p class="admin-field-hint">${esc(I18n.t("announcementTextHint"))}</p>
          <textarea class="ann-text" data-ann-text rows="5" placeholder="${esc(I18n.t("announcementText"))}"></textarea>
          <div class="ann-actions">
            <button type="button" class="btn btn-primary" data-ann-generate>${esc(I18n.t("generateImage"))}</button>
            <label class="btn btn-ghost ann-upload-label">
              ${esc(I18n.t("uploadImage"))}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden data-ann-file />
            </label>
          </div>
          <p class="ann-status" data-ann-status hidden></p>
          <div class="ann-preview" data-ann-preview hidden>
            <img alt="" data-ann-preview-img />
            <div class="ann-preview-actions">
              <button type="button" class="btn btn-primary" data-ann-validate disabled>${esc(I18n.t("validateImage"))}</button>
              <button type="button" class="btn btn-ghost" data-ann-regen>${esc(I18n.t("regenerateImage"))}</button>
            </div>
            <p class="ann-validate-hint" data-ann-validate-hint hidden>${esc(I18n.t("imageValidated"))}</p>
          </div>
          <input type="hidden" data-ann-image-url value="" />
          <input type="hidden" data-ann-image-validated value="0" />
        </section>

        <section class="admin-panel" style="margin-bottom:1rem">
          <div class="admin-panel-head">
            <div class="admin-panel-label">${esc(I18n.t("selectGroups"))}</div>
            <span class="ann-group-count" data-ann-group-count></span>
          </div>
          <div class="ann-group-toolbar">
            <input type="search" class="ann-group-search" data-ann-group-search placeholder="${esc(I18n.t("searchGroups"))}" />
            <button type="button" class="btn btn-ghost btn-sm" data-ann-select-all>${esc(I18n.t("selectAllGroups"))}</button>
            <button type="button" class="btn btn-ghost btn-sm" data-ann-clear-groups>${esc(I18n.t("clearGroups"))}</button>
            <button type="button" class="btn btn-ghost btn-sm" data-ann-groups-refresh>${esc(I18n.t("waRefresh"))}</button>
          </div>
          <div class="ann-groups" data-ann-groups>
            <div class="admin-empty">${esc(I18n.t("loading"))}</div>
          </div>
        </section>

        <section class="admin-panel" style="margin-bottom:1rem">
          <div class="admin-panel-label">${esc(I18n.t("scheduleTitle"))}</div>
          <p class="admin-field-hint">${esc(I18n.t("scheduleHint"))}</p>
          <div class="ann-schedule" data-ann-schedule>
            <label class="ann-schedule-option">
              <input type="radio" name="ann-schedule-mode" value="now" checked data-ann-sched-mode />
              <span>${esc(I18n.t("sendNow"))}</span>
            </label>
            <label class="ann-schedule-option">
              <input type="radio" name="ann-schedule-mode" value="later" data-ann-sched-mode />
              <span>${esc(I18n.t("scheduleLater"))}</span>
            </label>
            <div class="ann-schedule-fields" data-ann-sched-fields hidden>
              <div class="ann-schedule-presets">
                <button type="button" class="btn btn-ghost btn-sm" data-ann-delay="5">+5 ${esc(I18n.t("minutesShort"))}</button>
                <button type="button" class="btn btn-ghost btn-sm" data-ann-delay="15">+15 ${esc(I18n.t("minutesShort"))}</button>
                <button type="button" class="btn btn-ghost btn-sm" data-ann-delay="30">+30 ${esc(I18n.t("minutesShort"))}</button>
                <button type="button" class="btn btn-ghost btn-sm" data-ann-delay="60">+60 ${esc(I18n.t("minutesShort"))}</button>
              </div>
              <label class="admin-field">
                <span>${esc(I18n.t("scheduleAt"))}</span>
                <input type="datetime-local" data-ann-sched-at />
              </label>
            </div>
          </div>
        </section>

        <div class="ann-send-bar">
          <button type="button" class="btn btn-primary" data-ann-send disabled>${esc(I18n.t("sendAnnouncement"))}</button>
          <p class="admin-field-hint">${esc(I18n.t("sendImageOnlyHint"))}</p>
          <p class="admin-field-hint">${esc(I18n.t("sendRequiresValidate"))}</p>
          <p class="ann-send-result" data-ann-send-result hidden></p>
        </div>
      </div>
    `
    );
  }

  async function fetchStatus() {
    return BBC_API.get("/announcements/wa/status");
  }

  function setNavLocked(root, connected) {
    root.querySelectorAll("[data-wa-nav-item]").forEach((btn) => {
      const id = btn.getAttribute("data-wa-nav-item");
      if (id === "connect") {
        btn.disabled = false;
        btn.classList.remove("is-locked");
        return;
      }
      btn.disabled = !connected;
      btn.classList.toggle("is-locked", !connected);
      if (!connected) {
        btn.title = I18n.t("waConnectMandatory");
      } else {
        btn.removeAttribute("title");
      }
    });
  }

  function setNavStatus(root, st) {
    const el = root.querySelector("[data-wa-nav-status]");
    if (!el) return;
    if (st?.ready) {
      el.innerHTML = `<span class="ann-status-pill ok">${esc(I18n.t("waConnected"))}</span>${
        st.phone ? `<span class="wa-nav-phone">${esc(st.phone)}</span>` : ""
      }`;
    } else {
      el.innerHTML = `<span class="ann-status-pill warn">${esc(I18n.t("waNotConnected"))}</span>`;
    }
  }

  function bindConnectPanel(root) {
    const panel = root.querySelector("[data-wa-panel]");
    const actions = root.querySelector("[data-wa-connect-actions]");
    const disconnectBtn = root.querySelector("[data-wa-disconnect]");
    if (!panel) return () => {};

    let qrObjectUrl = null;
    let pollTimer = null;

    const render = async () => {
      try {
        const st = await fetchStatus();
        if (qrObjectUrl) {
          URL.revokeObjectURL(qrObjectUrl);
          qrObjectUrl = null;
        }
        setNavStatus(root, st);
        setNavLocked(root, Boolean(st.ready));
        if (disconnectBtn) disconnectBtn.hidden = !st.ready;

        if (st.ready) {
          panel.innerHTML = `
            <div class="ann-wa-ready wa-ready-block">
              <span class="ann-status-pill ok">${esc(I18n.t("waConnected"))}</span>
              ${st.phone ? `<p class="ann-wa-phone">${esc(st.phone)}</p>` : ""}
              ${st.pushname ? `<p class="admin-field-hint">${esc(st.pushname)}</p>` : ""}
              <p class="admin-field-hint">${esc(I18n.t("waSessionHint"))}</p>
              <button type="button" class="btn btn-ghost wa-disconnect-btn" data-wa-disconnect-inline>${esc(I18n.t("waDisconnect"))}</button>
            </div>`;
          if (actions) actions.hidden = false;
          panel.querySelector("[data-wa-disconnect-inline]")?.addEventListener("click", () => doDisconnect());
        } else if (st.qrReady) {
          if (actions) actions.hidden = true;
          try {
            qrObjectUrl = await BBC_API.getBlobUrl(`/announcements/wa/qr?t=${Date.now()}`);
            panel.innerHTML = `
              <div class="wa-qr-block">
                <p class="wa-qr-title">${esc(I18n.t("waScanQr"))}</p>
                <img class="ann-qr" src="${qrObjectUrl}" alt="WhatsApp QR" />
              </div>`;
          } catch (err) {
            panel.innerHTML = `<p class="admin-empty">${esc(I18n.t("waWaiting"))} ${esc(err.message || "")}</p>`;
          }
        } else {
          if (actions) actions.hidden = true;
          panel.innerHTML = `<p class="admin-empty">${esc(st.error || st.info || I18n.t("waWaiting"))}</p>`;
        }
      } catch (err) {
        if (actions) actions.hidden = true;
        if (disconnectBtn) disconnectBtn.hidden = true;
        setNavStatus(root, { ready: false });
        setNavLocked(root, false);
        panel.innerHTML = `<p class="admin-empty is-err">${esc(err.message || I18n.t("waWaiting"))}</p>`;
      }
    };

    const doDisconnect = async () => {
      if (!window.confirm(I18n.t("waDisconnectConfirm"))) return;
      const buttons = [
        disconnectBtn,
        ...root.querySelectorAll("[data-wa-disconnect-inline]"),
      ].filter(Boolean);
      buttons.forEach((b) => {
        b.disabled = true;
        b.textContent = I18n.t("waDisconnecting");
      });
      try {
        await BBC_API.post("/announcements/wa/logout", {});
        if (actions) actions.hidden = true;
        if (disconnectBtn) disconnectBtn.hidden = true;
        setNavLocked(root, false);
        setNavStatus(root, { ready: false });
        panel.innerHTML = `<p class="admin-empty">${esc(I18n.t("waDisconnected"))}</p>`;
        await render();
      } catch (err) {
        alert(err.message || I18n.t("waDisconnect"));
        buttons.forEach((b) => {
          b.disabled = false;
          b.textContent = I18n.t("waDisconnect");
        });
      }
    };

    root.querySelector("[data-wa-refresh]")?.addEventListener("click", () => render());
    disconnectBtn?.addEventListener("click", () => doDisconnect());
    render();
    pollTimer = setInterval(render, 3500);

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
    };
  }

  function bindHistory(root) {
    const historyEl = root.querySelector("[data-ann-history]");
    if (!historyEl) return;
    (async () => {
      try {
        const list = await BBC_API.get("/announcements");
        if (!list.length) {
          historyEl.innerHTML = `<div class="admin-empty">${esc(I18n.t("noAnnouncementsYet"))}</div>`;
          return;
        }
        historyEl.innerHTML = list
          .map((a, idx) => {
            const names = (a.groupNames || []).filter(Boolean);
            const groupsLabel = names.length
              ? names.slice(0, 6).map(esc).join(", ") + (names.length > 6 ? ` +${names.length - 6}` : "")
              : (a.groupIds || []).length
                ? `${(a.groupIds || []).length}`
                : "—";
            const when =
              a.status === "scheduled" && a.scheduledAt
                ? `${I18n.t("scheduledFor")}: ${formatAnnouncementTime(a.scheduledAt)}`
                : a.sentAt
                  ? `${I18n.t("annSentAt")}: ${formatAnnouncementTime(a.sentAt)}`
                  : formatAnnouncementTime(a.createdAt);
            const cancelBtn =
              a.status === "scheduled"
                ? `<button type="button" class="btn btn-ghost btn-sm" data-ann-cancel="${esc(a.id)}">${esc(I18n.t("cancelSchedule"))}</button>`
                : "";
            return `
              <article class="ann-card" data-ann-open="${idx}" tabindex="0" role="button" aria-label="${esc(I18n.t("annViewDetails"))}">
                <div class="ann-card-thumb">
                  ${
                    a.imagePath
                      ? `<img src="${esc(a.imagePath)}" alt="" loading="lazy" data-photo-view="${esc(a.imagePath)}" />`
                      : `<span class="ann-card-placeholder">—</span>`
                  }
                </div>
                <div class="ann-card-body">
                  <p class="ann-card-text">${esc(a.text || "—")}</p>
                  <p class="ann-card-meta">${esc(I18n.t("sentTo"))}: ${groupsLabel}</p>
                  <p class="ann-card-meta">${esc(when)}</p>
                  <div class="ann-card-actions">
                    <span class="ann-status-pill ${announcementStatusClass(a.status)}">${esc(a.status || "—")}</span>
                    <button type="button" class="btn btn-ghost btn-sm" data-ann-details="${idx}">${esc(I18n.t("annViewDetails"))}</button>
                    ${cancelBtn}
                  </div>
                </div>
              </article>`;
          })
          .join("");

        const openFromIdx = (raw) => {
          const idx = Number(raw);
          if (!Number.isFinite(idx) || !list[idx]) return;
          openAnnDetail(list[idx]);
        };

        historyEl.querySelectorAll(".ann-card[data-ann-open]").forEach((card) => {
          card.addEventListener("click", (e) => {
            if (e.target.closest("[data-ann-cancel]") || e.target.closest("[data-photo-view]")) return;
            openFromIdx(card.getAttribute("data-ann-open"));
          });
          card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              if (e.target.closest("[data-ann-cancel]")) return;
              e.preventDefault();
              openFromIdx(card.getAttribute("data-ann-open"));
            }
          });
        });

        historyEl.querySelectorAll("[data-ann-details]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            openFromIdx(btn.getAttribute("data-ann-details"));
          });
        });

        historyEl.querySelectorAll("[data-ann-cancel]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute("data-ann-cancel");
            if (!id) return;
            btn.disabled = true;
            try {
              await BBC_API.post(`/announcements/${encodeURIComponent(id)}/cancel`, {});
              bindHistory(root);
            } catch (err) {
              btn.disabled = false;
              alert(err.message || "Cancel failed");
            }
          });
        });
        if (window.QEAPhoto && typeof window.QEAPhoto.bind === "function") {
          window.QEAPhoto.bind(historyEl);
        }
      } catch (err) {
        historyEl.innerHTML = `<div class="admin-empty is-err">${esc(err.message || "Failed to load")}</div>`;
      }
    })();
  }

  function bindCreate(root, go) {
    const createRoot = root.querySelector("[data-ann-create]");
    if (!createRoot) return;

    let groups = [];
    let selected = new Set();

    const textEl = createRoot.querySelector("[data-ann-text]");
    const statusEl = createRoot.querySelector("[data-ann-status]");
    const previewWrap = createRoot.querySelector("[data-ann-preview]");
    const previewImg = createRoot.querySelector("[data-ann-preview-img]");
    const imageUrlEl = createRoot.querySelector("[data-ann-image-url]");
    const validatedEl = createRoot.querySelector("[data-ann-image-validated]");
    const validateBtn = createRoot.querySelector("[data-ann-validate]");
    const validateHint = createRoot.querySelector("[data-ann-validate-hint]");
    const groupsEl = createRoot.querySelector("[data-ann-groups]");
    const groupCountEl = createRoot.querySelector("[data-ann-group-count]");
    const sendBtn = createRoot.querySelector("[data-ann-send]");
    const sendResultEl = createRoot.querySelector("[data-ann-send-result]");
    const searchEl = createRoot.querySelector("[data-ann-group-search]");
    const schedFields = createRoot.querySelector("[data-ann-sched-fields]");
    const schedAtEl = createRoot.querySelector("[data-ann-sched-at]");
    const schedModes = createRoot.querySelectorAll("[data-ann-sched-mode]");

    const toLocalInputValue = (date) => {
      const pad = (n) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    const syncScheduleUi = () => {
      const mode = createRoot.querySelector("[data-ann-sched-mode]:checked")?.value || "now";
      if (schedFields) schedFields.hidden = mode !== "later";
      if (sendBtn) {
        sendBtn.textContent =
          mode === "later" ? I18n.t("scheduleAnnouncement") : I18n.t("sendAnnouncement");
      }
    };

    schedModes.forEach((el) => el.addEventListener("change", syncScheduleUi));
    createRoot.querySelectorAll("[data-ann-delay]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mins = Number(btn.getAttribute("data-ann-delay") || 0);
        const later = createRoot.querySelector('[data-ann-sched-mode][value="later"]');
        if (later) {
          later.checked = true;
          syncScheduleUi();
        }
        if (schedAtEl && mins > 0) {
          schedAtEl.value = toLocalInputValue(new Date(Date.now() + mins * 60_000));
        }
      });
    });
    syncScheduleUi();

    const setStatus = (msg, ok) => {
      if (!statusEl) return;
      statusEl.hidden = !msg;
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("is-ok", Boolean(ok && msg));
      statusEl.classList.toggle("is-err", Boolean(!ok && msg));
    };

    const setValidated = (ok) => {
      if (validatedEl) validatedEl.value = ok ? "1" : "0";
      if (validateHint) validateHint.hidden = !ok;
      if (validateBtn) {
        validateBtn.disabled = !imageUrlEl?.value || ok;
        validateBtn.textContent = ok ? I18n.t("imageValidated") : I18n.t("validateImage");
      }
      updateSendEnabled();
    };

    const setImage = (url, { needsValidation = true } = {}) => {
      if (imageUrlEl) imageUrlEl.value = url || "";
      if (previewWrap && previewImg) {
        if (url) {
          previewWrap.hidden = false;
          previewImg.src = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
        } else {
          previewWrap.hidden = true;
          previewImg.removeAttribute("src");
        }
      }
      setValidated(url ? !needsValidation : false);
      if (url && needsValidation && validateBtn) {
        validateBtn.disabled = false;
        validateBtn.textContent = I18n.t("validateImage");
      }
    };

    const updateSendEnabled = () => {
      const hasImage = Boolean(imageUrlEl?.value);
      const validated = validatedEl?.value === "1";
      const hasGroups = selected.size > 0;
      if (sendBtn) sendBtn.disabled = !(hasImage && validated && hasGroups);
      if (groupCountEl) {
        groupCountEl.textContent = I18n.t("groupsSelected").replace("{n}", String(selected.size));
      }
    };

    const renderGroups = () => {
      const q = (searchEl?.value || "").trim().toLowerCase();
      const filtered = groups.filter((g) => !q || String(g.name || "").toLowerCase().includes(q));
      if (!groups.length) {
        groupsEl.innerHTML = `<div class="admin-empty">${esc(I18n.t("noGroups"))}</div>`;
        updateSendEnabled();
        return;
      }
      if (!filtered.length) {
        groupsEl.innerHTML = `<div class="admin-empty">—</div>`;
        updateSendEnabled();
        return;
      }
      groupsEl.innerHTML = filtered
        .map((g) => {
          const on = selected.has(g.id);
          return `<button type="button" class="ann-group-card${on ? " selected" : ""}" data-group-id="${esc(g.id)}">
            <span class="ann-group-check" aria-hidden="true">${on ? "✓" : ""}</span>
            <span class="ann-group-name">${esc(g.name || g.id)}</span>
          </button>`;
        })
        .join("");
      groupsEl.querySelectorAll("[data-group-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const gid = btn.getAttribute("data-group-id");
          if (selected.has(gid)) selected.delete(gid);
          else selected.add(gid);
          renderGroups();
        });
      });
      updateSendEnabled();
    };

    const loadGroups = async () => {
      groupsEl.innerHTML = `<div class="admin-empty">${esc(I18n.t("loading"))}</div>`;
      try {
        const data = await BBC_API.get("/announcements/wa/groups");
        groups = Array.isArray(data?.groups) ? data.groups : Array.isArray(data) ? data : [];
        if (!groups.length) {
          groupsEl.innerHTML = `<div class="admin-empty">${esc(I18n.t("noGroups"))}</div>`;
          updateSendEnabled();
          return;
        }
        renderGroups();
      } catch (err) {
        groups = [];
        groupsEl.innerHTML = `<div class="admin-empty is-err">${esc(err.message || I18n.t("noGroups"))}</div>`;
        updateSendEnabled();
      }
    };

    createRoot.querySelector("[data-ann-generate]")?.addEventListener("click", async () => {
      const text = (textEl?.value || "").trim();
      if (!text) {
        setStatus("Enter announcement text first", false);
        return;
      }
      setStatus(I18n.t("generatingImage"), true);
      setValidated(false);
      try {
        const res = await BBC_API.post("/announcements/generate-image", { text });
        setImage(res.url, { needsValidation: true });
        setStatus(I18n.t("imageReadyValidate"), true);
      } catch (err) {
        setStatus(err.message || "Generation failed", false);
      }
    });

    createRoot.querySelector("[data-ann-regen]")?.addEventListener("click", () => {
      createRoot.querySelector("[data-ann-generate]")?.click();
    });

    validateBtn?.addEventListener("click", () => {
      if (!imageUrlEl?.value) return;
      setValidated(true);
      setStatus(I18n.t("imageValidated"), true);
    });

    createRoot.querySelector("[data-ann-file]")?.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      setStatus(I18n.t("photoUploading") || "Uploading…", true);
      setValidated(false);
      try {
        const dataUrl = await BBC_API.readFileAsDataUrl(file);
        const res = await BBC_API.post("/announcements/upload-image", { dataUrl });
        setImage(res.url, { needsValidation: true });
        setStatus(I18n.t("imageReadyValidate"), true);
      } catch (err) {
        setStatus(err.message || "Upload failed", false);
      }
      e.target.value = "";
    });

    createRoot.querySelector("[data-ann-groups-refresh]")?.addEventListener("click", () => {
      loadGroups();
    });
    searchEl?.addEventListener("input", () => renderGroups());
    createRoot.querySelector("[data-ann-select-all]")?.addEventListener("click", () => {
      const q = (searchEl?.value || "").trim().toLowerCase();
      groups
        .filter((g) => !q || String(g.name || "").toLowerCase().includes(q))
        .forEach((g) => selected.add(g.id));
      renderGroups();
    });
    createRoot.querySelector("[data-ann-clear-groups]")?.addEventListener("click", () => {
      selected.clear();
      renderGroups();
    });

    sendBtn?.addEventListener("click", async () => {
      const text = (textEl?.value || "").trim();
      const imageUrl = imageUrlEl?.value || "";
      if (validatedEl?.value !== "1") {
        setStatus(I18n.t("sendRequiresValidate"), false);
        return;
      }
      const groupIds = [...selected];
      const groupNames = groupIds.map((id) => groups.find((x) => x.id === id)?.name || id);
      if (!imageUrl || !groupIds.length) return;

      const mode = createRoot.querySelector("[data-ann-sched-mode]:checked")?.value || "now";
      const payload = {
        text,
        imageUrl,
        groupIds,
        groupNames,
      };
      if (mode === "later") {
        const localVal = schedAtEl?.value || "";
        if (!localVal) {
          setStatus(I18n.t("scheduleTimeRequired"), false);
          return;
        }
        const when = new Date(localVal);
        if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() + 20_000) {
          setStatus(I18n.t("scheduleTimeInvalid"), false);
          return;
        }
        payload.scheduleAt = when.toISOString();
      }

      sendBtn.disabled = true;
      sendBtn.textContent =
        mode === "later" ? I18n.t("schedulingAnnouncement") : I18n.t("sendingAnnouncement");
      if (sendResultEl) {
        sendResultEl.hidden = false;
        sendResultEl.textContent =
          mode === "later" ? I18n.t("schedulingAnnouncement") : I18n.t("sendingAnnouncement");
        sendResultEl.classList.remove("is-err", "is-ok");
      }
      try {
        const res = await BBC_API.post("/announcements/send", payload);
        if (sendResultEl) {
          if (res.scheduled) {
            sendResultEl.textContent = I18n.t("scheduledOk").replace(
              "{time}",
              formatAnnouncementTime(res.announcement?.scheduledAt)
            );
            sendResultEl.classList.add("is-ok");
          } else {
            const sent = res.send?.sent ?? 0;
            const failed = res.send?.failed ?? 0;
            sendResultEl.textContent = `Sent ${sent}, failed ${failed}`;
            sendResultEl.classList.toggle("is-ok", failed === 0);
            sendResultEl.classList.toggle("is-err", failed > 0 && sent === 0);
          }
        }
        setTimeout(() => go("/whatsapp/announcements"), 1200);
      } catch (err) {
        if (sendResultEl) {
          sendResultEl.textContent = err.message || "Send failed";
          sendResultEl.classList.add("is-err");
        }
        updateSendEnabled();
        syncScheduleUi();
      }
    });

    loadGroups();
  }

  function bind(root, go) {
    if (typeof root._annCleanup === "function") {
      try {
        root._annCleanup();
      } catch {
        /* ignore */
      }
      root._annCleanup = null;
    }

    if (!root.querySelector("[data-wa-shell]")) return;

    const hash = (location.hash || "#/whatsapp").replace(/^#/, "") || "/whatsapp";
    const parts = hash.split("/").filter(Boolean);
    const section = parts[1] || "";
    const action = parts[2] || "";
    const needsSession = section === "hub" || section === "announcements";

    // Lock automation nav until connected; block deep links without session
    (async () => {
      let st = { ready: false };
      try {
        st = await fetchStatus();
      } catch {
        st = { ready: false };
      }
      setNavStatus(root, st);
      setNavLocked(root, Boolean(st.ready));

      if (needsSession && !st.ready) {
        go("/whatsapp");
        return;
      }

      if (!section || section === "connect") {
        root._annCleanup = bindConnectPanel(root);
        return;
      }

      if (section === "hub") return;
      if (section === "announcements" && action === "new") {
        bindCreate(root, go);
        return;
      }
      if (section === "announcements") bindHistory(root);
    })();

    // Intercept locked nav clicks
    root.querySelectorAll("[data-wa-nav-item]").forEach((btn) => {
      btn.addEventListener(
        "click",
        (e) => {
          if (btn.disabled || btn.classList.contains("is-locked")) {
            e.preventDefault();
            e.stopPropagation();
            go("/whatsapp");
          }
        },
        true
      );
    });
  }

  function resolve(parts) {
    if (!parts.length || parts[0] !== "whatsapp") return null;
    const section = parts[1] || "";
    const action = parts[2] || "";
    if (!section || section === "connect") return viewConnect();
    if (section === "hub") return viewHub();
    if (section === "announcements" && action === "new") return viewCreate();
    if (section === "announcements") return viewAnnouncements();
    return viewConnect();
  }

  return { resolve, bind };
})();

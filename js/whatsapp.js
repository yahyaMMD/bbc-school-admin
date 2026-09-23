/**
 * WhatsApp / Announcements portal — third interface (own password & role).
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
      { id: "home", href: "#/whatsapp", label: I18n.t("announcementHistory"), icon: "◆" },
      { id: "new", href: "#/whatsapp/new", label: I18n.t("createAnnouncement"), icon: "✦" },
    ];
    return `
      <div class="admin-shell wa-shell">
        <aside class="admin-nav">
          <div class="admin-nav-brand">
            <span class="admin-nav-mark">WA</span>
            <span>${esc(I18n.t("whatsappConsole"))}</span>
          </div>
          <nav class="admin-nav-links">
            ${nav
              .map(
                (n) =>
                  `<button type="button" class="admin-nav-link${active === n.id ? " active" : ""}" data-nav="${esc(n.href)}"><span class="admin-nav-ico" aria-hidden="true">${n.icon}</span>${esc(n.label)}</button>`
              )
              .join("")}
          </nav>
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
    if (status === "sent") return "ok";
    if (status === "partial") return "warn";
    if (status === "failed") return "err";
    return "";
  }

  function viewHome() {
    return layout(
      "home",
      I18n.t("announcements"),
      I18n.t("announcementsLede"),
      `
      <div class="admin-action-grid" style="margin-bottom:1.25rem">
        <button type="button" class="admin-action-card" data-nav="#/whatsapp/new">
          <span class="admin-action-tag">WhatsApp</span>
          <h3>${esc(I18n.t("announcements"))}</h3>
          <p>${esc(I18n.t("announcementsLede"))}</p>
          <span class="cta">${esc(I18n.t("createAnnouncement"))} →</span>
        </button>
      </div>
      <div class="admin-toolbar" style="margin-bottom:1rem">
        <button type="button" class="btn btn-primary" data-nav="#/whatsapp/new">${esc(I18n.t("createAnnouncement"))}</button>
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
      "new",
      I18n.t("createAnnouncement"),
      I18n.t("announcementsLede"),
      `
      <div class="admin-toolbar" style="margin-bottom:1rem">
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/whatsapp">← ${esc(I18n.t("announcementHistory"))}</button>
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
          </div>
          <input type="hidden" data-ann-image-url value="" />
        </section>

        <section class="admin-panel" style="margin-bottom:1rem">
          <div class="admin-panel-head">
            <div class="admin-panel-label">${esc(I18n.t("whatsappConnection"))}</div>
            <button type="button" class="btn btn-ghost btn-sm" data-ann-wa-refresh>${esc(I18n.t("waRefresh"))}</button>
          </div>
          <div class="ann-wa" data-ann-wa>
            <p class="admin-empty">${esc(I18n.t("waWaiting"))}</p>
          </div>
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
          </div>
          <div class="ann-groups" data-ann-groups>
            <div class="admin-empty">${esc(I18n.t("waWaiting"))}</div>
          </div>
        </section>

        <div class="ann-send-bar">
          <button type="button" class="btn btn-primary" data-ann-send disabled>${esc(I18n.t("sendAnnouncement"))}</button>
          <p class="ann-send-result" data-ann-send-result hidden></p>
        </div>
      </div>
    `
    );
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

    const historyEl = root.querySelector("[data-ann-history]");
    if (historyEl) {
      (async () => {
        try {
          const list = await BBC_API.get("/announcements");
          if (!list.length) {
            historyEl.innerHTML = `<div class="admin-empty">${esc(I18n.t("noAnnouncementsYet"))}</div>`;
            return;
          }
          historyEl.innerHTML = list
            .map((a) => {
              const names = (a.groupNames || []).filter(Boolean);
              const groupsLabel = names.length
                ? names.slice(0, 6).map(esc).join(", ") + (names.length > 6 ? ` +${names.length - 6}` : "")
                : (a.groupIds || []).length
                  ? `${(a.groupIds || []).length} groups`
                  : "—";
              return `
                <article class="ann-card">
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
                    <p class="ann-card-meta">${esc(formatAnnouncementTime(a.createdAt))}</p>
                    <span class="ann-status-pill ${announcementStatusClass(a.status)}">${esc(a.status || "—")}</span>
                  </div>
                </article>`;
            })
            .join("");
          if (window.QEAPhoto && typeof window.QEAPhoto.bind === "function") {
            window.QEAPhoto.bind(historyEl);
          }
        } catch (err) {
          historyEl.innerHTML = `<div class="admin-empty is-err">${esc(err.message || "Failed to load")}</div>`;
        }
      })();
    }

    const createRoot = root.querySelector("[data-ann-create]");
    if (!createRoot) return;

    let groups = [];
    let selected = new Set();
    let qrObjectUrl = null;
    let pollTimer = null;

    const textEl = createRoot.querySelector("[data-ann-text]");
    const statusEl = createRoot.querySelector("[data-ann-status]");
    const previewWrap = createRoot.querySelector("[data-ann-preview]");
    const previewImg = createRoot.querySelector("[data-ann-preview-img]");
    const imageUrlEl = createRoot.querySelector("[data-ann-image-url]");
    const waEl = createRoot.querySelector("[data-ann-wa]");
    const groupsEl = createRoot.querySelector("[data-ann-groups]");
    const groupCountEl = createRoot.querySelector("[data-ann-group-count]");
    const sendBtn = createRoot.querySelector("[data-ann-send]");
    const sendResultEl = createRoot.querySelector("[data-ann-send-result]");
    const searchEl = createRoot.querySelector("[data-ann-group-search]");

    const setStatus = (msg, ok) => {
      if (!statusEl) return;
      statusEl.hidden = !msg;
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("is-ok", Boolean(ok && msg));
      statusEl.classList.toggle("is-err", Boolean(!ok && msg));
    };

    const setImage = (url) => {
      if (imageUrlEl) imageUrlEl.value = url || "";
      if (previewWrap && previewImg) {
        if (url) {
          previewWrap.hidden = false;
          previewImg.src = url;
        } else {
          previewWrap.hidden = true;
          previewImg.removeAttribute("src");
        }
      }
      updateSendEnabled();
    };

    const updateSendEnabled = () => {
      const hasImage = Boolean(imageUrlEl?.value);
      const hasGroups = selected.size > 0;
      if (sendBtn) sendBtn.disabled = !(hasImage && hasGroups);
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
          return `<button type="button" class="ann-group-card${on ? " selected" : ""}" data-group-id="${esc(g.id)}" data-group-name="${esc(g.name || "")}">
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
      try {
        const data = await BBC_API.get("/announcements/wa/groups");
        groups = Array.isArray(data?.groups) ? data.groups : Array.isArray(data) ? data : [];
        renderGroups();
      } catch (err) {
        groups = [];
        groupsEl.innerHTML = `<div class="admin-empty is-err">${esc(err.message || I18n.t("noGroups"))}</div>`;
        updateSendEnabled();
      }
    };

    const renderWa = async () => {
      try {
        const st = await BBC_API.get("/announcements/wa/status");
        if (qrObjectUrl) {
          URL.revokeObjectURL(qrObjectUrl);
          qrObjectUrl = null;
        }
        if (st.ready) {
          waEl.innerHTML = `
            <div class="ann-wa-ready">
              <span class="ann-status-pill ok">${esc(I18n.t("waConnected"))}</span>
              ${st.phone ? `<p class="ann-wa-phone">${esc(st.phone)}</p>` : ""}
            </div>`;
          await loadGroups();
        } else if (st.qrReady) {
          try {
            qrObjectUrl = await BBC_API.getBlobUrl(`/announcements/wa/qr?t=${Date.now()}`);
            waEl.innerHTML = `
              <p class="admin-field-hint">${esc(I18n.t("waScanQr"))}</p>
              <img class="ann-qr" src="${qrObjectUrl}" alt="WhatsApp QR" />`;
          } catch (err) {
            waEl.innerHTML = `<p class="admin-empty">${esc(I18n.t("waWaiting"))} ${esc(err.message || "")}</p>`;
          }
        } else {
          waEl.innerHTML = `<p class="admin-empty">${esc(st.error || I18n.t("waWaiting"))}</p>`;
        }
      } catch (err) {
        waEl.innerHTML = `<p class="admin-empty is-err">${esc(err.message || I18n.t("waWaiting"))}</p>`;
      }
    };

    createRoot.querySelector("[data-ann-generate]")?.addEventListener("click", async () => {
      const text = (textEl?.value || "").trim();
      if (!text) {
        setStatus("Enter announcement text first", false);
        return;
      }
      setStatus(I18n.t("generatingImage"), true);
      try {
        const res = await BBC_API.post("/announcements/generate-image", { text });
        setImage(res.url);
        setStatus("Image ready", true);
      } catch (err) {
        setStatus(err.message || "Generation failed", false);
      }
    });

    createRoot.querySelector("[data-ann-file]")?.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      setStatus(I18n.t("photoUploading") || "Uploading…", true);
      try {
        const dataUrl = await BBC_API.readFileAsDataUrl(file);
        const res = await BBC_API.post("/announcements/upload-image", { dataUrl });
        setImage(res.url);
        setStatus("Image ready", true);
      } catch (err) {
        setStatus(err.message || "Upload failed", false);
      }
      e.target.value = "";
    });

    createRoot.querySelector("[data-ann-wa-refresh]")?.addEventListener("click", () => {
      renderWa();
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
      const groupIds = [...selected];
      const groupNames = groupIds.map((id) => {
        const g = groups.find((x) => x.id === id);
        return g?.name || id;
      });
      if (!imageUrl || !groupIds.length) return;
      sendBtn.disabled = true;
      sendBtn.textContent = I18n.t("sendingAnnouncement");
      if (sendResultEl) {
        sendResultEl.hidden = false;
        sendResultEl.textContent = I18n.t("sendingAnnouncement");
        sendResultEl.classList.remove("is-err", "is-ok");
      }
      try {
        const res = await BBC_API.post("/announcements/send", {
          text,
          imageUrl,
          groupIds,
          groupNames,
          caption: text,
        });
        const sent = res.send?.sent ?? 0;
        const failed = res.send?.failed ?? 0;
        if (sendResultEl) {
          sendResultEl.textContent = `Sent ${sent}, failed ${failed}`;
          sendResultEl.classList.toggle("is-ok", failed === 0);
          sendResultEl.classList.toggle("is-err", failed > 0 && sent === 0);
        }
        setTimeout(() => go("/whatsapp"), 1200);
      } catch (err) {
        if (sendResultEl) {
          sendResultEl.textContent = err.message || "Send failed";
          sendResultEl.classList.add("is-err");
        }
        updateSendEnabled();
        sendBtn.textContent = I18n.t("sendAnnouncement");
      }
    });

    renderWa();
    pollTimer = setInterval(renderWa, 4000);
    root._annCleanup = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
    };
  }

  function resolve(parts) {
    if (!parts.length || parts[0] !== "whatsapp") return null;
    if (parts[1] === "new") return viewCreate();
    return viewHome();
  }

  return { resolve, bind };
})();

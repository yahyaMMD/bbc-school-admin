/**
 * Préscolaire Manager console — inbox, CMS, share links.
 */
const PreschoolApp = (() => {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const state = { dash: null, items: [], content: [] };

  function shell(title, body) {
    return `
      <div class="teacher-portal preschool-portal">
        <div class="teacher-portal-head">
          <div>
            <p class="teacher-portal-kicker">${esc(I18n.t("preschoolPortal"))}</p>
            <h1>${esc(title)}</h1>
          </div>
          <nav class="teacher-nav">
            <button type="button" class="teacher-nav-item" data-nav="#/preschool">${esc(I18n.t("preschoolDash"))}</button>
            <button type="button" class="teacher-nav-item" data-nav="#/preschool/inbox">${esc(I18n.t("preschoolInbox"))}</button>
            <button type="button" class="teacher-nav-item" data-nav="#/preschool/content">${esc(I18n.t("preschoolContent"))}</button>
            <button type="button" class="teacher-nav-item" data-nav="#/preschool/links">${esc(I18n.t("preschoolShareLinks"))}</button>
          </nav>
        </div>
        ${body}
      </div>`;
  }

  function typeLabel(t) {
    const map = {
      printing: I18n.t("preschoolFormPrinting"),
      concern: I18n.t("preschoolFormConcern"),
      filming: I18n.t("preschoolFormFilming"),
      followup: I18n.t("preschoolFormFollowup"),
    };
    return map[t] || t;
  }

  function statusLabel(s) {
    return I18n.t("preschoolStatus_" + s) || s;
  }

  function originBase() {
    return location.origin + location.pathname.replace(/\/[^/]*$/, "/");
  }

  async function viewDashboard() {
    const dash = await BBC_API.get("/preschool/dashboard");
    state.dash = dash;
    const by = dash.byType || {};
    const cards = ["printing", "concern", "filming", "followup"]
      .map((t) => {
        const c = by[t] || { new: 0, open: 0, total: 0 };
        return `<div class="fact-card">
          <div class="k">${esc(typeLabel(t))}</div>
          <div class="v">${c.new || 0} ${esc(I18n.t("preschoolNew"))}</div>
          <div class="muted">${c.open || 0} open · ${c.total || 0} total</div>
        </div>`;
      })
      .join("");
    const recent = (dash.recent || [])
      .map(
        (it) => `<button type="button" class="floor-report-inbox-card" data-nav="#/preschool/inbox/${esc(it.id)}" style="text-align:start;width:100%">
          <div class="floor-report-inbox-head">
            <strong>${esc(typeLabel(it.formType))}</strong>
            <span class="floor-report-status ${it.unread ? "is-draft" : "is-sent"}">${esc(statusLabel(it.status))}</span>
          </div>
          <div class="muted">${esc(it.teacherName || "—")} · ${esc(it.classCode || "")}</div>
        </button>`
      )
      .join("");
    return shell(
      I18n.t("preschoolDash"),
      `
      <p class="lede">${esc(I18n.t("preschoolDashLede"))}</p>
      <div class="facts-grid" style="margin:1rem 0">${cards}
        <div class="fact-card"><div class="k">${esc(I18n.t("preschoolUnread"))}</div><div class="v">${dash.unread || 0}</div></div>
      </div>
      <section class="admin-panel">
        <div class="admin-panel-label">${esc(I18n.t("preschoolRecent"))}</div>
        <div class="floor-report-inbox-grid" style="margin-top:0.75rem">${recent || `<p class="muted">${esc(I18n.t("preschoolEmptyInbox"))}</p>`}</div>
      </section>`
    );
  }

  async function viewInbox(id) {
    if (id) return viewSubmission(id);
    const data = await BBC_API.get("/preschool/forms");
    state.items = data.items || [];
    const rows = state.items
      .map(
        (it) => `<tr>
          <td><button type="button" class="link-btn" data-nav="#/preschool/inbox/${esc(it.id)}">${esc(typeLabel(it.formType))}</button></td>
          <td dir="auto">${esc(it.teacherName || "—")}</td>
          <td>${esc(it.classCode || "—")}</td>
          <td>${esc(statusLabel(it.status))}${it.unread ? " · ●" : ""}</td>
          <td class="muted">${esc(formatTime(it.createdAt))}</td>
        </tr>`
      )
      .join("");
    return shell(
      I18n.t("preschoolInbox"),
      `
      <div class="floor-report-table-wrap">
        <table class="floor-report-table">
          <thead><tr>
            <th>${esc(I18n.t("preschoolType"))}</th>
            <th>${esc(I18n.t("preschoolTeacher"))}</th>
            <th>${esc(I18n.t("class"))}</th>
            <th>${esc(I18n.t("status"))}</th>
            <th>${esc(I18n.t("sessionDate"))}</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="5" class="muted">${esc(I18n.t("preschoolEmptyInbox"))}</td></tr>`}</tbody>
        </table>
      </div>`
    );
  }

  function formatTime(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return String(iso);
    }
  }

  function payloadHtml(it) {
    const p = it.payload || {};
    const lines = Object.entries(p)
      .filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => {
        const val = Array.isArray(v) ? v.join(", ") : String(v);
        return `<div class="fact-card"><div class="k">${esc(k)}</div><div class="v" dir="auto">${esc(val)}</div></div>`;
      });
    return `<div class="facts-grid">${lines.join("")}</div>`;
  }

  async function viewSubmission(id) {
    const data = await BBC_API.get(`/preschool/forms/${encodeURIComponent(id)}`);
    const it = data.submission;
    return shell(
      typeLabel(it.formType),
      `
      <p class="muted">${esc(formatTime(it.createdAt))} · ${esc(statusLabel(it.status))}</p>
      ${payloadHtml(it)}
      <form class="admin-panel" id="preschool-status-form" data-id="${esc(it.id)}" style="margin-top:1rem">
        <div class="admin-panel-label">${esc(I18n.t("preschoolUpdateStatus"))}</div>
        <label class="admin-field" style="margin-top:0.5rem">
          <span>${esc(I18n.t("status"))}</span>
          <select name="status">
            ${["new", "seen", "in_progress", "done", "rejected"]
              .map(
                (s) =>
                  `<option value="${s}"${it.status === s ? " selected" : ""}>${esc(statusLabel(s))}</option>`
              )
              .join("")}
          </select>
        </label>
        <label class="admin-field">
          <span>${esc(I18n.t("preschoolManagerNote"))}</span>
          <textarea name="managerNote" rows="3" dir="auto">${esc(it.managerNote || "")}</textarea>
        </label>
        <button type="submit" class="btn btn-primary">${esc(I18n.t("save"))}</button>
        <p class="ann-status" data-status hidden></p>
      </form>
      <p style="margin-top:1rem"><button type="button" class="btn btn-ghost" data-nav="#/preschool/inbox">${esc(I18n.t("preschoolBackInbox"))}</button></p>`
    );
  }

  async function viewContent() {
    const data = await BBC_API.get("/preschool/content/manage");
    state.content = data.items || [];
    const groups = ["announcement", "drama", "curriculum", "contact"];
    const sections = groups
      .map((kind) => {
        const items = state.content.filter((c) => c.kind === kind);
        const rows = items
          .map(
            (c) => `<article class="admin-panel" style="margin-bottom:0.65rem">
              <strong dir="auto">${esc(c.title || c.id)}</strong>
              <div class="muted">${esc(c.audience)} · ${c.published ? "published" : "draft"}</div>
              <p dir="auto" style="white-space:pre-wrap;margin:0.4rem 0 0;font-size:0.9rem">${esc((c.body || "").slice(0, 220))}</p>
              ${c.youtubeUrl ? `<div class="muted">${esc(c.youtubeUrl)}</div>` : ""}
            </article>`
          )
          .join("");
        return `<section style="margin-bottom:1.25rem">
          <h3>${esc(I18n.t("preschoolKind_" + kind))}</h3>
          ${rows || `<p class="muted">—</p>`}
        </section>`;
      })
      .join("");

    return shell(
      I18n.t("preschoolContent"),
      `
      <p class="lede">${esc(I18n.t("preschoolContentLede"))}</p>
      <form class="admin-panel" id="preschool-content-form" style="margin-bottom:1.25rem">
        <div class="admin-panel-label">${esc(I18n.t("preschoolAddContent"))}</div>
        <label class="admin-field"><span>Kind</span>
          <select name="kind">
            <option value="announcement">announcement</option>
            <option value="drama">drama</option>
            <option value="curriculum">curriculum</option>
            <option value="contact">contact</option>
          </select>
        </label>
        <label class="admin-field"><span>Title</span><input name="title" required /></label>
        <label class="admin-field"><span>Body</span><textarea name="body" rows="4"></textarea></label>
        <label class="admin-field"><span>YouTube URL (drama)</span><input name="youtubeUrl" placeholder="https://youtube.com/..." /></label>
        <label class="admin-field"><span>Audience</span>
          <select name="audience">
            <option value="both">both</option>
            <option value="teachers">teachers</option>
            <option value="parents">parents</option>
          </select>
        </label>
        <label class="admin-field" style="flex-direction:row;align-items:center;gap:0.5rem">
          <input type="checkbox" name="published" checked /> <span>Published</span>
        </label>
        <button type="submit" class="btn btn-primary">${esc(I18n.t("save"))}</button>
        <p class="ann-status" data-status hidden></p>
      </form>
      ${sections}`
    );
  }

  function viewLinks() {
    const base = originBase();
    const links = [
      [I18n.t("preschoolTeachersHub"), base + "kids-teachers.html"],
      [I18n.t("preschoolParentsHub"), base + "kids-parents.html"],
      [I18n.t("preschoolFormPrinting"), base + "kids-teachers.html#/forms/printing"],
      [I18n.t("preschoolFormConcern"), base + "kids-teachers.html#/forms/concern"],
      [I18n.t("preschoolFormFilming"), base + "kids-teachers.html#/forms/filming"],
      [I18n.t("preschoolFormFollowup"), base + "kids-teachers.html#/forms/followup"],
    ];
    return shell(
      I18n.t("preschoolShareLinks"),
      `
      <p class="lede">${esc(I18n.t("preschoolShareLinksLede"))}</p>
      <div class="admin-panel">
        ${links
          .map(
            ([label, url]) => `
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin:0.65rem 0;padding:0.55rem 0;border-bottom:1px solid rgba(0,0,0,0.06)">
            <strong style="min-width:10rem">${esc(label)}</strong>
            <code style="flex:1;word-break:break-all;font-size:0.82rem">${esc(url)}</code>
            <button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(url)}">${esc(I18n.t("copy"))}</button>
          </div>`
          )
          .join("")}
      </div>`
    );
  }

  async function render(pathParts) {
    const sub = pathParts[1] || "";
    const id = pathParts[2] || "";
    try {
      if (sub === "inbox") return await viewInbox(id);
      if (sub === "content") return await viewContent();
      if (sub === "links") return viewLinks();
      return await viewDashboard();
    } catch (e) {
      return shell(I18n.t("preschoolPortal"), `<div class="admin-empty is-err">${esc(e.message || I18n.t("failedLoad"))}</div>`);
    }
  }

  function bind(root) {
    root.querySelector("#preschool-status-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const id = form.getAttribute("data-id");
      const statusEl = form.querySelector("[data-status]");
      try {
        await BBC_API.patch(`/preschool/forms/${encodeURIComponent(id)}`, {
          status: form.status.value,
          managerNote: form.managerNote.value,
        });
        statusEl.hidden = false;
        statusEl.textContent = I18n.t("saved");
        statusEl.className = "ann-status is-ok";
        setTimeout(() => go(`/preschool/inbox/${id}`), 400);
      } catch (err) {
        statusEl.hidden = false;
        statusEl.textContent = err.message;
        statusEl.className = "ann-status is-err";
      }
    });

    root.querySelector("#preschool-content-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const statusEl = form.querySelector("[data-status]");
      try {
        await BBC_API.post("/preschool/content", {
          kind: form.kind.value,
          title: form.title.value,
          body: form.body.value,
          youtubeUrl: form.youtubeUrl.value,
          audience: form.audience.value,
          published: form.published.checked,
        });
        statusEl.hidden = false;
        statusEl.textContent = I18n.t("saved");
        statusEl.className = "ann-status is-ok";
        setTimeout(() => go("/preschool/content"), 400);
      } catch (err) {
        statusEl.hidden = false;
        statusEl.textContent = err.message;
        statusEl.className = "ann-status is-err";
      }
    });

    root.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const url = btn.getAttribute("data-copy");
        try {
          await navigator.clipboard.writeText(url);
          btn.textContent = I18n.t("copied") || "Copied";
        } catch {
          prompt("Copy:", url);
        }
      });
    });
  }

  return { render, bind };
})();

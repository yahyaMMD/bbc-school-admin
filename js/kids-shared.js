/**
 * Shared helpers for BBC Kids public hubs.
 */
const KidsShared = (() => {
  const API = "/api";

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
    return data;
  }

  function route() {
    const h = (location.hash || "#/").replace(/^#/, "") || "/";
    const parts = h.split("?")[0].split("/").filter(Boolean);
    return { path: "/" + parts.join("/"), parts, params: new URLSearchParams(h.split("?")[1] || "") };
  }

  function brandBar(hub, active) {
    const isTeachers = hub === "teachers";
    const home = isTeachers ? "kids-teachers.html" : "kids-parents.html";
    const links = isTeachers
      ? [
          ["", "Home"],
          ["forms/printing", "Printing"],
          ["forms/concern", "Concerns"],
          ["forms/filming", "Filming"],
          ["forms/followup", "Follow-up"],
          ["drama", "Drama"],
          ["announcements", "News"],
          ["curriculum", "Curriculum"],
          ["contact", "Contact"],
        ]
      : [
          ["", "Home"],
          ["announcements", "News"],
          ["contact", "Contact"],
        ];
    return `
      <header class="kids-top">
        <a class="kids-brand" href="${home}#/">
          <img src="assets/logo.png?v=70" alt="" width="52" height="52" />
          <div>
            <strong>BBC Kids</strong>
            <span>${isTeachers ? "Teachers · Préscolaire English" : "Parents · Préscolaire"}</span>
          </div>
        </a>
        <nav class="kids-nav" aria-label="Hub">
          ${links
            .map(([p, label]) => {
              const href = `${home}#/${p}`;
              const key = p || "home";
              const on = active === key || (active === "home" && !p);
              return `<a href="${href}" class="${on ? "is-active" : ""}">${esc(label)}</a>`;
            })
            .join("")}
        </nav>
      </header>`;
  }

  function footer(hub) {
    const other =
      hub === "teachers"
        ? `<a href="kids-parents.html#/">Parents hub</a>`
        : `<a href="kids-teachers.html#/">Teachers hub</a>`;
    return `
      <footer class="kids-footer">
        <span>Quality education Algerie (Q.E.A) · Préscolaire</span>
        <span>${other}</span>
      </footer>`;
  }

  function shell(hub, active, body) {
    return `<div class="kids-shell">${brandBar(hub, active)}${body}${footer(hub)}</div>`;
  }

  function renderAnnouncements(items) {
    if (!items?.length) {
      return `<p class="lede">No announcements yet.</p>`;
    }
    return `<div class="kids-ann-list">${items
      .map(
        (a) => `<article class="kids-ann">
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.body)}</p>
      </article>`
      )
      .join("")}</div>`;
  }

  function renderDrama(items) {
    if (!items?.length) return `<p class="lede">No videos yet.</p>`;
    return `<div class="kids-drama-grid">${items
      .map((d) => {
        if (d.youtubeId) {
          return `<div class="kids-drama">
            <iframe src="https://www.youtube.com/embed/${esc(d.youtubeId)}" title="${esc(d.title)}" allowfullscreen loading="lazy"></iframe>
            <div class="cap">${esc(d.title)}</div>
          </div>`;
        }
        return `<div class="kids-drama"><div class="cap pending">${esc(d.title)} — video link coming soon</div></div>`;
      })
      .join("")}</div>`;
  }

  function renderContact(items) {
    const c = items?.[0];
    if (!c) return `<p class="lede">Contact details will appear here.</p>`;
    return `<div class="kids-panel"><h2 style="margin-top:0;font-family:var(--kids-display)">${esc(c.title)}</h2>
      <div class="kids-contact">${esc(c.body)}</div></div>`;
  }

  return {
    esc,
    api,
    route,
    shell,
    renderAnnouncements,
    renderDrama,
    renderContact,
  };
})();

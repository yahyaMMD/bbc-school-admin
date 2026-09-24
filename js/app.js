/**
 * BBC School Administration — SPA
 * Flow: Departments → Years/Levels → Classes → Students / Teachers → Detail
 */

(() => {
  const app = document.getElementById("app");
  if (!app) {
    document.body.innerHTML = "<p style='padding:2rem;font-family:sans-serif'>App root #app missing.</p>";
    return;
  }
  const state = { route: parseHash(), searchQuery: "" };

  const icons = {
    users: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    search: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
    alert: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  const DEPT_SHORT = { primary: "Primary", middle: "Middle School" };

  const LEVEL_FR = {
    "Year 1": "1re année",
    "Year 2": "2e année",
    "Year 3": "3e année",
    "Year 4": "4e année",
    "Year 5": "5e année",
    "1st Year Middle": "1re année moyenne",
    "2nd Year Middle": "2e année moyenne",
    "3rd Year Middle": "3e année moyenne",
    "4th Year Middle": "4e année moyenne",
  };

  function deptShortLabel(deptId) {
    if (deptId === "primary") return I18n.t("primary");
    if (deptId === "middle") return I18n.t("middle");
    return DEPT_SHORT[deptId] || deptId;
  }

  function deptFullLabel(dept) {
    if (!dept) return "—";
    if (dept.id === "primary") return I18n.t("primaryDept");
    if (dept.id === "middle") return I18n.t("middleDept");
    return dept.label || dept.name || "—";
  }

  function levelDisplayName(level) {
    if (!level) return "—";
    const lang = I18n.getLang();
    if (lang === "ar" && level.nameAr) return level.nameAr;
    if (lang === "fr") return LEVEL_FR[level.name] || level.name;
    return level.name;
  }

  function classOrdinal(cls) {
    if (!cls) return null;
    const idMatch = String(cls.id || "").match(/C0*(\d+)\s*$/i);
    if (idMatch) return Number(idMatch[1]);
    const codeMatch = String(cls.code || cls.name || "").match(/(\d+)\s*$/);
    if (codeMatch) return Number(codeMatch[1]);
    return null;
  }

  function classDisplayCode(cls) {
    if (!cls) return "—";
    const n = classOrdinal(cls);
    if (n != null && Number.isFinite(n)) return I18n.t("classN", { n });
    if (I18n.getLang() === "ar" && cls.nameAr) return cls.nameAr;
    return cls.code || cls.name || "—";
  }

  function classDisplayExtra(cls) {
    if (!cls) return "";
    const parts = [];
    if (cls.floor) {
      const floor = String(cls.floor);
      if (I18n.getLang() === "ar" || I18n.getLang() === "fr") {
        parts.push(floor.replace(/^Floor\s*/i, I18n.t("floor") + " "));
      } else {
        parts.push(floor);
      }
    }
    return parts.filter(Boolean).join(" · ");
  }

  function classOptionLabel(opt) {
    if (!opt) return "—";
    const found = BBC_DATA.findClassById(opt.id);
    const cls = found ? found.cls : null;
    const name = cls ? classDisplayCode(cls) : opt.code || opt.id;
    return `${deptShortLabel(opt.departmentId)} · ${name}`;
  }

  function moduleLabel(m) {
    const key = "mod_" + String(m || "").replace(/\s+/g, "_");
    const translated = I18n.t(key);
    return translated === key ? m : translated;
  }

  function genderLabel(g) {
    const s = String(g || "").trim();
    if (!s) return "—";
    if (/^(female|أنثى)$/i.test(s)) return I18n.t("female");
    if (/^(male|ذكر)$/i.test(s)) return I18n.t("male");
    return s;
  }

  function localizedClassPath(found) {
    if (!found) return "—";
    return `${deptFullLabel(found.dept)} · ${levelDisplayName(found.level)} · ${classDisplayCode(found.cls)}`;
  }

  function parseHash() {
    const hash = location.hash || "#/";
    const withoutHash = hash.replace(/^#/, "");
    const [pathPart, queryPart = ""] = withoutHash.split("?");
    const parts = (pathPart || "/").split("/").filter(Boolean);
    const params = new URLSearchParams(queryPart);
    return { parts, path: "/" + parts.join("/"), params };
  }

  function go(path) {
    location.hash = path.startsWith("#") ? path : "#" + path;
  }

  function initials(a, b) {
    const x = (a || "").trim();
    const y = (b || "").trim();
    if (!x && !y) return "?";
    return `${(x[0] || "")}${(y[0] || "")}`.toUpperCase() || "?";
  }

  /** Profile picture: real photo when set, else student/teacher icon placeholder. Click to enlarge. */
  function profileAvatar(person, role, size = "") {
    const photo = String(person?.photo || "").trim();
    const sizeCls = size ? ` ${size}` : "";
    const roleCls = role === "teacher" ? "avatar-teacher" : "avatar-student";
    const fallback =
      role === "teacher" ? "assets/avatars/teacher.svg" : "assets/avatars/student.svg";
    const src = photo || fallback;
    const label =
      role === "teacher"
        ? BBC_DATA.teacherDisplayName(person)
        : BBC_DATA.studentFullName(person);
    return `<span role="button" tabindex="0" class="avatar ${roleCls}${sizeCls} avatar-clickable" data-photo-view="${esc(src)}" data-photo-label="${esc(label)}" title="${esc(label)}" aria-label="${esc(I18n.t("viewPhoto"))}">
      <img src="${esc(src)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallback)}'" />
    </span>`;
  }

  function ensurePhotoLightbox() {
    let overlay = document.getElementById("photo-lightbox");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "photo-lightbox";
    overlay.className = "photo-lightbox";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="photo-lightbox-card" role="dialog" aria-modal="true" aria-label="${esc(I18n.t("photoCaption"))}">
        <button type="button" class="photo-lightbox-close" data-photo-close aria-label="${esc(I18n.t("close"))}">×</button>
        <img class="photo-lightbox-img" alt="" />
        <p class="photo-lightbox-caption"></p>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-photo-close]")) {
        overlay.hidden = true;
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) overlay.hidden = true;
    });
    return overlay;
  }

  function openPhotoLightbox(src, label = "") {
    if (!src) return;
    const overlay = ensurePhotoLightbox();
    const img = overlay.querySelector(".photo-lightbox-img");
    const caption = overlay.querySelector(".photo-lightbox-caption");
    img.src = src;
    img.alt = label || I18n.t("photoCaption");
    caption.textContent = label || "";
    caption.hidden = !label;
    overlay.hidden = false;
  }

  function bindPhotoViewer(root) {
    (root || document).querySelectorAll("[data-photo-view]").forEach((el) => {
      if (el.dataset.photoBound === "1") return;
      el.dataset.photoBound = "1";
      const open = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPhotoLightbox(el.getAttribute("data-photo-view"), el.getAttribute("data-photo-label") || "");
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open(e);
      });
    });
  }

  // Shared with Staff console
  window.QEAPhoto = { open: openPhotoLightbox, bind: bindPhotoViewer };

  function dash(v) {
    const s = String(v ?? "").trim();
    return s || "—";
  }

  function teacherLabel(t) {
    return BBC_DATA.teacherDisplayName(t);
  }

  function teacherLatin(t) {
    return String(t.nameLatin || "").trim();
  }

  /** Digits for wa.me — Algerian 0XXXXXXXXX → 213XXXXXXXXX */
  function whatsappNumber(phone) {
    let digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("0") && digits.length === 10) digits = "213" + digits.slice(1);
    if (digits.length < 8) return "";
    return digits;
  }

  function phoneWithWhatsApp(phone) {
    const raw = String(phone || "").trim();
    if (!raw) return `<span class="muted">${esc(I18n.t("notOnFile"))}</span>`;
    const wa = whatsappNumber(raw);
    const waBtn = wa
      ? `<a class="btn-whatsapp" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener noreferrer" title="${esc(I18n.t("whatsapp"))}" aria-label="${esc(I18n.t("whatsapp"))}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          ${esc(I18n.t("whatsapp"))}
        </a>`
      : "";
    return `<span class="phone-with-wa"><span class="phone-num">${esc(raw)}</span>${waBtn}</span>`;
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shell(content) {
    const brand =
      typeof BBC_DATA !== "undefined" && BBC_DATA.brandName
        ? BBC_DATA.brandName()
        : I18n.t("brand");
    let year = "2026 — 2027";
    try {
      year = BBC_DATA.school?.academicYear || year;
    } catch (_) {
      /* data not loaded yet */
    }
    const isStaff = Auth.isAdmin();
    const isWa = Auth.isWhatsApp();
    const isTeacher = Auth.isTeacher();
    const homeNav = isStaff ? "#/manage" : isWa ? "#/whatsapp" : isTeacher ? "#/my" : "#/home";
    const subtitle = isStaff
      ? I18n.t("adminConsole")
      : isWa
        ? I18n.t("whatsappConsole")
        : isTeacher
          ? I18n.t("teacherPortal")
          : I18n.t("portal");
    return `
      <div class="app-shell${isStaff || isWa || isTeacher ? " app-shell-staff" : ""}">
        <header class="topbar">
          <div class="topbar-main">
            <button type="button" class="topbar-brand" data-nav="${homeNav}" aria-label="${esc(I18n.t("home"))}">
              <img src="assets/logo.png?v=2" alt="${esc(I18n.t("brand"))}" width="44" height="44" />
              <div class="topbar-brand-text">
                <strong>${esc(brand)}</strong>
                <span class="hide-sm">${esc(subtitle)}</span>
              </div>
            </button>
            <div class="topbar-actions">
              ${I18n.langSwitcher("lang-switch-top")}
              <span class="badge-year hide-md">${esc(year)}</span>
              <button type="button" class="btn btn-ghost btn-logout" id="btn-logout" aria-label="${esc(I18n.t("signOut"))}">
                <span class="hide-sm">${esc(I18n.t("signOut"))}</span>
                <span class="show-sm-only" aria-hidden="true">⎋</span>
              </button>
            </div>
          </div>
          ${
            isStaff || isWa || isTeacher
              ? ""
              : `<form class="top-search" id="global-search" autocomplete="off">
            <input type="search" name="q" placeholder="${esc(I18n.t("searchPlaceholder"))}" value="${esc(state.searchQuery)}" />
            <button type="submit" class="btn btn-primary btn-search" aria-label="${esc(I18n.t("search"))}">${icons.search}</button>
          </form>`
          }
        </header>
        <main class="page">${content}</main>
      </div>
    `;
  }

  function crumb(items) {
    return `
      <nav class="breadcrumb" aria-label="${esc(I18n.t("breadcrumb"))}">
        ${items
          .map((item, i) => {
            const isLast = i === items.length - 1;
            if (isLast) return `<span class="current">${esc(item.label)}</span>`;
            return `<button type="button" data-nav="${esc(item.to)}">${esc(item.label)}</button><span class="sep">/</span>`;
          })
          .join("")}
      </nav>
    `;
  }

  function viewLogin() {
    return `
      <div class="login-page">
        <div class="login-card">
          <div class="login-lang">${I18n.langSwitcher()}</div>
          <div class="login-brand">
            <img src="assets/logo.png?v=2" alt="${esc(I18n.t("brand"))}" width="88" height="88" />
            <div>
              <h1>${esc(I18n.t("brand"))}</h1>
            </div>
          </div>
          <form class="login-form" id="login-form" autocomplete="off">
            <div class="field">
              <label for="password">${esc(I18n.t("password"))}</label>
              <input id="password" name="password" type="password" placeholder="${esc(I18n.t("passwordPlaceholder"))}" required autofocus />
            </div>
            <div class="login-error" id="login-error" role="alert"></div>
            <button type="submit" class="btn btn-primary">${esc(I18n.t("access"))}</button>
          </form>
          <p class="login-meta">${esc(I18n.t("welcomeAddress"))}</p>
          <p class="login-alt">
            <button type="button" class="link-btn" data-nav="#/teacher-login">${esc(I18n.t("teacherLoginLink"))}</button>
          </p>
        </div>
      </div>
    `;
  }

  function viewTeacherLogin() {
    return `
      <div class="login-page">
        <div class="login-card">
          <div class="login-lang">${I18n.langSwitcher()}</div>
          <div class="login-brand">
            <img src="assets/logo.png?v=2" alt="${esc(I18n.t("brand"))}" width="88" height="88" />
            <div>
              <h1>${esc(I18n.t("teacherPortal"))}</h1>
              <p class="login-hint">${esc(I18n.t("teacherLoginHint"))}</p>
            </div>
          </div>
          <form class="login-form" id="teacher-login-form" autocomplete="on">
            <div class="field">
              <label for="teacher-phone">${esc(I18n.t("phone"))}</label>
              <input id="teacher-phone" name="phone" type="tel" inputmode="tel" placeholder="${esc(I18n.t("teacherPhonePlaceholder"))}" required autofocus />
            </div>
            <div class="field">
              <label for="teacher-password">${esc(I18n.t("password"))}</label>
              <input id="teacher-password" name="password" type="password" placeholder="${esc(I18n.t("passwordPlaceholder"))}" required />
            </div>
            <div class="login-error" id="teacher-login-error" role="alert"></div>
            <button type="submit" class="btn btn-primary">${esc(I18n.t("access"))}</button>
          </form>
          <p class="login-meta">${esc(I18n.t("welcomeAddress"))}</p>
          <p class="login-alt">
            <button type="button" class="link-btn" data-nav="#/">${esc(I18n.t("staffLoginLink"))}</button>
          </p>
        </div>
      </div>
    `;
  }

  function viewHome() {
    const stats = BBC_DATA.stats();
    const year = BBC_DATA.school.academicYear;
    const loc =
      I18n.getLang() === "ar" ? "ar" : I18n.getLang() === "fr" ? "fr-FR" : "en-US";
    return shell(`
      ${crumb([{ label: I18n.t("home"), to: "#/home" }])}
      <div class="page-header home-header">
        <h1>${esc(I18n.t("dashboard"))}</h1>
        <p class="lede">${esc(I18n.t("dashboardLede", { year }))}</p>
      </div>

      <div class="page-header" style="margin-bottom:0.85rem">
        <h2 class="section-title" style="margin:0">${esc(I18n.t("departments"))}</h2>
      </div>
      <div class="dept-grid">
        ${BBC_DATA.departments
          .map((d) => {
            const label = d.id === "primary" ? I18n.t("primary") : I18n.t("middle");
            const desc = d.id === "primary" ? I18n.t("primaryDesc") : I18n.t("middleDesc");
            return `
          <button type="button" class="dept-card" data-nav="#/dept/${d.id}">
            <img src="${esc(d.image)}" alt="" loading="eager" />
            <div class="overlay"></div>
            <div class="content">
              <h2>${esc(label)}</h2>
              <p>${esc(desc)}</p>
              <span class="cta">${esc(I18n.t("openDepartment"))}</span>
            </div>
          </button>
        `;
          })
          .join("")}
      </div>

      <div class="home-shortcuts-wrap">
        <div class="page-header" style="margin-bottom:0.65rem">
          <h2 class="section-title" style="margin:0">${esc(I18n.t("directories"))}</h2>
        </div>
        <div class="home-icon-strip" role="navigation" aria-label="${esc(I18n.t("directories"))}">
          <button type="button" class="home-icon-tile" data-nav="#/teachers">
            <span class="home-icon-pic" aria-hidden="true">
              <img src="assets/avatars/teacher.svg" alt="" />
            </span>
            <strong>${esc(I18n.t("ourTeachers"))}</strong>
            <span class="muted">${stats.teachers}</span>
          </button>
          <button type="button" class="home-icon-tile" data-nav="#/students">
            <span class="home-icon-pic" aria-hidden="true">
              <img src="assets/avatars/student.svg" alt="" />
            </span>
            <strong>${esc(I18n.t("ourStudents"))}</strong>
            <span class="muted">${stats.students.toLocaleString(loc)}</span>
          </button>
        </div>
      </div>

      <div class="stats-row home-stats">
        <div class="stat-card"><div class="label">${esc(I18n.t("classes"))}</div><div class="value">${stats.classes}</div></div>
        <div class="stat-card"><div class="label">${esc(I18n.t("students"))}</div><div class="value">${stats.students.toLocaleString(loc)}</div></div>
        <div class="stat-card"><div class="label">${esc(I18n.t("teachersListed"))}</div><div class="value">${stats.teachers}</div></div>
      </div>
    `);
  }

  function severityBadge(sev) {
    const s = String(sev || "").toLowerCase();
    const cls = s === "high" ? "sev-high" : s === "medium" ? "sev-medium" : "sev-low";
    const label =
      s === "high"
        ? I18n.t("severityHigh")
        : s === "medium"
          ? I18n.t("severityMedium")
          : s === "low"
            ? I18n.t("severityLow")
            : sev || "—";
    return `<span class="issue-badge ${cls}">${esc(label)}</span>`;
  }

  function statusBadge(status) {
    const s = String(status || "").toLowerCase();
    const cls = s === "open" ? "status-open" : s === "resolved" ? "status-resolved" : "status-other";
    const label =
      s === "open" ? I18n.t("statusOpen") : s === "resolved" ? I18n.t("statusResolved") : status || "—";
    return `<span class="issue-badge ${cls}">${esc(label)}</span>`;
  }

  function viewIssues() {
    const issues = BBC_DATA.listIssues();
    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        { label: I18n.t("operationsIssues"), to: "#/issues" },
      ])}
      <div class="page-header">
        <h1>${esc(I18n.t("operationsIssues"))}</h1>
        <p class="lede">${esc(I18n.t("operationsIssuesLede"))}</p>
      </div>
      <div class="issue-list">
        ${
          issues.length
            ? issues
                .map(
                  (issue) => `
          <button type="button" class="issue-card" data-nav="#/issues/${esc(issue.id)}">
            <div class="issue-card-top">
              ${statusBadge(issue.status)}
              ${severityBadge(issue.severity)}
              <span class="issue-area">${esc(issue.area || "")}</span>
            </div>
            <h3>${esc(I18n.getLang() === "ar" && issue.titleAr ? issue.titleAr : issue.title)}</h3>
            ${issue.titleAr && I18n.getLang() !== "ar" ? `<p class="issue-ar" dir="rtl">${esc(issue.titleAr)}</p>` : ""}
            <p>${esc(issue.summary || "")}</p>
            <span class="cta">${esc(I18n.t("openIssue"))}</span>
          </button>`
                )
                .join("")
            : `<div class="empty-state"><p>${esc(I18n.t("noIssuesYet"))}</p></div>`
        }
      </div>
    `);
  }

  function viewIssueDetail(issueId) {
    const issue = BBC_DATA.getIssue(issueId);
    if (!issue) return viewNotFound();
    const list = (arr) =>
      (arr || []).length
        ? `<ul class="issue-bullets">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
        : `<p class="muted">—</p>`;
    const title = I18n.getLang() === "ar" && issue.titleAr ? issue.titleAr : issue.title;
    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        { label: I18n.t("operationsIssues"), to: "#/issues" },
        { label: title, to: `#/issues/${issue.id}` },
      ])}
      <div class="page-header">
        <div class="issue-card-top" style="margin-bottom:0.75rem">
          ${statusBadge(issue.status)}
          ${severityBadge(issue.severity)}
          <span class="issue-area">${esc(issue.area || "")}</span>
          ${issue.updated ? `<span class="issue-area">${esc(I18n.t("updatedOn", { date: issue.updated }))}</span>` : ""}
        </div>
        <h1>${esc(title)}</h1>
        ${issue.titleAr && I18n.getLang() !== "ar" ? `<p class="lede issue-ar" dir="rtl">${esc(issue.titleAr)}</p>` : ""}
        <p class="lede">${esc(issue.summary || "")}</p>
      </div>
      <div class="detail-layout">
        <section class="info-panel">
          <div class="panel-label">${esc(I18n.t("currentProcess"))}</div>
          ${list(issue.currentProcess)}
        </section>
        <section class="info-panel">
          <div class="panel-label">${esc(I18n.t("impact"))}</div>
          ${list(issue.impact)}
        </section>
      </div>
      <div class="info-panel" style="margin-top:1rem">
        <div class="panel-label">${esc(I18n.t("goal"))}</div>
        <p style="margin-top:0.65rem">${esc(issue.goal || "—")}</p>
      </div>
      ${
        issue.notes
          ? `<div class="info-panel" style="margin-top:1rem">
              <div class="panel-label">${esc(I18n.t("notes"))}</div>
              <p style="margin-top:0.65rem">${esc(issue.notes)}</p>
            </div>`
          : ""
      }
      <div class="info-panel" style="margin-top:1rem">
        <div class="panel-label">${esc(I18n.t("quickLookup"))}</div>
        <p style="margin-top:0.65rem;margin-bottom:0.85rem">${esc(I18n.t("quickLookupLede"))}</p>
        <button type="button" class="btn btn-primary" data-nav="#/students">${esc(I18n.t("openStudentDirectory"))}</button>
      </div>
    `);
  }

  function viewLevels(deptId) {
    const dept = BBC_DATA.getDepartment(deptId);
    if (!dept) return viewNotFound();
    const short = deptShortLabel(deptId);
    const totalClasses = dept.levels.reduce((n, l) => n + l.classes.length, 0);
    const totalStudents = dept.levels.reduce(
      (n, l) => n + l.classes.reduce((a, c) => a + c.students.length, 0),
      0
    );
    return shell(`
      ${crumb([
        { label: I18n.t("departments"), to: "#/home" },
        { label: short, to: `#/dept/${deptId}` },
      ])}
      <div class="page-header">
        <h1>${esc(deptFullLabel(dept))}</h1>
        <p class="lede">${esc(
          I18n.t("deptSummary", {
            years: dept.levels.length,
            classes: totalClasses,
            students: totalStudents,
          })
        )}</p>
      </div>
      <div class="floor-grid" style="--cols: ${Math.min(dept.levels.length, 5)}">
        ${dept.levels
          .map(
            (l, i) => `
          <button type="button" class="floor-card" style="--accent:${["#F26522","#E85A1A","#D94F14","#C94412","#B83A10"][i % 5]}" data-nav="#/dept/${deptId}/level/${l.id}">
            <span class="floor-num">${l.id === 99 ? "—" : l.id}</span>
            <h3>${esc(levelDisplayName(l))}</h3>
            ${
              I18n.getLang() !== "ar" && (l.nameAr || l.subtitle)
                ? `<p>${esc(l.nameAr || l.subtitle || "")}</p>`
                : ""
            }
            <div class="floor-meta">${esc(I18n.t("classesCount", { n: l.classes.length }))}</div>
          </button>
        `
          )
          .join("")}
      </div>
    `);
  }

  function viewClasses(deptId, levelId) {
    const dept = BBC_DATA.getDepartment(deptId);
    const level = BBC_DATA.getLevel(deptId, levelId);
    if (!dept || !level) return viewNotFound();
    const short = deptShortLabel(deptId);
    const sub = I18n.getLang() === "ar" ? "" : level.nameAr || "";
    return shell(`
      ${crumb([
        { label: I18n.t("departments"), to: "#/home" },
        { label: short, to: `#/dept/${deptId}` },
        { label: levelDisplayName(level), to: `#/dept/${deptId}/level/${level.id}` },
      ])}
      <div class="page-header">
        <h1>${esc(levelDisplayName(level))}</h1>
        <p class="lede">${esc([sub, I18n.t("classesCount", { n: level.classes.length })].filter(Boolean).join(" — "))}</p>
      </div>
      <div class="group-grid">
        ${level.classes
          .map(
            (c) => `
          <button type="button" class="group-card" data-nav="#/dept/${deptId}/level/${level.id}/class/${c.id}">
            <div class="group-icon">${icons.users}</div>
            <h3>${esc(classDisplayCode(c))}</h3>
            <div class="code">${esc(classDisplayExtra(c))}</div>
            <div class="hint">${esc(
              I18n.t("studentsModulesCount", {
                students: c.students.length,
                modules: (c.modules || []).length,
              })
            )}</div>
          </button>
        `
          )
          .join("")}
      </div>
    `);
  }

  function viewClassDetail(deptId, levelId, classId) {
    const dept = BBC_DATA.getDepartment(deptId);
    const level = BBC_DATA.getLevel(deptId, levelId);
    const cls = BBC_DATA.getClass(deptId, levelId, classId);
    if (!dept || !level || !cls) return viewNotFound();
    const short = deptShortLabel(deptId);
    const teachers = (cls.teacherIds || []).map((id) => BBC_DATA.getTeacher(id)).filter(Boolean);
    const females = cls.students.filter((s) => s.gender === "Female").length;
    const males = cls.students.filter((s) => s.gender === "Male").length;

    return shell(`
      ${crumb([
        { label: I18n.t("departments"), to: "#/home" },
        { label: short, to: `#/dept/${deptId}` },
        { label: levelDisplayName(level), to: `#/dept/${deptId}/level/${level.id}` },
        { label: classDisplayCode(cls), to: `#/dept/${deptId}/level/${level.id}/class/${cls.id}` },
      ])}
      <div class="page-header">
        <h1>${esc(classDisplayCode(cls))}</h1>
        <p class="lede">${esc(classDisplayExtra(cls))}</p>
      </div>

      <div class="detail-layout">
        <aside class="info-panel">
          <div class="panel-label">${esc(I18n.t("enrollment"))}</div>
          <div class="big-stat">${cls.students.length}<span>${esc(I18n.t("studentsOnRoster"))}</span></div>
          <div class="panel-divider"></div>
          <dl class="info-list">
            <div><dt>${esc(I18n.t("females"))}</dt><dd>${cls.stats?.females ?? females}</dd></div>
            <div><dt>${esc(I18n.t("males"))}</dt><dd>${cls.stats?.males ?? males}</dd></div>
            <div><dt>${esc(I18n.t("modules"))}</dt><dd>${(cls.modules || []).length}</dd></div>
            <div><dt>${esc(I18n.t("teachersNamed"))}</dt><dd>${teachers.length}</dd></div>
          </dl>
          <div class="panel-divider"></div>
          <div class="panel-label">${esc(I18n.t("modules"))}</div>
          <div class="chip-row" style="margin-top:0.6rem">
            ${(cls.modules || []).map((m) => `<span class="chip">${esc(moduleLabel(m))}</span>`).join("")}
          </div>
        </aside>

        <div class="stack-panels">
          <section class="info-panel">
            <div class="section-head">
              <h2 class="section-title" style="margin:0">${esc(I18n.t("teachers"))}</h2>
            </div>
            ${
              teachers.length
                ? `<div class="teacher-list" style="margin-top:0.85rem">
                    ${teachers
                      .map((t) => {
                        const from = encodeURIComponent(
                          `#/dept/${deptId}/level/${level.id}/class/${cls.id}`
                        );
                        const wa = whatsappNumber(t.phone);
                        const phoneBlock = t.phone
                          ? `<div class="teacher-contact">
                              <span class="teacher-phone">${esc(t.phone)}</span>
                              ${
                                wa
                                  ? `<a class="btn-whatsapp btn-whatsapp-sm" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener noreferrer" title="${esc(I18n.t("whatsapp"))}" aria-label="${esc(I18n.t("whatsapp"))}">
                                      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                      ${esc(I18n.t("whatsapp"))}
                                    </a>`
                                  : ""
                              }
                            </div>`
                          : "";
                        return `
                      <div class="teacher-row-wrap">
                        <button type="button" class="teacher-row" data-nav="#/teacher/${t.id}?from=${from}">
                          ${profileAvatar(t, "teacher")}
                          <div class="meta">
                            <strong dir="auto">${esc(teacherLabel(t))}</strong>
                            <span>${esc((t.modules || []).map(moduleLabel).join(" · "))}</span>
                          </div>
                          <span class="chev">→</span>
                        </button>
                        ${phoneBlock}
                      </div>`;
                      })
                      .join("")}
                  </div>`
                : `<p class="muted" style="margin-top:0.75rem">${esc(I18n.t("teachersUnnamed"))}</p>`
            }
          </section>

          <section class="info-panel">
            <div class="section-head">
              <h2 class="section-title" style="margin:0">${esc(I18n.t("students"))}</h2>
              <form class="inline-search" id="class-search" data-class-search="${esc(cls.id)}" autocomplete="off">
                <input type="search" name="q" placeholder="${esc(I18n.t("filterByName"))}" />
              </form>
            </div>
            <div class="student-table-wrap" style="margin-top:0.85rem">
              <table class="student-table" id="student-table">
                <thead>
                  <tr>
                    <th class="col-num">#</th>
                    <th class="col-name-full hide-desktop">${esc(I18n.t("student"))}</th>
                    <th class="col-last hide-mobile">${esc(I18n.t("lastName"))}</th>
                    <th class="col-first hide-mobile">${esc(I18n.t("firstName"))}</th>
                    <th class="col-dob hide-mobile">${esc(I18n.t("dob"))}</th>
                    <th class="col-gender hide-sm">${esc(I18n.t("gender"))}</th>
                    <th class="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  ${cls.students
                    .map(
                      (s) => `
                    <tr data-search="${esc((s.searchName || s.fullName || s.fullNameLatin || "").toLowerCase())}">
                      <td class="col-num" data-label="#">${s.number ?? ""}</td>
                      <td class="col-name-full hide-desktop" data-label="${esc(I18n.t("student"))}">${esc(BBC_DATA.studentFullName(s))}</td>
                      <td class="col-last hide-mobile" data-label="${esc(I18n.t("lastName"))}">${esc(BBC_DATA.studentLastName(s))}</td>
                      <td class="col-first hide-mobile" data-label="${esc(I18n.t("firstName"))}">${esc(BBC_DATA.studentFirstName(s))}</td>
                      <td class="col-dob hide-mobile" data-label="${esc(I18n.t("dob"))}">${esc(s.dateOfBirth || "—")}</td>
                      <td class="col-gender hide-sm" data-label="${esc(I18n.t("gender"))}">${esc(genderLabel(s.gender))}</td>
                      <td class="col-action" data-label=""><button type="button" class="link-btn" data-nav="#/student/${s.id}">${esc(I18n.t("view"))}</button></td>
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    `);
  }

  const PREV_YEAR_FIELDS = [
    { key: "number", labelKey: "pyNo" },
    { key: "matchedName", labelKey: "fullName" },
    { key: "dateOfBirth", labelKey: "dob" },
    { key: "age", labelKey: "pyAge" },
    { key: "annualAverage", labelKey: "pyAnnualAverage" },
    { key: "socialStatus", labelKey: "pySocialStatus" },
    { key: "healthStatus", labelKey: "pyHealthStatus" },
    { key: "strengths", labelKey: "pyStrengths" },
    { key: "weaknesses", labelKey: "pyWeaknesses" },
    { key: "behavioralPerformance", labelKey: "pyBehavioral" },
    { key: "academicPerformance", labelKey: "pyAcademic" },
    { key: "talents", labelKey: "pyTalents" },
    { key: "additionalNotes", labelKey: "pyAdditionalNotes" },
    { key: "actionPlan", labelKey: "pyActionPlan" },
    { key: "generalNote", labelKey: "pyGeneralNote" },
  ];

  function renderPreviousYearDetails(details) {
    if (!details) return "";
    const yearLabel = details.previousYear || I18n.t("previousYear");
    const yearAr = details.previousYearAr || "";
    const classLabel = details.previousClass ? ` · ${details.previousClass}` : "";
    const rows = PREV_YEAR_FIELDS.map(({ key, labelKey }) => {
      const val = (details[key] || "").toString().trim();
      if (!val) return "";
      return `
        <div class="detail-row">
          <div class="detail-label">
            <span>${esc(I18n.t(labelKey))}</span>
          </div>
          <div class="detail-value" dir="auto">${esc(val)}</div>
        </div>`;
    }).join("");

    return `
      <div class="info-panel student-more-panel" style="margin-top:1rem">
        <button type="button" class="btn btn-primary" id="btn-more-details" aria-expanded="false">
          ${esc(I18n.t("moreDetails"))}
        </button>
        <div id="student-more-details" class="student-more-details" hidden>
          <div class="prev-year-banner">
            <div class="panel-label">${esc(I18n.t("previousYearRecord"))}</div>
            <p class="prev-year-title">
              ${esc(I18n.getLang() === "ar" && yearAr ? yearAr : yearLabel)}${esc(classLabel)}
            </p>
            <p class="prev-year-hint">${esc(I18n.t("prevYearHint"))}</p>
          </div>
          <div class="detail-rows">${rows || `<p class="empty-details">${esc(I18n.t("noExtraFields"))}</p>`}</div>
        </div>
      </div>`;
  }

  function viewStudent(studentId, from) {
    const found = BBC_DATA.getStudent(studentId);
    if (!found) return viewNotFound();
    const { student: s, dept, level, cls } = found;
    const short = deptShortLabel(dept.id);
    const classBack = `#/dept/${dept.id}/level/${level.id}/class/${cls.id}`;
    const back = from || classBack;
    const hasPrev = !!s.previousYearDetails;
    const noPrevMsg =
      level.name && /year\s*1/i.test(level.name)
        ? I18n.t("noPreviousYearYear1")
        : I18n.t("noPreviousYear");

    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        ...(from && from.includes("/students")
          ? [{ label: I18n.t("students"), to: "#/students" }]
          : [
              { label: short, to: `#/dept/${dept.id}` },
              { label: levelDisplayName(level), to: `#/dept/${dept.id}/level/${level.id}` },
              { label: classDisplayCode(cls), to: classBack },
            ]),
        { label: BBC_DATA.studentFullName(s), to: `#/student/${s.id}` },
      ])}
      <div class="page-header" style="margin-bottom:1rem">
        <button type="button" class="btn btn-ghost" data-nav="${esc(back)}" style="margin-bottom:0.75rem;padding-left:0">${esc(I18n.t("backTo"))}</button>
      </div>
      <div class="teacher-hero">
        ${profileAvatar(s, "student", "avatar-lg")}
        <div>
          <h1 dir="auto">${esc(BBC_DATA.studentFullName(s))}</h1>
          <p class="role">${esc(I18n.t("student"))} · ${esc(classDisplayCode(cls))} · ${esc(levelDisplayName(level))} · ${esc(short)}</p>
        </div>
      </div>
      <div class="facts-grid">
        <div class="fact-card"><div class="k">${esc(I18n.t("lastName"))}</div><div class="v" dir="auto">${esc(BBC_DATA.studentLastName(s))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("firstName"))}</div><div class="v" dir="auto">${esc(BBC_DATA.studentFirstName(s))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("lastNameAr"))}</div><div class="v" dir="auto">${esc(s.lastName || "—")}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("firstNameAr"))}</div><div class="v" dir="auto">${esc(s.firstName || "—")}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("lastNameLatin"))}</div><div class="v" dir="auto">${esc(s.lastNameLatin || "—")}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("firstNameLatin"))}</div><div class="v" dir="auto">${esc(s.firstNameLatin || "—")}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("dob"))}</div><div class="v">${esc(s.dateOfBirth || I18n.t("notOnFile"))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("gender"))}</div><div class="v">${esc(genderLabel(s.gender))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("rosterNumber"))}</div><div class="v">${s.number ?? "—"}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("department"))}</div><div class="v">${esc(deptFullLabel(dept))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("year"))}</div><div class="v">${esc(levelDisplayName(level))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("class"))}</div><div class="v"><button type="button" class="link-btn" data-nav="${esc(classBack)}">${esc(classDisplayCode(cls))}</button></div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("studentId"))}</div><div class="v">${esc(s.id)}</div></div>
      </div>
      ${
        s.notes
          ? `<div class="info-panel"><div class="panel-label">${esc(I18n.t("notes"))}</div><p style="margin-top:0.5rem">${esc(s.notes)}</p></div>`
          : ""
      }
      ${
        hasPrev
          ? renderPreviousYearDetails(s.previousYearDetails)
          : `<div class="info-panel" style="margin-top:1rem"><div class="panel-label">${esc(I18n.t("previousYear"))}</div><p style="margin-top:0.5rem;color:var(--muted)">${esc(noPrevMsg)}</p></div>`
      }
      <div class="info-panel" style="margin-top:1rem">
        <div class="panel-label">${esc(I18n.t("classModules"))}</div>
        <div class="chip-row" style="margin-top:0.6rem">
          ${(cls.modules || []).map((m) => `<span class="chip">${esc(moduleLabel(m))}</span>`).join("")}
        </div>
      </div>
    `);
  }

  function viewSearch(query) {
    const results = BBC_DATA.searchStudents(query);
    return shell(`
      ${crumb([
        { label: I18n.t("departments"), to: "#/home" },
        { label: I18n.t("search"), to: `#/search?q=${encodeURIComponent(query)}` },
      ])}
      <div class="page-header">
        <h1>${esc(I18n.t("searchResults"))}</h1>
        <p class="lede">${esc(I18n.t("studentsMatching", { n: results.length, q: query }))}</p>
      </div>
      ${
        results.length
          ? `<div class="student-table-wrap">
              <table class="student-table student-table-search">
                <thead>
                  <tr>
                    <th>${esc(I18n.t("fullName"))}</th>
                    <th class="hide-sm">${esc(I18n.t("department"))}</th>
                    <th class="hide-mobile">${esc(I18n.t("year"))}</th>
                    <th>${esc(I18n.t("class"))}</th>
                    <th class="hide-sm">${esc(I18n.t("gender"))}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${results
                    .map(
                      ({ student: s, dept, level, cls }) => `
                    <tr>
                      <td data-label="${esc(I18n.t("fullName"))}"><strong dir="auto">${esc(BBC_DATA.studentFullName(s))}</strong></td>
                      <td class="hide-sm" data-label="${esc(I18n.t("department"))}">${esc(deptShortLabel(dept.id))}</td>
                      <td class="hide-mobile" data-label="${esc(I18n.t("year"))}">${esc(levelDisplayName(level))}</td>
                      <td data-label="${esc(I18n.t("class"))}">${esc(classDisplayCode(cls))}</td>
                      <td class="hide-sm" data-label="${esc(I18n.t("gender"))}">${esc(genderLabel(s.gender))}</td>
                      <td data-label=""><button type="button" class="link-btn" data-nav="#/student/${s.id}">${esc(I18n.t("view"))}</button></td>
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<div class="empty-state"><h2>${esc(I18n.t("noStudentsFound"))}</h2><p>${esc(I18n.t("tryOtherSpelling"))}</p></div>`
      }
    `);
  }

  function viewTeachersDirectory(params) {
    const q = (params.get("q") || "").trim().toLowerCase();
    const dept = params.get("dept") || "";
    const module = params.get("module") || "";
    const classId = params.get("class") || "";
    const modules = BBC_DATA.listModules();
    const classOpts = BBC_DATA.listClassOptions();
    const all = BBC_DATA.listAllTeachers();

    const filtered = all.filter(({ teacher: t, classes }) => {
      if (dept && !(t.departments || []).includes(dept)) return false;
      if (module && !(t.modules || []).includes(module)) return false;
      if (classId && !(t.classIds || []).includes(classId)) return false;
      if (q) {
        const hay = `${t.id} ${t.firstName || ""} ${t.lastName || ""} ${teacherLabel(t)} ${teacherLatin(t)} ${(t.phone || "")} ${(t.modules || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => teacherLabel(a.teacher).localeCompare(teacherLabel(b.teacher), I18n.getLang() === "ar" ? "ar" : I18n.getLang() === "fr" ? "fr" : "en"));

    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        { label: I18n.t("teachers"), to: "#/teachers" },
      ])}
      <div class="page-header">
        <h1>${esc(I18n.t("ourTeachers"))}</h1>
        <p class="lede">${esc(I18n.t("ofCount", { shown: filtered.length, total: all.length }))} ${esc(I18n.t("teachers"))}</p>
      </div>
      <form class="filter-panel" id="dir-filter" data-dir="teachers" autocomplete="off">
        <div class="filter-grid">
          <label class="filter-field">
            <span>${esc(I18n.t("nameIdPhone"))}</span>
            <input type="search" name="q" value="${esc(params.get("q") || "")}" placeholder="${esc(I18n.t("searchEllipsis"))}" />
          </label>
          <label class="filter-field">
            <span>${esc(I18n.t("department"))}</span>
            <select name="dept">
              <option value="">${esc(I18n.t("all"))}</option>
              <option value="primary"${dept === "primary" ? " selected" : ""}>${esc(I18n.t("primary"))}</option>
              <option value="middle"${dept === "middle" ? " selected" : ""}>${esc(I18n.t("middle"))}</option>
            </select>
          </label>
          <label class="filter-field">
            <span>${esc(I18n.t("subject"))}</span>
            <select name="module">
              <option value="">${esc(I18n.t("all"))}</option>
              ${modules.map((m) => `<option value="${esc(m)}"${module === m ? " selected" : ""}>${esc(moduleLabel(m))}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>${esc(I18n.t("class"))}</span>
            <select name="class">
              <option value="">${esc(I18n.t("all"))}</option>
              ${classOpts.map((o) => `<option value="${esc(o.id)}"${classId === o.id ? " selected" : ""}>${esc(classOptionLabel(o))}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="filter-actions">
          <button type="submit" class="btn btn-primary">${esc(I18n.t("applyFilters"))}</button>
          <button type="button" class="btn btn-ghost" data-nav="#/teachers">${esc(I18n.t("clearFilters"))}</button>
        </div>
      </form>
      <div class="dir-list" id="dir-list">
        ${
          filtered.length
            ? filtered
                .map(({ teacher: t, classes }) => {
                  const depts = (t.departments || []).map((d) => deptShortLabel(d)).join(" · ");
                  const classCodes = classes.map((x) => classDisplayCode(x.cls)).join(", ") || "—";
                  const mods = (t.modules || []).map(moduleLabel).join(", ") || "—";
                  return `
              <button type="button" class="dir-card" data-nav="#/teacher/${t.id}?from=${encodeURIComponent("#/teachers")}">
                ${profileAvatar(t, "teacher")}
                <div class="dir-card-body">
                  <strong dir="auto">${esc(teacherLabel(t))}</strong>
                  ${teacherLatin(t) ? `<span class="dir-meta">${esc(teacherLatin(t))}</span>` : ""}
                  <span class="dir-meta">${esc(depts || "—")} · ${esc(mods)}</span>
                  <span class="dir-meta hide-sm">${esc(I18n.t("idPrefix"))} ${esc(t.id)} · ${esc(I18n.t("classesColon"))}: ${esc(classCodes)}</span>
                  <span class="dir-meta">${t.phone ? esc(t.phone) : esc(I18n.t("noPhone"))}</span>
                </div>
                <span class="chev">→</span>
              </button>`;
                })
                .join("")
            : `<div class="empty-state"><h2>${esc(I18n.t("noTeachersMatch"))}</h2><p>${esc(I18n.t("tryClearFilters"))}</p></div>`
        }
      </div>
    `);
  }

  function viewStudentsDirectory(params) {
    const q = (params.get("q") || "").trim().toLowerCase();
    const dept = params.get("dept") || "";
    const classId = params.get("class") || "";
    const gender = params.get("gender") || "";
    const year = params.get("year") || "";
    const classOpts = BBC_DATA.listClassOptions().filter((o) => !dept || o.departmentId === dept);
    const all = BBC_DATA.listAllStudents();

    const yearOptions = [];
    for (const d of BBC_DATA.departments) {
      for (const l of d.levels) {
        yearOptions.push({
          value: `${d.id}:${l.id}`,
          label: `${deptShortLabel(d.id)} · ${levelDisplayName(l)}`,
        });
      }
    }

    const filtered = all.filter(({ student: s, dept: d, level, cls }) => {
      if (dept && d.id !== dept) return false;
      if (classId && cls.id !== classId) return false;
      if (gender && (s.gender || "") !== gender) return false;
      if (year) {
        const [yd, yl] = year.split(":");
        if (d.id !== yd || String(level.id) !== String(yl)) return false;
      }
      if (q) {
        const hay = `${s.id} ${s.searchName || ""} ${s.fullName || ""} ${s.fullNameLatin || ""} ${s.firstName || ""} ${s.firstNameLatin || ""} ${s.lastName || ""} ${s.lastNameLatin || ""} ${cls.code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) =>
      BBC_DATA.studentFullName(a.student).localeCompare(BBC_DATA.studentFullName(b.student), I18n.getLang() === "ar" ? "ar" : "en")
    );

    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        { label: I18n.t("students"), to: "#/students" },
      ])}
      <div class="page-header">
        <h1>${esc(I18n.t("ourStudents"))}</h1>
        <p class="lede">${esc(I18n.t("ofCount", { shown: filtered.length, total: all.length }))} ${esc(I18n.t("students"))}</p>
      </div>
      <form class="filter-panel" id="dir-filter" data-dir="students" autocomplete="off">
        <div class="filter-grid">
          <label class="filter-field">
            <span>${esc(I18n.t("nameId"))}</span>
            <input type="search" name="q" value="${esc(params.get("q") || "")}" placeholder="${esc(I18n.t("searchEllipsis"))}" />
          </label>
          <label class="filter-field">
            <span>${esc(I18n.t("department"))}</span>
            <select name="dept">
              <option value="">${esc(I18n.t("all"))}</option>
              <option value="primary"${dept === "primary" ? " selected" : ""}>${esc(I18n.t("primary"))}</option>
              <option value="middle"${dept === "middle" ? " selected" : ""}>${esc(I18n.t("middle"))}</option>
            </select>
          </label>
          <label class="filter-field">
            <span>${esc(I18n.t("year"))}</span>
            <select name="year">
              <option value="">${esc(I18n.t("all"))}</option>
              ${yearOptions.map((o) => `<option value="${esc(o.value)}"${year === o.value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>${esc(I18n.t("class"))}</span>
            <select name="class">
              <option value="">${esc(I18n.t("all"))}</option>
              ${classOpts.map((o) => `<option value="${esc(o.id)}"${classId === o.id ? " selected" : ""}>${esc(classOptionLabel(o))}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>${esc(I18n.t("gender"))}</span>
            <select name="gender">
              <option value="">${esc(I18n.t("all"))}</option>
              <option value="Male"${gender === "Male" ? " selected" : ""}>${esc(I18n.t("male"))}</option>
              <option value="Female"${gender === "Female" ? " selected" : ""}>${esc(I18n.t("female"))}</option>
            </select>
          </label>
        </div>
        <div class="filter-actions">
          <button type="submit" class="btn btn-primary">${esc(I18n.t("applyFilters"))}</button>
          <button type="button" class="btn btn-ghost" data-nav="#/students">${esc(I18n.t("clearFilters"))}</button>
        </div>
      </form>
      <div class="dir-list" id="dir-list">
        ${
          filtered.length
            ? filtered
                .map(({ student: s, dept: d, level, cls }) => `
              <button type="button" class="dir-card" data-nav="#/student/${s.id}?from=${encodeURIComponent("#/students")}">
                ${profileAvatar(s, "student")}
                <div class="dir-card-body">
                  <strong dir="auto">${esc(BBC_DATA.studentFullName(s))}</strong>
                  <span class="dir-meta">${esc(deptShortLabel(d.id))} · ${esc(levelDisplayName(level))} · ${esc(classDisplayCode(cls))}</span>
                  <span class="dir-meta hide-sm">${esc(I18n.t("idPrefix"))} ${esc(s.id)}${s.dateOfBirth ? ` · ${esc(I18n.t("dobShort"))} ${esc(s.dateOfBirth)}` : ""}</span>
                  <span class="dir-meta">${esc(genderLabel(s.gender))}</span>
                </div>
                <span class="chev">→</span>
              </button>`)
                .join("")
            : `<div class="empty-state"><h2>${esc(I18n.t("noStudentsMatch"))}</h2><p>${esc(I18n.t("tryClearFilters"))}</p></div>`
        }
      </div>
    `);
  }

  function viewTeacher(teacherId, from) {
    const t = BBC_DATA.getTeacher(teacherId);
    if (!t) return viewNotFound();
    const back = from || "#/teachers";
    const classes = (t.classIds || [])
      .map((cid) => BBC_DATA.findClassById(cid))
      .filter(Boolean);
    const depts = (t.departments || []).map((d) => {
      const dept = BBC_DATA.getDepartment(d);
      return dept ? deptFullLabel(dept) : d;
    });
    const arName = [t.firstName, t.lastName].filter(Boolean).join(" ").trim();
    const latinName = teacherLatin(t);
    const secondaryName = I18n.useArabicNames() ? latinName : arName;

    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        { label: I18n.t("teachers"), to: "#/teachers" },
        { label: teacherLabel(t), to: `#/teacher/${t.id}` },
      ])}
      <div class="page-header" style="margin-bottom:1rem">
        <button type="button" class="btn btn-ghost" data-nav="${esc(back)}" style="margin-bottom:0.75rem;padding-left:0">${esc(I18n.t("backTo"))}</button>
      </div>
      <div class="teacher-hero">
        ${profileAvatar(t, "teacher", "avatar-lg")}
        <div>
          <h1 dir="auto">${esc(teacherLabel(t))}</h1>
          <p class="role">${esc(I18n.t("teacher"))} · ${esc(depts.join(" · ") || I18n.t("brand"))}${secondaryName ? ` · ${esc(secondaryName)}` : ""}</p>
        </div>
      </div>
      <div class="facts-grid">
        <div class="fact-card"><div class="k">${esc(I18n.t("firstName"))}</div><div class="v" dir="auto">${esc(dash(I18n.useArabicNames() ? t.firstName : t.firstNameLatin || t.firstName))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("lastName"))}</div><div class="v" dir="auto">${esc(dash(I18n.useArabicNames() ? t.lastName : t.lastNameLatin || t.lastName))}</div></div>
        ${latinName ? `<div class="fact-card"><div class="k">${esc(I18n.t("latinName"))}</div><div class="v">${esc(latinName)}</div></div>` : ""}
        <div class="fact-card"><div class="k">${esc(I18n.t("phone"))}</div><div class="v">${phoneWithWhatsApp(t.phone)}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("department"))}</div><div class="v">${esc(depts.join(" · ") || "—")}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("wilaya"))}</div><div class="v">${esc(dash(t.wilaya))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("commune"))}</div><div class="v">${esc(dash(t.commune))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("teacherId"))}</div><div class="v">${esc(t.id)}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("classesAssigned"))}</div><div class="v">${classes.length}</div></div>
      </div>
      <div class="detail-layout">
        <aside class="info-panel">
          <div class="panel-label">${esc(I18n.t("subjectsModules"))}</div>
          <div class="chip-row" style="margin-top:0.75rem">
            ${(t.modules || []).length
              ? (t.modules || []).map((m) => `<span class="chip">${esc(moduleLabel(m))}</span>`).join("")
              : `<span class="muted">${esc(I18n.t("noneListed"))}</span>`}
          </div>
        </aside>
        <section class="info-panel">
          <div class="panel-label">${esc(I18n.t("assignedClasses"))}</div>
          <div class="group-links" style="margin-top:0.85rem">
            ${
              classes.length
                ? classes
                    .map((found) => {
                      const href = `#/dept/${found.dept.id}/level/${found.level.id}/class/${found.cls.id}`;
                      return `<button type="button" class="group-link" data-nav="${esc(href)}">
                        <span>${esc(localizedClassPath(found))}</span>
                        <span class="chip neutral">${esc(I18n.t("studentsCount", { n: (found.cls.students || []).length }))}</span>
                      </button>`;
                    })
                    .join("")
                : `<p class="muted">${esc(I18n.t("noClassesLinked"))}</p>`
            }
          </div>
        </section>
      </div>
    `);
  }

  function viewNotFound() {
    return shell(`
      <div class="empty-state">
        <h2>${esc(I18n.t("pageNotFound"))}</h2>
        <p>${esc(I18n.t("pageNotFoundLede"))}</p>
        <button type="button" class="btn btn-primary" style="margin-top:1.25rem" data-nav="#/home">${esc(I18n.t("back"))}</button>
      </div>
    `);
  }

  async function resolveView() {
    const { parts, params } = state.route;
    const path0 = parts[0] || "home";

    if (!Auth.isAuthenticated()) {
      if (path0 === "teacher-login") return viewTeacherLogin();
      return viewLogin();
    }

    // Keep Director, Staff, WhatsApp, and Teacher sides fully separated
    if (Auth.isDirector() && (path0 === "manage" || path0 === "whatsapp" || path0 === "my")) {
      go("/home");
      return viewHome();
    }
    if (Auth.isAdmin() && path0 !== "manage") {
      go("/manage");
      const html = AdminApp.resolve(["manage"], new URLSearchParams());
      return shell(html || "");
    }
    if (Auth.isWhatsApp() && path0 !== "whatsapp") {
      go("/whatsapp");
      const html = WhatsAppApp.resolve(["whatsapp"]);
      return shell(html || "");
    }
    if (Auth.isTeacher() && path0 !== "my") {
      go("/my");
      const result = await TeacherApp.resolve(["my"], new URLSearchParams());
      return shell(result.html || "");
    }

    if (Auth.isAdmin() && path0 === "manage") {
      const html = AdminApp.resolve(parts, params);
      if (html) return shell(html);
    }

    if (Auth.isWhatsApp() && path0 === "whatsapp") {
      const html = WhatsAppApp.resolve(parts);
      if (html) return shell(html);
    }

    if (Auth.isTeacher() && path0 === "my") {
      const result = await TeacherApp.resolve(parts, params);
      return shell(result.html || "");
    }

    if (parts[0] === "search") {
      const q = params.get("q") || state.searchQuery || "";
      state.searchQuery = q;
      return viewSearch(q);
    }

    if (parts.length === 0 || parts[0] === "home") return viewHome();

    if (parts[0] === "teachers") return viewTeachersDirectory(params);
    if (parts[0] === "students") return viewStudentsDirectory(params);

    if (parts[0] === "dept" && (parts[1] === "primary" || parts[1] === "middle")) {
      const deptId = parts[1];
      if (parts.length === 2) return viewLevels(deptId);
      if (parts[2] === "level" && parts[3]) {
        if (parts.length === 4) return viewClasses(deptId, parts[3]);
        if (parts[4] === "class" && parts[5]) {
          return viewClassDetail(deptId, parts[3], parts[5]);
        }
      }
    }

    if (parts[0] === "student" && parts[1]) {
      return viewStudent(parts[1], state.route.params.get("from"));
    }
    if (parts[0] === "teacher" && parts[1]) {
      return viewTeacher(parts[1], state.route.params.get("from"));
    }

    return viewNotFound();
  }

  function bindEvents() {
    I18n.bind(app, () => render());
    bindPhotoViewer(app);

    document.getElementById("login-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = document.getElementById("password").value;
      const err = document.getElementById("login-error");
      const result = await Auth.login(password);
      if (!result.ok) {
        err.textContent = result.error || I18n.t("loginError");
        err.classList.add("show");
        return;
      }
      try {
        app.innerHTML = `<div class="login-page"><div class="login-card"><p>${esc(I18n.t("loading"))}</p></div></div>`;
        if (result.role !== "whatsapp" && result.role !== "teacher") {
          const data = await BBC_API.loadSchoolData();
          BBC_DATA.setData(data);
        }
        go(Auth.homePath());
        render();
      } catch (loadErr) {
        Auth.logout();
        err.textContent = loadErr.message || I18n.t("failedLoad");
        err.classList.add("show");
        render();
      }
    });

    document.getElementById("teacher-login-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const phone = document.getElementById("teacher-phone")?.value || "";
      const password = document.getElementById("teacher-password")?.value || "";
      const err = document.getElementById("teacher-login-error");
      const result = await Auth.login(password, { phone });
      if (!result.ok) {
        if (err) {
          err.textContent = result.error || I18n.t("loginError");
          err.classList.add("show");
        }
        return;
      }
      go(Auth.homePath());
      render();
    });

    document.getElementById("btn-logout")?.addEventListener("click", () => {
      Auth.logout();
      go("/");
      render();
    });

    document.getElementById("global-search")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = new FormData(e.target).get("q");
      state.searchQuery = String(q || "");
      go(`/search?q=${encodeURIComponent(state.searchQuery)}`);
    });

    const dirFilter = document.getElementById("dir-filter");
    if (dirFilter) {
      const dir = dirFilter.getAttribute("data-dir") || "teachers";
      dirFilter.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(dirFilter);
        const qs = new URLSearchParams();
        for (const [k, v] of fd.entries()) {
          if (String(v).trim()) qs.set(k, String(v).trim());
        }
        const qstr = qs.toString();
        go(qstr ? `/${dir}?${qstr}` : `/${dir}`);
      });
      dirFilter.querySelectorAll("select").forEach((sel) => {
        sel.addEventListener("change", () => dirFilter.requestSubmit());
      });
    }

    const classSearch = document.getElementById("class-search");
    if (classSearch) {
      const input = classSearch.querySelector("input");
      input?.addEventListener("input", () => {
        const q = (input.value || "").trim().toLowerCase();
        document.querySelectorAll("#student-table tbody tr").forEach((tr) => {
          const hay = tr.getAttribute("data-search") || "";
          tr.style.display = !q || hay.includes(q) ? "" : "none";
        });
      });
    }

    const moreBtn = document.getElementById("btn-more-details");
    const morePanel = document.getElementById("student-more-details");
    if (moreBtn && morePanel) {
      moreBtn.addEventListener("click", () => {
        const open = morePanel.hasAttribute("hidden");
        if (open) {
          morePanel.removeAttribute("hidden");
          moreBtn.setAttribute("aria-expanded", "true");
          moreBtn.textContent = I18n.t("hideDetails");
        } else {
          morePanel.setAttribute("hidden", "");
          moreBtn.setAttribute("aria-expanded", "false");
          moreBtn.textContent = I18n.t("moreDetails");
        }
      });
    }

    if (Auth.isAdmin()) {
      AdminApp.bind(app, (path) => {
        go(path);
        render();
      });
    }

    if (Auth.isWhatsApp()) {
      WhatsAppApp.bind(app, (path) => {
        go(path);
        render();
      });
    }

    if (Auth.isTeacher()) {
      TeacherApp.bind(app, (path) => {
        go(path);
        render();
      });
    }

    app.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const target = el.getAttribute("data-nav");
        if (!target) return;
        e.preventDefault();
        go(target.replace(/^#/, ""));
      });
    });
  }

  async function boot() {
    state.route = parseHash();
    if (Auth.isAuthenticated()) {
      try {
        app.innerHTML = `<div class="login-page"><div class="login-card"><p>${typeof I18n !== "undefined" ? I18n.t("loading") : "Loading…"}</p></div></div>`;
        if (!Auth.isWhatsApp() && !Auth.isTeacher()) {
          const data = await BBC_API.loadSchoolData();
          BBC_DATA.setData(data);
        }
      } catch (err) {
        Auth.logout();
        console.error(err);
      }
    }
    if (!location.hash || location.hash === "#") {
      location.hash = Auth.isAuthenticated() ? `#${Auth.homePath()}` : "#/";
    }
    render();
  }

  async function render() {
    state.route = parseHash();
    if (state.route.params.get("q")) {
      state.searchQuery = state.route.params.get("q") || "";
    }
    try {
      app.innerHTML = await resolveView();
      bindEvents();
    } catch (err) {
      console.error(err);
      app.innerHTML = `<div class="login-page"><div class="login-card"><h1>${esc(I18n.t("displayError"))}</h1><p>${esc(err.message || err)}</p><button type="button" class="btn btn-primary" id="btn-reload">${esc(I18n.t("reload"))}</button></div></div>`;
      document.getElementById("btn-reload")?.addEventListener("click", () => location.reload());
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", render);
  boot();
})();

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
    if (deptId === "preschool") return I18n.t("preschool");
    return DEPT_SHORT[deptId] || deptId;
  }

  function deptFullLabel(dept) {
    if (!dept) return "—";
    if (dept.id === "primary") return I18n.t("primaryDept");
    if (dept.id === "middle") return I18n.t("middleDept");
    if (dept.id === "preschool") return I18n.t("preschoolDept");
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
    const hash = (location.hash || "").replace(/^#/, "") || "/";
    const onManage = hash === "/manage" || hash.startsWith("/manage/");
    const onWa = hash === "/whatsapp" || hash.startsWith("/whatsapp/");
    const onPreschool = hash === "/preschool" || hash.startsWith("/preschool/");
    const onEnterTeacher = hash === "/enter-teacher" || hash.startsWith("/enter-teacher");
    const isStaff = Auth.isAdmin() || (Auth.isGlobalView() && onManage);
    const isWa = Auth.isWhatsApp() || (Auth.isGlobalView() && onWa);
    const isPreschool = Auth.isPreschool() || (Auth.isGlobalView() && onPreschool);
    const isTeacher = Auth.isTeacher();
    const isFloor = Auth.isFloor();
    const isDirector = Auth.isDirector();
    const impersonating = Auth.isImpersonating();
    const lockedRole =
      isTeacher || isFloor || Auth.isAdmin() || Auth.isWhatsApp() || Auth.isPreschool();
    const homeNav = `#${Auth.homePath()}`;
    const subtitle = Auth.isAdmin()
      ? I18n.t("adminConsole")
      : Auth.isWhatsApp()
        ? I18n.t("whatsappConsole")
        : Auth.isPreschool()
          ? I18n.t("preschoolPortal")
          : isTeacher
            ? I18n.t("teacherPortal")
            : isFloor
              ? I18n.t("floorPortal")
              : I18n.t("portal");

    const directorNav =
      isDirector && !impersonating
        ? Auth.isGlobalView()
          ? `<nav class="director-navbar" aria-label="${esc(I18n.t("otherInterfaces"))}">
            <button type="button" class="director-nav-btn${hash === "/home" || hash === "/" || hash === "" ? " is-active" : ""}" data-nav="#/home">${esc(I18n.t("home"))}</button>
            <button type="button" class="director-nav-btn${onManage ? " is-active" : ""}" data-nav="#/manage">${esc(I18n.t("openManage"))}</button>
            <button type="button" class="director-nav-btn${onWa ? " is-active" : ""}" data-nav="#/whatsapp">${esc(I18n.t("openWhatsapp"))}</button>
            <button type="button" class="director-nav-btn${onPreschool ? " is-active" : ""}" data-nav="#/preschool">${esc(I18n.t("openPreschool"))}</button>
            <button type="button" class="director-nav-btn${onEnterTeacher ? " is-active" : ""}" data-nav="#/enter-teacher">${esc(I18n.t("openTeacherPortals"))}</button>
          </nav>`
          : `<nav class="director-navbar" aria-label="${esc(I18n.t("home"))}">
            <button type="button" class="director-nav-btn${hash === "/home" || hash === "/" || hash === "" ? " is-active" : ""}" data-nav="#/home">${esc(I18n.t("home"))}</button>
            <button type="button" class="director-nav-btn${hash.startsWith("/timetable") ? " is-active" : ""}" data-nav="#/timetable">${esc(I18n.t("timetableOverview") || "Timetables")}</button>
            <button type="button" class="director-nav-btn${hash.startsWith("/floor-reports") ? " is-active" : ""}" data-nav="#/floor-reports">${esc(I18n.t("floorReportsInbox"))}</button>
          </nav>`
        : "";

    const impersonationBar = impersonating
      ? `<div class="impersonation-bar">
          <span>${esc(I18n.t("viewingAsTeacher", { name: BBC_API.impersonateName() || "…" }))}</span>
          <button type="button" class="btn btn-primary btn-sm" id="btn-exit-impersonation">${esc(I18n.t("backToDirector"))}</button>
        </div>`
      : "";

    // Global search + director nav only for the director home console
    const showGlobalSearch = isDirector && !impersonating && !onManage && !onWa;
    const globalSearch = showGlobalSearch
      ? `<form class="top-search" id="global-search" autocomplete="off">
            <input type="search" name="q" placeholder="${esc(I18n.t("searchPlaceholder"))}" value="${esc(state.searchQuery)}" />
            <button type="submit" class="btn btn-primary btn-search" aria-label="${esc(I18n.t("search"))}">${icons.search}</button>
          </form>`
      : "";
    const directorTools =
      directorNav || globalSearch
        ? `<div class="director-top-tools">${directorNav}${globalSearch}</div>`
        : "";

    return `
      <div class="app-shell${isStaff || isWa || isTeacher || isFloor || lockedRole ? " app-shell-staff" : ""}">
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
          ${directorTools}
          ${impersonationBar}
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
            <span class="muted"> · </span>
            <button type="button" class="link-btn" data-nav="#/floor-login">${esc(I18n.t("floorLoginLink"))}</button>
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
              <label for="teacher-login-code">${esc(I18n.t("teacherLoginId"))}</label>
              <input id="teacher-login-code" name="loginCode" type="text" inputmode="text" autocomplete="username" placeholder="${esc(I18n.t("teacherLoginIdPlaceholder"))}" required autofocus style="text-transform:uppercase" />
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
            <span class="muted"> · </span>
            <button type="button" class="link-btn" data-nav="#/floor-login">${esc(I18n.t("floorLoginLink"))}</button>
          </p>
        </div>
      </div>
    `;
  }

  function viewFloorLogin() {
    return `
      <div class="login-page">
        <div class="login-card">
          <div class="login-lang">${I18n.langSwitcher()}</div>
          <div class="login-brand">
            <img src="assets/logo.png?v=2" alt="${esc(I18n.t("brand"))}" width="88" height="88" />
            <div>
              <h1>${esc(I18n.t("floorPortal"))}</h1>
              <p class="login-hint">${esc(I18n.t("floorLoginHint"))}</p>
            </div>
          </div>
          <form class="login-form" id="floor-login-form" autocomplete="on">
            <div class="field">
              <label for="floor-login-code">${esc(I18n.t("floorLoginId"))}</label>
              <input id="floor-login-code" name="loginCode" type="text" inputmode="text" autocomplete="username" placeholder="${esc(I18n.t("floorLoginIdPlaceholder"))}" required autofocus style="text-transform:uppercase" />
            </div>
            <div class="field">
              <label for="floor-password">${esc(I18n.t("password"))}</label>
              <input id="floor-password" name="password" type="password" placeholder="${esc(I18n.t("passwordPlaceholder"))}" required />
            </div>
            <div class="login-error" id="floor-login-error" role="alert"></div>
            <button type="submit" class="btn btn-primary">${esc(I18n.t("access"))}</button>
          </form>
          <p class="login-meta">${esc(I18n.t("welcomeAddress"))}</p>
          <p class="login-alt">
            <button type="button" class="link-btn" data-nav="#/">${esc(I18n.t("staffLoginLink"))}</button>
            <span class="muted"> · </span>
            <button type="button" class="link-btn" data-nav="#/teacher-login">${esc(I18n.t("teacherLoginLink"))}</button>
          </p>
        </div>
      </div>
    `;
  }

  function viewHome() {
    const stats = BBC_DATA.stats();
    const loc =
      I18n.getLang() === "ar" ? "ar" : I18n.getLang() === "fr" ? "fr-FR" : "en-US";
    const directorGates = Auth.isDirector()
      ? Auth.isGlobalView()
        ? `
      <div class="director-gates" role="navigation" aria-label="${esc(I18n.t("otherInterfaces"))}">
        <div class="director-gate-grid director-gate-grid-3">
          <button type="button" class="director-gate-card" data-nav="#/manage">
            <span class="director-gate-ico" aria-hidden="true">▦</span>
            <div>
              <strong>${esc(I18n.t("openManage"))}</strong>
              <p>${esc(I18n.t("openManageLede"))}</p>
            </div>
            <span class="cta">${esc(I18n.t("open"))}</span>
          </button>
          <button type="button" class="director-gate-card" data-nav="#/whatsapp">
            <span class="director-gate-ico" aria-hidden="true">◈</span>
            <div>
              <strong>${esc(I18n.t("openWhatsapp"))}</strong>
              <p>${esc(I18n.t("openWhatsappLede"))}</p>
            </div>
            <span class="cta">${esc(I18n.t("open"))}</span>
          </button>
          <button type="button" class="director-gate-card" data-nav="#/preschool">
            <span class="director-gate-ico" aria-hidden="true">◎</span>
            <div>
              <strong>${esc(I18n.t("openPreschool"))}</strong>
              <p>${esc(I18n.t("openPreschoolLede"))}</p>
            </div>
            <span class="cta">${esc(I18n.t("open"))}</span>
          </button>
          <button type="button" class="director-gate-card" data-nav="#/enter-teacher">
            <span class="director-gate-ico" aria-hidden="true">◇</span>
            <div>
              <strong>${esc(I18n.t("openTeacherPortals"))}</strong>
              <p>${esc(I18n.t("openTeacherPortalsLede"))}</p>
            </div>
            <span class="cta">${esc(I18n.t("open"))}</span>
          </button>
          <button type="button" class="director-gate-card" data-nav="#/timetable">
            <span class="director-gate-ico" aria-hidden="true">▦</span>
            <div>
              <strong>${esc(I18n.t("timetableOverview") || "Timetables")}</strong>
              <p>${esc(I18n.t("timetableOverviewLede") || "Weekly schedules for all primary classes")}</p>
            </div>
            <span class="cta">${esc(I18n.t("open"))}</span>
          </button>
          <button type="button" class="director-gate-card" data-nav="#/floor-access">
            <span class="director-gate-ico" aria-hidden="true">▣</span>
            <div>
              <strong>${esc(I18n.t("floorPortal"))}</strong>
              <p>${esc(I18n.t("floorPortalDirectorDesc"))}</p>
            </div>
            <span class="cta">${esc(I18n.t("open"))}</span>
          </button>
          <button type="button" class="director-gate-card" data-nav="#/floor-reports">
            <span class="director-gate-ico" aria-hidden="true">▤</span>
            <div>
              <strong>${esc(I18n.t("floorReportsInbox"))}</strong>
              <p>${esc(I18n.t("floorReportsInboxLede"))}</p>
            </div>
            <span class="cta">${esc(I18n.t("open"))}</span>
          </button>
        </div>
      </div>`
        : `
      <div class="director-gates" role="navigation" aria-label="${esc(I18n.t("otherInterfaces"))}">
        <div class="director-gate-grid director-gate-grid-3">
          <button type="button" class="director-gate-card" data-nav="#/timetable">
            <span class="director-gate-ico" aria-hidden="true">▦</span>
            <div>
              <strong>${esc(I18n.t("timetableOverview") || "Timetables")}</strong>
              <p>${esc(I18n.t("timetableOverviewLede") || "Weekly schedules for all primary classes")}</p>
            </div>
            <span class="cta">${esc(I18n.t("open"))}</span>
          </button>
          <button type="button" class="director-gate-card" data-nav="#/floor-reports">
            <span class="director-gate-ico" aria-hidden="true">▤</span>
            <div>
              <strong>${esc(I18n.t("floorReportsInbox"))}</strong>
              <p>${esc(I18n.t("floorReportsInboxLede"))}</p>
            </div>
            <span class="cta">${esc(I18n.t("open"))}</span>
          </button>
        </div>
      </div>`
      : "";
    return shell(`
      ${crumb([{ label: I18n.t("home"), to: "#/home" }])}
      <div class="page-header home-header">
        <h1>${esc(I18n.t("dashboard"))}</h1>
      </div>

      <div class="stats-row home-stats home-stats-top">
        <div class="stat-card"><div class="label">${esc(I18n.t("classes"))}</div><div class="value">${stats.classes}</div></div>
        <div class="stat-card"><div class="label">${esc(I18n.t("students"))}</div><div class="value">${stats.students.toLocaleString(loc)}</div></div>
        <div class="stat-card"><div class="label">${esc(I18n.t("teachersListed"))}</div><div class="value">${stats.teachers}</div></div>
      </div>

      ${directorGates}

      <div class="page-header" style="margin-bottom:0.85rem">
        <h2 class="section-title" style="margin:0">${esc(I18n.t("departments"))}</h2>
      </div>
      <div class="dept-grid">
        ${BBC_DATA.departments
          .map((d) => {
            const label =
              d.id === "primary"
                ? I18n.t("primary")
                : d.id === "middle"
                  ? I18n.t("middle")
                  : d.id === "preschool"
                    ? I18n.t("preschool")
                    : d.label || d.name;
            const desc =
              d.id === "primary"
                ? I18n.t("primaryDesc")
                : d.id === "middle"
                  ? I18n.t("middleDesc")
                  : d.id === "preschool"
                    ? I18n.t("preschoolDesc")
                    : d.description || "";
            const img =
              d.image ||
              (d.id === "preschool"
                ? "assets/preschool-department.png"
                : d.id === "middle"
                  ? "assets/middle-department.png"
                  : "assets/primary-department.png");
            return `
          <button type="button" class="dept-card" data-nav="#/dept/${d.id}">
            <img src="${esc(img)}" alt="" loading="eager" />
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
          <button type="button" class="home-icon-tile home-photo-tile" data-nav="#/teachers">
            <span class="home-icon-pic home-photo-pic" aria-hidden="true">
              <img src="assets/home-teachers.jpg" alt="" loading="lazy" />
            </span>
            <strong class="home-photo-label">${esc(I18n.t("ourTeachers"))}</strong>
          </button>
          <button type="button" class="home-icon-tile home-photo-tile" data-nav="#/students">
            <span class="home-icon-pic home-photo-pic" aria-hidden="true">
              <img src="assets/home-students.jpg" alt="" loading="lazy" />
            </span>
            <strong class="home-photo-label">${esc(I18n.t("ourStudents"))}</strong>
          </button>
        </div>
      </div>
    `);
  }

  function viewEnterTeacher(params) {
    const q = (params?.get("q") || "").trim();
    const qLower = q.toLowerCase();
    const all = BBC_DATA.listAllTeachers();
    const filtered = !q
      ? all.slice(0, 40)
      : all.filter(({ teacher: t }) => {
          const hay = [
            t.id,
            t.loginCode,
            t.firstName,
            t.lastName,
            t.firstNameLatin,
            t.lastNameLatin,
            teacherLabel(t),
            teacherLatin(t),
            t.phone,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(qLower) || qLower.split(/\s+/).every((p) => hay.includes(p));
        });
    filtered.sort((a, b) =>
      teacherLabel(a.teacher).localeCompare(
        teacherLabel(b.teacher),
        I18n.getLang() === "ar" ? "ar" : I18n.getLang() === "fr" ? "fr" : "en"
      )
    );

    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        { label: I18n.t("openTeacherPortals"), to: "#/enter-teacher" },
      ])}
      <div class="page-header">
        <h1>${esc(I18n.t("openTeacherPortals"))}</h1>
        <p class="lede">${esc(I18n.t("openTeacherPortalsLede"))}</p>
      </div>
      <form class="filter-panel enter-teacher-search" id="enter-teacher-filter" autocomplete="off">
        <label class="field" style="flex:1;min-width:220px">
          <span>${esc(I18n.t("searchTeacher"))}</span>
          <input type="search" name="q" value="${esc(q)}" placeholder="${esc(I18n.t("searchTeacherPlaceholder"))}" autofocus />
        </label>
        <button type="submit" class="btn btn-primary">${esc(I18n.t("search"))}</button>
        ${q ? `<button type="button" class="btn btn-ghost" data-nav="#/enter-teacher">${esc(I18n.t("clearFilters"))}</button>` : ""}
      </form>
      <p class="muted" style="margin:0.75rem 0 1rem">${esc(
        q
          ? I18n.t("ofCount", { shown: filtered.length, total: all.length })
          : I18n.t("teacherSearchHint", { n: filtered.length })
      )}</p>
      <div class="enter-teacher-list">
        ${
          filtered.length
            ? filtered
                .map(({ teacher: t, classes }) => {
                  const latin = teacherLatin(t);
                  const code = t.loginCode || t.id;
                  return `
          <div class="enter-teacher-row">
            ${profileAvatar(t, "teacher")}
            <div class="enter-teacher-meta">
              <strong dir="auto">${esc(teacherLabel(t))}</strong>
              ${latin ? `<span class="dir-meta">${esc(latin)}</span>` : ""}
              <span class="dir-meta">${esc(I18n.t("teacherId"))}: ${esc(code)}${t.phone ? ` · ${esc(t.phone)}` : ""}</span>
              <span class="dir-meta">${esc((classes || []).map((c) => classDisplayCode(c.cls || c)).filter(Boolean).join(" · ") || "—")}</span>
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-enter-teacher="${esc(t.id)}">${esc(I18n.t("enterTeacherPortal"))}</button>
          </div>`;
                })
                .join("")
            : `<div class="empty-state"><p>${esc(I18n.t("noTeachersFound"))}</p></div>`
        }
      </div>
    `);
  }

  async function viewFloorAccess() {
    let managers = [];
    let err = "";
    try {
      const data = await BBC_API.get("/floor-managers");
      managers = data.managers || [];
    } catch (e) {
      err = e.message || I18n.t("failedLoad");
    }
    const deptLabel = (id) => {
      if (id === "middle") return I18n.t("middle");
      if (id === "primary") return I18n.t("primary");
      if (id === "preschool") return I18n.t("preschool");
      return id || "—";
    };
    const rows = managers.length
      ? managers
          .map(
            (m) => `
        <tr>
          <td><code>${esc(m.loginCode || m.id)}</code></td>
          <td dir="auto">${esc(I18n.getLang() === "ar" && m.floorLabelAr ? m.floorLabelAr : m.floorLabel || "")}</td>
          <td>${esc(m.managedYear != null ? m.managedYear : "—")}</td>
          <td>${esc(deptLabel(m.departmentId))}</td>
          <td>${esc(m.classCount != null ? m.classCount : "—")}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="5"><div class="admin-empty">${esc(err || I18n.t("failedLoad"))}</div></td></tr>`;

    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        { label: I18n.t("floorPortal"), to: "#/floor-access" },
      ])}
      <div class="page-header">
        <h1>${esc(I18n.t("floorPortal"))}</h1>
        <p class="lede">${esc(I18n.t("floorAccessLede"))}</p>
      </div>
      <div class="admin-panel" style="margin-bottom:1rem">
        <p class="admin-field-hint">${esc(I18n.t("floorAccessHint"))}</p>
        <p style="margin:0.75rem 0 0">
          <button type="button" class="btn btn-primary" data-nav="#/floor-login">${esc(I18n.t("floorLoginLink"))}</button>
        </p>
      </div>
      <div class="student-table-wrap">
        <table class="student-table">
          <thead>
            <tr>
              <th>${esc(I18n.t("floorLoginId"))}</th>
              <th>${esc(I18n.t("floorLabel"))}</th>
              <th>${esc(I18n.t("year"))}</th>
              <th>${esc(I18n.t("department"))}</th>
              <th>${esc(I18n.t("classes"))}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
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

      <div id="director-class-tt" class="tt-host" data-tt-class="${esc(cls.id)}" style="margin-bottom:1rem"></div>

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
                    <th class="col-photo">${esc(I18n.t("photo") || "Photo")}</th>
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
                      <td class="col-photo" data-label="${esc(I18n.t("photo") || "Photo")}">${profileAvatar(s, "student", "avatar-sm")}</td>
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

  function renderParentProfile(profile) {
    if (typeof ParentProfileView === "undefined") return "";
    return ParentProfileView.render(profile);
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
    const hasParent = !!(s.parentProfile && typeof s.parentProfile === "object");

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
          <p class="role">${esc(I18n.t("student"))} · ${esc(classDisplayCode(cls))} · ${esc(levelDisplayName(level))} · ${esc(short)}${hasParent ? ` · ${esc(I18n.t("parentFormLinkedBadge"))}` : ""}</p>
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
      ${
        hasParent
          ? renderParentProfile(s.parentProfile)
          : `<div class="info-panel" style="margin-top:1rem"><div class="panel-label">${esc(I18n.t("parentFormLinked"))}</div><p style="margin-top:0.5rem;color:var(--muted)">${esc(I18n.t("parentFormNotLinked"))}</p></div>`
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
              <option value="preschool"${dept === "preschool" ? " selected" : ""}>${esc(I18n.t("preschool"))}</option>
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
              <option value="preschool"${dept === "preschool" ? " selected" : ""}>${esc(I18n.t("preschool"))}</option>
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
        <div class="fact-card"><div class="k">${esc(I18n.t("teacherId"))}</div><div class="v">${esc(t.loginCode || t.id)}</div></div>
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

  function formatFloorReportTime(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString();
    } catch {
      return String(iso);
    }
  }

  function floorManagerLabel(m) {
    if (!m) return "";
    const base =
      I18n.getLang && I18n.getLang() === "ar" && m.floorLabelAr
        ? m.floorLabelAr
        : m.floorLabel || m.loginCode || "";
    const dept =
      m.departmentId === "middle"
        ? I18n.t("middle")
        : m.departmentId === "primary"
          ? I18n.t("primary")
          : "";
    const yearBit = m.managedYear != null ? `${I18n.t("year")} ${m.managedYear}` : "";
    return [base, dept && yearBit ? `${dept} · ${yearBit}` : yearBit || dept].filter(Boolean).join(" · ");
  }

  function renderDirectorReportList(items, emptyKey) {
    if (!items || !items.length) {
      return `<p class="muted floor-report-empty">${esc(I18n.t(emptyKey || "floorReportEmptySection"))}</p>`;
    }
    return `<ul class="floor-report-list">
      ${items
        .map((it) => {
          const cls = it.classCode || it.className || "";
          const who = it.studentName || it.teacherName || "—";
          const subj = it.subject ? ` · ${it.subject}` : "";
          const teacher = it.teacherName && it.studentName ? ` · ${it.teacherName}` : "";
          const remark = String(it.remark || it.homework || "").trim()
            ? `<div class="floor-report-remark" dir="auto">${esc(it.remark || it.homework)}</div>`
            : "";
          return `<li>
            <div class="floor-report-line">
              <strong>${esc(cls)}</strong>
              <span dir="auto">${esc(who)}</span>
              <span class="muted">${esc(subj)}${esc(teacher)}</span>
            </div>
            ${remark}
          </li>`;
        })
        .join("")}
    </ul>`;
  }

  function formatFloorInboxDay(iso, opts = {}) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
    try {
      const d = new Date(`${iso}T12:00:00`);
      const lang = I18n.getLang();
      const locale = lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-FR" : "en-GB";
      if (opts.weekdayOnly) {
        return d.toLocaleDateString(locale, { weekday: "short" });
      }
      if (opts.dayMonth) {
        return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
      }
      return d.toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function isoAddDays(iso, delta) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /** Sunday-start week containing iso date → 7 ISO days */
  function weekDaysContaining(iso) {
    const d = new Date(`${iso}T12:00:00`);
    const dow = d.getDay(); // 0=Sun
    const start = isoAddDays(iso, -dow);
    return Array.from({ length: 7 }, (_, i) => isoAddDays(start, i));
  }

  function formatWeekRangeLabel(weekDays) {
    if (!weekDays?.length) return "";
    const a = formatFloorInboxDay(weekDays[0], { dayMonth: true });
    const b = formatFloorInboxDay(weekDays[6], { dayMonth: true });
    const y = weekDays[6].slice(0, 4);
    return `${a} – ${b} ${y}`;
  }

  function floorInboxCard(it, date) {
    const m = it.manager || {};
    const sent = it.report?.status === "sent";
    const meta = it.formMeta || {};
    const s = it.summary || {};
    const chips = [];
    if (sent && meta.complaints) chips.push(I18n.t("floorReportMetaComplaints", { n: meta.complaints }));
    if (sent && meta.staffAbsences) chips.push(I18n.t("floorReportMetaAbsences", { n: meta.staffAbsences }));
    if (sent && meta.teacherLates) chips.push(I18n.t("floorReportMetaLates", { n: meta.teacherLates }));
    if (sent && meta.hasIncident) chips.push(I18n.t("floorReportMetaIncident"));
    if (sent && meta.cameraReview === "yes") chips.push(I18n.t("floorReportMetaCameras"));
    if (sent && meta.hasFloorNeeds) chips.push(I18n.t("floorReportMetaNeeds"));
    if (!sent) {
      chips.push(`${s.absent || 0} ${I18n.t("attendanceAbsent")}`);
      chips.push(`${s.late || 0} ${I18n.t("attendanceLate")}`);
    }
    const badge = sent
      ? `<span class="floor-report-status is-sent">${esc(I18n.t("floorReportSent"))}</span>`
      : `<span class="floor-report-status is-draft">${esc(I18n.t("floorReportNotSent"))}</span>`;
    const preview = sent && it.notesPreview
      ? `<p class="floor-report-preview" dir="auto">${esc(it.notesPreview)}</p>`
      : sent
        ? `<p class="muted">${esc(I18n.t("floorReportFormEmpty"))}</p>`
        : `<p class="muted">${esc(I18n.t("floorReportNoNotes"))}</p>`;
    return `
      <article class="floor-report-inbox-card${sent ? " is-sent" : " is-pending"}">
        <div class="floor-report-inbox-head">
          <div>
            <strong dir="auto">${esc(floorManagerLabel(m))}</strong>
            <div class="muted"><code>${esc(m.loginCode || "")}</code></div>
          </div>
          ${badge}
        </div>
        ${chips.length ? `<div class="floor-report-inbox-chips">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
        ${preview}
        <button type="button" class="btn ${sent ? "btn-primary" : "btn-ghost"}" data-nav="#/floor-reports/${esc(m.id)}?date=${esc(date)}">${esc(I18n.t("floorReportOpen"))}</button>
      </article>`;
  }

  async function viewFloorReportsInbox(params) {
    const requested = params?.get("date") || "";
    let data = { items: [], totals: {}, availableDates: [] };
    let err = "";
    try {
      const q = requested ? `?date=${encodeURIComponent(requested)}` : "";
      data = await BBC_API.get(`/director/floor-reports${q}`);
    } catch (e) {
      err = e.message || I18n.t("failedLoad");
    }
    const date = data.date || requested || new Date().toISOString().slice(0, 10);
    const totals = data.totals || {};
    const available = data.availableDates || [];
    const sentByDate = Object.fromEntries((available || []).map((d) => [d.date, d.sent || 0]));
    const suggested = data.suggestedDate || (available.find((d) => d.sent > 0)?.date ?? "");
    const todayIso = new Date().toISOString().slice(0, 10);
    const week = weekDaysContaining(date);
    const prevWeekAnchor = isoAddDays(week[0], -7);
    const nextWeekAnchor = isoAddDays(week[0], 7);
    const weekSentTotal = week.reduce((n, d) => n + (sentByDate[d] || 0), 0);

    const weekGrid = `<div class="floor-inbox-week" role="list">
      ${week
        .map((d) => {
          const sent = sentByDate[d] || 0;
          const active = d === date ? " is-active" : "";
          const has = sent > 0 ? " has-sent" : "";
          const isToday = d === todayIso ? " is-today" : "";
          return `<button type="button" class="floor-inbox-weekday${active}${has}${isToday}" role="listitem"
            data-nav="#/floor-reports?date=${esc(d)}"
            title="${esc(formatFloorInboxDay(d))}">
            <span class="floor-inbox-weekday-name">${esc(formatFloorInboxDay(d, { weekdayOnly: true }))}</span>
            <span class="floor-inbox-weekday-num">${esc(d.slice(8, 10))}</span>
            <span class="floor-inbox-weekday-count">${sent > 0 ? esc(I18n.t("floorReportSentCount", { n: sent })) : "·"}</span>
          </button>`;
        })
        .join("")}
    </div>`;

    const sentItems = (data.items || []).filter((it) => it.report?.status === "sent");
    const pendingItems = (data.items || []).filter((it) => it.report?.status !== "sent");

    const sentBlock = sentItems.length
      ? `<section class="floor-inbox-section">
          <h2 class="floor-inbox-section-title">${esc(I18n.t("floorReportSubmittedSection", { n: sentItems.length }))}</h2>
          <div class="floor-report-inbox-grid">${sentItems.map((it) => floorInboxCard(it, date)).join("")}</div>
        </section>`
      : `<section class="floor-inbox-empty">
          <h2>${esc(I18n.t("floorReportEmptyDay"))}</h2>
          <p class="lede">${esc(I18n.t("floorReportEmptyDayHint"))}</p>
          ${suggested && suggested !== date
            ? `<button type="button" class="btn btn-primary" data-nav="#/floor-reports?date=${esc(suggested)}">${esc(I18n.t("floorReportJumpLatest"))}</button>`
            : ""}
        </section>`;

    const pendingBlock = pendingItems.length
      ? `<details class="floor-inbox-pending" ${sentItems.length ? "" : "open"}>
          <summary>${esc(I18n.t("floorReportAwaitingSection", { n: pendingItems.length }))}</summary>
          <div class="floor-report-inbox-grid">${pendingItems.map((it) => floorInboxCard(it, date)).join("")}</div>
        </details>`
      : "";

    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        { label: I18n.t("floorReportsInbox"), to: `#/floor-reports?date=${esc(date)}` },
      ])}
      <div class="page-header floor-inbox-header">
        <h1>${esc(I18n.t("floorReportsInbox"))}</h1>
        <p class="lede">${esc(I18n.t("floorReportsInboxLede"))}</p>
      </div>

      <section class="floor-inbox-archive admin-panel">
        <div class="floor-inbox-archive-head">
          <div>
            <h2 class="floor-inbox-archive-title">${esc(I18n.t("floorReportWeekTitle"))}</h2>
            <p class="muted">${esc(formatWeekRangeLabel(week))} · ${esc(I18n.t("floorReportSentCount", { n: weekSentTotal }))}</p>
          </div>
          <form class="floor-inbox-datejump" id="director-floor-reports-date">
            <label class="admin-field">
              <span>${esc(I18n.t("floorReportPickDate"))}</span>
              <input type="date" name="date" value="${esc(date)}" required />
            </label>
          </form>
        </div>
        <div class="floor-inbox-weekbar">
          <button type="button" class="btn btn-ghost floor-inbox-week-nav" data-nav="#/floor-reports?date=${esc(prevWeekAnchor)}">${esc(I18n.t("floorReportPrevWeek"))}</button>
          <button type="button" class="btn btn-ghost floor-inbox-week-nav" data-nav="#/floor-reports?date=${esc(todayIso)}">${esc(I18n.t("floorReportThisWeek"))}</button>
          <button type="button" class="btn btn-ghost floor-inbox-week-nav" data-nav="#/floor-reports?date=${esc(nextWeekAnchor)}">${esc(I18n.t("floorReportNextWeek"))}</button>
        </div>
        ${weekGrid}
      </section>

      <div class="floor-inbox-daybar">
        <div>
          <div class="floor-inbox-day-label">${esc(I18n.t("sessionDate"))}</div>
          <strong class="floor-inbox-day-value">${esc(formatFloorInboxDay(date))}</strong>
        </div>
        <div class="floor-inbox-day-stats">
          <span class="floor-inbox-stat is-sent">${esc(I18n.t("floorReportSentCount", { n: totals.sent || 0 }))}</span>
          <span class="floor-inbox-stat">${esc(I18n.t("floorReportPendingCount", { n: totals.pending || 0 }))}</span>
          <span class="floor-inbox-stat">${totals.absent || 0} ${esc(I18n.t("attendanceAbsent"))}</span>
          <span class="floor-inbox-stat">${totals.late || 0} ${esc(I18n.t("attendanceLate"))}</span>
        </div>
      </div>

      ${err ? `<div class="admin-empty is-err">${esc(err)}</div>` : ""}
      ${sentBlock}
      ${pendingBlock}
    `);
  }

  function ynLabel(v) {
    if (v === "yes" || v === true) return I18n.t("yes");
    if (v === "no" || v === false) return I18n.t("no");
    return I18n.t("floorReportNone");
  }

  function roleLabel(role) {
    const map = {
      teacher: "floorReportRoleTeacher",
      assistant: "floorReportRoleAssistant",
      admin: "floorReportRoleAdmin",
      other: "floorReportRoleOther",
    };
    return map[role] ? I18n.t(map[role]) : role || I18n.t("floorReportNone");
  }

  function renderDirectorFormCard(report, manager, date) {
    const form = report?.form || {};
    const complaints = (form.complaints || []).map((c) => String(c || "").trim()).filter(Boolean);
    const staff = (form.staffAbsences || []).filter((r) => r.name || r.role || r.substitute);
    const lates = (form.teacherLates || []).filter(
      (r) => r.teacherId || r.teacherName || r.duration || r.substitute
    );
    const empty = (html) =>
      html || `<p class="muted floor-report-empty">${esc(I18n.t("floorReportFormEmpty"))}</p>`;

    return `
      <section class="admin-panel floor-report-notes-panel">
        <div class="admin-panel-label">${esc(I18n.t("floorReportCardTitle"))}</div>
        <div class="floor-report-meta facts-grid" style="margin-top:0.75rem">
          <div class="fact-card">
            <div class="k">${esc(I18n.t("floorLabel"))}</div>
            <div class="v" dir="auto">${esc(floorManagerLabel(manager))}</div>
          </div>
          <div class="fact-card">
            <div class="k">${esc(I18n.t("sessionDate"))}</div>
            <div class="v">${esc(date)}</div>
          </div>
          <div class="fact-card">
            <div class="k">${esc(I18n.t("floorReportTimeFrom"))} → ${esc(I18n.t("floorReportTimeTo"))}</div>
            <div class="v">${esc(form.timeFrom || "—")} – ${esc(form.timeTo || "—")}</div>
          </div>
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-label">${esc(I18n.t("floorReportComplaints"))}</div>
        ${empty(
          complaints.length
            ? `<ol class="floor-report-complaint-list" dir="auto">${complaints
                .map((c) => `<li>${esc(c)}</li>`)
                .join("")}</ol>`
            : ""
        )}
      </section>

      <section class="admin-panel">
        <div class="floor-report-split">
          <div class="fact-card">
            <div class="k">${esc(I18n.t("floorReportProblemsSolved"))}</div>
            <div class="v">${esc(String(form.problemsSolved ?? 0))}</div>
          </div>
          <div class="fact-card">
            <div class="k">${esc(I18n.t("floorReportParentReplied"))}</div>
            <div class="v">${esc(ynLabel(form.parentResponded))}</div>
          </div>
        </div>
        <div class="admin-field" style="margin-top:0.75rem">
          <span>${esc(I18n.t("floorReportActionsTaken"))}</span>
          ${
            String(form.actionsTaken || "").trim()
              ? `<p class="floor-report-notes-body" dir="auto">${esc(form.actionsTaken)}</p>`
              : `<p class="muted">${esc(I18n.t("floorReportFormEmpty"))}</p>`
          }
        </div>
        <div class="admin-field" style="margin-top:0.75rem">
          <span>${esc(I18n.t("floorReportAdminEscalation"))}</span>
          ${
            String(form.adminEscalation || "").trim()
              ? `<p class="floor-report-notes-body" dir="auto">${esc(form.adminEscalation)}</p>`
              : `<p class="muted">${esc(I18n.t("floorReportFormEmpty"))}</p>`
          }
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-label">${esc(I18n.t("floorReportFloorNeeds"))}</div>
        ${
          String(form.floorNeeds || "").trim()
            ? `<p class="floor-report-notes-body" dir="auto">${esc(form.floorNeeds)}</p>`
            : `<p class="muted">${esc(I18n.t("floorReportFormEmpty"))}</p>`
        }
      </section>

      <section class="admin-panel">
        <div class="admin-panel-label">${esc(I18n.t("floorReportStaffAbsences"))}</div>
        ${
          staff.length
            ? `<div class="floor-report-table-wrap"><table class="floor-report-table">
                <thead><tr>
                  <th>${esc(I18n.t("floorReportAbsentName"))}</th>
                  <th>${esc(I18n.t("floorReportRole"))}</th>
                  <th>${esc(I18n.t("floorReportSubstitute"))}</th>
                </tr></thead>
                <tbody>${staff
                  .map(
                    (r) => `<tr>
                      <td dir="auto">${esc(r.name || "—")}</td>
                      <td>${esc(roleLabel(r.role))}</td>
                      <td dir="auto">${esc(r.substitute || "—")}</td>
                    </tr>`
                  )
                  .join("")}</tbody>
              </table></div>`
            : `<p class="muted">${esc(I18n.t("floorReportFormEmpty"))}</p>`
        }
      </section>

      <section class="admin-panel">
        <div class="admin-panel-label">${esc(I18n.t("floorReportTeacherLates"))}</div>
        ${
          lates.length
            ? `<div class="floor-report-table-wrap"><table class="floor-report-table">
                <thead><tr>
                  <th>${esc(I18n.t("floorReportLateTeacher"))}</th>
                  <th>${esc(I18n.t("floorReportDuration"))}</th>
                  <th>${esc(I18n.t("floorReportSubstitute"))}</th>
                </tr></thead>
                <tbody>${lates
                  .map(
                    (r) => `<tr>
                      <td dir="auto">${esc(r.teacherName || "—")}</td>
                      <td dir="auto">${esc(r.duration || "—")}</td>
                      <td dir="auto">${esc(r.substitute || "—")}</td>
                    </tr>`
                  )
                  .join("")}</tbody>
              </table></div>`
            : `<p class="muted">${esc(I18n.t("floorReportFormEmpty"))}</p>`
        }
      </section>

      <section class="admin-panel">
        <div class="admin-panel-label">${esc(I18n.t("floorReportIncident"))}</div>
        ${
          String(form.incident || "").trim()
            ? `<p class="floor-report-notes-body" dir="auto">${esc(form.incident)}</p>`
            : `<p class="muted">${esc(I18n.t("floorReportFormEmpty"))}</p>`
        }
        <div class="fact-card" style="margin-top:0.75rem">
          <div class="k">${esc(I18n.t("floorReportCameraReview"))}</div>
          <div class="v">${esc(ynLabel(form.cameraReview))}</div>
        </div>
      </section>

      <section class="admin-panel floor-report-notes-panel">
        <div class="admin-panel-label">${esc(I18n.t("floorReportExtraNotes"))}</div>
        ${
          String(report?.notes || "").trim()
            ? `<p class="floor-report-notes-body" dir="auto">${esc(report.notes)}</p>`
            : `<p class="muted">${esc(I18n.t("floorReportNoNotes"))}</p>`
        }
      </section>`;
  }

  async function viewFloorReportDetail(managerId, params) {
    const date = params?.get("date") || new Date().toISOString().slice(0, 10);
    let payload = null;
    let err = "";
    try {
      payload = await BBC_API.get(
        `/director/floor-reports/${encodeURIComponent(managerId)}?date=${encodeURIComponent(date)}`
      );
    } catch (e) {
      err = e.message || I18n.t("failedLoad");
    }
    if (!payload) {
      return shell(`
        ${crumb([
          { label: I18n.t("home"), to: "#/home" },
          { label: I18n.t("floorReportsInbox"), to: "#/floor-reports" },
        ])}
        <div class="admin-empty is-err">${esc(err)}</div>
      `);
    }
    const m = payload.manager || {};
    const report = payload.report || {};
    const summary = payload.summary || {};
    const sent = report.status === "sent";
    const statusChip = sent
      ? `<span class="floor-report-status is-sent">${esc(I18n.t("floorReportSent"))}</span>`
      : `<span class="floor-report-status is-draft">${esc(I18n.t("floorReportNotSent"))}</span>`;

    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        { label: I18n.t("floorReportsInbox"), to: `#/floor-reports?date=${encodeURIComponent(date)}` },
        { label: floorManagerLabel(m), to: `#/floor-reports/${encodeURIComponent(managerId)}?date=${encodeURIComponent(date)}` },
      ])}
      <div class="page-header">
        <h1 dir="auto">${esc(floorManagerLabel(m))}</h1>
        <p class="lede">${esc(date)} · <code>${esc(m.loginCode || "")}</code></p>
      </div>
      <div class="floor-report-status-row" style="margin-bottom:1rem">
        ${statusChip}
        ${
          sent && report.submittedAt
            ? `<span class="muted">${esc(I18n.t("floorReportSentAt", { time: formatFloorReportTime(report.submittedAt) }))}</span>`
            : ""
        }
        <div class="register-summary" style="margin-inline-start:auto">
          <span>${summary.absent || 0} ${esc(I18n.t("attendanceAbsent"))}</span>
          · <span>${summary.late || 0} ${esc(I18n.t("attendanceLate"))}</span>
          · <span>${summary.remarks || 0} ${esc(I18n.t("remark"))}</span>
        </div>
      </div>
      <div class="floor-report-grid">
        <section class="floor-report-section">
          <h3>${esc(I18n.t("floorReportAutoAbsences"))} <span class="chip neutral">${esc(String(summary.absent || 0))}</span></h3>
          ${renderDirectorReportList(payload.absences)}
        </section>
        <section class="floor-report-section">
          <h3>${esc(I18n.t("floorReportAutoLate"))} <span class="chip neutral">${esc(String(summary.late || 0))}</span></h3>
          ${renderDirectorReportList(payload.late)}
        </section>
        <section class="floor-report-section">
          <h3>${esc(I18n.t("floorReportAutoRemarks"))} <span class="chip neutral">${esc(String(summary.remarks || 0))}</span></h3>
          ${renderDirectorReportList(payload.remarks)}
        </section>
        <section class="floor-report-section">
          <h3>${esc(I18n.t("floorReportAutoHomework"))} <span class="chip neutral">${esc(String(summary.homework || 0))}</span></h3>
          ${
            !(payload.homework || []).length
              ? `<p class="muted floor-report-empty">${esc(I18n.t("floorReportEmptySection"))}</p>`
              : `<ul class="floor-report-list">
                  ${(payload.homework || [])
                    .map(
                      (h) => `<li>
                        <div class="floor-report-line">
                          <strong>${esc(h.classCode || "")}</strong>
                          <span class="muted">${esc(h.subject || "")}${h.teacherName ? ` · ${esc(h.teacherName)}` : ""}</span>
                        </div>
                        <div class="floor-report-remark" dir="auto">${esc(h.homework || "")}</div>
                      </li>`
                    )
                    .join("")}
                </ul>`
          }
        </section>
      </div>
      ${renderDirectorFormCard(report, m, date)}
      <p style="margin-top:1rem">
        <button type="button" class="btn btn-ghost" data-nav="#/floor-reports?date=${esc(date)}">${esc(I18n.t("floorReportBackInbox"))}</button>
      </p>
    `);
  }

  function viewTimetableOverview() {
    return shell(`
      ${crumb([
        { label: I18n.t("home"), to: "#/home" },
        { label: I18n.t("timetableOverview") || "Timetables", to: "#/timetable" },
      ])}
      <div class="page-header">
        <h1>${esc(I18n.t("timetableOverview") || "Timetables")}</h1>
        <p class="lede">${esc(I18n.t("timetableOverviewLede") || "Weekly schedules for all primary classes")}</p>
      </div>
      <div id="director-tt-overview" class="tt-host" data-tt-director="primary"></div>
    `);
  }

  async function resolveView() {
    const { parts, params } = state.route;
    const path0 = parts[0] || "home";

    if (!Auth.isAuthenticated()) {
      if (path0 === "teacher-login") return viewTeacherLogin();
      if (path0 === "floor-login") return viewFloorLogin();
      return viewLogin();
    }

    // Hard isolation: non-director roles cannot open any other interface via URL hash
    if (!Auth.canAccessPath(path0)) {
      const home = Auth.homePath();
      if (`/${path0}` !== home && path0 !== home.replace(/^\//, "")) {
        go(home);
      }
      if (Auth.isTeacher()) {
        const result = await TeacherApp.resolve(["my"], new URLSearchParams());
        return shell(result.html || "");
      }
      if (Auth.isFloor()) {
        const result = await FloorApp.resolve(["floor"], new URLSearchParams());
        return shell(result.html || "");
      }
      if (Auth.isAdmin()) {
        const html = AdminApp.resolve(["manage"], new URLSearchParams());
        return shell(html || "");
      }
      if (Auth.isWhatsApp()) {
        const html = WhatsAppApp.resolve(["whatsapp"]);
        return shell(html || "");
      }
      if (Auth.isPreschool()) {
        const html = await PreschoolApp.render(["preschool"]);
        return shell(html || "");
      }
      go("/home");
      return viewHome();
    }

    if (Auth.canManage() && path0 === "manage") {
      const html = AdminApp.resolve(parts, params);
      if (html) return shell(html);
    }

    if (Auth.canWhatsApp() && path0 === "whatsapp") {
      const html = WhatsAppApp.resolve(parts);
      if (html) return shell(html);
    }

    if (Auth.canPreschool() && path0 === "preschool") {
      const html = await PreschoolApp.render(parts);
      return shell(html || "");
    }

    if (Auth.isTeacher() && path0 === "my") {
      const result = await TeacherApp.resolve(parts, params);
      return shell(result.html || "");
    }

    if (Auth.isFloor() && path0 === "floor") {
      const result = await FloorApp.resolve(parts, params);
      return shell(result.html || "");
    }

    // ——— Director-only surfaces below ———
    if (!Auth.isDirector()) {
      go(Auth.homePath());
      return viewHome();
    }

    if (path0 === "enter-teacher") {
      if (!Auth.isGlobalView()) {
        go("/home");
        return viewHome();
      }
      return viewEnterTeacher(params);
    }

    if (path0 === "floor-access" || path0 === "floor-login") {
      if (!Auth.isGlobalView()) {
        go("/home");
        return viewHome();
      }
      return await viewFloorAccess();
    }

    if (path0 === "floor-reports") {
      if (parts[1]) return await viewFloorReportDetail(parts[1], params);
      return await viewFloorReportsInbox(params);
    }

    if (path0 === "timetable") {
      return viewTimetableOverview();
    }

    if (path0 === "search") {
      const q = params.get("q") || state.searchQuery || "";
      state.searchQuery = q;
      return viewSearch(q);
    }

    if (parts.length === 0 || path0 === "home") return viewHome();

    if (path0 === "teachers") return viewTeachersDirectory(params);
    if (path0 === "students") return viewStudentsDirectory(params);

    if (path0 === "dept" && (parts[1] === "primary" || parts[1] === "middle" || parts[1] === "preschool")) {
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
        if (
          result.role !== "whatsapp" &&
          result.role !== "teacher" &&
          result.role !== "floor" &&
          result.role !== "preschool"
        ) {
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
      const loginCode = document.getElementById("teacher-login-code")?.value || "";
      const password = document.getElementById("teacher-password")?.value || "";
      const err = document.getElementById("teacher-login-error");
      const result = await Auth.login(password, { loginCode });
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

    document.getElementById("floor-login-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const loginCode = document.getElementById("floor-login-code")?.value || "";
      const password = document.getElementById("floor-password")?.value || "";
      const err = document.getElementById("floor-login-error");
      const result = await Auth.login(password, { loginCode });
      if (!result.ok) {
        if (err) {
          err.textContent = result.error || I18n.t("loginError");
          err.classList.add("show");
        }
        return;
      }
      if (typeof FloorApp !== "undefined" && FloorApp.reset) FloorApp.reset();
      go(Auth.homePath());
      render();
    });

    document.getElementById("btn-logout")?.addEventListener("click", () => {
      Auth.logout();
      go("/");
      render();
    });

    document.getElementById("btn-exit-impersonation")?.addEventListener("click", () => {
      if (Auth.exitToDirector()) {
        go("/home");
        render();
      }
    });

    document.getElementById("enter-teacher-filter")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = String(new FormData(e.target).get("q") || "").trim();
      go(q ? `/enter-teacher?q=${encodeURIComponent(q)}` : "/enter-teacher");
    });

    app.querySelectorAll("[data-enter-teacher]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-enter-teacher");
        if (!id) return;
        btn.disabled = true;
        try {
          await BBC_API.enterAsTeacher(id);
          if (typeof TeacherApp !== "undefined" && TeacherApp.reset) TeacherApp.reset();
          go("/my");
          render();
        } catch (err) {
          btn.disabled = false;
          alert(err.message || I18n.t("failedLoad"));
        }
      });
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

    const loadClassTt = async () => {
      const host = document.getElementById("director-class-tt");
      if (!host || host.dataset.loaded === "1") return;
      const cid = host.getAttribute("data-tt-class");
      if (!cid) return;
      try {
        host.innerHTML = `<p class="muted">${esc(I18n.t("loading") || "…")}</p>`;
        const data = await BBC_API.get(`/timetable/class/${encodeURIComponent(cid)}`);
        host.innerHTML = window.QEATimetable
          ? window.QEATimetable.renderGrid(data, {
              title: I18n.t("classTimetable") || "Class timetable",
            })
          : "";
        host.dataset.loaded = "1";
      } catch (err) {
        host.innerHTML = `<p class="muted">${esc(err.message || "")}</p>`;
      }
    };
    loadClassTt();

    const loadDirectorTt = async () => {
      const host = document.getElementById("director-tt-overview");
      if (!host || host.dataset.loaded === "1") return;
      try {
        host.innerHTML = `<p class="muted">${esc(I18n.t("loading") || "…")}</p>`;
        const data = await BBC_API.get("/timetable/director?dept=primary");
        host.innerHTML = window.QEATimetable
          ? window.QEATimetable.renderDirectorOverview(data)
          : "";
        host.dataset.loaded = "1";
        host.querySelectorAll("[data-tt-jump]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const y = btn.getAttribute("data-tt-jump");
            host.querySelectorAll(".tt-year-tab").forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");
            const panel = host.querySelector(`[data-tt-year="${y}"]`);
            if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        });
      } catch (err) {
        host.innerHTML = `<p class="muted">${esc(err.message || "")}</p>`;
      }
    };
    loadDirectorTt();

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

    document.getElementById("director-floor-reports-date")?.addEventListener("change", (e) => {
      if (e.target?.name === "date") {
        const date = e.target.value;
        go(`/floor-reports?date=${encodeURIComponent(date)}`);
      }
    });

    if (Auth.canManage()) {
      AdminApp.bind(app, (path) => {
        go(path);
        render();
      });
    }

    if (Auth.canWhatsApp()) {
      WhatsAppApp.bind(app, (path) => {
        go(path);
        render();
      });
    }

    if (Auth.canPreschool()) {
      PreschoolApp.bind(app);
    }

    if (Auth.isTeacher()) {
      TeacherApp.bind(app, (path) => {
        go(path);
        render();
      });
    }

    if (Auth.isFloor()) {
      FloorApp.bind(app, (path) => {
        go(path);
        render();
      });
    }

    app.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const target = el.getAttribute("data-nav");
        if (!target) return;
        e.preventDefault();
        const path = target.replace(/^#/, "");
        // Strip ?query before reading the first segment (e.g. /floor-reports?date=…)
        const path0 = path.split("?")[0].replace(/^\//, "").split("/")[0] || "home";
        if (Auth.isAuthenticated() && !Auth.canAccessPath(path0)) {
          go(Auth.homePath());
          return;
        }
        go(path);
      });
    });
  }

  async function boot() {
    state.route = parseHash();
    if (Auth.isAuthenticated()) {
      try {
        app.innerHTML = `<div class="login-page"><div class="login-card"><p>${typeof I18n !== "undefined" ? I18n.t("loading") : "Loading…"}</p></div></div>`;
        if (!Auth.isWhatsApp() && !Auth.isTeacher() && !Auth.isFloor() && !Auth.isPreschool()) {
          let data = null;
          let lastErr = null;
          for (let i = 0; i < 3; i++) {
            try {
              data = await BBC_API.loadSchoolData();
              lastErr = null;
              break;
            } catch (err) {
              lastErr = err;
              await new Promise((r) => setTimeout(r, 600 * (i + 1)));
            }
          }
          if (lastErr) throw lastErr;
          BBC_DATA.setData(data);
        }
      } catch (err) {
        Auth.logout();
        console.error(err);
        app.innerHTML = `<div class="login-page"><div class="login-card"><h1>${esc(I18n.t("failedLoad"))}</h1><p class="lede">${esc(err.message || err)}</p><button type="button" class="btn btn-primary" id="btn-reload">${esc(I18n.t("reload"))}</button></div></div>`;
        document.getElementById("btn-reload")?.addEventListener("click", () => location.reload());
        return;
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

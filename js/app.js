/**
 * BBC School Administration — SPA router & views
 * Flow: Departments → Floors → Classes → Class detail → Teacher
 */

(() => {
  const app = document.getElementById("app");
  const state = {
    route: parseHash(),
  };

  const icons = {
    users: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  };

  const DEPT_SHORT = {
    primary: "Primary",
    middle: "Middle School",
  };

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

  function initials(first, last) {
    return `${(first || "?")[0]}${(last || "?")[0]}`.toUpperCase();
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shell(content) {
    const { school } = BBC_DATA;
    return `
      <div class="app-shell">
        <header class="topbar">
          <button type="button" class="topbar-brand" data-nav="#/home" aria-label="Home">
            <img src="assets/logo.png" alt="BBC School" width="44" height="44" />
            <div>
              <strong>${esc(school.name)}</strong>
              <span>Administration Portal</span>
            </div>
          </button>
          <div class="topbar-actions">
            <span class="badge-year">${esc(school.academicYear)}</span>
            <button type="button" class="btn btn-ghost" id="btn-logout">Sign out</button>
          </div>
        </header>
        <main class="page">${content}</main>
      </div>
    `;
  }

  function crumb(items) {
    return `
      <nav class="breadcrumb" aria-label="Breadcrumb">
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
          <div class="login-brand">
            <img src="assets/logo.png" alt="BBC School" width="88" height="88" />
            <div>
              <h1>BBC School</h1>
              <p>Administration access only — confidential information</p>
            </div>
          </div>
          <form class="login-form" id="login-form" autocomplete="off">
            <div class="field">
              <label for="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Enter password"
                required
                autofocus
              />
            </div>
            <div class="login-error" id="login-error" role="alert"></div>
            <button type="submit" class="btn btn-primary">Access interface</button>
          </form>
          <p class="login-meta">${esc(BBC_DATA.school.address)}</p>
        </div>
      </div>
    `;
  }

  function viewHome() {
    const stats = BBC_DATA.stats();
    const depts = BBC_DATA.departments;
    return shell(`
      ${crumb([{ label: "Departments", to: "#/home" }])}
      <div class="page-header">
        <h1>Dashboard</h1>
        <p class="lede">Select a department to browse the academic structure and class information.</p>
      </div>
      <div class="stats-row">
        <div class="stat-card"><div class="label">Floors</div><div class="value"><em>${stats.floors}</em></div></div>
        <div class="stat-card"><div class="label">Classes</div><div class="value">${stats.classes}</div></div>
        <div class="stat-card"><div class="label">Students</div><div class="value">${stats.students.toLocaleString("en-US")}</div></div>
        <div class="stat-card"><div class="label">Teachers</div><div class="value">${stats.teachers}</div></div>
      </div>
      <div class="dept-grid">
        ${depts
          .map(
            (d) => `
              <button
                type="button"
                class="dept-card"
                data-nav="#/dept/${d.id}"
              >
                <img src="${esc(d.image)}" alt="" loading="eager" />
                <div class="overlay"></div>
                <div class="content">
                  <span class="eyebrow">${esc(d.label || d.name)}</span>
                  <h2>${esc(d.name)}</h2>
                  <p>${esc(d.description)}</p>
                  <span class="cta">Open department</span>
                </div>
              </button>
            `
          )
          .join("")}
      </div>
    `);
  }

  function viewFloors(deptId) {
    const dept = BBC_DATA.getDepartment(deptId);
    if (!dept) return viewNotFound();
    const short = DEPT_SHORT[deptId] || dept.name;
    const totalClasses = dept.floors.reduce((n, f) => n + f.classes.length, 0);
    return shell(`
      ${crumb([
        { label: "Departments", to: "#/home" },
        { label: short, to: `#/dept/${deptId}` },
      ])}
      <div class="page-header">
        <h1>${esc(dept.name)}</h1>
        <p class="lede">${dept.floors.length} floors — ${totalClasses} classes in total. Choose a floor to continue.</p>
      </div>
      <div class="floor-grid" style="grid-template-columns: repeat(${Math.min(dept.floors.length, 5)}, 1fr);">
        ${dept.floors
          .map(
            (f) => `
          <button type="button" class="floor-card" style="--accent:${esc(f.accent)}" data-nav="#/dept/${deptId}/floor/${f.id}">
            <span class="floor-num">${f.id}</span>
            <h3>${esc(f.name)}</h3>
            <p>${esc(f.subtitle)}</p>
            <div class="floor-meta">${f.classes.length} classes</div>
          </button>
        `
          )
          .join("")}
      </div>
    `;
  }

  function findFloor(deptId, floorId) {
    const dept = BBC_DATA.getDepartment(deptId);
    if (!dept) return null;
    return dept.floors.find((f) => String(f.id) === String(floorId)) || null;
  }

  function findClass(deptId, floorId, classId) {
    const floor = findFloor(deptId, floorId);
    if (!floor) return null;
    return {
      floor,
      cls: floor.classes.find((c) => c.id === classId),
    };
  }

  function viewClasses(deptId, floorId) {
    const dept = BBC_DATA.getDepartment(deptId);
    const floor = findFloor(deptId, floorId);
    if (!dept || !floor) return viewNotFound();
    const short = DEPT_SHORT[deptId] || dept.name;
    return shell(`
      ${crumb([
        { label: "Departments", to: "#/home" },
        { label: short, to: `#/dept/${deptId}` },
        { label: floor.name, to: `#/dept/${deptId}/floor/${floor.id}` },
      ])}
      <div class="page-header">
        <h1>${esc(floor.name)}</h1>
        <p class="lede">${esc(floor.subtitle)} — ${floor.classes.length} classes available.</p>
      </div>
      <div class="group-grid">
        ${floor.classes
          .map(
            (c) => `
          <button type="button" class="group-card" data-nav="#/dept/${deptId}/floor/${floor.id}/class/${c.id}">
            <div class="group-icon">${icons.users}</div>
            <h3>${esc(c.name)}</h3>
            <div class="code">Code ${esc(c.code)}</div>
            <div class="hint">${c.studentCount} students · ${c.teacherIds.length} teachers</div>
          </button>
        `
          )
          .join("")}
      </div>
    `);
  }

  function viewClassDetail(deptId, floorId, classId) {
    const dept = BBC_DATA.getDepartment(deptId);
    const found = findClass(deptId, floorId, classId);
    if (!dept || !found?.cls) return viewNotFound();
    const { floor, cls } = found;
    const short = DEPT_SHORT[deptId] || dept.name;
    const teachers = cls.teacherIds.map((id) => BBC_DATA.getTeacher(id)).filter(Boolean);

    return shell(`
      ${crumb([
        { label: "Departments", to: "#/home" },
        { label: short, to: `#/dept/${deptId}` },
        { label: floor.name, to: `#/dept/${deptId}/floor/${floor.id}` },
        { label: cls.name, to: `#/dept/${deptId}/floor/${floor.id}/class/${cls.id}` },
      ])}
      <div class="page-header">
        <h1>${esc(cls.name)}</h1>
        <p class="lede">${esc(floor.name)} · Code ${esc(cls.code)}</p>
      </div>
      <div class="detail-layout">
        <aside class="info-panel">
          <div class="panel-label">Enrollment</div>
          <div class="big-stat">${cls.studentCount}<span>enrolled students</span></div>
          <div class="panel-divider"></div>
          <dl class="info-list">
            <div>
              <dt>Floor</dt>
              <dd>${esc(floor.name)}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>${esc(cls.name)} (${esc(cls.code)})</dd>
            </div>
            <div>
              <dt>Teachers</dt>
              <dd>${teachers.length}</dd>
            </div>
          </dl>
        </aside>
        <section>
          <h2 class="section-title">Teachers list</h2>
          <div class="teacher-list">
            ${teachers
              .map(
                (t) => `
              <button type="button" class="teacher-row" data-nav="#/teacher/${t.id}?from=${encodeURIComponent(`#/dept/${deptId}/floor/${floor.id}/class/${cls.id}`)}">
                <div class="avatar">${esc(initials(t.firstName, t.lastName))}</div>
                <div class="meta">
                  <strong>${esc(t.firstName)} ${esc(t.lastName)}</strong>
                  <span>${esc(t.modules.join(" · "))}</span>
                </div>
                <span class="chev">→</span>
              </button>
            `
              )
              .join("")}
          </div>
        </section>
      </div>
    `);
  }

  function viewTeacher(teacherId, from) {
    const t = BBC_DATA.getTeacher(teacherId);
    if (!t) return viewNotFound();
    const back = from || "#/home";
    const classes = t.classIds
      .map((cid) => BBC_DATA.getClassLabel(cid))
      .filter(Boolean);

    return shell(`
      ${crumb([
        { label: "Departments", to: "#/home" },
        { label: "Teacher", to: `#/teacher/${t.id}` },
      ])}
      <div class="page-header" style="margin-bottom:1rem">
        <button type="button" class="btn btn-ghost" data-nav="${esc(back)}" style="margin-bottom:0.75rem;padding-left:0">← Back</button>
      </div>
      <div class="teacher-hero">
        <div class="avatar avatar-lg">${esc(initials(t.firstName, t.lastName))}</div>
        <div>
          <h1>${esc(t.firstName)} ${esc(t.lastName)}</h1>
          <p class="role">Teacher · BBC School</p>
        </div>
      </div>
      <div class="facts-grid">
        <div class="fact-card">
          <div class="k">First name</div>
          <div class="v">${esc(t.firstName)}</div>
        </div>
        <div class="fact-card">
          <div class="k">Last name</div>
          <div class="v">${esc(t.lastName)}</div>
        </div>
        <div class="fact-card">
          <div class="k">Phone number</div>
          <div class="v">${esc(t.phone)}</div>
        </div>
        <div class="fact-card">
          <div class="k">Wilaya</div>
          <div class="v">${esc(t.wilaya)}</div>
        </div>
        <div class="fact-card">
          <div class="k">Commune</div>
          <div class="v">${esc(t.commune)}</div>
        </div>
        <div class="fact-card">
          <div class="k">ID</div>
          <div class="v">${esc(t.id)}</div>
        </div>
      </div>
      <div class="detail-layout">
        <aside class="info-panel">
          <div class="panel-label">Subjects taught</div>
          <div class="chip-row" style="margin-top:0.75rem">
            ${t.modules.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}
          </div>
        </aside>
        <section class="info-panel">
          <div class="panel-label">Assigned classes</div>
          <div class="group-links" style="margin-top:0.85rem">
            ${
              classes.length
                ? classes
                    .map((item) => {
                      const parts = item.class.id.match(/([PM])-E(\d+)-C(\d+)/);
                      const href = parts
                        ? `#/dept/${parts[1] === "P" ? "primary" : "middle"}/floor/${parts[2]}/class/${item.class.id}`
                        : "#/home";
                      return `
                      <button type="button" class="group-link" data-nav="${esc(href)}">
                        <span>${esc(item.path)}</span>
                        <span class="chip neutral">${item.class.studentCount} students</span>
                      </button>
                    `;
                    })
                    .join("")
                : `<p style="color:var(--muted)">No classes assigned.</p>`
            }
          </div>
        </section>
      </div>
    `);
  }

  function viewNotFound() {
    return shell(`
      <div class="empty-state">
        <h2>Page not found</h2>
        <p>The requested content does not exist in the local data.</p>
        <button type="button" class="btn btn-primary" style="margin-top:1.25rem" data-nav="#/home">Back</button>
      </div>
    `);
  }

  function resolveView() {
    if (!Auth.isAuthenticated()) return viewLogin();

    const { parts } = state.route;
    if (parts.length === 0 || parts[0] === "home") return viewHome();

    if (parts[0] === "dept" && (parts[1] === "primary" || parts[1] === "middle")) {
      const deptId = parts[1];
      if (parts.length === 2) return viewFloors(deptId);
      if (parts[2] === "floor" && parts[3]) {
        if (parts.length === 4) return viewClasses(deptId, parts[3]);
        if (parts[4] === "class" && parts[5]) {
          return viewClassDetail(deptId, parts[3], parts[5]);
        }
      }
    }

    if (parts[0] === "teacher" && parts[1]) {
      return viewTeacher(parts[1], state.route.params.get("from"));
    }

    return viewNotFound();
  }

  function bindEvents() {
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const password = document.getElementById("password").value;
        const result = Auth.login(password);
        const err = document.getElementById("login-error");
        if (!result.ok) {
          err.textContent = result.error;
          err.classList.add("show");
          return;
        }
        go("/home");
        render();
      });
    }

    document.getElementById("btn-logout")?.addEventListener("click", () => {
      Auth.logout();
      go("/");
      render();
    });

    app.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const target = el.getAttribute("data-nav");
        if (!target) return;
        e.preventDefault();
        go(target.replace(/^#/, ""));
      });
    });
  }

  function render() {
    state.route = parseHash();
    app.innerHTML = resolveView();
    bindEvents();
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", render);

  if (!location.hash || location.hash === "#") {
    location.hash = Auth.isAuthenticated() ? "#/home" : "#/";
  }

  render();
})();

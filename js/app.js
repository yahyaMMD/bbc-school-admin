/**
 * BBC School Administration — SPA
 * Flow: Departments → Years/Levels → Classes → Students / Teachers → Detail
 */

(() => {
  const app = document.getElementById("app");
  const state = { route: parseHash(), searchQuery: "" };

  const icons = {
    users: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    search: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
  };

  const DEPT_SHORT = { primary: "Primary", middle: "Middle School" };

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
    const x = (a || "?").trim();
    const y = (b || "?").trim();
    return `${x[0] || "?"}${y[0] || ""}`.toUpperCase();
  }

  function esc(str) {
    return String(str ?? "")
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
          <div class="topbar-main">
            <button type="button" class="topbar-brand" data-nav="#/home" aria-label="Home">
              <img src="assets/logo.png" alt="BBC School" width="44" height="44" />
              <div class="topbar-brand-text">
                <strong>${esc(school.name)}</strong>
                <span class="hide-sm">Administration Portal</span>
              </div>
            </button>
            <div class="topbar-actions">
              <span class="badge-year hide-md">${esc(school.academicYear)}</span>
              <button type="button" class="btn btn-ghost btn-logout" id="btn-logout" aria-label="Sign out">
                <span class="hide-sm">Sign out</span>
                <span class="show-sm-only" aria-hidden="true">Out</span>
              </button>
            </div>
          </div>
          <form class="top-search" id="global-search" autocomplete="off">
            <input type="search" name="q" placeholder="Search student…" value="${esc(state.searchQuery)}" />
            <button type="submit" class="btn btn-primary btn-search" aria-label="Search">${icons.search}</button>
          </form>
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
              <input id="password" name="password" type="password" placeholder="Enter password" required autofocus />
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
    return shell(`
      ${crumb([{ label: "Departments", to: "#/home" }])}
      <div class="page-header">
        <h1>Dashboard</h1>
        <p class="lede">Official student rosters — academic year ${esc(BBC_DATA.school.academicYear)}. Select a department.</p>
      </div>
      <div class="stats-row">
        <div class="stat-card"><div class="label">Year groups</div><div class="value"><em>${stats.levels}</em></div></div>
        <div class="stat-card"><div class="label">Classes</div><div class="value">${stats.classes}</div></div>
        <div class="stat-card"><div class="label">Students</div><div class="value">${stats.students.toLocaleString("en-US")}</div></div>
        <div class="stat-card"><div class="label">Teachers listed</div><div class="value">${stats.teachers}</div></div>
      </div>
      <div class="dept-grid">
        ${BBC_DATA.departments
          .map(
            (d) => `
          <button type="button" class="dept-card" data-nav="#/dept/${d.id}">
            <img src="${esc(d.image)}" alt="" loading="eager" />
            <div class="overlay"></div>
            <div class="content">
              <span class="eyebrow">${esc(d.label)}</span>
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

  function viewLevels(deptId) {
    const dept = BBC_DATA.getDepartment(deptId);
    if (!dept) return viewNotFound();
    const short = DEPT_SHORT[deptId] || dept.name;
    const totalClasses = dept.levels.reduce((n, l) => n + l.classes.length, 0);
    const totalStudents = dept.levels.reduce(
      (n, l) => n + l.classes.reduce((a, c) => a + c.students.length, 0),
      0
    );
    return shell(`
      ${crumb([
        { label: "Departments", to: "#/home" },
        { label: short, to: `#/dept/${deptId}` },
      ])}
      <div class="page-header">
        <h1>${esc(dept.name)}</h1>
        <p class="lede">${dept.levels.length} year groups · ${totalClasses} classes · ${totalStudents} students</p>
      </div>
      <div class="floor-grid" style="--cols: ${Math.min(dept.levels.length, 5)}">
        ${dept.levels
          .map(
            (l, i) => `
          <button type="button" class="floor-card" style="--accent:${["#F26522","#E85A1A","#D94F14","#C94412","#B83A10"][i % 5]}" data-nav="#/dept/${deptId}/level/${l.id}">
            <span class="floor-num">${l.id === 99 ? "—" : l.id}</span>
            <h3>${esc(l.name)}</h3>
            <p>${esc(l.nameAr || l.subtitle || "")}</p>
            <div class="floor-meta">${l.classes.length} classes</div>
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
    const short = DEPT_SHORT[deptId] || dept.name;
    return shell(`
      ${crumb([
        { label: "Departments", to: "#/home" },
        { label: short, to: `#/dept/${deptId}` },
        { label: level.name, to: `#/dept/${deptId}/level/${level.id}` },
      ])}
      <div class="page-header">
        <h1>${esc(level.name)}</h1>
        <p class="lede">${esc(level.nameAr || "")} — ${level.classes.length} classes</p>
      </div>
      <div class="group-grid">
        ${level.classes
          .map(
            (c) => `
          <button type="button" class="group-card" data-nav="#/dept/${deptId}/level/${level.id}/class/${c.id}">
            <div class="group-icon">${icons.users}</div>
            <h3>${esc(c.name)}</h3>
            <div class="code">${esc(c.code)}${c.floor ? " · " + esc(c.floor) : ""}</div>
            <div class="hint">${c.students.length} students · ${(c.modules || []).length} modules</div>
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
    const short = DEPT_SHORT[deptId] || dept.name;
    const teachers = (cls.teacherIds || []).map((id) => BBC_DATA.getTeacher(id)).filter(Boolean);
    const females = cls.students.filter((s) => s.gender === "Female").length;
    const males = cls.students.filter((s) => s.gender === "Male").length;

    return shell(`
      ${crumb([
        { label: "Departments", to: "#/home" },
        { label: short, to: `#/dept/${deptId}` },
        { label: level.name, to: `#/dept/${deptId}/level/${level.id}` },
        { label: cls.name, to: `#/dept/${deptId}/level/${level.id}/class/${cls.id}` },
      ])}
      <div class="page-header">
        <h1>${esc(cls.name)} <span class="code-inline">${esc(cls.code)}</span></h1>
        <p class="lede">${esc(cls.nameAr || "")}${cls.floor ? " · " + esc(cls.floor) : ""}</p>
      </div>

      <div class="detail-layout">
        <aside class="info-panel">
          <div class="panel-label">Enrollment</div>
          <div class="big-stat">${cls.students.length}<span>students on roster</span></div>
          <div class="panel-divider"></div>
          <dl class="info-list">
            <div><dt>Females</dt><dd>${cls.stats?.females ?? females}</dd></div>
            <div><dt>Males</dt><dd>${cls.stats?.males ?? males}</dd></div>
            <div><dt>Modules</dt><dd>${(cls.modules || []).length}</dd></div>
            <div><dt>Teachers named</dt><dd>${teachers.length}</dd></div>
          </dl>
          <div class="panel-divider"></div>
          <div class="panel-label">Modules</div>
          <div class="chip-row" style="margin-top:0.6rem">
            ${(cls.modules || []).map((m) => `<span class="chip">${esc(m)}</span>`).join("")}
          </div>
        </aside>

        <div class="stack-panels">
          <section class="info-panel">
            <div class="section-head">
              <h2 class="section-title" style="margin:0">Teachers</h2>
            </div>
            ${
              teachers.length
                ? `<div class="teacher-list" style="margin-top:0.85rem">
                    ${teachers
                      .map(
                        (t) => `
                      <button type="button" class="teacher-row" data-nav="#/teacher/${t.id}?from=${encodeURIComponent(`#/dept/${deptId}/level/${level.id}/class/${cls.id}`)}">
                        <div class="avatar">${esc(initials(t.firstName, t.lastName))}</div>
                        <div class="meta">
                          <strong>${esc(t.firstName)} ${esc(t.lastName)}</strong>
                          <span>${esc((t.modules || []).join(" · "))}</span>
                        </div>
                        <span class="chev">→</span>
                      </button>`
                      )
                      .join("")}
                  </div>`
                : `<p class="muted" style="margin-top:0.75rem">Teacher names not yet filled on the official form for this class. Modules are listed; names can be added later.</p>`
            }
          </section>

          <section class="info-panel">
            <div class="section-head">
              <h2 class="section-title" style="margin:0">Students</h2>
              <form class="inline-search" id="class-search" data-class-search="${esc(cls.id)}" autocomplete="off">
                <input type="search" name="q" placeholder="Filter by name…" />
              </form>
            </div>
            <div class="student-table-wrap" style="margin-top:0.85rem">
              <table class="student-table" id="student-table">
                <thead>
                  <tr>
                    <th class="col-num">#</th>
                    <th class="col-name-full hide-desktop">Student</th>
                    <th class="col-last hide-mobile">Last name</th>
                    <th class="col-first hide-mobile">First name</th>
                    <th class="col-dob hide-mobile">Date of birth</th>
                    <th class="col-gender hide-sm">Gender</th>
                    <th class="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  ${cls.students
                    .map(
                      (s) => `
                    <tr data-search="${esc((s.searchName || s.fullName || "").toLowerCase())}">
                      <td class="col-num" data-label="#">${s.number ?? ""}</td>
                      <td class="col-name-full hide-desktop" data-label="Student">${esc(s.fullName || `${s.lastName} ${s.firstName}`)}</td>
                      <td class="col-last hide-mobile" data-label="Last name">${esc(s.lastName)}</td>
                      <td class="col-first hide-mobile" data-label="First name">${esc(s.firstName)}</td>
                      <td class="col-dob hide-mobile" data-label="DOB">${esc(s.dateOfBirth || "—")}</td>
                      <td class="col-gender hide-sm" data-label="Gender">${esc(s.gender || "—")}</td>
                      <td class="col-action" data-label=""><button type="button" class="link-btn" data-nav="#/student/${s.id}">View</button></td>
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
    { key: "number", labelAr: "الرقم", labelEn: "No." },
    { key: "matchedName", labelAr: "اسم الطالب", labelEn: "Full name" },
    { key: "dateOfBirth", labelAr: "تاريخ الميلاد", labelEn: "Date of birth" },
    { key: "age", labelAr: "العمر", labelEn: "Age" },
    { key: "annualAverage", labelAr: "المعدل السنوي", labelEn: "Annual average" },
    { key: "socialStatus", labelAr: "الحالة الإجتماعية", labelEn: "Social status" },
    { key: "healthStatus", labelAr: "الحالة الصحية", labelEn: "Health status" },
    { key: "strengths", labelAr: "نقاط القوة", labelEn: "Strengths" },
    { key: "weaknesses", labelAr: "نقاط الضعف", labelEn: "Weaknesses" },
    { key: "behavioralPerformance", labelAr: "الأداء السلوكي", labelEn: "Behavioral" },
    { key: "academicPerformance", labelAr: "الأداء التحصيلي", labelEn: "Academic" },
    { key: "talents", labelAr: "المواهب (إن وجدت)", labelEn: "Talents" },
    { key: "additionalNotes", labelAr: "ملاحظات إضافية", labelEn: "Additional notes" },
    { key: "actionPlan", labelAr: "خطة العمل", labelEn: "Action plan" },
    { key: "generalNote", labelAr: "ملاحظة عامة", labelEn: "General note" },
  ];

  function renderPreviousYearDetails(details) {
    if (!details) return "";
    const yearLabel = details.previousYear || "previous year";
    const yearAr = details.previousYearAr || "";
    const classLabel = details.previousClass ? ` · ${details.previousClass}` : "";
    const rows = PREV_YEAR_FIELDS.map(({ key, labelAr, labelEn }) => {
      const val = (details[key] || "").toString().trim();
      if (!val) return "";
      return `
        <div class="detail-row">
          <div class="detail-label">
            <span class="ar" dir="rtl">${esc(labelAr)}</span>
            <span class="en">${esc(labelEn)}</span>
          </div>
          <div class="detail-value" dir="auto">${esc(val)}</div>
        </div>`;
    }).join("");

    return `
      <div class="info-panel student-more-panel" style="margin-top:1rem">
        <button type="button" class="btn btn-primary" id="btn-more-details" aria-expanded="false">
          More details
        </button>
        <div id="student-more-details" class="student-more-details" hidden>
          <div class="prev-year-banner">
            <div class="panel-label">Previous year record</div>
            <p class="prev-year-title">
              ${esc(yearLabel)}${yearAr ? ` · ${esc(yearAr)}` : ""}${esc(classLabel)}
            </p>
            <p class="prev-year-hint">Follow-up file from last academic year (matched by full name).</p>
          </div>
          <div class="detail-rows" dir="rtl">${rows || `<p class="empty-details">No extra fields on file for this student.</p>`}</div>
        </div>
      </div>`;
  }

  function viewStudent(studentId) {
    const found = BBC_DATA.getStudent(studentId);
    if (!found) return viewNotFound();
    const { student: s, dept, level, cls } = found;
    const short = DEPT_SHORT[dept.id] || dept.name;
    const back = `#/dept/${dept.id}/level/${level.id}/class/${cls.id}`;
    const hasPrev = !!s.previousYearDetails;

    return shell(`
      ${crumb([
        { label: "Departments", to: "#/home" },
        { label: short, to: `#/dept/${dept.id}` },
        { label: level.name, to: `#/dept/${dept.id}/level/${level.id}` },
        { label: cls.name, to: back },
        { label: s.fullName || "Student", to: `#/student/${s.id}` },
      ])}
      <div class="page-header" style="margin-bottom:1rem">
        <button type="button" class="btn btn-ghost" data-nav="${esc(back)}" style="margin-bottom:0.75rem;padding-left:0">← Back to class</button>
      </div>
      <div class="teacher-hero">
        <div class="avatar avatar-lg">${esc(initials(s.firstName || s.fullName, s.lastName || ""))}</div>
        <div>
          <h1>${esc(s.fullName || `${s.lastName} ${s.firstName}`)}</h1>
          <p class="role">Student · ${esc(cls.name)} (${esc(cls.code)}) · ${esc(level.name)}</p>
        </div>
      </div>
      <div class="facts-grid">
        <div class="fact-card"><div class="k">Last name</div><div class="v">${esc(s.lastName || "—")}</div></div>
        <div class="fact-card"><div class="k">First name</div><div class="v">${esc(s.firstName || "—")}</div></div>
        <div class="fact-card"><div class="k">Date of birth</div><div class="v">${esc(s.dateOfBirth || "Not on file")}</div></div>
        <div class="fact-card"><div class="k">Gender</div><div class="v">${esc(s.gender || "—")}</div></div>
        <div class="fact-card"><div class="k">Roster #</div><div class="v">${s.number ?? "—"}</div></div>
        <div class="fact-card"><div class="k">Department</div><div class="v">${esc(dept.name)}</div></div>
      </div>
      ${
        s.notes
          ? `<div class="info-panel"><div class="panel-label">Notes</div><p style="margin-top:0.5rem">${esc(s.notes)}</p></div>`
          : ""
      }
      ${
        hasPrev
          ? renderPreviousYearDetails(s.previousYearDetails)
          : `<div class="info-panel" style="margin-top:1rem"><div class="panel-label">Previous year</div><p style="margin-top:0.5rem;color:var(--muted)">No prior-year follow-up file matched for this student${
              level.name && /year\s*1/i.test(level.name) ? " (many Year 1 students are new this year)" : ""
            }.</p></div>`
      }
      <div class="info-panel" style="margin-top:1rem">
        <div class="panel-label">Class modules</div>
        <div class="chip-row" style="margin-top:0.6rem">
          ${(cls.modules || []).map((m) => `<span class="chip">${esc(m)}</span>`).join("")}
        </div>
      </div>
    `);
  }

  function viewSearch(query) {
    const results = BBC_DATA.searchStudents(query);
    return shell(`
      ${crumb([
        { label: "Departments", to: "#/home" },
        { label: "Search", to: `#/search?q=${encodeURIComponent(query)}` },
      ])}
      <div class="page-header">
        <h1>Search results</h1>
        <p class="lede">${results.length} student${results.length === 1 ? "" : "s"} matching “${esc(query)}”</p>
      </div>
      ${
        results.length
          ? `<div class="student-table-wrap">
              <table class="student-table student-table-search">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th class="hide-sm">Department</th>
                    <th class="hide-mobile">Year</th>
                    <th>Class</th>
                    <th class="hide-sm">Gender</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${results
                    .map(
                      ({ student: s, dept, level, cls }) => `
                    <tr>
                      <td data-label="Name"><strong dir="auto">${esc(s.fullName)}</strong></td>
                      <td class="hide-sm" data-label="Department">${esc(DEPT_SHORT[dept.id] || dept.name)}</td>
                      <td class="hide-mobile" data-label="Year">${esc(level.name)}</td>
                      <td data-label="Class">${esc(cls.code)}</td>
                      <td class="hide-sm" data-label="Gender">${esc(s.gender || "—")}</td>
                      <td data-label=""><button type="button" class="link-btn" data-nav="#/student/${s.id}">View</button></td>
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<div class="empty-state"><h2>No students found</h2><p>Try another spelling (Arabic or Latin).</p></div>`
      }
    `);
  }

  function viewTeacher(teacherId, from) {
    const t = BBC_DATA.getTeacher(teacherId);
    if (!t) return viewNotFound();
    const back = from || "#/home";
    const classes = (t.classIds || [])
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
        <div class="fact-card"><div class="k">First name</div><div class="v">${esc(t.firstName)}</div></div>
        <div class="fact-card"><div class="k">Last name</div><div class="v">${esc(t.lastName)}</div></div>
        <div class="fact-card"><div class="k">Phone</div><div class="v">${esc(t.phone || "Not on file")}</div></div>
        <div class="fact-card"><div class="k">Wilaya</div><div class="v">${esc(t.wilaya)}</div></div>
        <div class="fact-card"><div class="k">Commune</div><div class="v">${esc(t.commune)}</div></div>
        <div class="fact-card"><div class="k">ID</div><div class="v">${esc(t.id)}</div></div>
      </div>
      <div class="detail-layout">
        <aside class="info-panel">
          <div class="panel-label">Subjects</div>
          <div class="chip-row" style="margin-top:0.75rem">
            ${(t.modules || []).map((m) => `<span class="chip">${esc(m)}</span>`).join("")}
          </div>
        </aside>
        <section class="info-panel">
          <div class="panel-label">Assigned classes</div>
          <div class="group-links" style="margin-top:0.85rem">
            ${
              classes.length
                ? classes
                    .map((item) => {
                      const found = BBC_DATA.findClassById(item.class.id);
                      const href = found
                        ? `#/dept/${found.dept.id}/level/${found.level.id}/class/${found.cls.id}`
                        : "#/home";
                      return `<button type="button" class="group-link" data-nav="${esc(href)}">
                        <span>${esc(item.path)}</span>
                        <span class="chip neutral">${item.class.students.length} students</span>
                      </button>`;
                    })
                    .join("")
                : `<p class="muted">No classes linked.</p>`
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
    const { parts, params } = state.route;

    if (parts[0] === "search") {
      const q = params.get("q") || state.searchQuery || "";
      state.searchQuery = q;
      return viewSearch(q);
    }

    if (parts.length === 0 || parts[0] === "home") return viewHome();

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

    if (parts[0] === "student" && parts[1]) return viewStudent(parts[1]);
    if (parts[0] === "teacher" && parts[1]) {
      return viewTeacher(parts[1], state.route.params.get("from"));
    }

    return viewNotFound();
  }

  function bindEvents() {
    document.getElementById("login-form")?.addEventListener("submit", (e) => {
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
          moreBtn.textContent = "Hide details";
        } else {
          morePanel.setAttribute("hidden", "");
          moreBtn.setAttribute("aria-expanded", "false");
          moreBtn.textContent = "More details";
        }
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

  function render() {
    state.route = parseHash();
    if (state.route.params.get("q")) {
      state.searchQuery = state.route.params.get("q") || "";
    }
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

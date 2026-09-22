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
    const x = (a || "").trim();
    const y = (b || "").trim();
    if (!x && !y) return "?";
    return `${(x[0] || "")}${(y[0] || "")}`.toUpperCase() || "?";
  }

  function dash(v) {
    const s = String(v ?? "").trim();
    return s || "—";
  }

  function teacherLabel(t) {
    const parts = [t.firstName, t.lastName].map((p) => String(p || "").trim()).filter(Boolean);
    return parts.length ? parts.join(" ") : "—";
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
    if (!raw) return `<span class="muted">Not on file</span>`;
    const wa = whatsappNumber(raw);
    const waBtn = wa
      ? `<a class="btn-whatsapp" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener noreferrer" title="Open WhatsApp chat" aria-label="WhatsApp">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
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
    const { school } = BBC_DATA;
    return `
      <div class="app-shell">
        <header class="topbar">
          <div class="topbar-main">
            <button type="button" class="topbar-brand" data-nav="#/home" aria-label="Home">
              <img src="assets/logo.png?v=2" alt="Quality Education Algeria" width="44" height="44" />
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
            <input type="search" name="q" placeholder="Search student or go to directories…" value="${esc(state.searchQuery)}" />
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
            <img src="assets/logo.png?v=2" alt="Quality Education Algeria" width="88" height="88" />
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
      ${crumb([{ label: "Home", to: "#/home" }])}
      <div class="page-header">
        <h1>Dashboard</h1>
        <p class="lede">Official rosters — academic year ${esc(BBC_DATA.school.academicYear)}.</p>
      </div>
      <div class="stats-row">
        <div class="stat-card"><div class="label">Year groups</div><div class="value"><em>${stats.levels}</em></div></div>
        <div class="stat-card"><div class="label">Classes</div><div class="value">${stats.classes}</div></div>
        <div class="stat-card"><div class="label">Students</div><div class="value">${stats.students.toLocaleString("en-US")}</div></div>
        <div class="stat-card"><div class="label">Teachers listed</div><div class="value">${stats.teachers}</div></div>
      </div>
      <div class="dir-home-grid" style="margin-bottom:1.5rem">
        <button type="button" class="dir-home-card" data-nav="#/teachers">
          <div class="dir-home-icon" aria-hidden="true">${icons.users}</div>
          <div>
            <h3>Our teachers</h3>
            <p>${stats.teachers} teachers — filter by name, ID, department, subject, or class.</p>
          </div>
          <span class="cta">Browse teachers →</span>
        </button>
        <button type="button" class="dir-home-card" data-nav="#/students">
          <div class="dir-home-icon" aria-hidden="true">${icons.users}</div>
          <div>
            <h3>Our students</h3>
            <p>${stats.students.toLocaleString("en-US")} students — filter by name, ID, department, year, class, or gender.</p>
          </div>
          <span class="cta">Browse students →</span>
        </button>
      </div>
      <div class="page-header" style="margin-bottom:0.85rem">
        <h2 class="section-title" style="margin:0">Departments</h2>
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
            <h3>${esc(c.code || c.name)}</h3>
            <div class="code">${esc([c.nameAr && c.nameAr !== (c.code || c.name) ? c.nameAr : "", c.floor || ""].filter(Boolean).join(" · "))}</div>
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
        { label: cls.code || cls.name, to: `#/dept/${deptId}/level/${level.id}/class/${cls.id}` },
      ])}
      <div class="page-header">
        <h1>${esc(cls.code || cls.name)}</h1>
        <p class="lede">${esc([cls.nameAr && cls.nameAr !== (cls.code || cls.name) ? cls.nameAr : "", cls.floor || ""].filter(Boolean).join(" · "))}</p>
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
                                  ? `<a class="btn-whatsapp btn-whatsapp-sm" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener noreferrer" title="Open WhatsApp" aria-label="WhatsApp">
                                      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                      WhatsApp
                                    </a>`
                                  : ""
                              }
                            </div>`
                          : "";
                        return `
                      <div class="teacher-row-wrap">
                        <button type="button" class="teacher-row" data-nav="#/teacher/${t.id}?from=${from}">
                          <div class="avatar">${esc(initials(t.firstName, t.lastName))}</div>
                          <div class="meta">
                            <strong>${esc(teacherLabel(t))}</strong>
                            <span>${esc((t.modules || []).join(" · "))}</span>
                          </div>
                          <span class="chev">→</span>
                        </button>
                        ${phoneBlock}
                      </div>`;
                      })
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

  function viewStudent(studentId, from) {
    const found = BBC_DATA.getStudent(studentId);
    if (!found) return viewNotFound();
    const { student: s, dept, level, cls } = found;
    const short = DEPT_SHORT[dept.id] || dept.name;
    const classBack = `#/dept/${dept.id}/level/${level.id}/class/${cls.id}`;
    const back = from || classBack;
    const hasPrev = !!s.previousYearDetails;

    return shell(`
      ${crumb([
        { label: "Home", to: "#/home" },
        ...(from && from.includes("/students")
          ? [{ label: "Students", to: "#/students" }]
          : [
              { label: short, to: `#/dept/${dept.id}` },
              { label: level.name, to: `#/dept/${dept.id}/level/${level.id}` },
              { label: cls.code || cls.name, to: classBack },
            ]),
        { label: s.fullName || "Student", to: `#/student/${s.id}` },
      ])}
      <div class="page-header" style="margin-bottom:1rem">
        <button type="button" class="btn btn-ghost" data-nav="${esc(back)}" style="margin-bottom:0.75rem;padding-left:0">← Back</button>
      </div>
      <div class="teacher-hero">
        <div class="avatar avatar-lg">${esc(initials(s.firstName || s.fullName, s.lastName || ""))}</div>
        <div>
          <h1 dir="auto">${esc(s.fullName || `${s.lastName} ${s.firstName}`)}</h1>
          <p class="role">Student · ${esc(cls.code)} · ${esc(level.name)} · ${esc(short)}</p>
        </div>
      </div>
      <div class="facts-grid">
        <div class="fact-card"><div class="k">Last name</div><div class="v" dir="auto">${esc(s.lastName || "—")}</div></div>
        <div class="fact-card"><div class="k">First name</div><div class="v" dir="auto">${esc(s.firstName || "—")}</div></div>
        <div class="fact-card"><div class="k">Date of birth</div><div class="v">${esc(s.dateOfBirth || "Not on file")}</div></div>
        <div class="fact-card"><div class="k">Gender</div><div class="v">${esc(s.gender || "—")}</div></div>
        <div class="fact-card"><div class="k">Roster #</div><div class="v">${s.number ?? "—"}</div></div>
        <div class="fact-card"><div class="k">Department</div><div class="v">${esc(dept.name)}</div></div>
        <div class="fact-card"><div class="k">Year</div><div class="v">${esc(level.name)}</div></div>
        <div class="fact-card"><div class="k">Class</div><div class="v"><button type="button" class="link-btn" data-nav="${esc(classBack)}">${esc(cls.code || cls.name)}${cls.nameAr && cls.nameAr !== (cls.code || cls.name) ? " · " + esc(cls.nameAr) : ""}</button></div></div>
        <div class="fact-card"><div class="k">Student ID</div><div class="v">${esc(s.id)}</div></div>
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

    filtered.sort((a, b) => teacherLabel(a.teacher).localeCompare(teacherLabel(b.teacher), "ar"));

    return shell(`
      ${crumb([
        { label: "Home", to: "#/home" },
        { label: "Teachers", to: "#/teachers" },
      ])}
      <div class="page-header">
        <h1>Our teachers</h1>
        <p class="lede">${filtered.length} of ${all.length} teachers</p>
      </div>
      <form class="filter-panel" id="dir-filter" data-dir="teachers" autocomplete="off">
        <div class="filter-grid">
          <label class="filter-field">
            <span>Name / ID / phone</span>
            <input type="search" name="q" value="${esc(params.get("q") || "")}" placeholder="Search…" />
          </label>
          <label class="filter-field">
            <span>Department</span>
            <select name="dept">
              <option value="">All</option>
              <option value="primary"${dept === "primary" ? " selected" : ""}>Primary</option>
              <option value="middle"${dept === "middle" ? " selected" : ""}>Middle School</option>
            </select>
          </label>
          <label class="filter-field">
            <span>Subject</span>
            <select name="module">
              <option value="">All</option>
              ${modules.map((m) => `<option value="${esc(m)}"${module === m ? " selected" : ""}>${esc(m)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>Class</span>
            <select name="class">
              <option value="">All</option>
              ${classOpts.map((o) => `<option value="${esc(o.id)}"${classId === o.id ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="filter-actions">
          <button type="submit" class="btn btn-primary">Apply filters</button>
          <button type="button" class="btn btn-ghost" data-nav="#/teachers">Clear</button>
        </div>
      </form>
      <div class="dir-list" id="dir-list">
        ${
          filtered.length
            ? filtered
                .map(({ teacher: t, classes }) => {
                  const depts = (t.departments || []).map((d) => DEPT_SHORT[d] || d).join(" · ");
                  const classCodes = classes.map((x) => x.cls.code).join(", ") || "—";
                  return `
              <button type="button" class="dir-card" data-nav="#/teacher/${t.id}?from=${encodeURIComponent("#/teachers")}">
                <div class="avatar">${esc(initials(t.firstName, t.lastName))}</div>
                <div class="dir-card-body">
                  <strong dir="auto">${esc(teacherLabel(t))}</strong>
                  ${teacherLatin(t) ? `<span class="dir-meta">${esc(teacherLatin(t))}</span>` : ""}
                  <span class="dir-meta">${esc(depts || "—")} · ${esc((t.modules || []).join(", ") || "—")}</span>
                  <span class="dir-meta hide-sm">ID ${esc(t.id)} · Classes: ${esc(classCodes)}</span>
                  <span class="dir-meta">${t.phone ? esc(t.phone) : "No phone"}</span>
                </div>
                <span class="chev">→</span>
              </button>`;
                })
                .join("")
            : `<div class="empty-state"><h2>No teachers match</h2><p>Try clearing some filters.</p></div>`
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
          label: `${DEPT_SHORT[d.id] || d.name} · ${l.name}`,
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
        const hay = `${s.id} ${s.fullName || ""} ${s.firstName || ""} ${s.lastName || ""} ${cls.code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) =>
      (a.student.fullName || "").localeCompare(b.student.fullName || "", "ar")
    );

    return shell(`
      ${crumb([
        { label: "Home", to: "#/home" },
        { label: "Students", to: "#/students" },
      ])}
      <div class="page-header">
        <h1>Our students</h1>
        <p class="lede">${filtered.length} of ${all.length} students</p>
      </div>
      <form class="filter-panel" id="dir-filter" data-dir="students" autocomplete="off">
        <div class="filter-grid">
          <label class="filter-field">
            <span>Name / ID</span>
            <input type="search" name="q" value="${esc(params.get("q") || "")}" placeholder="Search…" />
          </label>
          <label class="filter-field">
            <span>Department</span>
            <select name="dept">
              <option value="">All</option>
              <option value="primary"${dept === "primary" ? " selected" : ""}>Primary</option>
              <option value="middle"${dept === "middle" ? " selected" : ""}>Middle School</option>
            </select>
          </label>
          <label class="filter-field">
            <span>Year</span>
            <select name="year">
              <option value="">All</option>
              ${yearOptions.map((o) => `<option value="${esc(o.value)}"${year === o.value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>Class</span>
            <select name="class">
              <option value="">All</option>
              ${classOpts.map((o) => `<option value="${esc(o.id)}"${classId === o.id ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>Gender</span>
            <select name="gender">
              <option value="">All</option>
              <option value="Male"${gender === "Male" ? " selected" : ""}>Male</option>
              <option value="Female"${gender === "Female" ? " selected" : ""}>Female</option>
            </select>
          </label>
        </div>
        <div class="filter-actions">
          <button type="submit" class="btn btn-primary">Apply filters</button>
          <button type="button" class="btn btn-ghost" data-nav="#/students">Clear</button>
        </div>
      </form>
      <div class="dir-list" id="dir-list">
        ${
          filtered.length
            ? filtered
                .map(({ student: s, dept: d, level, cls }) => `
              <button type="button" class="dir-card" data-nav="#/student/${s.id}?from=${encodeURIComponent("#/students")}">
                <div class="avatar">${esc(initials(s.firstName || s.fullName, s.lastName || ""))}</div>
                <div class="dir-card-body">
                  <strong dir="auto">${esc(s.fullName || `${s.lastName} ${s.firstName}`)}</strong>
                  <span class="dir-meta">${esc(DEPT_SHORT[d.id] || d.name)} · ${esc(level.name)} · ${esc(cls.code)}</span>
                  <span class="dir-meta hide-sm">ID ${esc(s.id)}${s.dateOfBirth ? ` · DOB ${esc(s.dateOfBirth)}` : ""}</span>
                  <span class="dir-meta">${esc(s.gender || "—")}</span>
                </div>
                <span class="chev">→</span>
              </button>`)
                .join("")
            : `<div class="empty-state"><h2>No students match</h2><p>Try clearing some filters.</p></div>`
        }
      </div>
    `);
  }

  function viewTeacher(teacherId, from) {
    const t = BBC_DATA.getTeacher(teacherId);
    if (!t) return viewNotFound();
    const back = from || "#/teachers";
    const classes = (t.classIds || [])
      .map((cid) => BBC_DATA.getClassLabel(cid))
      .filter(Boolean);
    const depts = (t.departments || []).map((d) => {
      const dept = BBC_DATA.getDepartment(d);
      return dept ? dept.name : d;
    });

    return shell(`
      ${crumb([
        { label: "Home", to: "#/home" },
        { label: "Teachers", to: "#/teachers" },
        { label: teacherLabel(t), to: `#/teacher/${t.id}` },
      ])}
      <div class="page-header" style="margin-bottom:1rem">
        <button type="button" class="btn btn-ghost" data-nav="${esc(back)}" style="margin-bottom:0.75rem;padding-left:0">← Back</button>
      </div>
      <div class="teacher-hero">
        <div class="avatar avatar-lg">${esc(initials(t.firstName, t.lastName))}</div>
        <div>
          <h1 dir="auto">${esc(teacherLabel(t))}</h1>
          <p class="role">Teacher · ${esc(depts.join(" · ") || "BBC School")}${teacherLatin(t) ? ` · ${esc(teacherLatin(t))}` : ""}</p>
        </div>
      </div>
      <div class="facts-grid">
        <div class="fact-card"><div class="k">First name</div><div class="v" dir="auto">${esc(dash(t.firstName))}</div></div>
        <div class="fact-card"><div class="k">Last name</div><div class="v" dir="auto">${esc(dash(t.lastName))}</div></div>
        ${teacherLatin(t) ? `<div class="fact-card"><div class="k">Latin name</div><div class="v">${esc(teacherLatin(t))}</div></div>` : ""}
        <div class="fact-card"><div class="k">Phone</div><div class="v">${phoneWithWhatsApp(t.phone)}</div></div>
        <div class="fact-card"><div class="k">Department</div><div class="v">${esc(depts.join(" · ") || "—")}</div></div>
        <div class="fact-card"><div class="k">Wilaya</div><div class="v">${esc(dash(t.wilaya))}</div></div>
        <div class="fact-card"><div class="k">Commune</div><div class="v">${esc(dash(t.commune))}</div></div>
        <div class="fact-card"><div class="k">ID</div><div class="v">${esc(t.id)}</div></div>
        <div class="fact-card"><div class="k">Classes assigned</div><div class="v">${classes.length}</div></div>
      </div>
      <div class="detail-layout">
        <aside class="info-panel">
          <div class="panel-label">Subjects / modules</div>
          <div class="chip-row" style="margin-top:0.75rem">
            ${(t.modules || []).length
              ? (t.modules || []).map((m) => `<span class="chip">${esc(m)}</span>`).join("")
              : `<span class="muted">None listed</span>`}
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
      // Live filter on select change for faster mobile use
      dirFilter.querySelectorAll("select").forEach((sel) => {
        sel.addEventListener("change", () => {
          dirFilter.requestSubmit();
        });
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

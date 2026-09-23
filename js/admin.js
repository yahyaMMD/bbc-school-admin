/**
 * Staff / manager console — clean lists, filters, complete student profiles.
 */
const AdminApp = (() => {
  const GENDER_OPTS = [
    { value: "", label: "—" },
    { value: "Female", label: "Female" },
    { value: "Male", label: "Male" },
  ];

  const WILAYA_OPTS = [
    "Algiers",
    "Blida",
    "Boumerdes",
    "Tipaza",
    "Oran",
    "Constantine",
    "Setif",
    "Annaba",
    "Bejaia",
    "Tizi Ouzou",
    "Other",
  ].map((w) => ({ value: w, label: w }));

  const PREV_YEAR_OPTS = [
    { value: "", label: "—" },
    { value: "Pre-school", label: "Pre-school" },
    { value: "Year 1", label: "Year 1" },
    { value: "Year 2", label: "Year 2" },
    { value: "Year 3", label: "Year 3" },
    { value: "Year 4", label: "Year 4" },
    { value: "Year 5 (Primary)", label: "Year 5 (Primary)" },
    { value: "Year 1 (Middle)", label: "Year 1 (Middle)" },
    { value: "Year 2 (Middle)", label: "Year 2 (Middle)" },
    { value: "Year 3 (Middle)", label: "Year 3 (Middle)" },
    { value: "Year 4 (Middle)", label: "Year 4 (Middle)" },
  ];

  const PREV_YEAR_FIELDS = [
    { key: "number", label: "No.", type: "text" },
    { key: "matchedName", label: "Full name (as on file)", type: "text" },
    { key: "dateOfBirth", label: "Date of birth", type: "text" },
    { key: "age", label: "Age", type: "text" },
    { key: "annualAverage", label: "Annual average", type: "text" },
    { key: "socialStatus", label: "Social status", type: "text" },
    { key: "healthStatus", label: "Health status", type: "text" },
    { key: "strengths", label: "Strengths", type: "textarea" },
    { key: "weaknesses", label: "Weaknesses", type: "textarea" },
    { key: "behavioralPerformance", label: "Behavioral performance", type: "textarea" },
    { key: "academicPerformance", label: "Academic performance", type: "textarea" },
    { key: "talents", label: "Talents", type: "text" },
    { key: "additionalNotes", label: "Additional notes", type: "textarea" },
    { key: "actionPlan", label: "Action plan", type: "textarea" },
    { key: "generalNote", label: "General note", type: "textarea" },
  ];

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function field(name, label, value = "", opts = {}) {
    const type = opts.type || "text";
    const full = opts.full ? " admin-field-full" : "";
    const hint = opts.hint ? `<small class="admin-field-hint">${esc(opts.hint)}</small>` : "";
    if (type === "textarea") {
      return `<label class="admin-field${full}"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="${opts.rows || 3}" placeholder="${esc(opts.placeholder || "")}">${esc(value)}</textarea>${hint}</label>`;
    }
    if (type === "select") {
      const options = (opts.options || [])
        .map(
          (o) =>
            `<option value="${esc(o.value)}"${String(o.value) === String(value) ? " selected" : ""}>${esc(o.label)}</option>`
        )
        .join("");
      return `<label class="admin-field${full}"><span>${esc(label)}</span><select name="${esc(name)}">${options}</select>${hint}</label>`;
    }
    if (type === "checkbox-group") {
      const boxes = (opts.options || [])
        .map((o) => {
          const checked = (opts.values || []).includes(o.value) ? " checked" : "";
          return `<label class="admin-check"><input type="checkbox" name="${esc(name)}" value="${esc(o.value)}"${checked}/><span>${esc(o.label)}</span></label>`;
        })
        .join("");
      return `<div class="admin-field${full}"><span>${esc(label)}</span><div class="admin-check-grid">${boxes}</div>${hint}</div>`;
    }
    return `<label class="admin-field${full}"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(opts.placeholder || "")}" ${opts.required ? "required" : ""} ${opts.min != null ? `min="${opts.min}"` : ""} /></label>`;
  }

  function sectionTitle(title, sub = "") {
    return `<div class="admin-section-head"><h3>${esc(title)}</h3>${sub ? `<p>${sub}</p>` : ""}</div>`;
  }

  async function refreshData() {
    const data = await BBC_API.loadSchoolData();
    BBC_DATA.setData(data);
  }

  function classOptions() {
    return BBC_DATA.listClassOptions();
  }

  function allModules() {
    const data = typeof SCHOOL_DATA !== "undefined" ? SCHOOL_DATA : {};
    const fromSchool = [...(data.primaryModules || []), ...(data.middleModules || [])];
    const fromTeachers = typeof BBC_DATA.listModules === "function" ? BBC_DATA.listModules() : [];
    return [...new Set([...fromSchool, ...fromTeachers])].sort((a, b) => a.localeCompare(b));
  }

  function deptOptions() {
    return (BBC_DATA.departments || []).map((d) => ({
      value: d.id,
      label: d.label || d.name || d.id,
    }));
  }

  function levelOptions(deptId) {
    const opts = [{ value: "", label: "All years" }];
    for (const dept of BBC_DATA.departments || []) {
      if (deptId && dept.id !== deptId) continue;
      for (const lv of dept.levels || []) {
        opts.push({
          value: `${dept.id}:${lv.id}`,
          label: deptId ? lv.name : `${dept.label || dept.name} · ${lv.name}`,
        });
      }
    }
    return opts;
  }

  function classSelectOptions(deptId, levelKey) {
    const opts = [{ value: "", label: "All classes" }];
    for (const o of classOptions()) {
      if (deptId && o.departmentId && o.departmentId !== deptId) continue;
      if (levelKey) {
        const [d, l] = levelKey.split(":");
        if (o.departmentId !== d || o.levelId !== l) continue;
      }
      opts.push({ value: o.id, label: o.label });
    }
    return opts;
  }

  function teacherName(t) {
    return BBC_DATA.teacherDisplayName(t) || t.id;
  }

  function studentName(s) {
    return BBC_DATA.studentFullName(s);
  }

  function isStudentIncomplete(s) {
    return !s.dateOfBirth || !s.gender || !s.firstName || !s.lastName;
  }

  function incompleteStudents() {
    return BBC_DATA.listAllStudents().filter(({ student: s }) => isStudentIncomplete(s));
  }

  function incompleteTeachers() {
    return BBC_DATA.listAllTeachers().filter(({ teacher: t }) => {
      return !t.phone || (!t.firstName && !t.lastName) || !(t.modules || []).length;
    });
  }

  function avatarHtml(person, kind) {
    const photo = String(person?.photo || "").trim();
    const fallback =
      kind === "teacher" ? "assets/avatars/teacher.svg" : "assets/avatars/student.svg";
    const src = photo || fallback;
    const roleCls = kind === "teacher" ? "avatar-teacher" : "avatar-student";
    return `<span class="avatar ${roleCls} avatar-sm"><img src="${esc(src)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallback)}'" /></span>`;
  }

  function layout(active, title, lede, body) {
    const nav = [
      { id: "home", href: "#/manage", label: I18n.t("overview"), icon: "◆" },
      { id: "classes", href: "#/manage/classes", label: I18n.t("classesRosters"), icon: "▦" },
      { id: "students", href: "#/manage/students", label: I18n.t("allStudents"), icon: "○" },
      { id: "teachers", href: "#/manage/teachers", label: I18n.t("teachers"), icon: "◇" },
      { id: "incomplete", href: "#/manage/incomplete", label: I18n.t("missingInfo"), icon: "!" },
    ];
    return `
      <div class="admin-shell">
        <aside class="admin-nav">
          <div class="admin-nav-brand">
            <span class="admin-nav-mark">Q.E.A</span>
            <span>${esc(I18n.t("adminConsole"))}</span>
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

  function studentCoreFields(s = {}, classId = "") {
    const classOpts = classOptions();
    return `
      ${sectionTitle("Identity", "Arabic & Latin names as shown on the student profile")}
      ${field("lastName", I18n.t("lastNameAr"), s.lastName || "", { required: true })}
      ${field("firstName", I18n.t("firstNameAr"), s.firstName || "", { required: true })}
      ${field("lastNameLatin", I18n.t("lastNameLatin"), s.lastNameLatin || "")}
      ${field("firstNameLatin", I18n.t("firstNameLatin"), s.firstNameLatin || "")}
      ${sectionTitle("Class & status")}
      ${field("number", "Roster #", s.number ?? "", { type: "number", min: 0 })}
      ${field("gender", "Gender", s.gender || "", { type: "select", options: GENDER_OPTS })}
      ${field("dateOfBirth", "Date of birth", s.dateOfBirth || "", { placeholder: "e.g. 12/03/2015" })}
      ${field("classId", "Class", classId || s.classId || classOpts[0]?.id || "", {
        type: "select",
        options: classOpts.map((o) => ({ value: o.id, label: o.label })),
      })}
      ${field("notes", "Notes", s.notes || "", { type: "textarea", full: true })}
      ${field("photo", I18n.t("photo"), s.photo || "", { full: true, hint: I18n.t("photoHint") })}
    `;
  }

  function previousYearFields(details = {}) {
    const d = details || {};
    return `
      <div class="admin-prev-block">
        ${sectionTitle("Previous year record", "Same fields as “More details” on the student profile — leave blank if none")}
        ${field("prev_previousYear", "Previous year", d.previousYear || "", {
          type: "select",
          options: PREV_YEAR_OPTS,
        })}
        ${field("prev_previousYearAr", "Previous year (Arabic)", d.previousYearAr || "")}
        ${field("prev_previousClass", "Previous class", d.previousClass || "", {
          placeholder: "e.g. 4AP2, GS1",
        })}
        ${PREV_YEAR_FIELDS.map((f) =>
          field(`prev_${f.key}`, f.label, d[f.key] || "", {
            type: f.type,
            full: f.type === "textarea",
            rows: 2,
          })
        ).join("")}
      </div>
    `;
  }

  function buildPreviousYearDetails(b) {
    const out = {};
    const map = {
      prev_previousYear: "previousYear",
      prev_previousYearAr: "previousYearAr",
      prev_previousClass: "previousClass",
    };
    PREV_YEAR_FIELDS.forEach((f) => {
      map[`prev_${f.key}`] = f.key;
    });
    let any = false;
    for (const [formKey, dataKey] of Object.entries(map)) {
      const val = (b[formKey] || "").toString().trim();
      if (val) {
        out[dataKey] = val;
        any = true;
      }
    }
    return any ? out : null;
  }

  function studentPayload(b, extra = {}) {
    const prev = buildPreviousYearDetails(b);
    const payload = {
      lastName: b.lastName,
      firstName: b.firstName,
      lastNameLatin: b.lastNameLatin || "",
      firstNameLatin: b.firstNameLatin || "",
      number: Number(b.number) || 0,
      gender: b.gender || "",
      dateOfBirth: b.dateOfBirth || "",
      notes: b.notes || "",
      photo: b.photo || "",
      classId: b.classId,
      fullName: `${b.lastName} ${b.firstName}`.trim(),
      fullNameLatin: `${b.firstNameLatin || ""} ${b.lastNameLatin || ""}`.trim(),
      ...extra,
    };
    const clearPrev = Array.isArray(b.clearPrev)
      ? b.clearPrev.includes("1")
      : b.clearPrev === "1";
    if (clearPrev) payload.previousYearDetails = null;
    else if (prev) payload.previousYearDetails = prev;
    return payload;
  }

  function personCard({ name, meta, badges = [], warn, actions, avatar }) {
    return `
      <article class="admin-person-card${warn ? " is-warn" : ""}">
        <div class="admin-person-main">
          ${avatar || ""}
          <div class="admin-person-text">
            <strong dir="auto">${esc(name)}</strong>
            <div class="admin-person-meta">${meta}</div>
            ${
              badges.length
                ? `<div class="admin-chip-row">${badges.map((b) => `<span class="admin-chip">${esc(b)}</span>`).join("")}</div>`
                : ""
            }
          </div>
        </div>
        <div class="admin-person-actions">${actions}</div>
      </article>
    `;
  }

  function viewAdminHome() {
    const stats = BBC_DATA.stats();
    const missS = incompleteStudents().length;
    const missT = incompleteTeachers().length;
    return layout(
      "home",
      I18n.t("dataManagement"),
      I18n.t("dataManagementLede"),
      `
      <div class="admin-stat-row">
        <div class="admin-stat"><span class="k">Students</span><span class="v">${stats.students}</span></div>
        <div class="admin-stat"><span class="k">Teachers</span><span class="v">${stats.teachers}</span></div>
        <div class="admin-stat"><span class="k">Classes</span><span class="v">${stats.classes}</span></div>
        <div class="admin-stat${missS + missT ? " warn" : ""}"><span class="k">Missing fields</span><span class="v">${missS + missT}</span></div>
      </div>
      <div class="admin-action-grid">
        <button type="button" class="admin-action-card" data-nav="#/manage/classes">
          <span class="admin-action-tag">Rosters</span>
          <h3>Classes &amp; rosters</h3>
          <p>Open a class, manage students and teachers, add or transfer members.</p>
          <span class="cta">Open classes →</span>
        </button>
        <button type="button" class="admin-action-card" data-nav="#/manage/students">
          <span class="admin-action-tag">People</span>
          <h3>Students</h3>
          <p>Search, filter by department / year / gender, edit full profiles including previous-year details.</p>
          <span class="cta">Manage students →</span>
        </button>
        <button type="button" class="admin-action-card" data-nav="#/manage/teachers">
          <span class="admin-action-tag">Staff</span>
          <h3>Teachers</h3>
          <p>Update contacts, subjects, departments, and class assignments with simple selects.</p>
          <span class="cta">Manage teachers →</span>
        </button>
        <button type="button" class="admin-action-card${missS + missT ? " warn" : ""}" data-nav="#/manage/incomplete">
          <span class="admin-action-tag">Quality</span>
          <h3>Missing information</h3>
          <p>${missS} students and ${missT} teachers still need DOB, gender, phone, or name fields.</p>
          <span class="cta">Fill gaps →</span>
        </button>
      </div>
    `
    );
  }

  function viewClassesIndex(params) {
    const deptId = params?.get("dept") || "";
    const q = (params?.get("q") || "").trim().toLowerCase();
    const blocks = BBC_DATA.departments
      .filter((dept) => !deptId || dept.id === deptId)
      .map((dept) => {
        const levels = (dept.levels || [])
          .map((lv) => {
            const cards = (lv.classes || [])
              .filter((c) => {
                if (!q) return true;
                return `${c.code} ${c.name || ""} ${c.nameAr || ""}`.toLowerCase().includes(q);
              })
              .map(
                (c) => `
              <button type="button" class="admin-class-pill" data-nav="#/manage/classes/${esc(c.id)}">
                <strong>${esc(c.code)}</strong>
                <span>${(c.students || []).length} students</span>
                <span>${(c.teacherIds || []).length} teachers</span>
              </button>`
              )
              .join("");
            if (!cards) return "";
            return `<div class="admin-level-block"><h3>${esc(lv.name)}</h3><div class="admin-class-pills">${cards}</div></div>`;
          })
          .filter(Boolean)
          .join("");
        if (!levels) return "";
        return `<section class="admin-panel admin-dept-block"><div class="admin-panel-label">${esc(dept.label || dept.name)}</div>${levels}</section>`;
      })
      .filter(Boolean)
      .join("");

    return layout(
      "classes",
      "Classes & rosters",
      "Pick a class to manage its students and assigned teachers.",
      `
      <form id="admin-class-filter" class="admin-filter-bar">
        <input type="search" name="q" placeholder="Find class code…" value="${esc(params?.get("q") || "")}" />
        <select name="dept">
          <option value="">All departments</option>
          ${deptOptions()
            .map((o) => `<option value="${esc(o.value)}"${o.value === deptId ? " selected" : ""}>${esc(o.label)}</option>`)
            .join("")}
        </select>
        <button type="submit" class="btn btn-primary btn-sm">Filter</button>
      </form>
      ${blocks || `<div class="admin-empty">No classes match your filters.</div>`}
    `
    );
  }

  function viewClassDetail(classId) {
    const found = BBC_DATA.findClassById(classId);
    if (!found) return layout("classes", "Class not found", "", `<p class="muted">Unknown class.</p>`);
    const { dept, level, cls } = found;
    const students = [...(cls.students || [])].sort((a, b) => (a.number || 0) - (b.number || 0));
    const teachers = (cls.teacherIds || []).map((id) => BBC_DATA.getTeacher(id)).filter(Boolean);
    const allTeachers = BBC_DATA.teachers || [];
    const classOpts = classOptions().filter((o) => o.id !== cls.id);
    const incomplete = students.filter(isStudentIncomplete).length;

    return layout(
      "classes",
      `${cls.code}`,
      `${esc(dept.label || dept.name)} · ${esc(level.name)}${cls.floor ? " · " + esc(cls.floor) : ""} · ${students.length} students${incomplete ? ` · ${incomplete} incomplete` : ""}`,
      `
      <div class="admin-toolbar">
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/classes">← All classes</button>
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/classes/${esc(cls.id)}/edit">Edit class</button>
        <button type="button" class="btn btn-primary btn-sm" data-nav="#/manage/students/new?classId=${esc(cls.id)}">+ Add student</button>
      </div>

      <div class="admin-split">
        <section class="admin-panel">
          <div class="admin-panel-head">
            <div class="admin-panel-label">Students</div>
            <input type="search" class="admin-inline-search" id="admin-roster-q" placeholder="Filter roster…" />
          </div>
          <div class="admin-person-list" id="admin-roster-list">
            ${
              students.length
                ? students
                    .map((s) => {
                      const warn = isStudentIncomplete(s);
                      const search = `${s.searchName || ""} ${studentName(s)} ${s.id}`.toLowerCase();
                      return `
                      <article class="admin-person-card${warn ? " is-warn" : ""}" data-roster-q="${esc(search)}">
                        <div class="admin-person-main">
                          <span class="admin-roster-num">${esc(s.number ?? "—")}</span>
                          ${avatarHtml(s, "student")}
                          <div class="admin-person-text">
                            <strong dir="auto">${esc(studentName(s))}</strong>
                            <div class="admin-person-meta">${esc(s.gender || "—")} · DOB ${esc(s.dateOfBirth || "—")}${warn ? " · needs info" : ""}</div>
                          </div>
                        </div>
                        <div class="admin-person-actions">
                          <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/students/${esc(s.id)}">Edit</button>
                          <button type="button" class="btn btn-ghost btn-sm admin-transfer-btn" data-id="${esc(s.id)}" data-name="${esc(studentName(s))}" data-from="${esc(cls.code)}">Transfer</button>
                          <button type="button" class="btn btn-ghost btn-sm admin-del-student" data-id="${esc(s.id)}" data-back="#/manage/classes/${esc(cls.id)}">Remove</button>
                        </div>
                      </article>`;
                    })
                    .join("")
                : `<div class="admin-empty">No students yet. Add the first one.</div>`
            }
          </div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-label">Teachers</div>
          <div class="admin-person-list">
            ${
              teachers.length
                ? teachers
                    .map(
                      (t) =>
                        personCard({
                          name: teacherName(t),
                          meta: `${(t.modules || []).join(", ") || "No subjects"} · ${t.phone || "no phone"}`,
                          avatar: avatarHtml(t, "teacher"),
                          actions: `
                            <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/teachers/${esc(t.id)}">Edit</button>
                            <button type="button" class="btn btn-ghost btn-sm admin-unassign-teacher" data-teacher="${esc(t.id)}" data-class="${esc(cls.id)}">Unassign</button>`,
                        })
                    )
                    .join("")
                : `<div class="admin-empty">No teachers linked.</div>`
            }
          </div>
          <form id="admin-assign-teacher" class="admin-form admin-form-stack" data-class-id="${esc(cls.id)}" style="margin-top:1rem">
            ${field("teacherId", "Assign teacher", "", {
              type: "select",
              full: true,
              options: [
                { value: "", label: "Select teacher…" },
                ...allTeachers
                  .filter((t) => !(cls.teacherIds || []).includes(t.id))
                  .map((t) => ({
                    value: t.id,
                    label: `${teacherName(t)} · ${(t.modules || [])[0] || "—"}`,
                  })),
              ],
            })}
            <button type="submit" class="btn btn-primary btn-sm">Assign to class</button>
          </form>
        </section>
      </div>

      <div id="admin-transfer-modal" class="admin-modal" hidden>
        <div class="admin-modal-card">
          <h3>Transfer student</h3>
          <p class="muted" id="admin-transfer-label"></p>
          <form id="admin-transfer-form" class="admin-form">
            <input type="hidden" name="studentId" />
            ${field("classId", "Destination class", classOpts[0]?.id || "", {
              type: "select",
              full: true,
              options: classOpts.map((o) => ({ value: o.id, label: o.label })),
            })}
            ${field("number", "New number in class (optional)", "", { type: "number" })}
            <div class="admin-form-actions">
              <button type="submit" class="btn btn-primary">Transfer</button>
              <button type="button" class="btn btn-ghost" id="admin-transfer-cancel">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `
    );
  }

  function viewEditClass(classId) {
    const found = BBC_DATA.findClassById(classId);
    if (!found) return layout("classes", "Not found", "", "");
    const c = found.cls;
    const mods = allModules();
    return layout(
      "classes",
      `Edit ${c.code}`,
      "Update class details. Student roster stays on the class page.",
      `
      <form id="admin-class-edit" class="admin-form admin-panel" data-id="${esc(c.id)}">
        ${field("name", "Display name", c.name || c.code)}
        ${field("nameAr", "Arabic name", c.nameAr || "")}
        ${field("code", "Code", c.code)}
        ${field("floor", "Floor", c.floor || "")}
        ${field("floorRaw", "Floor (AR)", c.floorRaw || "")}
        ${field("modules", "Modules", "", {
          type: "checkbox-group",
          full: true,
          values: c.modules || [],
          options: mods.map((m) => ({ value: m, label: m })),
        })}
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" class="btn btn-ghost" data-nav="#/manage/classes/${esc(c.id)}">Back to roster</button>
        </div>
      </form>
    `
    );
  }

  function viewManageStudents(params) {
    const q = (params?.get("q") || "").trim().toLowerCase();
    const filter = params?.get("filter") || "";
    const deptId = params?.get("dept") || "";
    const levelKey = params?.get("level") || "";
    const classId = params?.get("classId") || "";
    const gender = params?.get("gender") || "";

    let rows = BBC_DATA.listAllStudents();
    if (q) {
      rows = rows.filter(({ student: s, cls }) =>
        `${s.searchName || ""} ${s.fullName || ""} ${s.fullNameLatin || ""} ${s.id} ${cls.code}`.toLowerCase().includes(q)
      );
    }
    if (filter === "incomplete") {
      rows = rows.filter(({ student: s }) => isStudentIncomplete(s));
    }
    if (deptId) {
      rows = rows.filter(({ dept }) => dept.id === deptId);
    }
    if (levelKey) {
      const [d, l] = levelKey.split(":");
      rows = rows.filter(({ dept, level }) => dept.id === d && level.id === l);
    }
    if (classId) {
      rows = rows.filter(({ cls }) => cls.id === classId);
    }
    if (gender) {
      rows = rows.filter(({ student: s }) => (s.gender || "") === gender);
    }

    return layout(
      "students",
      "All students",
      `${rows.length} shown · search, filter, edit full profiles, or transfer.`,
      `
      <form id="admin-student-search" class="admin-filter-bar admin-filter-bar-wrap">
        <input type="search" name="q" placeholder="Search name, ID, or class…" value="${esc(params?.get("q") || "")}" />
        <select name="dept">
          <option value="">All departments</option>
          ${deptOptions()
            .map((o) => `<option value="${esc(o.value)}"${o.value === deptId ? " selected" : ""}>${esc(o.label)}</option>`)
            .join("")}
        </select>
        <select name="level">
          ${levelOptions(deptId)
            .map((o) => `<option value="${esc(o.value)}"${o.value === levelKey ? " selected" : ""}>${esc(o.label)}</option>`)
            .join("")}
        </select>
        <select name="classId">
          ${classSelectOptions(deptId, levelKey)
            .map((o) => `<option value="${esc(o.value)}"${o.value === classId ? " selected" : ""}>${esc(o.label)}</option>`)
            .join("")}
        </select>
        <select name="gender">
          <option value="">All genders</option>
          <option value="Female"${gender === "Female" ? " selected" : ""}>Female</option>
          <option value="Male"${gender === "Male" ? " selected" : ""}>Male</option>
        </select>
        <select name="filter">
          <option value="">All statuses</option>
          <option value="incomplete"${filter === "incomplete" ? " selected" : ""}>Missing info only</option>
        </select>
        <button type="submit" class="btn btn-primary btn-sm">Apply</button>
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/students">Reset</button>
        <button type="button" class="btn btn-primary btn-sm" data-nav="#/manage/students/new">+ New student</button>
      </form>

      <div class="admin-person-list admin-person-list-dense">
        ${
          rows.length
            ? rows
                .slice(0, 400)
                .map(({ student: s, cls, dept, level }) => {
                  const warn = isStudentIncomplete(s);
                  return personCard({
                    name: studentName(s),
                    meta: `${esc(cls.code)} · ${esc(level.name)} · ${esc(dept.label || dept.name)} · #${esc(s.number ?? "—")}`,
                    badges: [s.gender || "no gender", s.dateOfBirth ? `DOB ${s.dateOfBirth}` : "no DOB"].concat(
                      s.previousYearDetails ? ["prev. year"] : []
                    ),
                    warn,
                    avatar: avatarHtml(s, "student"),
                    actions: `
                      <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/students/${esc(s.id)}">Edit</button>
                      <button type="button" class="btn btn-ghost btn-sm admin-transfer-btn" data-id="${esc(s.id)}" data-name="${esc(studentName(s))}" data-from="${esc(cls.code)}">Transfer</button>
                      <button type="button" class="btn btn-ghost btn-sm admin-del-student" data-id="${esc(s.id)}" data-back="#/manage/students">Delete</button>`,
                  });
                })
                .join("")
            : `<div class="admin-empty">No students match these filters.</div>`
        }
      </div>
      ${rows.length > 400 ? `<p class="muted admin-list-note">Showing 400 of ${rows.length}. Narrow your search.</p>` : ""}

      <div id="admin-transfer-modal" class="admin-modal" hidden>
        <div class="admin-modal-card">
          <h3>Transfer student</h3>
          <p class="muted" id="admin-transfer-label"></p>
          <form id="admin-transfer-form" class="admin-form">
            <input type="hidden" name="studentId" />
            ${field("classId", "Destination class", classOptions()[0]?.id || "", {
              type: "select",
              full: true,
              options: classOptions().map((o) => ({ value: o.id, label: o.label })),
            })}
            ${field("number", "New number (optional)", "", { type: "number" })}
            <div class="admin-form-actions">
              <button type="submit" class="btn btn-primary">Transfer</button>
              <button type="button" class="btn btn-ghost" id="admin-transfer-cancel">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `
    );
  }

  function viewNewStudent(params) {
    const classId = params?.get("classId") || classOptions()[0]?.id || "";
    return layout(
      "students",
      "New student",
      "Fill identity, class, and optional previous-year follow-up — same fields as the director profile view.",
      `
      <form id="admin-student-create" class="admin-form admin-panel admin-form-wide">
        ${studentCoreFields({}, classId)}
        ${previousYearFields({})}
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Create student</button>
          <button type="button" class="btn btn-ghost" data-nav="${classId ? `#/manage/classes/${esc(classId)}` : "#/manage/students"}">Cancel</button>
        </div>
      </form>
    `
    );
  }

  function viewEditStudent(id) {
    const found = BBC_DATA.getStudent(id);
    if (!found) return layout("students", "Student not found", "", "");
    const s = found.student;
    return layout(
      "students",
      BBC_DATA.studentFullName(s),
      `Edit full profile · ${esc(found.cls.code)} · ${esc(found.level.name)}`,
      `
      <div class="admin-edit-hero">
        ${avatarHtml(s, "student")}
        <div>
          <div class="admin-chip-row">
            <span class="admin-chip">${esc(found.cls.code)}</span>
            <span class="admin-chip">${esc(s.gender || "no gender")}</span>
            ${s.previousYearDetails ? `<span class="admin-chip">has previous year</span>` : ""}
            ${isStudentIncomplete(s) ? `<span class="admin-chip warn">incomplete</span>` : ""}
          </div>
          <p class="muted" style="margin-top:0.35rem">ID ${esc(s.id)}</p>
        </div>
      </div>
      <form id="admin-student-edit" class="admin-form admin-panel admin-form-wide" data-id="${esc(s.id)}">
        ${studentCoreFields(s, s.classId)}
        ${previousYearFields(s.previousYearDetails || {})}
        <label class="admin-check admin-field-full" style="margin-top:0.5rem">
          <input type="checkbox" name="clearPrev" value="1" />
          <span>Clear previous-year record on save</span>
        </label>
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Save changes</button>
          <button type="button" class="btn btn-ghost" data-nav="#/manage/classes/${esc(s.classId)}">Open class roster</button>
          <button type="button" class="btn btn-ghost admin-del-student" data-id="${esc(s.id)}" data-back="#/manage/students">Delete</button>
        </div>
      </form>
    `
    );
  }

  function teacherFormFields(t = {}) {
    const mods = allModules();
    const opts = classOptions();
    return `
      ${sectionTitle("Identity & contact")}
      ${field("firstName", "First name", t.firstName || "")}
      ${field("lastName", "Last name", t.lastName || "")}
      ${field("nameLatin", "Latin name", t.nameLatin || "")}
      ${field("phone", "Phone", t.phone || "", { placeholder: "05…" })}
      ${field("wilaya", "Wilaya", t.wilaya || "Algiers", {
        type: "select",
        options: [{ value: "", label: "—" }, ...WILAYA_OPTS],
      })}
      ${field("commune", "Commune", t.commune || "", { placeholder: "e.g. Cheraga" })}
      ${sectionTitle("Teaching")}
      ${field("modules", "Subjects", "", {
        type: "checkbox-group",
        full: true,
        values: t.modules || [],
        options: mods.map((m) => ({ value: m, label: m })),
      })}
      ${field("departments", "Departments", "", {
        type: "checkbox-group",
        full: true,
        values: t.departments || [],
        options: deptOptions(),
      })}
      ${
        t.id
          ? field("classIds", "Assigned classes", "", {
              type: "checkbox-group",
              full: true,
              values: t.classIds || [],
              options: opts.map((o) => ({ value: o.id, label: o.label })),
            })
          : ""
      }
      ${field("photo", I18n.t("photo"), t.photo || "", { full: true, hint: I18n.t("photoHint") })}
    `;
  }

  function viewManageTeachers(params) {
    const q = (params?.get("q") || "").trim().toLowerCase();
    const deptId = params?.get("dept") || "";
    const module = params?.get("module") || "";
    const filter = params?.get("filter") || "";
    let rows = BBC_DATA.listAllTeachers();
    if (q) {
      rows = rows.filter(({ teacher: t }) =>
        `${teacherName(t)} ${t.phone || ""} ${(t.modules || []).join(" ")} ${t.wilaya || ""}`.toLowerCase().includes(q)
      );
    }
    if (deptId) {
      rows = rows.filter(({ teacher: t }) => (t.departments || []).includes(deptId));
    }
    if (module) {
      rows = rows.filter(({ teacher: t }) => (t.modules || []).includes(module));
    }
    if (filter === "incomplete") {
      rows = rows.filter(({ teacher: t }) => !t.phone || (!t.firstName && !t.lastName) || !(t.modules || []).length);
    }

    return layout(
      "teachers",
      "Teachers",
      `${rows.length} teachers · filter by department or subject, then edit.`,
      `
      <form id="admin-teacher-search" class="admin-filter-bar admin-filter-bar-wrap">
        <input type="search" name="q" placeholder="Search name, phone, subject…" value="${esc(params?.get("q") || "")}" />
        <select name="dept">
          <option value="">All departments</option>
          ${deptOptions()
            .map((o) => `<option value="${esc(o.value)}"${o.value === deptId ? " selected" : ""}>${esc(o.label)}</option>`)
            .join("")}
        </select>
        <select name="module">
          <option value="">All subjects</option>
          ${allModules()
            .map((m) => `<option value="${esc(m)}"${m === module ? " selected" : ""}>${esc(m)}</option>`)
            .join("")}
        </select>
        <select name="filter">
          <option value="">All statuses</option>
          <option value="incomplete"${filter === "incomplete" ? " selected" : ""}>Missing info only</option>
        </select>
        <button type="submit" class="btn btn-primary btn-sm">Apply</button>
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/teachers">Reset</button>
        <button type="button" class="btn btn-primary btn-sm" data-nav="#/manage/teachers/new">+ New teacher</button>
      </form>

      <div class="admin-person-list admin-person-list-dense">
        ${
          rows.length
            ? rows
                .map(({ teacher: t, classes }) => {
                  const warn = !t.phone || !(t.modules || []).length;
                  return personCard({
                    name: teacherName(t),
                    meta: `${esc(t.phone || "no phone")} · ${esc(t.wilaya || "—")}${t.commune ? " · " + esc(t.commune) : ""}`,
                    badges: [...(t.modules || []).slice(0, 3), `${(classes || []).length} classes`],
                    warn,
                    avatar: avatarHtml(t, "teacher"),
                    actions: `
                      <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/teachers/${esc(t.id)}">Edit</button>
                      <button type="button" class="btn btn-ghost btn-sm admin-del-teacher" data-id="${esc(t.id)}">Delete</button>`,
                  });
                })
                .join("")
            : `<div class="admin-empty">No teachers match these filters.</div>`
        }
      </div>
    `
    );
  }

  function viewNewTeacher() {
    return layout(
      "teachers",
      "New teacher",
      "Select subjects and departments — no need to type lists.",
      `
      <form id="admin-teacher-create" class="admin-form admin-panel admin-form-wide">
        ${teacherFormFields({})}
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Create teacher</button>
          <button type="button" class="btn btn-ghost" data-nav="#/manage/teachers">Cancel</button>
        </div>
      </form>
    `
    );
  }

  function viewEditTeacher(id) {
    const t = BBC_DATA.getTeacher(id);
    if (!t) return layout("teachers", "Teacher not found", "", "");
    return layout(
      "teachers",
      teacherName(t),
      "Update contact details, subjects, and class assignments.",
      `
      <div class="admin-edit-hero">
        ${avatarHtml(t, "teacher")}
        <div>
          <div class="admin-chip-row">
            ${(t.modules || []).map((m) => `<span class="admin-chip">${esc(m)}</span>`).join("") || `<span class="admin-chip warn">no subjects</span>`}
          </div>
          <p class="muted" style="margin-top:0.35rem">ID ${esc(t.id)}</p>
        </div>
      </div>
      <form id="admin-teacher-edit" class="admin-form admin-panel admin-form-wide" data-id="${esc(t.id)}">
        ${teacherFormFields(t)}
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Save teacher</button>
          <button type="button" class="btn btn-ghost" data-nav="#/manage/teachers">Back</button>
          <button type="button" class="btn btn-ghost admin-del-teacher" data-id="${esc(t.id)}">Delete</button>
        </div>
      </form>
    `
    );
  }

  function viewIncomplete() {
    const students = incompleteStudents();
    const teachers = incompleteTeachers();
    return layout(
      "incomplete",
      "Missing information",
      "Complete blank fields so directories and reports stay accurate.",
      `
      <section class="admin-panel" style="margin-bottom:1rem">
        <div class="admin-panel-label">Students (${students.length})</div>
        <div class="admin-person-list admin-person-list-dense">
          ${
            students.length
              ? students
                  .slice(0, 200)
                  .map(({ student: s, cls }) => {
                    const miss = [
                      !s.lastName || !s.firstName ? "name" : null,
                      !s.gender ? "gender" : null,
                      !s.dateOfBirth ? "DOB" : null,
                    ]
                      .filter(Boolean)
                      .join(", ");
                    return personCard({
                      name: studentName(s) || s.fullName || "—",
                      meta: `${esc(cls.code)} · missing: ${esc(miss)}`,
                      warn: true,
                      avatar: avatarHtml(s, "student"),
                      actions: `<button type="button" class="btn btn-primary btn-sm" data-nav="#/manage/students/${esc(s.id)}">Complete</button>`,
                    });
                  })
                  .join("")
              : `<div class="admin-empty">All student core fields filled.</div>`
          }
        </div>
      </section>
      <section class="admin-panel">
        <div class="admin-panel-label">Teachers (${teachers.length})</div>
        <div class="admin-person-list admin-person-list-dense">
          ${
            teachers.length
              ? teachers
                  .map(({ teacher: t }) => {
                    const miss = [
                      !t.firstName && !t.lastName ? "name" : null,
                      !t.phone ? "phone" : null,
                      !(t.modules || []).length ? "subjects" : null,
                    ]
                      .filter(Boolean)
                      .join(", ");
                    return personCard({
                      name: teacherName(t),
                      meta: `missing: ${esc(miss)}`,
                      warn: true,
                      avatar: avatarHtml(t, "teacher"),
                      actions: `<button type="button" class="btn btn-primary btn-sm" data-nav="#/manage/teachers/${esc(t.id)}">Complete</button>`,
                    });
                  })
                  .join("")
              : `<div class="admin-empty">All teacher core fields filled.</div>`
          }
        </div>
      </section>
    `
    );
  }

  function formData(form) {
    const fd = new FormData(form);
    const obj = {};
    for (const [k, v] of fd.entries()) {
      if (obj[k] === undefined) obj[k] = String(v).trim();
      else if (Array.isArray(obj[k])) obj[k].push(String(v).trim());
      else obj[k] = [obj[k], String(v).trim()];
    }
    const checkNames = new Set(
      [...form.querySelectorAll('input[type="checkbox"][name]')].map((c) => c.name)
    );
    checkNames.forEach((name) => {
      obj[name] = [...form.querySelectorAll(`input[type="checkbox"][name="${name}"]:checked`)].map(
        (c) => c.value
      );
    });
    return obj;
  }

  function asList(val) {
    if (Array.isArray(val)) return val.filter(Boolean);
    if (!val) return [];
    return String(val)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function bind(root, go) {
    const flash = async (fn, back) => {
      try {
        await fn();
        await refreshData();
        go(back);
      } catch (err) {
        alert(err.message || "Operation failed");
      }
    };

    root.querySelector("#admin-class-filter")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const b = formData(e.target);
      const qs = new URLSearchParams();
      if (b.q) qs.set("q", b.q);
      if (b.dept) qs.set("dept", b.dept);
      go("/manage/classes" + (qs.toString() ? `?${qs}` : ""));
    });

    root.querySelector("#admin-roster-q")?.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      root.querySelectorAll("[data-roster-q]").forEach((el) => {
        const hay = el.getAttribute("data-roster-q") || "";
        el.hidden = q && !hay.includes(q);
      });
    });

    root.querySelector("#admin-student-search")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const b = formData(e.target);
      const qs = new URLSearchParams();
      ["q", "dept", "level", "classId", "gender", "filter"].forEach((k) => {
        if (b[k]) qs.set(k, b[k]);
      });
      go("/manage/students" + (qs.toString() ? `?${qs}` : ""));
    });

    // Cascade dept → level → class by re-navigating on change for simplicity
    const studentFilter = root.querySelector("#admin-student-search");
    studentFilter?.querySelector('[name="dept"]')?.addEventListener("change", () => {
      const b = formData(studentFilter);
      const qs = new URLSearchParams();
      if (b.q) qs.set("q", b.q);
      if (b.dept) qs.set("dept", b.dept);
      if (b.gender) qs.set("gender", b.gender);
      if (b.filter) qs.set("filter", b.filter);
      go("/manage/students" + (qs.toString() ? `?${qs}` : ""));
    });

    root.querySelector("#admin-teacher-search")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const b = formData(e.target);
      const qs = new URLSearchParams();
      ["q", "dept", "module", "filter"].forEach((k) => {
        if (b[k]) qs.set(k, b[k]);
      });
      go("/manage/teachers" + (qs.toString() ? `?${qs}` : ""));
    });

    root.querySelector("#admin-student-create")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const b = formData(e.target);
      const cls = BBC_DATA.findClassById(b.classId);
      if (!cls) {
        alert("Select a class");
        return;
      }
      flash(async () => {
        await BBC_API.post("/students", studentPayload(b, { departmentId: cls.dept.id }));
      }, `/manage/classes/${b.classId}`);
    });

    root.querySelector("#admin-student-edit")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = e.target.getAttribute("data-id");
      const b = formData(e.target);
      const cls = BBC_DATA.findClassById(b.classId);
      const payload = studentPayload(b, { departmentId: cls?.dept.id });
      flash(async () => {
        await BBC_API.put(`/students/${id}`, payload);
      }, `/manage/classes/${b.classId}`);
    });

    root.querySelectorAll(".admin-del-student").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("Delete this student permanently?")) return;
        const back = btn.getAttribute("data-back") || "#/manage/students";
        flash(async () => {
          await BBC_API.del(`/students/${btn.getAttribute("data-id")}`);
        }, back.replace(/^#/, ""));
      });
    });

    const modal = root.querySelector("#admin-transfer-modal");
    root.querySelectorAll(".admin-transfer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!modal) return;
        modal.hidden = false;
        root.querySelector("#admin-transfer-label").textContent =
          `${btn.getAttribute("data-name")} · from ${btn.getAttribute("data-from")}`;
        modal.querySelector('[name="studentId"]').value = btn.getAttribute("data-id");
      });
    });
    root.querySelector("#admin-transfer-cancel")?.addEventListener("click", () => {
      if (modal) modal.hidden = true;
    });
    root.querySelector("#admin-transfer-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const b = formData(e.target);
      const payload = { classId: b.classId };
      if (b.number) payload.number = Number(b.number);
      flash(async () => {
        await BBC_API.post(`/students/${b.studentId}/transfer`, payload);
      }, `/manage/classes/${b.classId}`);
    });

    root.querySelector("#admin-teacher-create")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const b = formData(e.target);
      flash(async () => {
        await BBC_API.post("/teachers", {
          firstName: b.firstName,
          lastName: b.lastName,
          nameLatin: b.nameLatin,
          phone: b.phone,
          wilaya: b.wilaya,
          commune: b.commune,
          modules: asList(b.modules),
          departments: asList(b.departments),
          classIds: [],
          photo: b.photo || "",
        });
      }, "/manage/teachers");
    });

    root.querySelector("#admin-teacher-edit")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = e.target.getAttribute("data-id");
      const b = formData(e.target);
      flash(async () => {
        await BBC_API.put(`/teachers/${id}`, {
          firstName: b.firstName,
          lastName: b.lastName,
          nameLatin: b.nameLatin,
          phone: b.phone,
          wilaya: b.wilaya,
          commune: b.commune,
          modules: asList(b.modules),
          departments: asList(b.departments),
          classIds: asList(b.classIds),
          photo: b.photo || "",
        });
      }, "/manage/teachers");
    });

    root.querySelectorAll(".admin-del-teacher").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("Delete this teacher?")) return;
        flash(async () => {
          await BBC_API.del(`/teachers/${btn.getAttribute("data-id")}`);
        }, "/manage/teachers");
      });
    });

    root.querySelector("#admin-assign-teacher")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const classId = e.target.getAttribute("data-class-id");
      const b = formData(e.target);
      if (!b.teacherId) return;
      const t = BBC_DATA.getTeacher(b.teacherId);
      const classIds = [...new Set([...(t.classIds || []), classId])];
      flash(async () => {
        await BBC_API.put(`/teachers/${b.teacherId}`, { classIds });
      }, `/manage/classes/${classId}`);
    });

    root.querySelectorAll(".admin-unassign-teacher").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tid = btn.getAttribute("data-teacher");
        const cid = btn.getAttribute("data-class");
        const t = BBC_DATA.getTeacher(tid);
        const classIds = (t.classIds || []).filter((x) => x !== cid);
        flash(async () => {
          await BBC_API.put(`/teachers/${tid}`, { classIds });
        }, `/manage/classes/${cid}`);
      });
    });

    root.querySelector("#admin-class-edit")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = e.target.getAttribute("data-id");
      const b = formData(e.target);
      flash(async () => {
        await BBC_API.put(`/classes/${id}`, {
          name: b.name,
          nameAr: b.nameAr,
          code: b.code,
          floor: b.floor,
          floorRaw: b.floorRaw,
          modules: asList(b.modules),
        });
      }, `/manage/classes/${id}`);
    });
  }

  function resolve(parts, params) {
    if (!parts.length || parts[0] !== "manage") return null;
    const [, section, id, action] = parts;
    if (!section) return viewAdminHome();
    if (section === "classes" && !id) return viewClassesIndex(params);
    if (section === "classes" && id && action === "edit") return viewEditClass(id);
    if (section === "classes" && id) return viewClassDetail(id);
    if (section === "students" && id === "new") return viewNewStudent(params);
    if (section === "students" && id) return viewEditStudent(id);
    if (section === "students") return viewManageStudents(params);
    if (section === "teachers" && id === "new") return viewNewTeacher();
    if (section === "teachers" && id) return viewEditTeacher(id);
    if (section === "teachers") return viewManageTeachers(params);
    if (section === "incomplete") return viewIncomplete();
    return viewAdminHome();
  }

  return { resolve, bind };
})();

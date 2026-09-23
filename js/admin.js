/**
 * Professional admin console — class-first workflows, transfer, incomplete data.
 */
const AdminApp = (() => {
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
    if (type === "textarea") {
      return `<label class="admin-field${full}"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="${opts.rows || 3}">${esc(value)}</textarea></label>`;
    }
    if (type === "select") {
      const options = (opts.options || [])
        .map(
          (o) =>
            `<option value="${esc(o.value)}"${String(o.value) === String(value) ? " selected" : ""}>${esc(o.label)}</option>`
        )
        .join("");
      return `<label class="admin-field${full}"><span>${esc(label)}</span><select name="${esc(name)}">${options}</select></label>`;
    }
    if (type === "checkbox-group") {
      const boxes = (opts.options || [])
        .map((o) => {
          const checked = (opts.values || []).includes(o.value) ? " checked" : "";
          return `<label class="admin-check"><input type="checkbox" name="${esc(name)}" value="${esc(o.value)}"${checked}/><span>${esc(o.label)}</span></label>`;
        })
        .join("");
      return `<div class="admin-field${full}"><span>${esc(label)}</span><div class="admin-check-grid">${boxes}</div></div>`;
    }
    return `<label class="admin-field${full}"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${opts.required ? "required" : ""} /></label>`;
  }

  async function refreshData() {
    const data = await BBC_API.loadSchoolData();
    BBC_DATA.setData(data);
  }

  function classOptions() {
    return BBC_DATA.listClassOptions();
  }

  function teacherName(t) {
    return BBC_DATA.teacherDisplayName(t) || t.id;
  }

  function studentName(s) {
    return BBC_DATA.studentFullName(s);
  }

  function incompleteStudents() {
    return BBC_DATA.listAllStudents().filter(({ student: s }) => {
      return !s.dateOfBirth || !s.gender || !s.firstName || !s.lastName;
    });
  }

  function incompleteTeachers() {
    return BBC_DATA.listAllTeachers().filter(({ teacher: t }) => {
      return !t.phone || (!t.firstName && !t.lastName) || !(t.modules || []).length;
    });
  }

  function layout(active, title, lede, body) {
    const nav = [
      { id: "home", href: "#/manage", label: I18n.t("overview") },
      { id: "classes", href: "#/manage/classes", label: I18n.t("classesRosters") },
      { id: "students", href: "#/manage/students", label: I18n.t("allStudents") },
      { id: "teachers", href: "#/manage/teachers", label: I18n.t("teachers") },
      { id: "incomplete", href: "#/manage/incomplete", label: I18n.t("missingInfo") },
      { id: "browse", href: "#/home", label: I18n.t("directorView") },
    ];
    return `
      <div class="admin-shell">
        <aside class="admin-nav">
          <div class="admin-nav-brand">${esc(I18n.t("adminConsole"))}</div>
          ${nav
            .map(
              (n) =>
                `<button type="button" class="admin-nav-link${active === n.id ? " active" : ""}" data-nav="${esc(n.href)}">${esc(n.label)}</button>`
            )
            .join("")}
        </aside>
        <div class="admin-main">
          <div class="page-header">
            <h1>${esc(title)}</h1>
            ${lede ? `<p class="lede">${lede}</p>` : ""}
          </div>
          ${body}
        </div>
      </div>
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
      <div class="stats-row">
        <div class="stat-card"><div class="label">Students</div><div class="value">${stats.students}</div></div>
        <div class="stat-card"><div class="label">Teachers</div><div class="value">${stats.teachers}</div></div>
        <div class="stat-card"><div class="label">Classes</div><div class="value">${stats.classes}</div></div>
        <div class="stat-card"><div class="label">Missing fields</div><div class="value">${missS + missT}</div></div>
      </div>
      <div class="admin-action-grid">
        <button type="button" class="admin-action-card" data-nav="#/manage/classes">
          <h3>Classes &amp; rosters</h3>
          <p>Open a class (e.g. 4P10, 1M1), manage its students and teachers, add or remove members.</p>
          <span class="cta">Open classes →</span>
        </button>
        <button type="button" class="admin-action-card" data-nav="#/manage/students">
          <h3>Students</h3>
          <p>Search anyone, edit profile fields, transfer to another class, or delete.</p>
          <span class="cta">Manage students →</span>
        </button>
        <button type="button" class="admin-action-card" data-nav="#/manage/teachers">
          <h3>Teachers</h3>
          <p>Update contact info, subjects, and which classes each teacher teaches.</p>
          <span class="cta">Manage teachers →</span>
        </button>
        <button type="button" class="admin-action-card${missS + missT ? " warn" : ""}" data-nav="#/manage/incomplete">
          <h3>Missing information</h3>
          <p>${missS} students and ${missT} teachers still need DOB, gender, phone, or name fields.</p>
          <span class="cta">Fill gaps →</span>
        </button>
      </div>
    `
    );
  }

  function viewClassesIndex() {
    const blocks = BBC_DATA.departments
      .map((dept) => {
        const levels = (dept.levels || [])
          .map((lv) => {
            const cards = (lv.classes || [])
              .map(
                (c) => `
              <button type="button" class="admin-class-pill" data-nav="#/manage/classes/${esc(c.id)}">
                <strong>${esc(c.code)}</strong>
                <span>${(c.students || []).length} students</span>
                <span>${(c.teacherIds || []).length} teachers</span>
              </button>`
              )
              .join("");
            return `<div class="admin-level-block"><h3>${esc(lv.name)}</h3><div class="admin-class-pills">${cards}</div></div>`;
          })
          .join("");
        return `<section class="info-panel admin-dept-block"><div class="panel-label">${esc(dept.label)}</div>${levels}</section>`;
      })
      .join("");
    return layout("classes", "Classes & rosters", "Pick a class code to manage its students and assigned teachers.", blocks);
  }

  function viewClassDetail(classId) {
    const found = BBC_DATA.findClassById(classId);
    if (!found) return layout("classes", "Class not found", "", `<p class="muted">Unknown class.</p>`);
    const { dept, level, cls } = found;
    const students = [...(cls.students || [])].sort((a, b) => (a.number || 0) - (b.number || 0));
    const teachers = (cls.teacherIds || []).map((id) => BBC_DATA.getTeacher(id)).filter(Boolean);
    const allTeachers = BBC_DATA.teachers || [];
    const classOpts = classOptions().filter((o) => o.id !== cls.id);

    return layout(
      "classes",
      `${cls.code}`,
      `${esc(dept.label)} · ${esc(level.name)}${cls.floor ? " · " + esc(cls.floor) : ""} · ${(students || []).length} students`,
      `
      <div class="admin-toolbar">
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/classes">← All classes</button>
        <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/classes/${esc(cls.id)}/edit">Edit class details</button>
      </div>

      <div class="admin-split">
        <section class="info-panel">
          <div class="panel-label">Students in ${esc(cls.code)}</div>
          <form id="admin-add-to-class" class="admin-form compact" data-class-id="${esc(cls.id)}" data-dept="${esc(dept.id)}">
            ${field("lastName", I18n.t("lastNameAr"), "", { required: true })}
            ${field("firstName", I18n.t("firstNameAr"), "", { required: true })}
            ${field("lastNameLatin", I18n.t("lastNameLatin"), "")}
            ${field("firstNameLatin", I18n.t("firstNameLatin"), "")}
            ${field("number", "No.", String((students.at(-1)?.number || 0) + 1), { type: "number" })}
            ${field("gender", "Gender", "", {
              type: "select",
              options: [
                { value: "", label: "—" },
                { value: "Female", label: "Female" },
                { value: "Male", label: "Male" },
              ],
            })}
            ${field("dateOfBirth", "DOB")}
            <button type="submit" class="btn btn-primary btn-sm">Add to class</button>
          </form>
          <div class="table-wrap" style="margin-top:1rem">
            <table class="data-table">
              <thead><tr><th>#</th><th>Name</th><th>Gender</th><th>DOB</th><th>Actions</th></tr></thead>
              <tbody>
                ${
                  students.length
                    ? students
                        .map(
                          (s) => `<tr class="${!s.dateOfBirth || !s.gender ? "row-warn" : ""}">
                          <td>${esc(s.number)}</td>
                          <td dir="auto">${esc(studentName(s))}</td>
                          <td>${esc(s.gender || "—")}</td>
                          <td>${esc(s.dateOfBirth || "—")}</td>
                          <td class="admin-actions">
                            <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/students/${esc(s.id)}">Edit</button>
                            <button type="button" class="btn btn-ghost btn-sm admin-transfer-btn" data-id="${esc(s.id)}" data-name="${esc(studentName(s))}" data-from="${esc(cls.code)}">Transfer</button>
                            <button type="button" class="btn btn-ghost btn-sm admin-del-student" data-id="${esc(s.id)}" data-back="#/manage/classes/${esc(cls.id)}">Remove</button>
                          </td>
                        </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="5" class="muted">No students yet.</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="info-panel">
          <div class="panel-label">Teachers for ${esc(cls.code)}</div>
          <ul class="admin-teacher-list">
            ${
              teachers.length
                ? teachers
                    .map(
                      (t) => `<li>
                        <div>
                          <strong dir="auto">${esc(teacherName(t))}</strong>
                          <div class="muted">${esc((t.modules || []).join(", ") || "No subjects")} · ${esc(t.phone || "no phone")}</div>
                        </div>
                        <div class="admin-actions">
                          <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/teachers/${esc(t.id)}">Edit</button>
                          <button type="button" class="btn btn-ghost btn-sm admin-unassign-teacher" data-teacher="${esc(t.id)}" data-class="${esc(cls.id)}">Unassign</button>
                        </div>
                      </li>`
                    )
                    .join("")
                : `<li class="muted">No teachers linked.</li>`
            }
          </ul>
          <form id="admin-assign-teacher" class="admin-form compact" data-class-id="${esc(cls.id)}" style="margin-top:1rem">
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
    return layout(
      "classes",
      `Edit ${c.code}`,
      "Update class metadata. Student roster is managed from the class page.",
      `
      <form id="admin-class-edit" class="admin-form info-panel" data-id="${esc(c.id)}">
        ${field("name", "Display name", c.name || c.code)}
        ${field("nameAr", "Arabic name", c.nameAr || "")}
        ${field("code", "Code", c.code)}
        ${field("floor", "Floor", c.floor || "")}
        ${field("floorRaw", "Floor (AR)", c.floorRaw || "")}
        ${field("modules", "Modules (comma-separated)", (c.modules || []).join(", "), { full: true })}
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
    let rows = BBC_DATA.listAllStudents();
    if (q) {
      rows = rows.filter(({ student: s, cls }) =>
        `${s.searchName || ""} ${s.fullName || ""} ${s.fullNameLatin || ""} ${s.id} ${cls.code}`.toLowerCase().includes(q)
      );
    }
    if (filter === "incomplete") {
      rows = rows.filter(({ student: s }) => !s.dateOfBirth || !s.gender || !s.firstName || !s.lastName);
    }
    const classOpts = classOptions();
    return layout(
      "students",
      "All students",
      `${rows.length} shown · search, edit profiles, or transfer between classes.`,
      `
      <form id="admin-student-search" class="admin-toolbar-form">
        <input type="search" name="q" placeholder="Search name, ID, or class code…" value="${esc(params?.get("q") || "")}" />
        <select name="filter">
          <option value="">All</option>
          <option value="incomplete"${filter === "incomplete" ? " selected" : ""}>Missing info only</option>
        </select>
        <button type="submit" class="btn btn-primary btn-sm">Filter</button>
      </form>

      <details class="info-panel" style="margin-bottom:1rem">
        <summary class="panel-label" style="cursor:pointer">Add new student</summary>
        <form id="admin-student-create" class="admin-form" style="margin-top:0.75rem">
          ${field("lastName", I18n.t("lastNameAr"), "", { required: true })}
          ${field("firstName", I18n.t("firstNameAr"), "", { required: true })}
          ${field("lastNameLatin", I18n.t("lastNameLatin"), "")}
          ${field("firstNameLatin", I18n.t("firstNameLatin"), "")}
          ${field("number", "Number", "1", { type: "number" })}
          ${field("gender", "Gender", "", {
            type: "select",
            options: [
              { value: "", label: "—" },
              { value: "Female", label: "Female" },
              { value: "Male", label: "Male" },
            ],
          })}
          ${field("dateOfBirth", "Date of birth")}
          ${field("classId", "Class", classOpts[0]?.id || "", {
            type: "select",
            options: classOpts.map((o) => ({ value: o.id, label: o.label })),
          })}
          ${field("notes", "Notes", "", { type: "textarea", full: true })}
          <button type="submit" class="btn btn-primary">Create student</button>
        </form>
      </details>

      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Name</th><th>Class</th><th>Gender</th><th>DOB</th><th></th></tr></thead>
          <tbody>
            ${rows
              .slice(0, 500)
              .map(({ student: s, cls, dept }) => {
                const warn = !s.dateOfBirth || !s.gender;
                return `<tr class="${warn ? "row-warn" : ""}">
                  <td>${esc(s.number)}</td>
                  <td dir="auto">${esc(studentName(s))}</td>
                  <td>${esc(cls.code)}</td>
                  <td>${esc(s.gender || "—")}</td>
                  <td>${esc(s.dateOfBirth || "—")}</td>
                  <td class="admin-actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/students/${esc(s.id)}">Edit</button>
                    <button type="button" class="btn btn-ghost btn-sm admin-transfer-btn" data-id="${esc(s.id)}" data-name="${esc(studentName(s))}" data-from="${esc(cls.code)}">Transfer</button>
                    <button type="button" class="btn btn-ghost btn-sm admin-del-student" data-id="${esc(s.id)}" data-back="#/manage/students">Delete</button>
                  </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
        ${rows.length > 500 ? `<p class="muted">Showing 500 of ${rows.length}. Refine your search.</p>` : ""}
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

  function viewEditStudent(id) {
    const found = BBC_DATA.getStudent(id);
    if (!found) return layout("students", "Student not found", "", "");
    const s = found.student;
    const classOpts = classOptions();
    return layout(
      "students",
      BBC_DATA.studentFullName(s),
      `Edit profile · current class ${esc(found.cls.code)}`,
      `
      <form id="admin-student-edit" class="admin-form info-panel" data-id="${esc(s.id)}">
        ${field("lastName", I18n.t("lastNameAr"), s.lastName)}
        ${field("firstName", I18n.t("firstNameAr"), s.firstName)}
        ${field("lastNameLatin", I18n.t("lastNameLatin"), s.lastNameLatin || "")}
        ${field("firstNameLatin", I18n.t("firstNameLatin"), s.firstNameLatin || "")}
        ${field("number", "Number in class", s.number, { type: "number" })}
        ${field("gender", "Gender", s.gender || "", {
          type: "select",
          options: [
            { value: "", label: "—" },
            { value: "Female", label: "Female" },
            { value: "Male", label: "Male" },
          ],
        })}
        ${field("dateOfBirth", "Date of birth", s.dateOfBirth || "")}
        ${field("classId", "Class (transfer by changing)", s.classId, {
          type: "select",
          options: classOpts.map((o) => ({ value: o.id, label: o.label })),
        })}
        ${field("notes", "Notes", s.notes || "", { type: "textarea", full: true })}
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Save changes</button>
          <button type="button" class="btn btn-ghost" data-nav="#/manage/classes/${esc(s.classId)}">Open class roster</button>
          <button type="button" class="btn btn-ghost admin-del-student" data-id="${esc(s.id)}" data-back="#/manage/students">Delete</button>
        </div>
      </form>
    `
    );
  }

  function viewManageTeachers(params) {
    const q = (params?.get("q") || "").trim().toLowerCase();
    let rows = BBC_DATA.listAllTeachers();
    if (q) {
      rows = rows.filter(({ teacher: t }) =>
        `${teacherName(t)} ${t.phone} ${(t.modules || []).join(" ")}`.toLowerCase().includes(q)
      );
    }
    return layout(
      "teachers",
      "Teachers",
      `${rows.length} teachers · edit profiles and class assignments.`,
      `
      <form id="admin-teacher-search" class="admin-toolbar-form">
        <input type="search" name="q" placeholder="Search name, phone, subject…" value="${esc(params?.get("q") || "")}" />
        <button type="submit" class="btn btn-primary btn-sm">Search</button>
      </form>
      <details class="info-panel" style="margin-bottom:1rem">
        <summary class="panel-label" style="cursor:pointer">Add teacher</summary>
        <form id="admin-teacher-create" class="admin-form" style="margin-top:0.75rem">
          ${field("firstName", "First name")}
          ${field("lastName", "Last name")}
          ${field("nameLatin", "Latin name")}
          ${field("phone", "Phone")}
          ${field("wilaya", "Wilaya", "Algiers")}
          ${field("commune", "Commune")}
          ${field("modules", "Subjects (comma-separated)", "Arabic", { full: true })}
          ${field("departments", "Departments (comma-separated)", "primary", { full: true })}
          <button type="submit" class="btn btn-primary">Create teacher</button>
        </form>
      </details>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Phone</th><th>Subjects</th><th>Classes</th><th></th></tr></thead>
          <tbody>
            ${rows
              .map(({ teacher: t, classes }) => {
                const warn = !t.phone || !(t.modules || []).length;
                return `<tr class="${warn ? "row-warn" : ""}">
                  <td dir="auto">${esc(teacherName(t))}</td>
                  <td>${esc(t.phone || "—")}</td>
                  <td>${esc((t.modules || []).join(", ") || "—")}</td>
                  <td>${esc((classes || []).map((x) => x.cls.code).join(", ") || "—")}</td>
                  <td class="admin-actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/teachers/${esc(t.id)}">Edit / assign</button>
                    <button type="button" class="btn btn-ghost btn-sm admin-del-teacher" data-id="${esc(t.id)}">Delete</button>
                  </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
    );
  }

  function viewEditTeacher(id) {
    const t = BBC_DATA.getTeacher(id);
    if (!t) return layout("teachers", "Teacher not found", "", "");
    const opts = classOptions();
    return layout(
      "teachers",
      teacherName(t),
      "Update contact details and which classes this teacher is assigned to.",
      `
      <form id="admin-teacher-edit" class="admin-form info-panel" data-id="${esc(t.id)}">
        ${field("firstName", "First name", t.firstName || "")}
        ${field("lastName", "Last name", t.lastName || "")}
        ${field("nameLatin", "Latin name", t.nameLatin || "")}
        ${field("phone", "Phone", t.phone || "")}
        ${field("wilaya", "Wilaya", t.wilaya || "")}
        ${field("commune", "Commune", t.commune || "")}
        ${field("modules", "Subjects (comma-separated)", (t.modules || []).join(", "), { full: true })}
        ${field("departments", "Departments (comma-separated)", (t.departments || []).join(", "), { full: true })}
        ${field("classIds", "Assigned classes", "", {
          type: "checkbox-group",
          full: true,
          name: "classIds",
          values: t.classIds || [],
          options: opts.map((o) => ({ value: o.id, label: o.label })),
        })}
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Save teacher</button>
          <button type="button" class="btn btn-ghost" data-nav="#/manage/teachers">Back</button>
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
      "Fill blank fields so directories and reports stay complete.",
      `
      <section class="info-panel" style="margin-bottom:1rem">
        <div class="panel-label">Students missing DOB / gender / name (${students.length})</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Class</th><th>Missing</th><th></th></tr></thead>
            <tbody>
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
                        return `<tr class="row-warn">
                          <td dir="auto">${esc(s.fullName || "—")}</td>
                          <td>${esc(cls.code)}</td>
                          <td>${esc(miss)}</td>
                          <td><button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/students/${esc(s.id)}">Complete</button></td>
                        </tr>`;
                      })
                      .join("")
                  : `<tr><td colspan="4" class="muted">All student core fields filled.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
      <section class="info-panel">
        <div class="panel-label">Teachers missing phone / name / subjects (${teachers.length})</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Missing</th><th></th></tr></thead>
            <tbody>
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
                        return `<tr class="row-warn">
                          <td dir="auto">${esc(teacherName(t))}</td>
                          <td>${esc(miss)}</td>
                          <td><button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/teachers/${esc(t.id)}">Complete</button></td>
                        </tr>`;
                      })
                      .join("")
                  : `<tr><td colspan="3" class="muted">All teacher core fields filled.</td></tr>`
              }
            </tbody>
          </table>
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

  function csvList(s) {
    return String(s || "")
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

    root.querySelector("#admin-student-search")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const b = formData(e.target);
      const qs = new URLSearchParams();
      if (b.q) qs.set("q", b.q);
      if (b.filter) qs.set("filter", b.filter);
      go("/manage/students" + (qs.toString() ? `?${qs}` : ""));
    });

    root.querySelector("#admin-teacher-search")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const b = formData(e.target);
      go(b.q ? `/manage/teachers?q=${encodeURIComponent(b.q)}` : "/manage/teachers");
    });

    root.querySelector("#admin-student-create")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const b = formData(e.target);
      const cls = BBC_DATA.findClassById(b.classId);
      flash(async () => {
        await BBC_API.post("/students", {
          ...b,
          number: Number(b.number) || 0,
          departmentId: cls.dept.id,
          fullName: `${b.lastName} ${b.firstName}`.trim(),
          fullNameLatin: `${b.firstNameLatin || ""} ${b.lastNameLatin || ""}`.trim(),
        });
      }, `/manage/classes/${b.classId}`);
    });

    root.querySelector("#admin-add-to-class")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const classId = e.target.getAttribute("data-class-id");
      const dept = e.target.getAttribute("data-dept");
      const b = formData(e.target);
      flash(async () => {
        await BBC_API.post("/students", {
          ...b,
          classId,
          departmentId: dept,
          number: Number(b.number) || 0,
          fullName: `${b.lastName} ${b.firstName}`.trim(),
          fullNameLatin: `${b.firstNameLatin || ""} ${b.lastNameLatin || ""}`.trim(),
        });
      }, `/manage/classes/${classId}`);
    });

    root.querySelector("#admin-student-edit")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = e.target.getAttribute("data-id");
      const b = formData(e.target);
      const cls = BBC_DATA.findClassById(b.classId);
      flash(async () => {
        await BBC_API.put(`/students/${id}`, {
          ...b,
          number: Number(b.number) || 0,
          departmentId: cls?.dept.id,
          fullName: `${b.lastName} ${b.firstName}`.trim(),
          fullNameLatin: `${b.firstNameLatin || ""} ${b.lastNameLatin || ""}`.trim(),
        });
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
          ...b,
          modules: csvList(b.modules),
          departments: csvList(b.departments),
          classIds: [],
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
          modules: csvList(b.modules),
          departments: csvList(b.departments),
          classIds: Array.isArray(b.classIds) ? b.classIds : b.classIds ? [b.classIds] : [],
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
          modules: csvList(b.modules),
        });
      }, `/manage/classes/${id}`);
    });
  }

  function resolve(parts, params) {
    if (!parts.length || parts[0] !== "manage") return null;
    if (parts.length === 1) return viewAdminHome();
    if (parts[1] === "classes") {
      if (parts[2] && parts[3] === "edit") return viewEditClass(parts[2]);
      if (parts[2]) return viewClassDetail(parts[2]);
      return viewClassesIndex();
    }
    if (parts[1] === "students") {
      if (parts[2]) return viewEditStudent(parts[2]);
      return viewManageStudents(params);
    }
    if (parts[1] === "teachers") {
      if (parts[2]) return viewEditTeacher(parts[2]);
      return viewManageTeachers(params);
    }
    if (parts[1] === "incomplete") return viewIncomplete();
    return viewAdminHome();
  }

  return { resolve, bind, refreshData };
})();

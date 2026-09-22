/**
 * Admin manage UI — CRUD over live API.
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
    if (type === "textarea") {
      return `<label class="admin-field"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="3">${esc(value)}</textarea></label>`;
    }
    if (type === "select") {
      const options = (opts.options || [])
        .map(
          (o) =>
            `<option value="${esc(o.value)}"${String(o.value) === String(value) ? " selected" : ""}>${esc(o.label)}</option>`
        )
        .join("");
      return `<label class="admin-field"><span>${esc(label)}</span><select name="${esc(name)}">${options}</select></label>`;
    }
    return `<label class="admin-field"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" /></label>`;
  }

  async function refreshData() {
    const data = await BBC_API.loadSchoolData();
    BBC_DATA.setData(data);
  }

  function viewAdminHome() {
    const stats = BBC_DATA.stats();
    return `
      <div class="page-header">
        <h1>Manage school data</h1>
        <p class="lede">Live database — changes appear immediately for the Director view.</p>
      </div>
      <div class="stats-row">
        <div class="stat-card"><div class="label">Students</div><div class="value">${stats.students}</div></div>
        <div class="stat-card"><div class="label">Teachers</div><div class="value">${stats.teachers}</div></div>
        <div class="stat-card"><div class="label">Classes</div><div class="value">${stats.classes}</div></div>
      </div>
      <div class="dir-home-grid">
        <button type="button" class="dir-home-card" data-nav="#/manage/students">
          <h3>Students</h3>
          <p>Add, edit, move, or delete students.</p>
          <span class="cta">Manage students →</span>
        </button>
        <button type="button" class="dir-home-card" data-nav="#/manage/teachers">
          <h3>Teachers</h3>
          <p>Update phones, subjects, and class links.</p>
          <span class="cta">Manage teachers →</span>
        </button>
        <button type="button" class="dir-home-card" data-nav="#/manage/classes">
          <h3>Classes</h3>
          <p>Edit class codes, floors, and teacher assignments.</p>
          <span class="cta">Manage classes →</span>
        </button>
        <button type="button" class="dir-home-card" data-nav="#/manage/issues">
          <h3>Operations issues</h3>
          <p>Track school-day problems and status.</p>
          <span class="cta">Manage issues →</span>
        </button>
      </div>
    `;
  }

  function viewManageStudents() {
    const rows = BBC_DATA.listAllStudents();
    const classOpts = BBC_DATA.listClassOptions();
    return `
      <div class="page-header">
        <h1>Manage students</h1>
        <p class="lede">${rows.length} students in the live database.</p>
      </div>
      <div class="info-panel" style="margin-bottom:1rem">
        <div class="panel-label">Add student</div>
        <form id="admin-student-create" class="admin-form">
          ${field("lastName", "Last name")}
          ${field("firstName", "First name")}
          ${field("number", "Number", "1", { type: "number" })}
          ${field("gender", "Gender", "", {
            type: "select",
            options: [
              { value: "", label: "—" },
              { value: "Female", label: "Female" },
              { value: "Male", label: "Male" },
            ],
          })}
          ${field("dateOfBirth", "Date of birth (YYYY-MM-DD)")}
          ${field("classId", "Class", classOpts[0]?.id || "", {
            type: "select",
            options: classOpts.map((o) => ({ value: o.id, label: o.label })),
          })}
          ${field("notes", "Notes", "", { type: "textarea" })}
          <button type="submit" class="btn btn-primary">Add student</button>
        </form>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Name</th><th>Class</th><th>Gender</th><th></th></tr></thead>
          <tbody>
            ${rows
              .slice(0, 400)
              .map(({ student: s, cls, dept }) => {
                const found = BBC_DATA.findClassById(cls.id);
                return `<tr>
                  <td>${esc(s.number)}</td>
                  <td dir="auto">${esc(s.fullName)}</td>
                  <td>${esc(cls.code)} · ${esc(dept.label)}</td>
                  <td>${esc(s.gender || "—")}</td>
                  <td class="admin-actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/students/${esc(s.id)}">Edit</button>
                    <button type="button" class="btn btn-ghost btn-sm admin-del-student" data-id="${esc(s.id)}">Delete</button>
                  </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
        ${rows.length > 400 ? `<p class="muted">Showing first 400 — use search in Director view for the rest, or edit by opening a student.</p>` : ""}
      </div>
    `;
  }

  function viewEditStudent(id) {
    const found = BBC_DATA.getStudent(id);
    if (!found) return `<div class="empty-state"><h2>Student not found</h2></div>`;
    const s = found.student;
    const classOpts = BBC_DATA.listClassOptions();
    return `
      <div class="page-header">
        <h1>Edit student</h1>
        <p class="lede" dir="auto">${esc(s.fullName)}</p>
      </div>
      <form id="admin-student-edit" class="admin-form info-panel" data-id="${esc(s.id)}">
        ${field("lastName", "Last name", s.lastName)}
        ${field("firstName", "First name", s.firstName)}
        ${field("number", "Number", s.number, { type: "number" })}
        ${field("gender", "Gender", s.gender || "", {
          type: "select",
          options: [
            { value: "", label: "—" },
            { value: "Female", label: "Female" },
            { value: "Male", label: "Male" },
          ],
        })}
        ${field("dateOfBirth", "Date of birth", s.dateOfBirth || "")}
        ${field("classId", "Class", s.classId, {
          type: "select",
          options: classOpts.map((o) => ({ value: o.id, label: o.label })),
        })}
        ${field("notes", "Notes", s.notes || "", { type: "textarea" })}
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Save changes</button>
          <button type="button" class="btn btn-ghost" data-nav="#/manage/students">Cancel</button>
        </div>
      </form>
    `;
  }

  function viewManageTeachers() {
    const rows = BBC_DATA.listAllTeachers();
    return `
      <div class="page-header">
        <h1>Manage teachers</h1>
        <p class="lede">${rows.length} teachers.</p>
      </div>
      <div class="info-panel" style="margin-bottom:1rem">
        <div class="panel-label">Add teacher</div>
        <form id="admin-teacher-create" class="admin-form">
          ${field("firstName", "First name")}
          ${field("lastName", "Last name")}
          ${field("nameLatin", "Latin name")}
          ${field("phone", "Phone")}
          ${field("wilaya", "Wilaya", "Algiers")}
          ${field("commune", "Commune")}
          ${field("modules", "Modules (comma-separated)", "Arabic")}
          ${field("departments", "Departments (comma-separated)", "primary")}
          <button type="submit" class="btn btn-primary">Add teacher</button>
        </form>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Phone</th><th>Modules</th><th></th></tr></thead>
          <tbody>
            ${rows
              .map(({ teacher: t }) => {
                const name = [t.firstName, t.lastName].filter(Boolean).join(" ") || "—";
                return `<tr>
                  <td dir="auto">${esc(name)}</td>
                  <td>${esc(t.phone || "—")}</td>
                  <td>${esc((t.modules || []).join(", "))}</td>
                  <td class="admin-actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/teachers/${esc(t.id)}">Edit</button>
                    <button type="button" class="btn btn-ghost btn-sm admin-del-teacher" data-id="${esc(t.id)}">Delete</button>
                  </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function viewEditTeacher(id) {
    const t = BBC_DATA.getTeacher(id);
    if (!t) return `<div class="empty-state"><h2>Teacher not found</h2></div>`;
    return `
      <div class="page-header">
        <h1>Edit teacher</h1>
      </div>
      <form id="admin-teacher-edit" class="admin-form info-panel" data-id="${esc(t.id)}">
        ${field("firstName", "First name", t.firstName || "")}
        ${field("lastName", "Last name", t.lastName || "")}
        ${field("nameLatin", "Latin name", t.nameLatin || "")}
        ${field("phone", "Phone", t.phone || "")}
        ${field("wilaya", "Wilaya", t.wilaya || "")}
        ${field("commune", "Commune", t.commune || "")}
        ${field("modules", "Modules (comma-separated)", (t.modules || []).join(", "))}
        ${field("departments", "Departments (comma-separated)", (t.departments || []).join(", "))}
        ${field("classIds", "Class IDs (comma-separated)", (t.classIds || []).join(", "))}
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Save changes</button>
          <button type="button" class="btn btn-ghost" data-nav="#/manage/teachers">Cancel</button>
        </div>
      </form>
    `;
  }

  function viewManageClasses() {
    const opts = [];
    for (const dept of BBC_DATA.departments) {
      for (const level of dept.levels) {
        for (const cls of level.classes) {
          opts.push({ dept, level, cls });
        }
      }
    }
    return `
      <div class="page-header">
        <h1>Manage classes</h1>
        <p class="lede">${opts.length} classes.</p>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Code</th><th>Dept</th><th>Year</th><th>Students</th><th>Floor</th><th></th></tr></thead>
          <tbody>
            ${opts
              .map(
                ({ dept, level, cls }) => `<tr>
                <td><strong>${esc(cls.code)}</strong></td>
                <td>${esc(dept.label)}</td>
                <td>${esc(level.name)}</td>
                <td>${cls.students.length}</td>
                <td>${esc(cls.floor || "—")}</td>
                <td><button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/classes/${esc(cls.id)}">Edit</button></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function viewEditClass(id) {
    const found = BBC_DATA.findClassById(id);
    if (!found) return `<div class="empty-state"><h2>Class not found</h2></div>`;
    const c = found.cls;
    return `
      <div class="page-header">
        <h1>Edit class ${esc(c.code)}</h1>
      </div>
      <form id="admin-class-edit" class="admin-form info-panel" data-id="${esc(c.id)}">
        ${field("name", "Name / code label", c.name || c.code)}
        ${field("nameAr", "Arabic name", c.nameAr || "")}
        ${field("code", "Code", c.code)}
        ${field("floor", "Floor", c.floor || "")}
        ${field("floorRaw", "Floor (AR)", c.floorRaw || "")}
        ${field("teacherIds", "Teacher IDs (comma-separated)", (c.teacherIds || []).join(", "))}
        ${field("modules", "Modules (comma-separated)", (c.modules || []).join(", "))}
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Save changes</button>
          <button type="button" class="btn btn-ghost" data-nav="#/manage/classes">Cancel</button>
        </div>
      </form>
    `;
  }

  function viewManageIssues() {
    const issues = BBC_DATA.listIssues();
    return `
      <div class="page-header">
        <h1>Manage issues</h1>
      </div>
      <div class="info-panel" style="margin-bottom:1rem">
        <div class="panel-label">Add issue</div>
        <form id="admin-issue-create" class="admin-form">
          ${field("title", "Title")}
          ${field("titleAr", "Title (AR)")}
          ${field("area", "Area", "Operations")}
          ${field("severity", "Severity", "high", {
            type: "select",
            options: [
              { value: "high", label: "high" },
              { value: "medium", label: "medium" },
              { value: "low", label: "low" },
            ],
          })}
          ${field("status", "Status", "open", {
            type: "select",
            options: [
              { value: "open", label: "open" },
              { value: "resolved", label: "resolved" },
            ],
          })}
          ${field("summary", "Summary", "", { type: "textarea" })}
          ${field("goal", "Goal", "", { type: "textarea" })}
          <button type="submit" class="btn btn-primary">Add issue</button>
        </form>
      </div>
      <div class="issue-list">
        ${issues
          .map(
            (i) => `<div class="issue-card" style="cursor:default">
              <div class="issue-card-top"><span class="issue-badge status-open">${esc(i.status)}</span><span class="issue-badge sev-high">${esc(i.severity)}</span></div>
              <h3>${esc(i.title)}</h3>
              <p>${esc(i.summary || "")}</p>
              <div class="admin-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-nav="#/manage/issues/${esc(i.id)}">Edit</button>
                <button type="button" class="btn btn-ghost btn-sm admin-del-issue" data-id="${esc(i.id)}">Delete</button>
              </div>
            </div>`
          )
          .join("")}
      </div>
    `;
  }

  function viewEditIssue(id) {
    const i = BBC_DATA.getIssue(id);
    if (!i) return `<div class="empty-state"><h2>Issue not found</h2></div>`;
    return `
      <div class="page-header"><h1>Edit issue</h1></div>
      <form id="admin-issue-edit" class="admin-form info-panel" data-id="${esc(i.id)}">
        ${field("title", "Title", i.title)}
        ${field("titleAr", "Title (AR)", i.titleAr || "")}
        ${field("area", "Area", i.area || "")}
        ${field("severity", "Severity", i.severity, {
          type: "select",
          options: [
            { value: "high", label: "high" },
            { value: "medium", label: "medium" },
            { value: "low", label: "low" },
          ],
        })}
        ${field("status", "Status", i.status, {
          type: "select",
          options: [
            { value: "open", label: "open" },
            { value: "resolved", label: "resolved" },
          ],
        })}
        ${field("summary", "Summary", i.summary || "", { type: "textarea" })}
        ${field("goal", "Goal", i.goal || "", { type: "textarea" })}
        ${field("notes", "Notes", i.notes || "", { type: "textarea" })}
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" class="btn btn-ghost" data-nav="#/manage/issues">Cancel</button>
        </div>
      </form>
    `;
  }

  function formData(form) {
    const fd = new FormData(form);
    const obj = {};
    fd.forEach((v, k) => {
      obj[k] = String(v).trim();
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
    root.querySelector("#admin-student-create")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = formData(e.target);
      const cls = BBC_DATA.findClassById(b.classId);
      if (!cls) return alert("Class required");
      await BBC_API.post("/students", {
        ...b,
        number: Number(b.number) || 0,
        departmentId: cls.dept.id,
        fullName: `${b.lastName} ${b.firstName}`.trim(),
      });
      await refreshData();
      go("/manage/students");
    });

    root.querySelector("#admin-student-edit")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = e.target.getAttribute("data-id");
      const b = formData(e.target);
      const cls = BBC_DATA.findClassById(b.classId);
      await BBC_API.put(`/students/${id}`, {
        ...b,
        number: Number(b.number) || 0,
        departmentId: cls?.dept.id,
        fullName: `${b.lastName} ${b.firstName}`.trim(),
      });
      await refreshData();
      go("/manage/students");
    });

    root.querySelectorAll(".admin-del-student").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this student?")) return;
        await BBC_API.del(`/students/${btn.getAttribute("data-id")}`);
        await refreshData();
        go("/manage/students");
      });
    });

    root.querySelector("#admin-teacher-create")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = formData(e.target);
      await BBC_API.post("/teachers", {
        ...b,
        modules: csvList(b.modules),
        departments: csvList(b.departments),
        classIds: [],
      });
      await refreshData();
      go("/manage/teachers");
    });

    root.querySelector("#admin-teacher-edit")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = e.target.getAttribute("data-id");
      const b = formData(e.target);
      await BBC_API.put(`/teachers/${id}`, {
        ...b,
        modules: csvList(b.modules),
        departments: csvList(b.departments),
        classIds: csvList(b.classIds),
      });
      await refreshData();
      go("/manage/teachers");
    });

    root.querySelectorAll(".admin-del-teacher").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this teacher?")) return;
        await BBC_API.del(`/teachers/${btn.getAttribute("data-id")}`);
        await refreshData();
        go("/manage/teachers");
      });
    });

    root.querySelector("#admin-class-edit")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = e.target.getAttribute("data-id");
      const b = formData(e.target);
      await BBC_API.put(`/classes/${id}`, {
        name: b.name,
        nameAr: b.nameAr,
        code: b.code,
        floor: b.floor,
        floorRaw: b.floorRaw,
        teacherIds: csvList(b.teacherIds),
        modules: csvList(b.modules),
      });
      await refreshData();
      go("/manage/classes");
    });

    root.querySelector("#admin-issue-create")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = formData(e.target);
      await BBC_API.post("/issues", b);
      await refreshData();
      go("/manage/issues");
    });

    root.querySelector("#admin-issue-edit")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = e.target.getAttribute("data-id");
      const b = formData(e.target);
      await BBC_API.put(`/issues/${id}`, b);
      await refreshData();
      go("/manage/issues");
    });

    root.querySelectorAll(".admin-del-issue").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this issue?")) return;
        await BBC_API.del(`/issues/${btn.getAttribute("data-id")}`);
        await refreshData();
        go("/manage/issues");
      });
    });
  }

  function resolve(parts) {
    if (!parts.length || parts[0] !== "manage") return null;
    if (parts.length === 1) return viewAdminHome();
    if (parts[1] === "students") {
      if (parts[2]) return viewEditStudent(parts[2]);
      return viewManageStudents();
    }
    if (parts[1] === "teachers") {
      if (parts[2]) return viewEditTeacher(parts[2]);
      return viewManageTeachers();
    }
    if (parts[1] === "classes") {
      if (parts[2]) return viewEditClass(parts[2]);
      return viewManageClasses();
    }
    if (parts[1] === "issues") {
      if (parts[2]) return viewEditIssue(parts[2]);
      return viewManageIssues();
    }
    return null;
  }

  return { resolve, bind, refreshData };
})();

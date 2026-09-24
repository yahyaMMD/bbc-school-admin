/**
 * Teacher portal — scoped classes, students, and profile.
 */
const TeacherApp = (() => {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const state = {
    me: null,
    classes: null,
    classCache: new Map(),
    studentCache: new Map(),
  };

  function dash(v) {
    return v == null || v === "" ? "—" : String(v);
  }

  function teacherLabel(t) {
    if (!t) return "";
    if (typeof BBC_DATA !== "undefined" && BBC_DATA.teacherDisplayName) {
      return BBC_DATA.teacherDisplayName(t);
    }
    const ar = [t.firstName, t.lastName].filter(Boolean).join(" ").trim();
    const latin = [t.firstNameLatin || "", t.lastNameLatin || ""].filter(Boolean).join(" ").trim() || t.nameLatin || "";
    if (typeof I18n !== "undefined" && I18n.useArabicNames && I18n.useArabicNames()) {
      return ar || latin || t.id;
    }
    return latin || ar || t.id;
  }

  function studentLabel(s) {
    if (!s) return "";
    if (typeof BBC_DATA !== "undefined" && BBC_DATA.studentFullName) {
      return BBC_DATA.studentFullName(s);
    }
    return s.fullName || [s.firstName, s.lastName].filter(Boolean).join(" ") || s.id;
  }

  function genderLabel(g) {
    if (g === "Female" || g === "F") return I18n.t("female");
    if (g === "Male" || g === "M") return I18n.t("male");
    return dash(g);
  }

  function classLabel(c) {
    if (!c) return "";
    if (I18n.getLang && I18n.getLang() === "ar" && c.nameAr) return c.nameAr;
    return c.name || c.code || c.id;
  }

  function avatarHtml(person, kind, size = "") {
    const src = person?.photo || (kind === "teacher" ? "assets/avatars/teacher.svg" : "assets/avatars/student.svg");
    const label = kind === "teacher" ? teacherLabel(person) : studentLabel(person);
    const sizeCls = size ? ` ${size}` : "";
    const roleCls = kind === "teacher" ? "avatar-teacher" : "avatar-student";
    return `<span role="button" tabindex="0" class="avatar ${roleCls}${sizeCls} avatar-clickable" data-photo-view="${esc(src)}" data-photo-label="${esc(label)}" title="${esc(label)}" aria-label="${esc(I18n.t("viewPhoto"))}">
      <img src="${esc(src)}" alt="" />
    </span>`;
  }

  function nav(items, active) {
    return `
      <nav class="teacher-nav" aria-label="${esc(I18n.t("teacherPortal"))}">
        ${items
          .map(
            (it) =>
              `<button type="button" class="teacher-nav-item${it.id === active ? " is-active" : ""}" data-nav="${esc(it.href)}">${esc(it.label)}</button>`
          )
          .join("")}
      </nav>
    `;
  }

  function shell(active, title, lede, body) {
    const t = state.me?.teacher;
    return `
      <div class="teacher-portal">
        <div class="teacher-portal-head">
          <div>
            <p class="teacher-portal-kicker">${esc(I18n.t("teacherPortal"))}</p>
            <h1>${esc(title)}</h1>
            ${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
          </div>
          ${
            t
              ? `<button type="button" class="teacher-portal-me" data-nav="#/my/profile">
                  ${avatarHtml(t, "teacher")}
                  <span dir="auto">${esc(teacherLabel(t))}</span>
                </button>`
              : ""
          }
        </div>
        ${nav(
          [
            { id: "home", href: "#/my", label: I18n.t("myClasses") },
            { id: "profile", href: "#/my/profile", label: I18n.t("myProfile") },
          ],
          active
        )}
        ${body}
      </div>
    `;
  }

  async function ensureMe() {
    if (state.me) return state.me;
    state.me = await BBC_API.get("/me");
    return state.me;
  }

  async function ensureClasses() {
    if (state.classes) return state.classes;
    const data = await BBC_API.get("/me/classes");
    state.classes = data.classes || [];
    return state.classes;
  }

  function viewMustChangePassword() {
    return `
      <div class="teacher-portal">
        <div class="admin-panel" style="max-width:28rem;margin:2rem auto">
          <div class="admin-panel-label">${esc(I18n.t("changePassword"))}</div>
          <p class="admin-field-hint">${esc(I18n.t("mustChangePasswordHint"))}</p>
          <form id="teacher-force-password" class="admin-form admin-form-stack">
            <label class="admin-field">
              <span>${esc(I18n.t("currentPassword"))}</span>
              <input type="password" name="currentPassword" required autocomplete="current-password" />
            </label>
            <label class="admin-field">
              <span>${esc(I18n.t("newPassword"))}</span>
              <input type="password" name="newPassword" required minlength="6" autocomplete="new-password" />
            </label>
            <label class="admin-field">
              <span>${esc(I18n.t("confirmPassword"))}</span>
              <input type="password" name="confirmPassword" required minlength="6" autocomplete="new-password" />
            </label>
            <p class="ann-status is-err" data-pw-err hidden></p>
            <button type="submit" class="btn btn-primary">${esc(I18n.t("savePassword"))}</button>
          </form>
        </div>
      </div>
    `;
  }

  function viewHome(classes) {
    const t = state.me?.teacher;
    return shell(
      "home",
      I18n.t("myClasses"),
      I18n.t("myClassesLede", { name: teacherLabel(t), n: classes.length }),
      `
      <div class="teacher-class-grid">
        ${
          classes.length
            ? classes
                .map(
                  (c) => `
            <button type="button" class="teacher-class-card" data-nav="#/my/class/${esc(c.id)}">
              <strong>${esc(classLabel(c))}</strong>
              <span class="muted">${esc(c.code || "")}${c.year ? ` · ${esc(I18n.t("year"))} ${esc(c.year)}` : ""}</span>
              <span class="teacher-class-count">${esc(I18n.t("studentsCount", { n: c.studentCount || 0 }))}</span>
            </button>`
                )
                .join("")
            : `<div class="admin-empty">${esc(I18n.t("noClassesLinked"))}</div>`
        }
      </div>
    `
    );
  }

  function viewClass(classId, payload) {
    const cls = payload.class;
    const students = payload.students || [];
    return shell(
      "home",
      classLabel(cls),
      I18n.t("classStudentsLede", { n: students.length }),
      `
      <div class="page-header" style="margin-bottom:0.75rem">
        <button type="button" class="btn btn-ghost" data-nav="#/my" style="padding-left:0">${esc(I18n.t("backToClasses"))}</button>
      </div>
      <div class="student-table-wrap">
        <table class="student-table">
          <thead>
            <tr>
              <th>#</th>
              <th></th>
              <th>${esc(I18n.t("fullName"))}</th>
              <th class="hide-sm">${esc(I18n.t("gender"))}</th>
              <th class="hide-mobile">${esc(I18n.t("dob"))}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${
              students.length
                ? students
                    .map(
                      (s) => `
              <tr>
                <td>${s.number ?? "—"}</td>
                <td>${avatarHtml(s, "student")}</td>
                <td dir="auto"><strong>${esc(studentLabel(s))}</strong></td>
                <td class="hide-sm">${esc(genderLabel(s.gender))}</td>
                <td class="hide-mobile">${esc(dash(s.dateOfBirth))}</td>
                <td><button type="button" class="btn btn-ghost btn-sm" data-nav="#/my/student/${esc(s.id)}?from=${encodeURIComponent(`#/my/class/${classId}`)}">${esc(I18n.t("annViewDetails"))}</button></td>
              </tr>`
                    )
                    .join("")
                : `<tr><td colspan="6"><div class="admin-empty">${esc(I18n.t("noStudentsInClass") || "No students")}</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    `
    );
  }

  function viewStudent(payload, from) {
    const s = payload.student;
    const cls = payload.class;
    const back = from || (cls?.id ? `#/my/class/${cls.id}` : "#/my");
    return shell(
      "home",
      studentLabel(s),
      `${I18n.t("student")} · ${classLabel(cls)}`,
      `
      <div class="page-header" style="margin-bottom:0.75rem">
        <button type="button" class="btn btn-ghost" data-nav="${esc(back)}" style="padding-left:0">${esc(I18n.t("back"))}</button>
      </div>
      <div class="teacher-hero">
        ${avatarHtml(s, "student", "avatar-lg")}
        <div>
          <h2 dir="auto" style="margin:0">${esc(studentLabel(s))}</h2>
          <p class="role">${esc(I18n.t("student"))} · ${esc(classLabel(cls))}</p>
        </div>
      </div>
      <div class="facts-grid">
        <div class="fact-card"><div class="k">${esc(I18n.t("lastName"))}</div><div class="v" dir="auto">${esc(dash(s.lastName))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("firstName"))}</div><div class="v" dir="auto">${esc(dash(s.firstName))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("lastNameLatin"))}</div><div class="v" dir="auto">${esc(dash(s.lastNameLatin))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("firstNameLatin"))}</div><div class="v" dir="auto">${esc(dash(s.firstNameLatin))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("dob"))}</div><div class="v">${esc(dash(s.dateOfBirth) || I18n.t("notOnFile"))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("gender"))}</div><div class="v">${esc(genderLabel(s.gender))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("rosterNumber"))}</div><div class="v">${s.number ?? "—"}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("class"))}</div><div class="v">${esc(classLabel(cls))}</div></div>
        <div class="fact-card"><div class="k">${esc(I18n.t("studentId"))}</div><div class="v">${esc(s.id)}</div></div>
      </div>
      ${
        s.notes
          ? `<div class="info-panel" style="margin-top:1rem"><div class="panel-label">${esc(I18n.t("notes"))}</div><p style="margin-top:0.5rem">${esc(s.notes)}</p></div>`
          : ""
      }
    `
    );
  }

  function viewProfile() {
    const t = state.me?.teacher || {};
    const classes = state.classes || [];
    return shell(
      "profile",
      I18n.t("myProfile"),
      I18n.t("myProfileLede"),
      `
      <div class="teacher-hero" style="margin-bottom:1rem">
        ${avatarHtml(t, "teacher", "avatar-lg")}
        <div>
          <h2 dir="auto" style="margin:0">${esc(teacherLabel(t))}</h2>
          <p class="role">${esc(I18n.t("teacher"))}</p>
        </div>
      </div>

      <section class="admin-panel" style="margin-bottom:1rem">
        <div class="admin-panel-label">${esc(I18n.t("profilePhoto"))}</div>
        <p class="admin-field-hint">${esc(I18n.t("profilePhotoHint"))}</p>
        <div class="teacher-photo-actions">
          <label class="btn btn-primary">
            ${esc(I18n.t("uploadImage"))}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden data-teacher-photo />
          </label>
          ${t.photo ? `<button type="button" class="btn btn-ghost" data-teacher-photo-remove>${esc(I18n.t("removePhoto"))}</button>` : ""}
        </div>
        <p class="ann-status" data-teacher-photo-status hidden></p>
      </section>

      <section class="admin-panel" style="margin-bottom:1rem">
        <div class="admin-panel-label">${esc(I18n.t("officialInfoLocked"))}</div>
        <div class="facts-grid" style="margin-top:0.75rem">
          <div class="fact-card"><div class="k">${esc(I18n.t("firstName"))}</div><div class="v" dir="auto">${esc(dash(t.firstName))}</div></div>
          <div class="fact-card"><div class="k">${esc(I18n.t("lastName"))}</div><div class="v" dir="auto">${esc(dash(t.lastName))}</div></div>
          <div class="fact-card"><div class="k">${esc(I18n.t("phone"))}</div><div class="v">${esc(dash(t.phone))}</div></div>
          <div class="fact-card"><div class="k">${esc(I18n.t("wilaya"))}</div><div class="v">${esc(dash(t.wilaya))}</div></div>
          <div class="fact-card"><div class="k">${esc(I18n.t("commune"))}</div><div class="v">${esc(dash(t.commune))}</div></div>
          <div class="fact-card"><div class="k">${esc(I18n.t("teacherId"))}</div><div class="v">${esc(t.id)}</div></div>
        </div>
        <div class="chip-row" style="margin-top:0.85rem">
          ${(t.modules || []).map((m) => `<span class="chip">${esc(m)}</span>`).join("") || `<span class="muted">${esc(I18n.t("noneListed"))}</span>`}
        </div>
        <div class="group-links" style="margin-top:0.85rem">
          ${
            classes.length
              ? classes
                  .map(
                    (c) =>
                      `<button type="button" class="group-link" data-nav="#/my/class/${esc(c.id)}"><span>${esc(classLabel(c))}</span><span class="chip neutral">${esc(I18n.t("studentsCount", { n: c.studentCount || 0 }))}</span></button>`
                  )
                  .join("")
              : `<p class="muted">${esc(I18n.t("noClassesLinked"))}</p>`
          }
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-label">${esc(I18n.t("changePassword"))}</div>
        <form id="teacher-change-password" class="admin-form admin-form-stack" style="margin-top:0.75rem">
          <label class="admin-field">
            <span>${esc(I18n.t("currentPassword"))}</span>
            <input type="password" name="currentPassword" required autocomplete="current-password" />
          </label>
          <label class="admin-field">
            <span>${esc(I18n.t("newPassword"))}</span>
            <input type="password" name="newPassword" required minlength="6" autocomplete="new-password" />
          </label>
          <label class="admin-field">
            <span>${esc(I18n.t("confirmPassword"))}</span>
            <input type="password" name="confirmPassword" required minlength="6" autocomplete="new-password" />
          </label>
          <p class="ann-status" data-pw-status hidden></p>
          <button type="submit" class="btn btn-primary">${esc(I18n.t("savePassword"))}</button>
        </form>
      </section>
    `
    );
  }

  async function resolve(parts, params) {
    try {
      const me = await ensureMe();
      if (me.mustChangePassword && !(parts[1] === "password")) {
        return { html: viewMustChangePassword(), forcePassword: true };
      }
      await ensureClasses();

      if (!parts[1] || parts[1] === "home") {
        return { html: viewHome(state.classes) };
      }
      if (parts[1] === "profile") {
        return { html: viewProfile() };
      }
      if (parts[1] === "class" && parts[2]) {
        const classId = parts[2];
        let payload = state.classCache.get(classId);
        if (!payload) {
          payload = await BBC_API.get(`/me/classes/${encodeURIComponent(classId)}/students`);
          state.classCache.set(classId, payload);
        }
        return { html: viewClass(classId, payload) };
      }
      if (parts[1] === "student" && parts[2]) {
        const studentId = parts[2];
        let payload = state.studentCache.get(studentId);
        if (!payload) {
          payload = await BBC_API.get(`/me/students/${encodeURIComponent(studentId)}`);
          state.studentCache.set(studentId, payload);
        }
        return { html: viewStudent(payload, params?.get("from") || "") };
      }
      return { html: viewHome(state.classes) };
    } catch (err) {
      return {
        html: `<div class="admin-empty is-err">${esc(err.message || I18n.t("failedLoad"))}</div>`,
      };
    }
  }

  function bind(root, go) {
    if (window.QEAPhoto && typeof window.QEAPhoto.bind === "function") {
      window.QEAPhoto.bind(root);
    }

    const setStatus = (el, msg, ok) => {
      if (!el) return;
      el.hidden = !msg;
      el.textContent = msg || "";
      el.classList.toggle("is-ok", Boolean(ok && msg));
      el.classList.toggle("is-err", Boolean(!ok && msg));
    };

    root.querySelector("#teacher-force-password")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const currentPassword = String(fd.get("currentPassword") || "");
      const newPassword = String(fd.get("newPassword") || "");
      const confirmPassword = String(fd.get("confirmPassword") || "");
      const errEl = root.querySelector("[data-pw-err]");
      if (newPassword !== confirmPassword) {
        setStatus(errEl, I18n.t("passwordMismatch"), false);
        return;
      }
      try {
        await BBC_API.post("/me/password", { currentPassword, newPassword });
        if (state.me) state.me.mustChangePassword = false;
        go("/my");
      } catch (err) {
        setStatus(errEl, err.message || I18n.t("loginError"), false);
      }
    });

    root.querySelector("#teacher-change-password")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const currentPassword = String(fd.get("currentPassword") || "");
      const newPassword = String(fd.get("newPassword") || "");
      const confirmPassword = String(fd.get("confirmPassword") || "");
      const statusEl = root.querySelector("[data-pw-status]");
      if (newPassword !== confirmPassword) {
        setStatus(statusEl, I18n.t("passwordMismatch"), false);
        return;
      }
      try {
        await BBC_API.post("/me/password", { currentPassword, newPassword });
        if (state.me) state.me.mustChangePassword = false;
        e.target.reset();
        setStatus(statusEl, I18n.t("passwordChanged"), true);
      } catch (err) {
        setStatus(statusEl, err.message || I18n.t("loginError"), false);
      }
    });

    root.querySelector("[data-teacher-photo]")?.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      const statusEl = root.querySelector("[data-teacher-photo-status]");
      if (!file) return;
      try {
        setStatus(statusEl, I18n.t("photoUploading") || "Uploading…", true);
        const dataUrl = await BBC_API.readFileAsDataUrl(file);
        const res = await BBC_API.post("/me/photo", { dataUrl });
        if (state.me?.teacher) state.me.teacher.photo = res.photo || res.url || "";
        setStatus(statusEl, I18n.t("photoUpdated"), true);
        go("/my/profile");
      } catch (err) {
        setStatus(statusEl, err.message || "Upload failed", false);
      }
      e.target.value = "";
    });

    root.querySelector("[data-teacher-photo-remove]")?.addEventListener("click", async () => {
      const statusEl = root.querySelector("[data-teacher-photo-status]");
      if (!confirm(I18n.t("removePhotoConfirm"))) return;
      try {
        await BBC_API.del("/me/photo");
        if (state.me?.teacher) state.me.teacher.photo = "";
        setStatus(statusEl, I18n.t("photoRemoved"), true);
        go("/my/profile");
      } catch (err) {
        setStatus(statusEl, err.message || "Remove failed", false);
      }
    });
  }

  function reset() {
    state.me = null;
    state.classes = null;
    state.classCache.clear();
    state.studentCache.clear();
  }

  return { resolve, bind, reset };
})();

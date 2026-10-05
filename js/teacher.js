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

  function isYesValue(v) {
    const t = String(v ?? "")
      .trim()
      .toLowerCase();
    return t === "yes" || t === "oui" || t === "نعم" || t === "y";
  }

  function isEmptyOrNo(v) {
    const t = String(v ?? "").trim();
    if (!t || t === "—" || t === "-") return true;
    const lower = t.toLowerCase();
    return lower === "no" || lower === "non" || lower === "لا" || lower === "nah";
  }

  function displayFieldValue(v) {
    if (isYesValue(v)) return I18n.t("yes");
    if (isEmptyOrNo(v)) return "";
    return String(v).trim();
  }

  function insightDl(pairs) {
    if (!pairs.length) return "";
    return `<dl class="parent-dossier-dl">${pairs
      .map(
        ([k, v]) =>
          `<div class="parent-dossier-item"><dt>${esc(k)}</dt><dd dir="auto">${esc(v)}</dd></div>`
      )
      .join("")}</dl>`;
  }

  function insightSection(title, icon, pairs, open) {
    if (!pairs.length) return "";
    return `
      <details class="parent-dossier-section teacher-student-panel"${open ? " open" : ""}>
        <summary class="parent-dossier-summary">
          <span class="parent-dossier-section-ico" aria-hidden="true">${icon}</span>
          <span>${esc(title)}</span>
          <span class="parent-dossier-count">${pairs.length}</span>
        </summary>
        <div class="parent-dossier-section-body">${insightDl(pairs)}</div>
      </details>`;
  }

  function renderTeacherFollowUp(details) {
    if (!details || typeof details !== "object") return "";
    const pairs = [
      [I18n.t("pyHealthStatus"), details.healthStatus],
      [I18n.t("pyStrengths"), details.strengths],
      [I18n.t("pyWeaknesses"), details.weaknesses],
      [I18n.t("pyBehavioral"), details.behavioralPerformance],
      [I18n.t("pyAcademic"), details.academicPerformance],
      [I18n.t("pyTalents"), details.talents],
    ]
      .map(([label, raw]) => [label, displayFieldValue(raw)])
      .filter(([, v]) => v);
    return insightSection(I18n.t("previousYearRecord"), "◆", pairs, true);
  }

  function buildTeacherMedicalPairs(med) {
    if (!med || typeof med !== "object") return [];
    const pairs = [];
    const push = (label, raw, { always = false } = {}) => {
      const val = displayFieldValue(raw);
      if (always && val) {
        pairs.push([label, val]);
        return;
      }
      if (isYesValue(raw)) {
        pairs.push([label, I18n.t("yes")]);
        return;
      }
      if (val) pairs.push([label, val]);
    };
    push(I18n.t("bloodType"), med.bloodType, { always: true });
    push(I18n.t("disability"), med.disability);
    if (isYesValue(med.disability) && String(med.disabilityExplain || "").trim()) {
      pairs.push([I18n.t("disabilityExplain"), String(med.disabilityExplain).trim()]);
    }
    push(I18n.t("allergy"), med.allergy);
    push(I18n.t("glasses"), med.glasses);
    push(I18n.t("behavior"), med.behavior);
    push(I18n.t("learningDifficulty"), med.learningDifficulty);
    push(I18n.t("treatment"), med.treatment);
    push(I18n.t("psychologist"), med.psychologist);
    push(I18n.t("incident"), med.incident);
    push(I18n.t("medicalOther"), med.other);
    return pairs;
  }

  function renderTeacherParentInsights(s) {
    const followUp = renderTeacherFollowUp(s.previousYearDetails);
    const profile = s.parentProfile;
    if (!profile || typeof profile !== "object") {
      return followUp ? `<article class="parent-dossier teacher-student-insights">${followUp}</article>` : "";
    }
    const med = profile.medical || {};
    const cons = profile.consents || {};
    const medicalPairs = buildTeacherMedicalPairs(med);
    const consentPairs = isYesValue(cons.photoMedia) ? [[I18n.t("photoMedia"), I18n.t("yes")]] : [];
    const medical = insightSection(I18n.t("parentSectionMedical"), "+", medicalPairs, medicalPairs.length <= 4);
    const consent = insightSection(I18n.t("parentSectionConsents"), "✓", consentPairs, true);
    if (!followUp && !medical && !consent) return "";
    return `
      <article class="parent-dossier teacher-student-insights">
        <header class="parent-dossier-head">
          <div class="parent-dossier-head-text">
            <span class="parent-dossier-badge">${esc(I18n.t("parentFormLinkedBadge"))}</span>
            <p class="parent-dossier-lede">${esc(I18n.t("teacherStudentInsightsLede"))}</p>
          </div>
        </header>
        <div class="parent-dossier-sections">
          ${followUp}
          ${medical}
          ${consent}
        </div>
      </article>`;
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
              <span class="muted" style="font-size:0.8rem">${esc(I18n.t("openDailyRegister"))}</span>
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
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return shell(
      "home",
      classLabel(cls),
      I18n.t("classStudentsLede", { n: students.length }),
      `
      <div class="page-header" style="margin-bottom:0.75rem">
        <button type="button" class="btn btn-ghost" data-nav="#/my" style="padding-left:0">${esc(I18n.t("backToClasses"))}</button>
      </div>
      <div class="teacher-class-actions">
        <button type="button" class="btn btn-primary" data-nav="#/my/class/${esc(classId)}/day?date=${esc(todayIso)}">${esc(I18n.t("openDailyRegister"))}</button>
        <p class="muted teacher-class-actions-hint">${esc(I18n.t("dailyRegisterHint"))}</p>
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

  function statusLabel(st) {
    if (st === "absent") return I18n.t("attendanceAbsent");
    if (st === "late") return I18n.t("attendanceLate");
    return I18n.t("attendancePresent");
  }

  function entryByStudent(session, studentId) {
    const list = session?.entries || [];
    return list.find((e) => e.studentId === studentId) || null;
  }

  function viewDayRegister(classId, payload, params) {
    const cls = payload.class;
    const students = payload.students || [];
    const subjects = payload.subjects || [];
    const date = payload.date || params?.get("date") || "";
    let subject = payload.subject || params?.get("subject") || "";
    // Auto-pick the teacher's first subject so the class opens ready to use
    if (!subject && subjects.length) subject = String(subjects[0] || "");
    const session = payload.session;
    const recent = payload.recentSessions || [];
    const siblings = payload.siblingClasses || [];
    const fromDay = `#/my/class/${classId}/day?date=${encodeURIComponent(date)}${subject ? `&subject=${encodeURIComponent(subject)}` : ""}`;

    const counts = { present: 0, absent: 0, late: 0 };
    students.forEach((s) => {
      const st = entryByStudent(session, s.id)?.status || "present";
      if (counts[st] != null) counts[st] += 1;
      else counts.present += 1;
    });

    const subjectOptions =
      subjects.length > 0
        ? subjects
            .map((m) => `<option value="${esc(m)}"${m === subject ? " selected" : ""}>${esc(m)}</option>`)
            .join("")
        : "";

    const recentChips = recent.length
      ? `<div class="register-recent">
          <div class="register-recent-label">${esc(I18n.t("recentSessions"))}</div>
          <div class="register-recent-list">
            ${recent
              .slice(0, 12)
              .map((r) => {
                const active = r.date === date && r.subject === subject;
                const href = `#/my/class/${encodeURIComponent(classId)}/day?date=${encodeURIComponent(r.date)}&subject=${encodeURIComponent(r.subject)}`;
                return `<button type="button" class="register-recent-chip${active ? " is-active" : ""}" data-nav="${esc(href)}">${esc(r.date)} · ${esc(r.subject)}</button>`;
              })
              .join("")}
          </div>
        </div>`
      : "";

    const siblingChecks = siblings.length
      ? `<div class="register-copy-hw">
          <div class="register-copy-label">${esc(I18n.t("copyHomeworkTo"))}</div>
          <div class="register-copy-list">
            ${siblings
              .map(
                (c) => `
              <label class="admin-check register-copy-item">
                <input type="checkbox" name="copyTo" value="${esc(c.id)}" />
                <span dir="auto">${esc(classLabel(c))}${c.code ? ` (${esc(c.code)})` : ""}</span>
              </label>`
              )
              .join("")}
          </div>
        </div>`
      : "";

    const rows = students.length
      ? students
          .map((s) => {
            const ent = entryByStudent(session, s.id);
            const st = ent?.status || "present";
            const remark = ent?.remark || "";
            const remarkOpen = Boolean(remark);
            const detailHref = `#/my/student/${encodeURIComponent(s.id)}?from=${encodeURIComponent(fromDay)}`;
            return `
            <article class="register-row" data-student-id="${esc(s.id)}">
              <div class="register-row-main">
                <span class="register-num">${s.number ?? "—"}</span>
                <button type="button" class="register-avatar-btn" data-nav="${esc(detailHref)}" title="${esc(I18n.t("annViewDetails"))}" aria-label="${esc(I18n.t("annViewDetails"))}">
                  ${avatarHtml(s, "student")}
                </button>
                <div class="register-name">
                  <button type="button" class="register-name-btn" data-nav="${esc(detailHref)}">
                    <strong dir="auto">${esc(studentLabel(s))}</strong>
                    <span class="register-open-detail">${esc(I18n.t("annViewDetails"))}</span>
                  </button>
                </div>
                <div class="register-status" role="group" aria-label="${esc(I18n.t("attendance"))}">
                  ${["present", "absent", "late"]
                    .map(
                      (k) =>
                        `<button type="button" class="register-status-btn is-${k}${st === k ? " is-on" : ""}" data-status="${k}" aria-pressed="${st === k ? "true" : "false"}">${esc(statusLabel(k))}</button>`
                    )
                    .join("")}
                </div>
                <button type="button" class="btn btn-ghost btn-sm register-remark-toggle${remarkOpen ? " has-remark" : ""}" data-remark-toggle aria-expanded="${remarkOpen ? "true" : "false"}">${esc(I18n.t("remark"))}</button>
              </div>
              <div class="register-remark-wrap"${remarkOpen ? "" : " hidden"}>
                <label class="admin-field">
                  <span class="visually-hidden">${esc(I18n.t("remark"))}</span>
                  <textarea class="register-remark" rows="2" maxlength="1000" placeholder="${esc(I18n.t("remarkPlaceholder"))}" dir="auto">${esc(remark)}</textarea>
                </label>
              </div>
            </article>`;
          })
          .join("")
      : `<div class="admin-empty">${esc(I18n.t("noStudentsInClass") || "No students")}</div>`;

    return shell(
      "home",
      classLabel(cls),
      I18n.t("classRegisterLede", { n: students.length }),
      `
      <div class="page-header" style="margin-bottom:0.75rem">
        <button type="button" class="btn btn-ghost" data-nav="#/my" style="padding-left:0">${esc(I18n.t("backToClasses"))}</button>
      </div>

      <form id="teacher-day-register" class="register-panel" data-class-id="${esc(classId)}">
        <div class="register-toolbar">
          <label class="admin-field register-field">
            <span>${esc(I18n.t("sessionDate"))}</span>
            <input type="date" name="date" value="${esc(date)}" required />
          </label>
          <label class="admin-field register-field">
            <span>${esc(I18n.t("subject"))}</span>
            ${
              subjects.length
                ? `<select name="subject" required>
                    ${subjectOptions || `<option value="">${esc(I18n.t("selectSubject"))}</option>`}
                    ${subject && !subjects.includes(subject) ? `<option value="${esc(subject)}" selected>${esc(subject)}</option>` : ""}
                  </select>`
                : `<input type="text" name="subject" value="${esc(subject)}" required maxlength="120" placeholder="${esc(I18n.t("subjectPlaceholder"))}" dir="auto" />`
            }
          </label>
          <div class="register-toolbar-actions">
            <button type="button" class="btn btn-ghost" data-mark-all-present>${esc(I18n.t("markAllPresent"))}</button>
          </div>
        </div>

        <div class="register-summary" data-register-summary>
          <span data-sum-present>${counts.present}</span> ${esc(I18n.t("attendancePresent"))}
          · <span data-sum-absent>${counts.absent}</span> ${esc(I18n.t("attendanceAbsent"))}
          · <span data-sum-late>${counts.late}</span> ${esc(I18n.t("attendanceLate"))}
        </div>

        ${recentChips}

        <div class="register-list" data-register-list>
          ${rows}
        </div>

        <section class="register-homework">
          <div class="admin-panel-label">${esc(I18n.t("homework"))}</div>
          <p class="admin-field-hint">${esc(I18n.t("homeworkHint"))}</p>
          <textarea name="homework" rows="3" maxlength="4000" placeholder="${esc(I18n.t("homeworkPlaceholder"))}" dir="auto">${esc(session?.homework || "")}</textarea>
          ${siblingChecks}
        </section>

        <div class="register-save-bar">
          <p class="ann-status" data-register-status hidden></p>
          <button type="submit" class="btn btn-primary" data-register-save>${esc(I18n.t("saveRegister"))}</button>
        </div>
      </form>
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
      ${renderTeacherParentInsights(s)}
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
        <div class="admin-panel-label">${esc(I18n.t("officialInfo"))}</div>
        <p class="admin-field-hint">${esc(I18n.t("officialInfoHint"))}</p>
        <form id="teacher-profile-form" class="admin-form admin-form-stack" style="margin-top:0.75rem">
          <label class="admin-field">
            <span>${esc(I18n.t("firstName"))}</span>
            <input name="firstName" type="text" dir="auto" value="${esc(t.firstName || "")}" autocomplete="given-name" />
          </label>
          <label class="admin-field">
            <span>${esc(I18n.t("lastName"))}</span>
            <input name="lastName" type="text" dir="auto" value="${esc(t.lastName || "")}" autocomplete="family-name" />
          </label>
          <label class="admin-field">
            <span>${esc(I18n.t("phone"))}</span>
            <input name="phone" type="tel" value="${esc(t.phone || "")}" autocomplete="tel" inputmode="tel" />
          </label>
          <label class="admin-field">
            <span>${esc(I18n.t("wilaya"))}</span>
            <input name="wilaya" type="text" dir="auto" value="${esc(t.wilaya || "")}" />
          </label>
          <label class="admin-field">
            <span>${esc(I18n.t("commune"))}</span>
            <input name="commune" type="text" dir="auto" value="${esc(t.commune || "")}" />
          </label>
          <label class="admin-field">
            <span>${esc(I18n.t("teacherId"))}</span>
            <input type="text" value="${esc(t.loginCode || t.id || "")}" readonly disabled />
          </label>
          <p class="ann-status" data-profile-status hidden></p>
          <button type="submit" class="btn btn-primary">${esc(I18n.t("saveProfile"))}</button>
        </form>
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
        // Opening a class always goes to today's register (presence / absence / remarks / homework)
        const date = params?.get("date") || "";
        let subject = params?.get("subject") || "";
        if (!subject) {
          try {
            subject = localStorage.getItem(`qea_reg_subject_${classId}`) || "";
          } catch {
            /* ignore */
          }
        }
        // Prefer first teacher module when nothing saved yet
        if (!subject && state.me?.teacher?.modules?.length) {
          subject = String(state.me.teacher.modules[0] || "");
        }
        const q = new URLSearchParams();
        if (date) q.set("date", date);
        if (subject) q.set("subject", subject);
        const qs = q.toString() ? `?${q}` : "";
        const payload = await BBC_API.get(
          `/me/classes/${encodeURIComponent(classId)}/session${qs}`
        );
        return { html: viewDayRegister(classId, payload, params), dayRegister: true };
      }
      if (parts[1] === "student" && parts[2]) {
        const studentId = parts[2];
        let payload = state.studentCache.get(studentId);
        if (!payload) {
          payload = await BBC_API.get(`/me/students/${encodeURIComponent(studentId)}`);
          state.studentCache.set(studentId, payload);
        }
        const from = params?.get("from") || "";
        // Default back to class daily register
        const fallback =
          payload?.class?.id
            ? `#/my/class/${payload.class.id}/day`
            : "#/my";
        return { html: viewStudent(payload, from || fallback) };
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

    root.querySelectorAll("[data-exit-impersonation]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof Auth !== "undefined" && Auth.exitToDirector && Auth.exitToDirector()) {
          go("/home");
        }
      });
    });

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

    root.querySelector("#teacher-profile-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const statusEl = root.querySelector("[data-profile-status]");
      const payload = {
        firstName: String(fd.get("firstName") || "").trim(),
        lastName: String(fd.get("lastName") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        wilaya: String(fd.get("wilaya") || "").trim(),
        commune: String(fd.get("commune") || "").trim(),
      };
      try {
        const res = await BBC_API.put("/me/profile", payload);
        if (state.me && res.teacher) state.me.teacher = res.teacher;
        setStatus(statusEl, I18n.t("profileSaved"), true);
        go("/my/profile");
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

    const registerForm = root.querySelector("#teacher-day-register");
    if (registerForm) {
      const classId = registerForm.getAttribute("data-class-id");
      const statusEl = root.querySelector("[data-register-status]");

      const refreshSummary = () => {
        const counts = { present: 0, absent: 0, late: 0 };
        root.querySelectorAll(".register-row").forEach((row) => {
          const on = row.querySelector(".register-status-btn.is-on");
          const st = on?.getAttribute("data-status") || "present";
          if (counts[st] != null) counts[st] += 1;
          else counts.present += 1;
        });
        const p = root.querySelector("[data-sum-present]");
        const a = root.querySelector("[data-sum-absent]");
        const l = root.querySelector("[data-sum-late]");
        if (p) p.textContent = String(counts.present);
        if (a) a.textContent = String(counts.absent);
        if (l) l.textContent = String(counts.late);
      };

      const navigateSession = () => {
        const date = registerForm.querySelector('[name="date"]')?.value || "";
        const subject = registerForm.querySelector('[name="subject"]')?.value || "";
        try {
          if (subject) localStorage.setItem(`qea_reg_subject_${classId}`, subject);
        } catch {
          /* ignore */
        }
        const q = new URLSearchParams();
        if (date) q.set("date", date);
        if (subject) q.set("subject", subject);
        go(`/my/class/${classId}/day?${q.toString()}`);
      };

      registerForm.querySelector('[name="date"]')?.addEventListener("change", navigateSession);
      registerForm.querySelector('[name="subject"]')?.addEventListener("change", navigateSession);

      root.querySelector("[data-mark-all-present]")?.addEventListener("click", () => {
        root.querySelectorAll(".register-row").forEach((row) => {
          row.querySelectorAll(".register-status-btn").forEach((btn) => {
            const on = btn.getAttribute("data-status") === "present";
            btn.classList.toggle("is-on", on);
            btn.setAttribute("aria-pressed", on ? "true" : "false");
          });
        });
        refreshSummary();
      });

      root.querySelectorAll("[data-remark-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest(".register-row");
          const wrap = row?.querySelector(".register-remark-wrap");
          if (!wrap) return;
          const open = wrap.hidden;
          wrap.hidden = !open;
          btn.setAttribute("aria-expanded", open ? "true" : "false");
        });
      });

      root.querySelectorAll(".register-status-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest(".register-row");
          if (!row) return;
          row.querySelectorAll(".register-status-btn").forEach((b) => {
            const on = b === btn;
            b.classList.toggle("is-on", on);
            b.setAttribute("aria-pressed", on ? "true" : "false");
          });
          refreshSummary();
        });
      });

      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const date = String(registerForm.querySelector('[name="date"]')?.value || "");
        const subject = String(registerForm.querySelector('[name="subject"]')?.value || "").trim();
        const homework = String(registerForm.querySelector('[name="homework"]')?.value || "");
        if (!subject) {
          setStatus(statusEl, I18n.t("selectSubject"), false);
          return;
        }
        const entries = [];
        root.querySelectorAll(".register-row").forEach((row) => {
          const studentId = row.getAttribute("data-student-id");
          const on = row.querySelector(".register-status-btn.is-on");
          const status = on?.getAttribute("data-status") || "present";
          const remark = String(row.querySelector(".register-remark")?.value || "").trim();
          entries.push({ studentId, status, remark });
        });
        const copyHomeworkToClassIds = [
          ...registerForm.querySelectorAll('input[name="copyTo"]:checked'),
        ].map((el) => el.value);

        const saveBtn = root.querySelector("[data-register-save]");
        if (saveBtn) saveBtn.disabled = true;
        try {
          await BBC_API.put(`/me/classes/${encodeURIComponent(classId)}/session`, {
            date,
            subject,
            homework,
            entries,
            copyHomeworkToClassIds,
          });
          try {
            localStorage.setItem(`qea_reg_subject_${classId}`, subject);
          } catch {
            /* ignore */
          }
          setStatus(statusEl, I18n.t("registerSaved"), true);
          const q = new URLSearchParams({ date, subject });
          go(`/my/class/${classId}/day?${q.toString()}`);
        } catch (err) {
          setStatus(statusEl, err.message || I18n.t("loginError"), false);
        } finally {
          if (saveBtn) saveBtn.disabled = false;
        }
      });
    }
  }

  function reset() {
    state.me = null;
    state.classes = null;
    state.classCache.clear();
    state.studentCache.clear();
  }

  return { resolve, bind, reset };
})();

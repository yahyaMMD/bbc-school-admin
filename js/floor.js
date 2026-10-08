/**
 * Floor Manager portal — one account per year (primary + middle).
 * Receives teacher daily registers for every class in that year.
 */
const FloorApp = (() => {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const state = {
    me: null,
    dayCache: new Map(),
    classDayCache: new Map(),
  };

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function floorLabel(m) {
    if (!m) return "";
    const base =
      typeof I18n !== "undefined" && I18n.getLang && I18n.getLang() === "ar" && m.floorLabelAr
        ? m.floorLabelAr
        : m.floorLabel || m.loginCode || "";
    const dept =
      m.departmentId === "middle"
        ? I18n.t("middle")
        : m.departmentId === "primary"
          ? I18n.t("primary")
          : "";
    const yearBit = m.managedYear ? `${I18n.t("year")} ${m.managedYear}` : "";
    return [base, dept && yearBit ? `${dept} · ${yearBit}` : yearBit || dept].filter(Boolean).join(" · ");
  }

  function classLabel(c) {
    if (!c) return "";
    if (I18n.getLang && I18n.getLang() === "ar" && c.nameAr) return c.nameAr;
    return c.name || c.code || c.id;
  }

  function studentLabel(s) {
    return s.fullName || [s.firstName, s.lastName].filter(Boolean).join(" ") || s.id;
  }

  function statusLabel(st) {
    if (st === "absent") return I18n.t("attendanceAbsent");
    if (st === "late") return I18n.t("attendanceLate");
    return I18n.t("attendancePresent");
  }

  function nav(active) {
    return `
      <nav class="teacher-nav" aria-label="${esc(I18n.t("floorPortal"))}">
        <button type="button" class="teacher-nav-item${active === "home" ? " is-active" : ""}" data-nav="#/floor">${esc(I18n.t("floorDayBoard"))}</button>
        <button type="button" class="teacher-nav-item${active === "report" ? " is-active" : ""}" data-nav="#/floor/report">${esc(I18n.t("floorDailyReport"))}</button>
        <button type="button" class="teacher-nav-item${active === "whatsapp" ? " is-active" : ""}" data-nav="#/floor/whatsapp">${esc(I18n.t("floorWhatsApp"))}</button>
        <button type="button" class="teacher-nav-item${active === "profile" ? " is-active" : ""}" data-nav="#/floor/profile">${esc(I18n.t("myProfile"))}</button>
      </nav>`;
  }

  function shell(active, title, lede, body) {
    const m = state.me?.manager;
    return `
      <div class="teacher-portal floor-portal">
        <div class="teacher-portal-head">
          <div>
            <p class="teacher-portal-kicker">${esc(I18n.t("floorPortal"))}</p>
            <h1>${esc(title)}</h1>
            ${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
          </div>
          ${
            m
              ? `<div class="floor-portal-badge">
                  <strong dir="auto">${esc(floorLabel(m))}</strong>
                  <span class="muted">${esc(m.loginCode || "")}</span>
                </div>`
              : ""
          }
        </div>
        ${nav(active)}
        ${body}
      </div>`;
  }

  async function ensureMe() {
    if (state.me) return state.me;
    state.me = await BBC_API.get("/floor/me");
    return state.me;
  }

  function viewDayBoard(payload) {
    const m = payload.manager || state.me?.manager;
    const date = payload.date || todayIso();
    const sessions = payload.sessions || [];
    const classes = payload.classes || [];
    const summary = payload.summary || { absent: 0, late: 0, remarks: 0, homework: 0 };

    const byClass = new Map();
    for (const c of classes) {
      byClass.set(c.id, { class: c, sessions: [] });
    }
    for (const s of sessions) {
      if (!byClass.has(s.classId)) {
        byClass.set(s.classId, {
          class: {
            id: s.classId,
            code: s.classCode,
            name: s.className,
            nameAr: s.classNameAr,
            year: s.classYear,
          },
          sessions: [],
        });
      }
      byClass.get(s.classId).sessions.push(s);
    }

    const cards = [...byClass.values()]
      .map(({ class: c, sessions: sess }) => {
        const abs = sess.reduce((n, s) => n + (s.absentCount || 0), 0);
        const late = sess.reduce((n, s) => n + (s.lateCount || 0), 0);
        const hw = sess.filter((s) => String(s.homework || "").trim()).length;
        return `
          <button type="button" class="floor-class-card" data-nav="#/floor/class/${esc(c.id)}?date=${esc(date)}" data-class-q="${esc(`${c.code || ""} ${classLabel(c)} ${c.year || ""}`.toLowerCase())}">
            <strong dir="auto">${esc(classLabel(c))}</strong>
            <span class="muted">${esc(c.code || "")}${c.year ? ` · ${esc(I18n.t("year"))} ${esc(c.year)}` : ""}</span>
            <div class="floor-class-stats">
              <span>${sess.length} ${esc(I18n.t("sessionsCount"))}</span>
              <span class="${abs ? "is-warn" : ""}">${abs} ${esc(I18n.t("attendanceAbsent"))}</span>
              <span class="${late ? "is-warn" : ""}">${late} ${esc(I18n.t("attendanceLate"))}</span>
              <span>${hw} ${esc(I18n.t("homework"))}</span>
            </div>
          </button>`;
      })
      .join("");

    return shell(
      "home",
      I18n.t("floorDayBoard"),
      `${floorLabel(m)} · ${I18n.t("floorDayBoardLede")}`,
      `
      <form class="register-toolbar floor-day-toolbar" id="floor-day-form">
        <label class="admin-field register-field">
          <span>${esc(I18n.t("sessionDate"))}</span>
          <input type="date" name="date" value="${esc(date)}" required />
        </label>
        <label class="admin-field register-field" style="flex:1;min-width:12rem">
          <span>${esc(I18n.t("search") || "Search")}</span>
          <input type="search" id="floor-class-search" placeholder="${esc(I18n.t("searchClasses") || "Search classes…")}" autocomplete="off" />
        </label>
        <div class="register-summary">
          <span>${summary.absent} ${esc(I18n.t("attendanceAbsent"))}</span>
          · <span>${summary.late} ${esc(I18n.t("attendanceLate"))}</span>
          · <span>${summary.remarks} ${esc(I18n.t("remark"))}</span>
          · <span>${summary.homework} ${esc(I18n.t("homework"))}</span>
        </div>
      </form>
      <div class="floor-class-grid" id="floor-class-grid">
        ${cards || `<div class="admin-empty">${esc(I18n.t("noClassesOnFloor"))}</div>`}
      </div>
    `
    );
  }

  function viewClassDay(classId, payload) {
    const cls = payload.class;
    const date = payload.date;
    const students = payload.students || [];
    const sessions = payload.sessions || [];
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const sessionBlocks = sessions.length
      ? sessions
          .map((sess) => {
            const issues = (sess.entries || []).filter(
              (e) => e.status === "absent" || e.status === "late" || String(e.remark || "").trim()
            );
            const rows = issues.length
              ? issues
                  .map((e) => {
                    const st = studentMap.get(e.studentId);
                    const phones = st?.parentPhones || [];
                    return `
                      <tr>
                        <td dir="auto"><strong>${esc(st ? studentLabel(st) : e.studentId)}</strong></td>
                        <td><span class="floor-status is-${esc(e.status)}">${esc(statusLabel(e.status))}</span></td>
                        <td dir="auto">${esc(e.remark || "—")}</td>
                        <td>
                          ${
                            phones.length
                              ? `<button type="button" class="btn btn-primary btn-sm" data-floor-contact
                                  data-student-id="${esc(e.studentId)}"
                                  data-session-id="${esc(sess.id)}"
                                  data-status="${esc(e.status)}"
                                  data-remark="${esc(e.remark || "")}"
                                  data-phones="${esc(JSON.stringify(phones))}"
                                  data-student-name="${esc(st ? studentLabel(st) : "")}"
                                >${esc(I18n.t("contactParents"))}</button>`
                              : `<span class="muted">${esc(I18n.t("noParentPhone"))}</span>`
                          }
                        </td>
                      </tr>`;
                  })
                  .join("")
              : `<tr><td colspan="4"><span class="muted">${esc(I18n.t("noIssuesInSession"))}</span></td></tr>`;

            return `
              <section class="admin-panel floor-session-block">
                <div class="floor-session-head">
                  <div>
                    <div class="admin-panel-label">${esc(sess.subject)}</div>
                    <p class="muted" style="margin:0.2rem 0 0">${esc(I18n.t("teacher"))}: ${esc(sess.teacherName)}</p>
                  </div>
                  ${
                    String(sess.homework || "").trim()
                      ? `<button type="button" class="btn btn-primary btn-sm" data-send-homework
                          data-session-id="${esc(sess.id)}"
                          data-subject="${esc(sess.subject)}"
                          data-homework="${esc(sess.homework)}"
                        >${esc(I18n.t("sendHomeworkToParents"))}</button>`
                      : ""
                  }
                </div>
                ${
                  String(sess.homework || "").trim()
                    ? `<div class="floor-homework" dir="auto"><strong>${esc(I18n.t("homework"))}:</strong> ${esc(sess.homework)}</div>`
                    : ""
                }
                <div class="student-table-wrap" style="margin-top:0.75rem">
                  <table class="student-table">
                    <thead>
                      <tr>
                        <th>${esc(I18n.t("fullName"))}</th>
                        <th>${esc(I18n.t("attendance"))}</th>
                        <th>${esc(I18n.t("remark"))}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </div>
              </section>`;
          })
          .join("")
      : `<div class="admin-empty">${esc(I18n.t("noSessionsThisDay"))}</div>`;

    return shell(
      "home",
      classLabel(cls),
      `${I18n.t("sessionDate")}: ${date}`,
      `
      <div class="page-header" style="margin-bottom:0.75rem">
        <button type="button" class="btn btn-ghost" data-nav="#/floor?date=${esc(date)}" style="padding-left:0">${esc(I18n.t("backToFloorBoard"))}</button>
      </div>
      <div data-floor-class-day data-class-id="${esc(classId)}" data-date="${esc(date)}" data-class-label="${esc(classLabel(cls))}">
        ${sessionBlocks}
      </div>
      <dialog class="floor-msg-dialog" id="floor-msg-dialog">
        <form method="dialog" class="admin-panel" id="floor-msg-form">
          <div class="admin-panel-label">${esc(I18n.t("sendWhatsAppMessage"))}</div>
          <p class="admin-field-hint" data-msg-hint></p>
          <label class="admin-field">
            <span>${esc(I18n.t("message"))}</span>
            <textarea name="text" rows="6" required dir="auto"></textarea>
          </label>
          <div data-msg-recipients class="floor-msg-recipients"></div>
          <p class="ann-status" data-msg-status hidden></p>
          <div class="floor-msg-actions">
            <button type="submit" class="btn btn-primary" value="send">${esc(I18n.t("sendViaWhatsApp"))}</button>
            <button type="submit" class="btn btn-ghost" value="cancel">${esc(I18n.t("cancel"))}</button>
          </div>
        </form>
      </dialog>
    `
    );
  }

  function viewWhatsApp(status, extra = {}) {
    const ready = Boolean(status?.ready);
    const qrReady = Boolean(status?.qrReady);
    const mode = extra.mode || "";
    const date = extra.date || todayIso();
    const content = extra.content || { homework: [], remarks: [] };
    const groups = extra.groups || [];
    const groupsError = extra.groupsError || "";

    const connection = `
      <section class="admin-panel">
        <div class="admin-panel-label">${esc(I18n.t("whatsappConnection"))}</div>
        <p class="admin-field-hint">${esc(status?.info || status?.error || I18n.t("floorWhatsAppHint"))}</p>
        <div class="floor-wa-status ${ready ? "is-ready" : ""}">
          <strong>${ready ? esc(I18n.t("whatsappConnected")) : esc(I18n.t("whatsappNotConnected"))}</strong>
          ${status?.phone ? `<span class="muted">${esc(status.phone)}${status.pushname ? ` · ${esc(status.pushname)}` : ""}</span>` : ""}
        </div>
        ${
          qrReady && !ready
            ? `<div class="floor-wa-qr"><img data-floor-qr alt="QR" width="280" height="280" /></div>`
            : ""
        }
        <div class="teacher-photo-actions" style="margin-top:0.85rem">
          <button type="button" class="btn btn-primary" data-floor-wa-refresh>${esc(I18n.t("refreshStatus"))}</button>
          ${ready ? `<button type="button" class="btn btn-ghost" data-floor-wa-logout>${esc(I18n.t("disconnectWhatsApp"))}</button>` : ""}
        </div>
        <p class="ann-status" data-wa-status hidden></p>
      </section>`;

    if (!ready) {
      return shell("whatsapp", I18n.t("floorWhatsApp"), I18n.t("floorWhatsAppLede"), connection);
    }

    if (!mode) {
      return shell(
        "whatsapp",
        I18n.t("floorWhatsApp"),
        I18n.t("floorWhatsAppLede"),
        `
        ${connection}
        <div class="floor-wa-actions" style="margin-top:1rem">
          <button type="button" class="floor-wa-action-card" data-nav="#/floor/whatsapp/homework">
            <strong>${esc(I18n.t("floorSendHomework"))}</strong>
            <p class="muted">${esc(I18n.t("floorSendHomeworkLede"))}</p>
          </button>
          <button type="button" class="floor-wa-action-card" data-nav="#/floor/whatsapp/remarks">
            <strong>${esc(I18n.t("floorSendRemarks"))}</strong>
            <p class="muted">${esc(I18n.t("floorSendRemarksLede"))}</p>
          </button>
        </div>`
      );
    }

    const isHw = mode === "homework";
    const items = isHw ? content.homework || [] : content.remarks || [];
    const title = isHw ? I18n.t("floorSendHomework") : I18n.t("floorSendRemarks");
    const pickLabel = isHw ? I18n.t("floorPickHomework") : I18n.t("floorPickRemarks");
    const actionType = isHw ? "homework_groups" : "remarks_groups";

    const itemRows = items.length
      ? items
          .map((it, idx) => {
            const key = isHw
              ? `hw:${it.sessionId || idx}`
              : `rm:${it.sessionId || ""}:${it.studentId || idx}`;
            const text = isHw ? it.homework || "" : it.remark || "";
            const meta = isHw
              ? `${it.classCode || ""} · ${it.subject || ""} · ${it.teacherName || ""}`
              : `${it.classCode || ""} · ${it.studentName || ""} · ${it.subject || ""} · ${it.teacherName || ""}`;
            return `
              <label class="floor-wa-pick-item">
                <input type="checkbox" name="pick" value="${esc(key)}" data-text="${esc(text)}" data-meta="${esc(meta)}" />
                <span>
                  <strong dir="auto">${esc(meta)}</strong>
                  <span class="floor-report-remark" dir="auto">${esc(text)}</span>
                </span>
              </label>`;
          })
          .join("")
      : `<p class="muted floor-report-empty">${esc(I18n.t("floorReportEmptySection"))}</p>`;

    const groupRows = groups.length
      ? groups
          .map(
            (g) => `
          <label class="floor-wa-pick-item" data-group-q="${esc(String(g.name || "").toLowerCase())}">
            <input type="checkbox" name="group" value="${esc(g.id)}" data-name="${esc(g.name || "")}" />
            <span dir="auto">${esc(g.name || g.id)}</span>
          </label>`
          )
          .join("")
      : `<p class="muted">${esc(groupsError || I18n.t("floorNoWaGroups"))}</p>`;

    return shell(
      "whatsapp",
      title,
      I18n.t("floorSendToGroupsLede"),
      `
      ${connection}
      <p style="margin:0.75rem 0">
        <button type="button" class="btn btn-ghost" data-nav="#/floor/whatsapp">${esc(I18n.t("floorBackWaOptions"))}</button>
      </p>
      <form class="floor-wa-composer" id="floor-wa-group-form" data-action-type="${esc(actionType)}" data-mode="${esc(mode)}">
        <section class="admin-panel">
          <div class="admin-panel-label">${esc(I18n.t("sessionDate"))}</div>
          <label class="admin-field register-field" style="margin-top:0.5rem;max-width:14rem">
            <input type="date" name="date" value="${esc(date)}" required />
          </label>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-label">${esc(pickLabel)}</div>
          <div class="floor-wa-pick-list" data-pick-list>${itemRows}</div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-label">${esc(I18n.t("floorMessageText"))}</div>
          <p class="admin-field-hint">${esc(I18n.t("floorMessageTextHint"))}</p>
          <label class="admin-field" style="margin-top:0.5rem">
            <textarea name="text" rows="8" dir="auto" placeholder="${esc(I18n.t("floorMessagePlaceholder"))}"></textarea>
          </label>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-label">${esc(I18n.t("floorPickGroups"))}</div>
          <label class="admin-field" style="margin:0.5rem 0">
            <input type="search" id="floor-wa-group-search" placeholder="${esc(I18n.t("floorSearchGroups"))}" autocomplete="off" />
          </label>
          <div class="floor-wa-pick-list" data-group-list>${groupRows}</div>
        </section>

        <div class="floor-report-actions">
          <button type="submit" class="btn btn-primary">${esc(I18n.t("sendViaWhatsApp"))}</button>
        </div>
        <p class="ann-status" data-group-send-status hidden></p>
      </form>`
    );
  }

  function formatReportTime(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString();
    } catch {
      return String(iso);
    }
  }

  function renderIssueList(items, emptyKey) {
    if (!items || !items.length) {
      return `<p class="muted floor-report-empty">${esc(I18n.t(emptyKey || "floorReportEmptySection"))}</p>`;
    }
    return `<ul class="floor-report-list">
      ${items
        .map((it) => {
          const cls = it.classCode || it.className || "";
          const who = it.studentName || "—";
          const subj = it.subject ? ` · ${it.subject}` : "";
          const teacher = it.teacherName ? ` · ${it.teacherName}` : "";
          const remark = String(it.remark || "").trim()
            ? `<div class="floor-report-remark" dir="auto">${esc(it.remark)}</div>`
            : "";
          const hw = String(it.homework || "").trim()
            ? `<div class="floor-report-remark" dir="auto">${esc(it.homework)}</div>`
            : "";
          return `<li>
            <div class="floor-report-line">
              <strong>${esc(cls)}</strong>
              <span dir="auto">${esc(who)}</span>
              <span class="muted">${esc(subj)}${esc(teacher)}</span>
            </div>
            ${remark}${hw}
          </li>`;
        })
        .join("")}
    </ul>`;
  }

  function defaultForm() {
    return {
      timeFrom: "08:00",
      timeTo: "16:00",
      complaints: [""],
      problemsSolved: 0,
      actionsTaken: "",
      parentResponded: null,
      adminEscalation: "",
      floorNeeds: "",
      staffAbsences: [{ name: "", role: "", substitute: "" }],
      teacherLates: [{ teacherId: "", teacherName: "", duration: "", substitute: "" }],
      incident: "",
      cameraReview: null,
    };
  }

  function ynRadios(name, value) {
    const v = value === true || value === "yes" ? "yes" : value === false || value === "no" ? "no" : "";
    return `
      <div class="floor-yn" role="radiogroup">
        <label class="floor-yn-opt">
          <input type="radio" name="${esc(name)}" value="yes"${v === "yes" ? " checked" : ""} />
          <span>${esc(I18n.t("yes"))}</span>
        </label>
        <label class="floor-yn-opt">
          <input type="radio" name="${esc(name)}" value="no"${v === "no" ? " checked" : ""} />
          <span>${esc(I18n.t("no"))}</span>
        </label>
      </div>`;
  }

  function teacherOptions(teachers, selectedId) {
    const opts = [`<option value="">${esc(I18n.t("floorReportPickTeacher"))}</option>`];
    for (const t of teachers || []) {
      const sel = t.id === selectedId ? " selected" : "";
      opts.push(`<option value="${esc(t.id)}" data-name="${esc(t.name)}"${sel}>${esc(t.name)}</option>`);
    }
    return opts.join("");
  }

  function roleOptions(selected) {
    const roles = [
      ["", I18n.t("floorReportRolePick")],
      ["teacher", I18n.t("floorReportRoleTeacher")],
      ["assistant", I18n.t("floorReportRoleAssistant")],
      ["admin", I18n.t("floorReportRoleAdmin")],
      ["other", I18n.t("floorReportRoleOther")],
    ];
    return roles
      .map(([v, label]) => `<option value="${esc(v)}"${selected === v ? " selected" : ""}>${esc(label)}</option>`)
      .join("");
  }

  function durationOptions(selected) {
    const presets = [
      "",
      "5 دقائق",
      "10 دقائق",
      "15 دقائق",
      "20 دقائق",
      "30 دقائق",
      "ساعة",
      "أكثر من ساعة",
    ];
    const known = presets.includes(selected);
    const opts = presets.map((p) => {
      const label = p || I18n.t("floorReportDurationPick");
      return `<option value="${esc(p)}"${selected === p ? " selected" : ""}>${esc(label)}</option>`;
    });
    if (selected && !known) {
      opts.push(`<option value="${esc(selected)}" selected>${esc(selected)}</option>`);
    }
    opts.push(`<option value="__custom__">${esc(I18n.t("floorReportDurationOther"))}</option>`);
    return opts.join("");
  }

  function complaintRowsHtml(complaints) {
    const list = complaints?.length ? complaints : [""];
    return list
      .map(
        (c, i) => `
        <div class="floor-dyn-row" data-complaint-row>
          <span class="floor-dyn-idx">${i + 1}.</span>
          <textarea name="complaint" rows="2" dir="auto" placeholder="${esc(I18n.t("floorReportComplaintPh"))}">${esc(c || "")}</textarea>
          <button type="button" class="btn btn-ghost floor-dyn-rm" data-rm-row title="${esc(I18n.t("floorReportRemoveRow"))}">×</button>
        </div>`
      )
      .join("");
  }

  function staffAbsenceRowsHtml(rows, teachers) {
    const list = rows?.length ? rows : [{ name: "", role: "", substitute: "" }];
    return list
      .map(
        (r) => `
        <tr data-staff-row>
          <td>
            <input list="floor-teacher-datalist" name="staff_name" dir="auto" value="${esc(r.name || "")}" placeholder="${esc(I18n.t("floorReportAbsentName"))}" />
          </td>
          <td>
            <select name="staff_role">${roleOptions(r.role || "")}</select>
          </td>
          <td>
            <input list="floor-teacher-datalist" name="staff_sub" dir="auto" value="${esc(r.substitute || "")}" placeholder="${esc(I18n.t("floorReportSubstitute"))}" />
          </td>
          <td class="floor-dyn-cell-rm">
            <button type="button" class="btn btn-ghost floor-dyn-rm" data-rm-row title="${esc(I18n.t("floorReportRemoveRow"))}">×</button>
          </td>
        </tr>`
      )
      .join("");
  }

  function teacherLateRowsHtml(rows, teachers) {
    const list = rows?.length ? rows : [{ teacherId: "", teacherName: "", duration: "", substitute: "" }];
    return list
      .map(
        (r) => `
        <tr data-late-row>
          <td>
            <select name="late_teacher">${teacherOptions(teachers, r.teacherId || "")}</select>
            ${
              r.teacherName && !r.teacherId
                ? `<input type="hidden" name="late_teacher_name" value="${esc(r.teacherName)}" />`
                : ""
            }
          </td>
          <td>
            <select name="late_duration">${durationOptions(r.duration || "")}</select>
            <input type="text" name="late_duration_custom" dir="auto" class="floor-duration-custom" hidden placeholder="${esc(I18n.t("floorReportDurationOther"))}" />
          </td>
          <td>
            <input list="floor-teacher-datalist" name="late_sub" dir="auto" value="${esc(r.substitute || "")}" placeholder="${esc(I18n.t("floorReportSubstitute"))}" />
          </td>
          <td class="floor-dyn-cell-rm">
            <button type="button" class="btn btn-ghost floor-dyn-rm" data-rm-row title="${esc(I18n.t("floorReportRemoveRow"))}">×</button>
          </td>
        </tr>`
      )
      .join("");
  }

  function teacherDatalist(teachers) {
    return `<datalist id="floor-teacher-datalist">
      ${(teachers || []).map((t) => `<option value="${esc(t.name)}"></option>`).join("")}
    </datalist>`;
  }

  function collectReportForm(form) {
    const complaints = [...form.querySelectorAll('[name="complaint"]')]
      .map((el) => String(el.value || "").trim())
      .filter(Boolean);

    const staffAbsences = [];
    form.querySelectorAll("[data-staff-row]").forEach((tr) => {
      const name = String(tr.querySelector('[name="staff_name"]')?.value || "").trim();
      const role = String(tr.querySelector('[name="staff_role"]')?.value || "").trim();
      const substitute = String(tr.querySelector('[name="staff_sub"]')?.value || "").trim();
      if (name || role || substitute) staffAbsences.push({ name, role, substitute });
    });

    const teacherLates = [];
    form.querySelectorAll("[data-late-row]").forEach((tr) => {
      const sel = tr.querySelector('[name="late_teacher"]');
      const teacherId = String(sel?.value || "").trim();
      const teacherName =
        teacherId
          ? String(sel?.selectedOptions?.[0]?.getAttribute("data-name") || sel?.selectedOptions?.[0]?.textContent || "").trim()
          : String(tr.querySelector('[name="late_teacher_name"]')?.value || "").trim();
      let duration = String(tr.querySelector('[name="late_duration"]')?.value || "").trim();
      if (duration === "__custom__") {
        duration = String(tr.querySelector('[name="late_duration_custom"]')?.value || "").trim();
      }
      const substitute = String(tr.querySelector('[name="late_sub"]')?.value || "").trim();
      if (teacherId || teacherName || duration || substitute) {
        teacherLates.push({ teacherId, teacherName, duration, substitute });
      }
    });

    const parentEl = form.querySelector('[name="parentResponded"]:checked');
    const cameraEl = form.querySelector('[name="cameraReview"]:checked');

    return {
      timeFrom: String(form.querySelector('[name="timeFrom"]')?.value || "08:00"),
      timeTo: String(form.querySelector('[name="timeTo"]')?.value || "16:00"),
      complaints: complaints.length ? complaints : [""],
      problemsSolved: Number(form.querySelector('[name="problemsSolved"]')?.value || 0) || 0,
      actionsTaken: String(form.querySelector('[name="actionsTaken"]')?.value || ""),
      parentResponded: parentEl ? parentEl.value : null,
      adminEscalation: String(form.querySelector('[name="adminEscalation"]')?.value || ""),
      floorNeeds: String(form.querySelector('[name="floorNeeds"]')?.value || ""),
      staffAbsences: staffAbsences.length ? staffAbsences : [{ name: "", role: "", substitute: "" }],
      teacherLates: teacherLates.length
        ? teacherLates
        : [{ teacherId: "", teacherName: "", duration: "", substitute: "" }],
      incident: String(form.querySelector('[name="incident"]')?.value || ""),
      cameraReview: cameraEl ? cameraEl.value : null,
    };
  }

  function bindReportFormDynamics(root) {
    const form = root.querySelector("#floor-report-form");
    if (!form) return;
    const teachers = (() => {
      try {
        return JSON.parse(form.getAttribute("data-teachers") || "[]");
      } catch {
        return [];
      }
    })();

    form.addEventListener("click", (e) => {
      const add = e.target?.closest("[data-add-row]");
      if (add) {
        e.preventDefault();
        const kind = add.getAttribute("data-add-row");
        if (kind === "complaint") {
          const box = form.querySelector("[data-complaint-list]");
          if (!box) return;
          box.insertAdjacentHTML("beforeend", complaintRowsHtml([""]));
          renumberComplaints(box);
        } else if (kind === "staff") {
          const tbody = form.querySelector("[data-staff-body]");
          if (!tbody) return;
          tbody.insertAdjacentHTML("beforeend", staffAbsenceRowsHtml([{ name: "", role: "", substitute: "" }], teachers));
        } else if (kind === "late") {
          const tbody = form.querySelector("[data-late-body]");
          if (!tbody) return;
          tbody.insertAdjacentHTML(
            "beforeend",
            teacherLateRowsHtml([{ teacherId: "", teacherName: "", duration: "", substitute: "" }], teachers)
          );
        }
        return;
      }
      const rm = e.target?.closest("[data-rm-row]");
      if (rm) {
        e.preventDefault();
        const complaintRow = rm.closest("[data-complaint-row]");
        if (complaintRow) {
          const box = form.querySelector("[data-complaint-list]");
          if (box && box.querySelectorAll("[data-complaint-row]").length > 1) {
            complaintRow.remove();
            renumberComplaints(box);
          } else if (complaintRow.querySelector("textarea")) {
            complaintRow.querySelector("textarea").value = "";
          }
          return;
        }
        const staffRow = rm.closest("[data-staff-row]");
        if (staffRow) {
          const tbody = form.querySelector("[data-staff-body]");
          if (tbody && tbody.querySelectorAll("[data-staff-row]").length > 1) staffRow.remove();
          else {
            staffRow.querySelectorAll("input").forEach((el) => (el.value = ""));
            const sel = staffRow.querySelector("select");
            if (sel) sel.selectedIndex = 0;
          }
          return;
        }
        const lateRow = rm.closest("[data-late-row]");
        if (lateRow) {
          const tbody = form.querySelector("[data-late-body]");
          if (tbody && tbody.querySelectorAll("[data-late-row]").length > 1) lateRow.remove();
          else {
            lateRow.querySelectorAll("input").forEach((el) => {
              el.value = "";
              el.hidden = el.classList.contains("floor-duration-custom");
            });
            lateRow.querySelectorAll("select").forEach((el) => (el.selectedIndex = 0));
          }
        }
      }
    });

    form.addEventListener("change", (e) => {
      const sel = e.target;
      if (sel?.name === "late_duration") {
        const custom = sel.closest("td")?.querySelector('[name="late_duration_custom"]');
        if (!custom) return;
        const isCustom = sel.value === "__custom__";
        custom.hidden = !isCustom;
        if (isCustom) custom.focus();
      }
    });
  }

  function renumberComplaints(box) {
    box.querySelectorAll("[data-complaint-row]").forEach((row, i) => {
      const idx = row.querySelector(".floor-dyn-idx");
      if (idx) idx.textContent = `${i + 1}.`;
    });
  }

  function viewDailyReport(payload) {
    const m = payload.manager || state.me?.manager;
    const date = payload.date || todayIso();
    const report = payload.report || { notes: "", status: "draft", form: defaultForm() };
    const form = { ...defaultForm(), ...(report.form || {}) };
    const teachers = payload.teachers || [];
    const summary = payload.summary || { absent: 0, late: 0, remarks: 0, homework: 0 };
    const sent = report.status === "sent";
    const statusChip = sent
      ? `<span class="floor-report-status is-sent">${esc(I18n.t("floorReportSent"))}</span>`
      : `<span class="floor-report-status is-draft">${esc(I18n.t("floorReportDraft"))}</span>`;
    const sentMeta =
      sent && report.submittedAt
        ? `<span class="muted">${esc(I18n.t("floorReportSentAt", { time: formatReportTime(report.submittedAt) }))}</span>`
        : "";
    const sendLabel = sent ? I18n.t("floorReportUpdateSend") : I18n.t("floorReportSend");
    const teachersJson = esc(JSON.stringify(teachers));

    return shell(
      "report",
      I18n.t("floorDailyReport"),
      `${floorLabel(m)} · ${I18n.t("floorDailyReportLede")}`,
      `
      <form class="register-toolbar floor-day-toolbar" id="floor-report-date-form">
        <label class="admin-field register-field">
          <span>${esc(I18n.t("sessionDate"))}</span>
          <input type="date" name="date" value="${esc(date)}" required />
        </label>
        <div class="floor-report-status-row">
          ${statusChip}
          ${sentMeta}
        </div>
        <div class="register-summary">
          <span>${summary.absent || 0} ${esc(I18n.t("attendanceAbsent"))}</span>
          · <span>${summary.late || 0} ${esc(I18n.t("attendanceLate"))}</span>
          · <span>${summary.remarks || 0} ${esc(I18n.t("remark"))}</span>
          · <span>${summary.homework || 0} ${esc(I18n.t("homework"))}</span>
        </div>
      </form>

      <div class="floor-report-meta facts-grid">
        <div class="fact-card">
          <div class="k">${esc(I18n.t("floorLabel"))}</div>
          <div class="v" dir="auto">${esc(floorLabel(m))}</div>
        </div>
        <div class="fact-card">
          <div class="k">${esc(I18n.t("floorReportManager"))}</div>
          <div class="v">${esc(m?.loginCode || "")}</div>
        </div>
        <div class="fact-card">
          <div class="k">${esc(I18n.t("sessionDate"))}</div>
          <div class="v">${esc(date)}</div>
        </div>
      </div>

      <div class="floor-report-grid">
        <section class="floor-report-section">
          <h3>${esc(I18n.t("floorReportAutoAbsences"))} <span class="chip neutral">${esc(String(summary.absent || 0))}</span></h3>
          ${renderIssueList(payload.absences)}
        </section>
        <section class="floor-report-section">
          <h3>${esc(I18n.t("floorReportAutoLate"))} <span class="chip neutral">${esc(String(summary.late || 0))}</span></h3>
          ${renderIssueList(payload.late)}
        </section>
        <section class="floor-report-section">
          <h3>${esc(I18n.t("floorReportAutoRemarks"))} <span class="chip neutral">${esc(String(summary.remarks || 0))}</span></h3>
          ${renderIssueList(payload.remarks)}
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

      <form class="floor-report-card-form" id="floor-report-form" data-report-date="${esc(date)}" data-teachers="${teachersJson}">
        ${teacherDatalist(teachers)}

        <section class="admin-panel">
          <div class="admin-panel-label">${esc(I18n.t("floorReportCardTitle"))}</div>
          <p class="admin-field-hint">${esc(I18n.t("floorReportCardHint"))}</p>
          <div class="floor-report-time-row">
            <label class="admin-field">
              <span>${esc(I18n.t("floorReportTimeFrom"))}</span>
              <input type="time" name="timeFrom" value="${esc(form.timeFrom || "08:00")}" />
            </label>
            <label class="admin-field">
              <span>${esc(I18n.t("floorReportTimeTo"))}</span>
              <input type="time" name="timeTo" value="${esc(form.timeTo || "16:00")}" />
            </label>
          </div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-label">${esc(I18n.t("floorReportComplaints"))}</div>
          <div class="floor-dyn-list" data-complaint-list>${complaintRowsHtml(form.complaints)}</div>
          <button type="button" class="btn btn-ghost" data-add-row="complaint">+ ${esc(I18n.t("floorReportAddComplaint"))}</button>
        </section>

        <section class="admin-panel">
          <div class="floor-report-split">
            <label class="admin-field">
              <span>${esc(I18n.t("floorReportProblemsSolved"))}</span>
              <input type="number" name="problemsSolved" min="0" max="99" value="${esc(String(form.problemsSolved || 0))}" />
            </label>
            <div class="admin-field">
              <span>${esc(I18n.t("floorReportParentReplied"))}</span>
              ${ynRadios("parentResponded", form.parentResponded)}
            </div>
          </div>
          <label class="admin-field" style="margin-top:0.75rem">
            <span>${esc(I18n.t("floorReportActionsTaken"))}</span>
            <textarea name="actionsTaken" rows="3" dir="auto" placeholder="${esc(I18n.t("floorReportActionsPh"))}">${esc(form.actionsTaken || "")}</textarea>
          </label>
          <label class="admin-field" style="margin-top:0.75rem">
            <span>${esc(I18n.t("floorReportAdminEscalation"))}</span>
            <textarea name="adminEscalation" rows="3" dir="auto" placeholder="${esc(I18n.t("floorReportEscalationPh"))}">${esc(form.adminEscalation || "")}</textarea>
          </label>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-label">${esc(I18n.t("floorReportFloorNeeds"))}</div>
          <label class="admin-field" style="margin-top:0.5rem">
            <textarea name="floorNeeds" rows="2" dir="auto" placeholder="${esc(I18n.t("floorReportFloorNeedsPh"))}">${esc(form.floorNeeds || "")}</textarea>
          </label>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-label">${esc(I18n.t("floorReportStaffAbsences"))}</div>
          <div class="floor-report-table-wrap">
            <table class="floor-report-table">
              <thead>
                <tr>
                  <th>${esc(I18n.t("floorReportAbsentName"))}</th>
                  <th>${esc(I18n.t("floorReportRole"))}</th>
                  <th>${esc(I18n.t("floorReportSubstitute"))}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody data-staff-body>${staffAbsenceRowsHtml(form.staffAbsences, teachers)}</tbody>
            </table>
          </div>
          <button type="button" class="btn btn-ghost" data-add-row="staff">+ ${esc(I18n.t("floorReportAddRow"))}</button>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-label">${esc(I18n.t("floorReportTeacherLates"))}</div>
          <div class="floor-report-table-wrap">
            <table class="floor-report-table">
              <thead>
                <tr>
                  <th>${esc(I18n.t("floorReportLateTeacher"))}</th>
                  <th>${esc(I18n.t("floorReportDuration"))}</th>
                  <th>${esc(I18n.t("floorReportSubstitute"))}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody data-late-body>${teacherLateRowsHtml(form.teacherLates, teachers)}</tbody>
            </table>
          </div>
          <button type="button" class="btn btn-ghost" data-add-row="late">+ ${esc(I18n.t("floorReportAddRow"))}</button>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-label">${esc(I18n.t("floorReportIncident"))}</div>
          <label class="admin-field" style="margin-top:0.5rem">
            <textarea name="incident" rows="4" dir="auto" placeholder="${esc(I18n.t("floorReportIncidentPh"))}">${esc(form.incident || "")}</textarea>
          </label>
          <div class="admin-field" style="margin-top:0.75rem">
            <span>${esc(I18n.t("floorReportCameraReview"))}</span>
            ${ynRadios("cameraReview", form.cameraReview)}
          </div>
        </section>

        <section class="admin-panel floor-report-notes-panel">
          <div class="admin-panel-label">${esc(I18n.t("floorReportExtraNotes"))}</div>
          <label class="admin-field" style="margin-top:0.5rem">
            <textarea name="notes" rows="3" dir="auto" placeholder="${esc(I18n.t("floorReportNotesPlaceholder"))}">${esc(report.notes || "")}</textarea>
          </label>
        </section>

        <div class="floor-report-actions">
          <button type="submit" name="action" value="draft" class="btn btn-ghost">${esc(I18n.t("floorReportSaveDraft"))}</button>
          <button type="submit" name="action" value="send" class="btn btn-primary">${esc(sendLabel)}</button>
        </div>
        <p class="ann-status" data-report-status hidden></p>
      </form>
    `
    );
  }

  function viewProfile() {
    const m = state.me?.manager || {};
    return shell(
      "profile",
      I18n.t("myProfile"),
      floorLabel(m),
      `
      <section class="admin-panel" style="margin-bottom:1rem">
        <div class="admin-panel-label">${esc(I18n.t("officialInfo"))}</div>
        <div class="facts-grid" style="margin-top:0.75rem">
          <div class="fact-card"><div class="k">${esc(I18n.t("floorLoginId"))}</div><div class="v">${esc(m.loginCode || "")}</div></div>
          <div class="fact-card"><div class="k">${esc(I18n.t("floorLabel"))}</div><div class="v" dir="auto">${esc(floorLabel(m))}</div></div>
          <div class="fact-card"><div class="k">${esc(I18n.t("department"))}</div><div class="v">${esc(I18n.t("primary"))}</div></div>
        </div>
      </section>
      <section class="admin-panel">
        <div class="admin-panel-label">${esc(I18n.t("changePassword"))}</div>
        <form id="floor-change-password" class="admin-form admin-form-stack" style="margin-top:0.75rem">
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
      await ensureMe();
      if (!parts[1] || parts[1] === "home") {
        const date = params?.get("date") || todayIso();
        const key = date;
        let payload = state.dayCache.get(key);
        if (!payload) {
          payload = await BBC_API.get(`/floor/day?date=${encodeURIComponent(date)}`);
          state.dayCache.set(key, payload);
        }
        return { html: viewDayBoard(payload) };
      }
      if (parts[1] === "class" && parts[2]) {
        const classId = parts[2];
        const date = params?.get("date") || todayIso();
        const key = `${classId}:${date}`;
        let payload = state.classDayCache.get(key);
        if (!payload) {
          payload = await BBC_API.get(
            `/floor/classes/${encodeURIComponent(classId)}/day?date=${encodeURIComponent(date)}`
          );
          state.classDayCache.set(key, payload);
        }
        return { html: viewClassDay(classId, payload) };
      }
      if (parts[1] === "report") {
        const date = params?.get("date") || todayIso();
        const payload = await BBC_API.get(`/floor/reports/day?date=${encodeURIComponent(date)}`);
        return { html: viewDailyReport(payload) };
      }
      if (parts[1] === "whatsapp") {
        let status = {};
        try {
          status = await BBC_API.get("/floor/wa/status");
        } catch (err) {
          status = { ready: false, error: err.message };
        }
        const mode = parts[2] === "homework" || parts[2] === "remarks" ? parts[2] : "";
        if (!mode || !status.ready) {
          return { html: viewWhatsApp(status) };
        }
        const date = params?.get("date") || todayIso();
        let content = { homework: [], remarks: [] };
        let groups = [];
        let groupsError = "";
        try {
          content = await BBC_API.get(`/floor/wa/day-content?date=${encodeURIComponent(date)}`);
        } catch (err) {
          content = { homework: [], remarks: [], error: err.message };
        }
        try {
          const g = await BBC_API.get("/floor/wa/groups");
          groups = g.groups || [];
          if (!groups.length && g.error) groupsError = g.error;
        } catch (err) {
          groupsError = err.message || I18n.t("floorNoWaGroups");
        }
        return {
          html: viewWhatsApp(status, { mode, date, content, groups, groupsError }),
        };
      }
      if (parts[1] === "profile") {
        return { html: viewProfile() };
      }
      return { html: viewDayBoard({ date: todayIso(), classes: me.classes || [], sessions: [], summary: {} }) };
    } catch (err) {
      return {
        html: `<div class="admin-empty is-err">${esc(err.message || I18n.t("failedLoad"))}</div>`,
      };
    }
  }

  function bind(root, go) {
    const setStatus = (el, msg, ok) => {
      if (!el) return;
      el.hidden = !msg;
      el.textContent = msg || "";
      el.classList.toggle("is-ok", Boolean(ok && msg));
      el.classList.toggle("is-err", Boolean(!ok && msg));
    };

    root.querySelector("#floor-day-form")?.addEventListener("change", (e) => {
      if (e.target?.name === "date") {
        const date = e.target.value;
        state.dayCache.clear();
        go(`/floor?date=${encodeURIComponent(date)}`);
      }
    });
    root.querySelector("#floor-report-date-form")?.addEventListener("change", (e) => {
      if (e.target?.name === "date") {
        const date = e.target.value;
        go(`/floor/report?date=${encodeURIComponent(date)}`);
      }
    });
    bindReportFormDynamics(root);
    root.querySelector("#floor-report-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const date = form.getAttribute("data-report-date") || todayIso();
      const notes = String(form.querySelector('[name="notes"]')?.value || "");
      const formData = collectReportForm(form);
      const action = e.submitter?.value || "draft";
      const send = action === "send";
      const statusEl = form.querySelector("[data-report-status]");
      try {
        await BBC_API.put("/floor/reports/day", { date, notes, form: formData, send });
        setStatus(
          statusEl,
          send ? I18n.t("floorReportSentOk") : I18n.t("floorReportSaved"),
          true
        );
        setTimeout(() => go(`/floor/report?date=${encodeURIComponent(date)}`), 500);
      } catch (err) {
        setStatus(statusEl, err.message || I18n.t("loginError"), false);
      }
    });
    root.querySelector("#floor-class-search")?.addEventListener("input", (e) => {
      const q = String(e.target.value || "")
        .toLowerCase()
        .trim();
      root.querySelectorAll("#floor-class-grid [data-class-q]").forEach((el) => {
        const hay = el.getAttribute("data-class-q") || "";
        el.hidden = Boolean(q && !hay.includes(q));
      });
    });
    root.querySelector("#floor-roster-search")?.addEventListener("input", (e) => {
      const q = String(e.target.value || "")
        .toLowerCase()
        .trim();
      root.querySelectorAll("[data-floor-roster-q]").forEach((el) => {
        const hay = el.getAttribute("data-floor-roster-q") || "";
        el.hidden = Boolean(q && !hay.includes(q));
      });
    });

    root.querySelector("#floor-change-password")?.addEventListener("submit", async (e) => {
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
        await BBC_API.post("/floor/password", { currentPassword, newPassword });
        if (state.me?.manager) state.me.manager.mustChangePassword = false;
        e.target.reset();
        setStatus(statusEl, I18n.t("passwordChanged"), true);
      } catch (err) {
        setStatus(statusEl, err.message || I18n.t("loginError"), false);
      }
    });

    root.querySelector("[data-floor-wa-refresh]")?.addEventListener("click", () => {
      go("/floor/whatsapp");
    });

    const qrImg = root.querySelector("[data-floor-qr]");
    if (qrImg && BBC_API.getBlobUrl) {
      BBC_API.getBlobUrl(`/floor/wa/qr?t=${Date.now()}`)
        .then((url) => {
          qrImg.src = url;
        })
        .catch(() => {
          /* QR may still be warming up */
        });
    }

    root.querySelector("[data-floor-wa-logout]")?.addEventListener("click", async () => {
      const statusEl = root.querySelector("[data-wa-status]");
      if (!confirm(I18n.t("disconnectWhatsAppConfirm"))) return;
      try {
        await BBC_API.post("/floor/wa/logout", {});
        setStatus(statusEl, I18n.t("whatsappDisconnected"), true);
        go("/floor/whatsapp");
      } catch (err) {
        setStatus(statusEl, err.message || I18n.t("loginError"), false);
      }
    });

    const waForm = root.querySelector("#floor-wa-group-form");
    if (waForm) {
      const textArea = waForm.querySelector('[name="text"]');
      const rebuildText = () => {
        if (!textArea || textArea.dataset.manual === "1") return;
        const blocks = [...waForm.querySelectorAll('input[name="pick"]:checked')].map((el) => {
          const meta = el.getAttribute("data-meta") || "";
          const body = el.getAttribute("data-text") || "";
          return meta ? `• ${meta}\n${body}` : body;
        });
        textArea.value = blocks.join("\n\n");
      };
      waForm.querySelectorAll('input[name="pick"]').forEach((el) => {
        el.addEventListener("change", () => {
          if (textArea) textArea.dataset.manual = "";
          rebuildText();
        });
      });
      textArea?.addEventListener("input", () => {
        textArea.dataset.manual = "1";
      });
      waForm.querySelector('[name="date"]')?.addEventListener("change", (e) => {
        const date = e.target.value;
        const mode = waForm.getAttribute("data-mode") || "homework";
        go(`/floor/whatsapp/${mode}?date=${encodeURIComponent(date)}`);
      });
      root.querySelector("#floor-wa-group-search")?.addEventListener("input", (e) => {
        const q = String(e.target.value || "")
          .toLowerCase()
          .trim();
        root.querySelectorAll("[data-group-list] [data-group-q]").forEach((el) => {
          const hay = el.getAttribute("data-group-q") || "";
          el.hidden = Boolean(q && !hay.includes(q));
        });
      });
      waForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const statusEl = waForm.querySelector("[data-group-send-status]");
        const text = String(textArea?.value || "").trim();
        const selected = [...waForm.querySelectorAll('input[name="group"]:checked')];
        const groupIds = selected.map((el) => el.value);
        const groupNames = selected.map((el) => el.getAttribute("data-name") || "");
        if (!text) {
          setStatus(statusEl, I18n.t("floorMessageRequired"), false);
          return;
        }
        if (!groupIds.length) {
          setStatus(statusEl, I18n.t("floorSelectGroups"), false);
          return;
        }
        try {
          setStatus(statusEl, I18n.t("sendingWhatsApp"), true);
          const res = await BBC_API.post("/floor/wa/send-groups", {
            text,
            groupIds,
            groupNames,
            actionType: waForm.getAttribute("data-action-type") || "group_message",
          });
          setStatus(
            statusEl,
            I18n.t("whatsappSendResult", { sent: res.sent || 0, failed: res.failed || 0 }),
            Boolean(res.ok)
          );
        } catch (err) {
          setStatus(statusEl, err.message || I18n.t("loginError"), false);
        }
      });
    }

    const dialog = root.querySelector("#floor-msg-dialog");
    const form = root.querySelector("#floor-msg-form");
    let pendingSend = null;

    const openComposer = ({ hint, text, recipients, meta }) => {
      if (!dialog || !form) return;
      pendingSend = { recipients, meta };
      form.querySelector("[data-msg-hint]").textContent = hint || "";
      form.querySelector('[name="text"]').value = text || "";
      form.querySelector("[data-msg-recipients]").innerHTML = recipients
        .map(
          (r) =>
            `<label class="admin-check"><input type="checkbox" name="phone" value="${esc(r.phone)}" checked /> <span dir="auto">${esc(r.name || r.role || "")} · ${esc(r.phone)}${r.studentName ? ` (${esc(r.studentName)})` : ""}</span></label>`
        )
        .join("");
      setStatus(form.querySelector("[data-msg-status]"), "", true);
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "open");
    };

    root.querySelectorAll("[data-floor-contact]").forEach((btn) => {
      btn.addEventListener("click", () => {
        let phones = [];
        try {
          phones = JSON.parse(btn.getAttribute("data-phones") || "[]");
        } catch {
          phones = [];
        }
        const studentName = btn.getAttribute("data-student-name") || "";
        const status = btn.getAttribute("data-status") || "";
        const remark = btn.getAttribute("data-remark") || "";
        const classLabelText = root.querySelector("[data-floor-class-day]")?.getAttribute("data-class-label") || "";
        const date = root.querySelector("[data-floor-class-day]")?.getAttribute("data-date") || "";
        let text = I18n.t("floorAbsenceMessage", {
          student: studentName,
          class: classLabelText,
          date,
          status: statusLabel(status),
        });
        if (remark) text += `\n${I18n.t("remark")}: ${remark}`;
        openComposer({
          hint: studentName,
          text,
          recipients: phones.map((p) => ({ ...p, studentName, studentId: btn.getAttribute("data-student-id") })),
          meta: {
            actionType: status === "late" ? "late_notified" : "absence_notified",
            classId: root.querySelector("[data-floor-class-day]")?.getAttribute("data-class-id"),
            sessionId: btn.getAttribute("data-session-id"),
            studentId: btn.getAttribute("data-student-id"),
          },
        });
      });
    });

    root.querySelectorAll("[data-send-homework]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wrap = root.querySelector("[data-floor-class-day]");
        const classId = wrap?.getAttribute("data-class-id");
        const classLabelText = wrap?.getAttribute("data-class-label") || "";
        const date = wrap?.getAttribute("data-date") || "";
        const subject = btn.getAttribute("data-subject") || "";
        const homework = btn.getAttribute("data-homework") || "";
        const payloadKey = `${classId}:${date}`;
        const cached = state.classDayCache.get(payloadKey);
        const recipients = [];
        for (const st of cached?.students || []) {
          for (const p of st.parentPhones || []) {
            recipients.push({
              ...p,
              studentId: st.id,
              studentName: studentLabel(st),
            });
          }
        }
        if (!recipients.length) {
          alert(I18n.t("noParentPhone"));
          return;
        }
        const text = I18n.t("floorHomeworkMessage", {
          class: classLabelText,
          date,
          subject,
          homework,
        });
        openComposer({
          hint: I18n.t("sendHomeworkToParents"),
          text,
          recipients,
          meta: {
            actionType: "homework_sent",
            classId,
            sessionId: btn.getAttribute("data-session-id"),
          },
        });
      });
    });

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitter = e.submitter;
      const value = submitter?.value || "cancel";
      if (value === "cancel") {
        dialog?.close?.();
        dialog?.removeAttribute("open");
        return;
      }
      const text = String(form.querySelector('[name="text"]')?.value || "").trim();
      const checked = [...form.querySelectorAll('input[name="phone"]:checked')].map((el) => el.value);
      const recipients = (pendingSend?.recipients || []).filter((r) => checked.includes(r.phone));
      const statusEl = form.querySelector("[data-msg-status]");
      if (!recipients.length) {
        setStatus(statusEl, I18n.t("selectRecipients"), false);
        return;
      }
      try {
        setStatus(statusEl, I18n.t("sendingWhatsApp"), true);
        const res = await BBC_API.post("/floor/wa/send", {
          text,
          recipients,
          ...(pendingSend?.meta || {}),
        });
        setStatus(
          statusEl,
          I18n.t("whatsappSendResult", { sent: res.sent || 0, failed: res.failed || 0 }),
          Boolean(res.ok)
        );
        if (res.ok) {
          setTimeout(() => {
            dialog?.close?.();
            dialog?.removeAttribute("open");
          }, 900);
        }
      } catch (err) {
        setStatus(statusEl, err.message || I18n.t("loginError"), false);
      }
    });
  }

  function reset() {
    state.me = null;
    state.dayCache.clear();
    state.classDayCache.clear();
  }

  return { resolve, bind, reset };
})();

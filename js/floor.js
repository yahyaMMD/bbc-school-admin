/**
 * Floor manager portal — primary étages: daily registers + WhatsApp to parents.
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
    if (typeof I18n !== "undefined" && I18n.getLang && I18n.getLang() === "ar" && m.floorLabelAr) {
      return m.floorLabelAr;
    }
    return m.floorLabel || m.loginCode || "";
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

  function viewMustChangePassword() {
    return `
      <div class="teacher-portal">
        <div class="admin-panel" style="max-width:28rem;margin:2rem auto">
          <div class="admin-panel-label">${esc(I18n.t("changePassword"))}</div>
          <p class="admin-field-hint">${esc(I18n.t("mustChangePasswordHint"))}</p>
          <form id="floor-force-password" class="admin-form admin-form-stack">
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
            <p class="ann-status" data-pw-err hidden></p>
            <button type="submit" class="btn btn-primary">${esc(I18n.t("savePassword"))}</button>
          </form>
        </div>
      </div>`;
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
          <button type="button" class="floor-class-card" data-nav="#/floor/class/${esc(c.id)}?date=${esc(date)}">
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
        <div class="register-summary">
          <span>${summary.absent} ${esc(I18n.t("attendanceAbsent"))}</span>
          · <span>${summary.late} ${esc(I18n.t("attendanceLate"))}</span>
          · <span>${summary.remarks} ${esc(I18n.t("remark"))}</span>
          · <span>${summary.homework} ${esc(I18n.t("homework"))}</span>
        </div>
      </form>
      <div class="floor-class-grid">
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

  function viewWhatsApp(status) {
    const ready = Boolean(status?.ready);
    const qrReady = Boolean(status?.qrReady);
    return shell(
      "whatsapp",
      I18n.t("floorWhatsApp"),
      I18n.t("floorWhatsAppLede"),
      `
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
      </section>
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
      const me = await ensureMe();
      if (me.manager?.mustChangePassword && parts[1] !== "password") {
        return { html: viewMustChangePassword(), forcePassword: true };
      }
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
      if (parts[1] === "whatsapp") {
        let status = {};
        try {
          status = await BBC_API.get("/floor/wa/status");
        } catch (err) {
          status = { ready: false, error: err.message };
        }
        return { html: viewWhatsApp(status) };
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

    root.querySelector("#floor-force-password")?.addEventListener("submit", async (e) => {
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
        await BBC_API.post("/floor/password", { currentPassword, newPassword });
        if (state.me?.manager) state.me.manager.mustChangePassword = false;
        go("/floor");
      } catch (err) {
        setStatus(errEl, err.message || I18n.t("loginError"), false);
      }
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

/* Shared weekly timetable renderer for teacher + director portals */
(function () {
  const DAYS = ["sun", "mon", "tue", "wed", "thu"];

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function t(key, fallback) {
    if (typeof I18n !== "undefined" && I18n.t) {
      const v = I18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function dayLabel(day, labels) {
    const lang =
      typeof I18n !== "undefined" && I18n.getLang
        ? I18n.getLang()
        : typeof I18n !== "undefined" && I18n.lang
          ? I18n.lang()
          : "ar";
    const pack = (labels && labels[day]) || {};
    if (lang === "fr") return pack.fr || day;
    if (lang === "en") return pack.en || day;
    return pack.ar || day;
  }

  function shiftLabel(shift) {
    return shift === "evening" ? t("ttEvening", "Evening") : t("ttMorning", "Morning");
  }

  function roleLabel(role) {
    const map = {
      general: ["ttRoleGeneral", "Homeroom"],
      arabic: ["ttRoleArabic", "Arabic"],
      french: ["ttRoleFrench", "French"],
      english_principal: ["ttRoleEngPrincipal", "English (principal)"],
      english_activity: ["ttRoleEngActivity", "English (activity)"],
      principal: ["ttRoleEngPrincipal", "Principal"],
      activity: ["ttRoleEngActivity", "Activity"],
      homeroom: ["ttRoleGeneral", "Homeroom"],
    };
    const pair = map[role];
    return pair ? t(pair[0], pair[1]) : role || "";
  }

  function moduleLabel(m) {
    if (!m) return "";
    const k = `module_${m}`;
    return t(k, m);
  }

  function teacherName(slot) {
    if (slot.teacher) {
      const te = slot.teacher;
      const ar = [te.firstName, te.lastName].filter(Boolean).join(" ").trim();
      return ar || te.nameLatin || slot.teacherName || "—";
    }
    return slot.teacherName || "—";
  }

  function classCode(slotOrClass) {
    if (!slotOrClass) return "";
    if (slotOrClass.code) return slotOrClass.code;
    return slotOrClass.class?.code || slotOrClass.classId || "";
  }

  function renderChip(s, opts = {}) {
    const showClass = opts.showClass !== false;
    const bits = [
      s.module ? `<span class="tt-mod">${esc(moduleLabel(s.module))}</span>` : "",
      `<span class="tt-who" dir="auto">${esc(teacherName(s))}</span>`,
      s.role && s.role !== "general" ? `<span class="tt-role">${esc(roleLabel(s.role))}</span>` : "",
      showClass && classCode(s) ? `<span class="tt-class">${esc(classCode(s))}</span>` : "",
    ].filter(Boolean);
    return `<div class="tt-chip role-${esc(s.role || "general")}">${bits.join("")}</div>`;
  }

  function renderCell(slots, opts) {
    if (!slots.length) return `<div class="tt-empty">—</div>`;
    return slots.map((s) => renderChip(s, opts)).join("");
  }

  function renderModuleTeachers(list) {
    if (!list || !list.length) return "";
    return `<div class="tt-module-teachers">
      <div class="tt-subtitle">${esc(t("ttModuleTeachers", "Module teachers"))}</div>
      <div class="tt-mt-row">
        ${list
          .map((m) => {
            const who =
              m.teacherName ||
              (m.teacher
                ? [m.teacher.firstName, m.teacher.lastName].filter(Boolean).join(" ")
                : "") ||
              "—";
            return `<span class="tt-mt-chip"><strong>${esc(moduleLabel(m.module) || m.module)}</strong> · ${esc(roleLabel(m.role))} · <span dir="auto">${esc(who)}</span></span>`;
          })
          .join("")}
      </div>
    </div>`;
  }

  function renderGrid(data, opts = {}) {
    let slots = data?.slots || [];
    if (opts.teacherId) {
      slots = slots.filter((s) => s.teacherId === opts.teacherId);
    }
    if (opts.classId) {
      slots = slots.filter((s) => s.classId === opts.classId);
    }
    const labels = data?.dayLabels || {};
    const title = opts.title || t("timetable", "Timetable");
    const byDayShift = {};
    for (const d of DAYS) byDayShift[d] = { morning: [], evening: [] };
    for (const s of slots) {
      const day = s.dayOfWeek;
      const shift = s.shift === "evening" ? "evening" : "morning";
      if (!byDayShift[day]) continue;
      byDayShift[day][shift].push(s);
    }

    const moduleTeachers = data.moduleTeachers || data.moduleRoles || [];
    const mtHtml = renderModuleTeachers(moduleTeachers);

    if (!slots.length && !moduleTeachers.length) {
      return `<section class="tt-panel"><div class="tt-head"><h3>${esc(title)}</h3></div><p class="muted">${esc(t("ttEmpty", "No timetable available yet"))}</p></section>`;
    }

    const chipOpts = { showClass: opts.showClass !== false && !opts.classId };

    return `
      <section class="tt-panel">
        <div class="tt-head">
          <h3>${esc(title)}</h3>
          <div class="tt-head-meta">
            ${data.defaultShift ? `<span class="chip neutral">${esc(shiftLabel(data.defaultShift))}</span>` : ""}
            <span class="chip accent">${esc(String(slots.length))} ${esc(t("ttSlots", "slots"))}</span>
          </div>
        </div>
        ${mtHtml}
        <div class="tt-table-wrap">
          <table class="tt-table">
            <thead>
              <tr>
                <th>${esc(t("ttShift", "Shift"))}</th>
                ${DAYS.map((d) => `<th>${esc(dayLabel(d, labels))}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${["morning", "evening"]
                .map(
                  (shift) => `
                <tr>
                  <th scope="row">${esc(shiftLabel(shift))}</th>
                  ${DAYS.map((d) => `<td>${renderCell(byDayShift[d][shift], chipOpts)}</td>`).join("")}
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  /** One combined grid per school year: columns = classes, rows = day×shift */
  function renderYearGrid(data, year, opts = {}) {
    const labels = data?.dayLabels || {};
    const allClasses = (data?.classes || [])
      .filter((c) => Number(c.year) === Number(year))
      .sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), "en"));
    const slots = (data?.slots || []).filter((s) => {
      const cls = allClasses.find((c) => c.id === s.classId);
      return Boolean(cls);
    });

    const title =
      opts.title ||
      `${t("timetable", "Timetable")} — ${t("year", "Year")} ${year}`;

    if (!allClasses.length) {
      return `<section class="tt-panel tt-year-panel"><div class="tt-head"><h3>${esc(title)}</h3></div><p class="muted">${esc(t("ttEmpty", "No timetable available yet"))}</p></section>`;
    }

    const byKey = {};
    for (const s of slots) {
      const shift = s.shift === "evening" ? "evening" : "morning";
      const key = `${s.classId}|${s.dayOfWeek}|${shift}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(s);
    }

    // Prefer richer cells: show all roles (general + language + english activity)
    const rowDefs = [];
    for (const d of DAYS) {
      rowDefs.push({ day: d, shift: "morning" });
      rowDefs.push({ day: d, shift: "evening" });
    }

    return `
      <section class="tt-panel tt-year-panel" data-tt-year="${esc(year)}">
        <div class="tt-head">
          <h3>${esc(title)}</h3>
          <div class="tt-head-meta">
            <span class="chip accent">${esc(String(allClasses.length))} ${esc(t("classes", "classes"))}</span>
            <span class="chip neutral">${esc(String(slots.length))} ${esc(t("ttSlots", "slots"))}</span>
          </div>
        </div>
        <div class="tt-legend">
          <span class="tt-leg role-general">${esc(t("ttRoleGeneral", "Homeroom"))}</span>
          <span class="tt-leg role-arabic">${esc(t("ttRoleArabic", "Arabic"))}</span>
          <span class="tt-leg role-french">${esc(t("ttRoleFrench", "French"))}</span>
          <span class="tt-leg role-english_principal">${esc(t("ttRoleEngPrincipal", "English principal"))}</span>
          <span class="tt-leg role-english_activity">${esc(t("ttRoleEngActivity", "English activity"))}</span>
        </div>
        <div class="tt-table-wrap tt-year-wrap">
          <table class="tt-table tt-year-table">
            <thead>
              <tr>
                <th class="tt-sticky">${esc(t("ttDayShift", "Day / shift"))}</th>
                ${allClasses
                  .map((c) => {
                    const shift = c.defaultShift ? `<div class="tt-col-shift">${esc(shiftLabel(c.defaultShift))}</div>` : "";
                    return `<th><div class="tt-col-code">${esc(c.code || c.nameAr || c.id)}</div>${shift}</th>`;
                  })
                  .join("")}
              </tr>
            </thead>
            <tbody>
              ${rowDefs
                .map((rd, idx) => {
                  const dayChanged = idx === 0 || rowDefs[idx - 1].day !== rd.day;
                  return `<tr class="${dayChanged ? "tt-day-start" : ""}">
                    <th scope="row" class="tt-sticky">
                      <div class="tt-row-day">${esc(dayLabel(rd.day, labels))}</div>
                      <div class="tt-row-shift">${esc(shiftLabel(rd.shift))}</div>
                    </th>
                    ${allClasses
                      .map((c) => {
                        const cell = byKey[`${c.id}|${rd.day}|${rd.shift}`] || [];
                        return `<td>${renderCell(cell, { showClass: false })}</td>`;
                      })
                      .join("")}
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function renderDirectorOverview(data) {
    const classes = data?.classes || [];
    const years = [...new Set(classes.map((c) => Number(c.year) || 0).filter(Boolean))].sort(
      (a, b) => a - b
    );
    const title = t("timetableOverview", "Class timetables");
    if (!years.length) {
      return `<section class="tt-panel"><div class="tt-head"><h3>${esc(title)}</h3></div><p class="muted">${esc(t("ttEmpty", "No timetable available yet"))}</p></section>`;
    }

    const deptLabel =
      data.departmentId === "middle" ? t("middle", "Middle") : t("primary", "Primary");

    return `
      <div class="tt-director">
        <div class="tt-director-head">
          <div>
            <h2 class="tt-director-title">${esc(title)}</h2>
            <p class="muted">${esc(deptLabel)} · ${esc(data.schoolYear || "2026-2027")}</p>
          </div>
          <div class="tt-year-tabs" role="tablist">
            ${years
              .map(
                (y, i) =>
                  `<button type="button" class="tt-year-tab${i === 0 ? " is-active" : ""}" data-tt-jump="${esc(y)}">${esc(t("year", "Year"))} ${esc(y)}</button>`
              )
              .join("")}
          </div>
        </div>
        ${years.map((y) => renderYearGrid(data, y)).join("")}
      </div>`;
  }

  window.QEATimetable = {
    renderGrid,
    renderYearGrid,
    renderDirectorOverview,
    DAYS,
  };
})();

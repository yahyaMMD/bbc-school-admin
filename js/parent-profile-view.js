/**
 * Compact, readable parent-form dossier for student profiles.
 */
const ParentProfileView = (() => {
  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function yesNo(v) {
    if (v === "yes") return I18n.t("yes");
    if (v === "no") return I18n.t("no");
    return v || "—";
  }

  function departureLabel(mode) {
    const map = {
      withParent: I18n.t("departureWithParent"),
      motherOnly: I18n.t("departureMotherOnly"),
      fatherOnly: I18n.t("departureFatherOnly"),
      alone: I18n.t("departureAlone"),
      companion: I18n.t("departureCompanion"),
      driver: I18n.t("departureDriver"),
    };
    return map[mode] || mode || "—";
  }

  function sexLabel(sex) {
    if (sex === "female") return I18n.t("parentFormsSexFemale");
    if (sex === "male") return I18n.t("parentFormsSexMale");
    return sex || "—";
  }

  function pairsFrom(obj, fields) {
    return fields
      .map(([label, key, fmt]) => {
        const raw = obj?.[key];
        const val = fmt ? fmt(raw) : raw;
        if (val == null || String(val).trim() === "") return null;
        return [label, val];
      })
      .filter(Boolean);
  }

  function dl(pairs) {
    if (!pairs.length) return "";
    return `<dl class="parent-dossier-dl">${pairs
      .map(
        ([k, v]) =>
          `<div class="parent-dossier-item"><dt>${esc(k)}</dt><dd dir="auto">${esc(v)}</dd></div>`
      )
      .join("")}</dl>`;
  }

  function section(title, icon, pairs, open) {
    if (!pairs.length) return "";
    return `
      <details class="parent-dossier-section"${open ? " open" : ""}>
        <summary class="parent-dossier-summary">
          <span class="parent-dossier-section-ico" aria-hidden="true">${icon}</span>
          <span>${esc(title)}</span>
          <span class="parent-dossier-count">${pairs.length}</span>
        </summary>
        <div class="parent-dossier-section-body">${dl(pairs)}</div>
      </details>`;
  }

  function parentMini(name, phone, profession) {
    if (!name && !phone && !profession) return "";
    return `
      <div class="parent-dossier-person">
        <strong dir="auto">${esc(name || "—")}</strong>
        ${profession ? `<span class="muted" dir="auto">${esc(profession)}</span>` : ""}
        ${phone ? `<a class="parent-dossier-tel" href="tel:${esc(String(phone).replace(/\s/g, ""))}">${esc(phone)}</a>` : ""}
      </div>`;
  }

  function render(profile, options = {}) {
    if (!profile || typeof profile !== "object") return "";

    const st = profile.student || {};
    const fa = profile.father || {};
    const mo = profile.mother || {};
    const co = profile.contact || {};
    const fam = profile.family || {};
    const med = profile.medical || {};
    const cons = profile.consents || {};

    const studentPairs = pairsFrom(st, [
      [I18n.t("lastName"), "lastName"],
      [I18n.t("firstName"), "firstName"],
      [I18n.t("gender"), "sex", sexLabel],
      [I18n.t("dob"), "dateOfBirth"],
      [I18n.t("placeOfBirth"), "placeOfBirth"],
      [I18n.t("nationality"), "nationality"],
      [I18n.t("enrollmentYear"), "enrollmentYear"],
      [I18n.t("level"), "level"],
      [I18n.t("repeatedYear"), "repeatedYear", yesNo],
      [I18n.t("studiedAbroad"), "studiedAbroad", yesNo],
    ]);

    const contactPairs = pairsFrom(co, [
      [I18n.t("parentPhoneSecondary"), "phoneBackup"],
      [I18n.t("parentAddress"), "address"],
      [I18n.t("email"), "email"],
    ]);

    const familyPairs = pairsFrom(fam, [
      [I18n.t("parentMarital"), "parentsStatus"],
      [I18n.t("custody"), "custody"],
      [I18n.t("siblingsCount"), "siblingsCount"],
      [I18n.t("brothersCount"), "brothersCount"],
      [I18n.t("sistersCount"), "sistersCount"],
      [I18n.t("siblingRank"), "siblingRank"],
      [I18n.t("tutor"), "tutorNameRole"],
      [I18n.t("tutorPhone"), "tutorPhone"],
      [I18n.t("adopted"), "adopted", yesNo],
    ]);

    const medicalPairs = pairsFrom(med, [
      [I18n.t("bloodType"), "bloodType"],
      [I18n.t("disability"), "disability", yesNo],
      [I18n.t("disabilityExplain"), "disabilityExplain"],
      [I18n.t("allergy"), "allergy"],
      [I18n.t("glasses"), "glasses"],
      [I18n.t("behavior"), "behavior"],
      [I18n.t("learningDifficulty"), "learningDifficulty"],
      [I18n.t("treatment"), "treatment"],
      [I18n.t("psychologist"), "psychologist"],
      [I18n.t("incident"), "incident"],
      [I18n.t("medicalOther"), "other"],
    ]);

    const consentPairs = [
      [I18n.t("departureMode"), departureLabel(cons.departureMode)],
      [I18n.t("companionRole"), cons.companionRole],
      [I18n.t("companionName"), cons.companionName],
      [I18n.t("companionPhone"), cons.companionPhone],
      [I18n.t("driverName"), cons.driverName],
      [I18n.t("driverPhone"), cons.driverPhone],
      [I18n.t("outings"), yesNo(cons.outings)],
      [I18n.t("sports"), yesNo(cons.sports)],
      [I18n.t("photoMedia"), yesNo(cons.photoMedia)],
    ].filter(([, v]) => v != null && String(v).trim() !== "" && v !== "—");

    const quick = [
      fa.phone ? `<span class="parent-dossier-chip">☎ ${esc(fa.phone)}</span>` : "",
      mo.phone ? `<span class="parent-dossier-chip">☎ ${esc(mo.phone)}</span>` : "",
      co.email ? `<span class="parent-dossier-chip">✉ ${esc(co.email)}</span>` : "",
      cons.departureMode
        ? `<span class="parent-dossier-chip accent">${esc(departureLabel(cons.departureMode))}</span>`
        : "",
    ].filter(Boolean);

    const detailLink = options.detailHref
      ? `<a class="parent-dossier-link link-btn" href="${esc(options.detailHref)}">${esc(I18n.t("parentFormDetail"))}</a>`
      : options.submissionId
        ? `<a class="parent-dossier-link link-btn" href="#/manage/parent-forms/${esc(options.submissionId)}">${esc(I18n.t("parentFormDetail"))}</a>`
        : "";

    const parentsBlock =
      fa.name || mo.name || fa.phone || mo.phone
        ? `<div class="parent-dossier-parents">
            ${parentMini(fa.name, fa.phone, fa.profession)}
            ${parentMini(mo.name, mo.phone, mo.profession)}
          </div>`
        : "";

    return `
      <article class="parent-dossier">
        <header class="parent-dossier-head">
          <div class="parent-dossier-head-text">
            <span class="parent-dossier-badge">${esc(I18n.t("parentFormLinkedBadge"))}</span>
            <p class="parent-dossier-lede">${esc(I18n.t("parentFormLinkedLede"))}</p>
            ${detailLink}
          </div>
          ${quick.length ? `<div class="parent-dossier-quick">${quick.join("")}</div>` : ""}
        </header>
        ${parentsBlock}
        <div class="parent-dossier-sections">
          ${section(I18n.t("parentSectionStudent"), "◆", studentPairs, true)}
          ${section(I18n.t("parentSectionContact"), "◎", contactPairs, true)}
          ${section(I18n.t("parentSectionFamily"), "⌂", familyPairs, false)}
          ${section(I18n.t("parentSectionMedical"), "+", medicalPairs, false)}
          ${section(I18n.t("parentSectionConsents"), "✓", consentPairs, false)}
        </div>
      </article>`;
  }

  return { render };
})();

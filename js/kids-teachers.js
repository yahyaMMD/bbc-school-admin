/**
 * BBC Kids — Teachers hub
 */
(() => {
  const { esc, api, route, shell, renderAnnouncements, renderDrama, renderContact } = KidsShared;
  const root = document.getElementById("kids-app");
  let meta = { classes: [], followupAreas: [] };
  let content = { announcement: [], drama: [], curriculum: [], contact: [] };

  function home() {
    return shell(
      "teachers",
      "home",
      `
      <section class="kids-hero">
        <p class="eyebrow">English Department · Préscolaire</p>
        <h1>BBC Kids</h1>
        <p>Requests, planning, drama, and follow-up — one place for Grande Section English teachers.</p>
        <div class="kids-cta-row">
          <a class="kids-btn kids-btn-primary" href="#/forms/printing">New printing request</a>
          <a class="kids-btn kids-btn-ghost" href="#/announcements">Latest news</a>
        </div>
      </section>
      <section class="kids-section">
        <h2>Teacher workspace</h2>
        <p class="lede">Submit requests and open shared resources. The Préscolaire manager sees every submission in real time.</p>
        <div class="kids-grid">
          <a class="kids-card" href="#/forms/printing"><strong>Printing</strong><span>Copies, colour, deadline</span><span class="go">Open form →</span></a>
          <a class="kids-card" href="#/forms/concern"><strong>Concerns</strong><span>Professional feedback & issues</span><span class="go">Open form →</span></a>
          <a class="kids-card" href="#/forms/filming"><strong>Filming</strong><span>Plan activity recordings</span><span class="go">Open form →</span></a>
          <a class="kids-card" href="#/forms/followup"><strong>Student follow-up</strong><span>Observation & support notes</span><span class="go">Open form →</span></a>
          <a class="kids-card" href="#/drama"><strong>Learning through drama</strong><span>Classroom videos</span><span class="go">Watch →</span></a>
          <a class="kids-card" href="#/curriculum"><strong>Curriculum</strong><span>Planning notes</span><span class="go">Open →</span></a>
          <a class="kids-card" href="#/contact"><strong>Contact</strong><span>Availability & office</span><span class="go">View →</span></a>
        </div>
      </section>`
    );
  }

  function classOptions() {
    return (meta.classes || [])
      .map((c) => `<option value="${esc(c.code)}">${esc(c.name || c.code)}</option>`)
      .join("");
  }

  function formShell(title, lede, fieldsHtml, type) {
    return shell(
      "teachers",
      `forms/${type}`,
      `
      <section class="kids-section">
        <h2>${esc(title)}</h2>
        <p class="lede">${esc(lede)}</p>
        <form class="kids-panel kids-form" id="kids-form" data-type="${esc(type)}">
          <label><span>Teacher name *</span><input name="teacherName" required autocomplete="name" /></label>
          <label><span>Class</span>
            <select name="classCode"><option value="">—</option>${classOptions()}</select>
          </label>
          ${fieldsHtml}
          <button type="submit" class="kids-btn kids-btn-primary">Submit</button>
          <p class="kids-status" data-status hidden></p>
        </form>
      </section>`
    );
  }

  function viewPrinting() {
    return formShell(
      "Printing request",
      "Tell us what to print and when you need it.",
      `
      <label><span>Document title *</span><input name="title" required /></label>
      <label><span>Description</span><textarea name="description"></textarea></label>
      <label><span>Copies</span><input name="copies" type="number" min="1" max="500" value="1" /></label>
      <label><span>Colour</span>
        <select name="color"><option value="bw">Black & white</option><option value="color">Colour</option></select>
      </label>
      <label><span>Needed by</span><input name="neededBy" type="date" /></label>
      <label><span>Notes</span><textarea name="notes" rows="2"></textarea></label>`,
      "printing"
    );
  }

  function viewConcern() {
    return formShell(
      "Teacher concerns & feedback",
      "A professional space to raise issues and share feedback.",
      `
      <label><span>Describe your concern *</span><textarea name="concern" required></textarea></label>
      <label><span>Was this discussed with someone else?</span>
        <select name="discussed"><option value="no">No</option><option value="yes">Yes</option></select>
      </label>
      <label><span>Discussed with (if yes)</span><input name="discussedWith" /></label>
      <label><span>Urgency</span>
        <select name="urgency">
          <option value="normal">Normal</option>
          <option value="low">Low</option>
          <option value="high">High</option>
        </select>
      </label>`,
      "concern"
    );
  }

  function viewFilming() {
    return formShell(
      "Activity filming request",
      "Help us plan and coordinate filming sessions.",
      `
      <label><span>Activity title *</span><input name="activityTitle" required /></label>
      <label><span>Proposed date & time *</span><input name="proposedAt" type="datetime-local" required /></label>
      <label><span>Cognitive objectives *</span><textarea name="cognitiveObjectives" required></textarea></label>
      <label><span>When should materials be ready?</span><input name="materialsReadyBy" type="date" /></label>
      <label><span>Location</span><input name="location" /></label>
      <label><span>Duration</span><input name="duration" placeholder="e.g. 30 minutes" /></label>
      <label><span>Notes</span><textarea name="notes" rows="2"></textarea></label>`,
      "filming"
    );
  }

  function viewFollowup() {
    const areas = (meta.followupAreas || [])
      .map(
        (a) => `<label><input type="checkbox" name="areas" value="${esc(a)}" /> <span>${esc(a)}</span></label>`
      )
      .join("");
    return formShell(
      "Student support & observation",
      "Document learning, behavioural, or social concerns objectively.",
      `
      <label><span>Observation date</span><input name="observationDate" type="date" /></label>
      <label><span>Student name</span><input name="studentName" /></label>
      <div>
        <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.35rem">Area(s) of concern</div>
        <div class="kids-check-grid">${areas}</div>
      </div>
      <label><span>Observation notes</span><textarea name="observation"></textarea></label>
      <label><span>Support given</span><textarea name="supportGiven" rows="2"></textarea></label>
      <label><span>Follow-up needed</span><textarea name="followUpNeeded" rows="2"></textarea></label>`,
      "followup"
    );
  }

  function collectForm(form) {
    const fd = new FormData(form);
    const type = form.getAttribute("data-type");
    const base = {
      teacherName: fd.get("teacherName"),
      classCode: fd.get("classCode"),
      notes: fd.get("notes") || "",
    };
    if (type === "printing") {
      return {
        ...base,
        title: fd.get("title"),
        description: fd.get("description"),
        copies: fd.get("copies"),
        color: fd.get("color"),
        neededBy: fd.get("neededBy"),
      };
    }
    if (type === "concern") {
      return {
        ...base,
        concern: fd.get("concern"),
        discussed: fd.get("discussed") === "yes",
        discussedWith: fd.get("discussedWith"),
        urgency: fd.get("urgency"),
      };
    }
    if (type === "filming") {
      return {
        ...base,
        activityTitle: fd.get("activityTitle"),
        proposedAt: fd.get("proposedAt"),
        cognitiveObjectives: fd.get("cognitiveObjectives"),
        materialsReadyBy: fd.get("materialsReadyBy"),
        location: fd.get("location"),
        duration: fd.get("duration"),
      };
    }
    const areas = [...form.querySelectorAll('[name="areas"]:checked')].map((el) => el.value);
    return {
      ...base,
      observationDate: fd.get("observationDate"),
      studentName: fd.get("studentName"),
      areas,
      observation: fd.get("observation"),
      supportGiven: fd.get("supportGiven"),
      followUpNeeded: fd.get("followUpNeeded"),
    };
  }

  function bindForm() {
    const form = root.querySelector("#kids-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = form.querySelector("[data-status]");
      const type = form.getAttribute("data-type");
      try {
        await api("/preschool/forms", {
          body: { formType: type, payload: collectForm(form) },
        });
        status.hidden = false;
        status.className = "kids-status ok";
        status.textContent = "Submitted — the manager will review it shortly.";
        form.reset();
      } catch (err) {
        status.hidden = false;
        status.className = "kids-status err";
        status.textContent = err.message || "Could not submit";
      }
    });
  }

  async function render() {
    const { parts } = route();
    const a = parts[0] || "";
    const b = parts[1] || "";
    let html = home();
    if (a === "forms" && b === "printing") html = viewPrinting();
    else if (a === "forms" && b === "concern") html = viewConcern();
    else if (a === "forms" && b === "filming") html = viewFilming();
    else if (a === "forms" && b === "followup") html = viewFollowup();
    else if (a === "drama") {
      html = shell(
        "teachers",
        "drama",
        `<section class="kids-section"><h2>Learning through drama</h2>
        <p class="lede">Classroom moments and collaborative films.</p>${renderDrama(content.drama)}</section>`
      );
    } else if (a === "announcements") {
      html = shell(
        "teachers",
        "announcements",
        `<section class="kids-section"><h2>Announcements</h2>${renderAnnouncements(content.announcement)}</section>`
      );
    } else if (a === "curriculum") {
      const blocks = content.curriculum || [];
      html = shell(
        "teachers",
        "curriculum",
        `<section class="kids-section"><h2>Curriculum & planning</h2>
        ${
          blocks.length
            ? blocks
                .map(
                  (c) => `<div class="kids-panel" style="margin-bottom:0.85rem">
              <h3 style="margin:0 0 0.4rem;font-family:var(--kids-display)">${esc(c.title)}</h3>
              <div class="kids-contact">${esc(c.body)}</div></div>`
                )
                .join("")
            : `<p class="lede">Planning notes will appear here.</p>`
        }</section>`
      );
    } else if (a === "contact") {
      html = shell(
        "teachers",
        "contact",
        `<section class="kids-section">${renderContact(content.contact)}</section>`
      );
    }
    root.innerHTML = html;
    bindForm();
  }

  async function boot() {
    try {
      const [m, c] = await Promise.all([
        api("/preschool/meta"),
        api("/preschool/content?audience=teachers"),
      ]);
      meta = m;
      content = c;
    } catch (e) {
      console.warn(e);
    }
    await render();
    window.addEventListener("hashchange", render);
  }

  boot();
})();

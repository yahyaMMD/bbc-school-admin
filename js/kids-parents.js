/**
 * BBC Kids — Parents hub
 */
(() => {
  const { api, route, shell, renderAnnouncements, renderContact } = KidsShared;
  const root = document.getElementById("kids-app");
  let content = { announcement: [], contact: [] };

  function home() {
    return shell(
      "parents",
      "home",
      `
      <section class="kids-hero">
        <p class="eyebrow">Préscolaire · Families</p>
        <h1>BBC Kids</h1>
        <p>News and how to reach the English department — clear, calm, and up to date.</p>
        <div class="kids-cta-row">
          <a class="kids-btn kids-btn-primary" href="#/announcements">Read announcements</a>
          <a class="kids-btn kids-btn-ghost" href="#/contact">Contact & hours</a>
        </div>
      </section>
      <section class="kids-section">
        <h2>For parents</h2>
        <p class="lede">This hub is for day-to-day Préscolaire English news. Enrollment forms stay on the school parent form.</p>
        <div class="kids-grid">
          <a class="kids-card" href="#/announcements"><strong>Announcements</strong><span>School & English notes</span><span class="go">Read →</span></a>
          <a class="kids-card" href="#/contact"><strong>Contact</strong><span>Availability & office</span><span class="go">View →</span></a>
        </div>
      </section>`
    );
  }

  async function render() {
    const { parts } = route();
    const a = parts[0] || "";
    let html = home();
    if (a === "announcements") {
      html = shell(
        "parents",
        "announcements",
        `<section class="kids-section"><h2>Announcements</h2>${renderAnnouncements(content.announcement)}</section>`
      );
    } else if (a === "contact") {
      html = shell(
        "parents",
        "contact",
        `<section class="kids-section">${renderContact(content.contact)}</section>`
      );
    }
    root.innerHTML = html;
  }

  async function boot() {
    try {
      content = await api("/preschool/content?audience=parents");
    } catch (e) {
      console.warn(e);
    }
    await render();
    window.addEventListener("hashchange", render);
  }

  boot();
})();

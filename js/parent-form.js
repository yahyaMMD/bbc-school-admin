(() => {
  const form = document.getElementById("parent-form");
  const errEl = document.getElementById("form-error");
  const btn = document.getElementById("submit-btn");
  const success = document.getElementById("success");

  // Always start on the empty form (Safari bfcache can restore a prior submit).
  if (success) success.hidden = true;
  if (form) form.hidden = false;

  function showError(msg) {
    if (!errEl) return;
    errEl.hidden = !msg;
    errEl.textContent = msg || "";
    if (msg) errEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const fd = new FormData(form);
    const payload = {
      studentLastName: String(fd.get("studentLastName") || "").trim(),
      studentFirstName: String(fd.get("studentFirstName") || "").trim(),
      dateOfBirth: String(fd.get("dateOfBirth") || "").trim(),
      className: "",
      homeAddress: String(fd.get("homeAddress") || "").trim(),
      phonePrimary: String(fd.get("phonePrimary") || "").trim(),
      phoneSecondary: String(fd.get("phoneSecondary") || "").trim(),
      maritalStatus: String(fd.get("maritalStatus") || "").trim(),
      familySituation: String(fd.get("familySituation") || "").trim(),
      healthNotes: String(fd.get("healthNotes") || "").trim(),
      emergencyName: String(fd.get("emergencyName") || "").trim(),
      emergencyPhone: String(fd.get("emergencyPhone") || "").trim(),
      emergencyRelation: String(fd.get("emergencyRelation") || "").trim(),
    };

    if (!payload.studentLastName || !payload.studentFirstName) {
      showError("اسم ولقب التلميذ مطلوبان");
      return;
    }
    if (!payload.dateOfBirth) {
      showError("تاريخ الميلاد مطلوب");
      return;
    }
    if (!payload.homeAddress) {
      showError("العنوان مطلوب");
      return;
    }
    if (payload.phonePrimary.replace(/\D/g, "").length < 8) {
      showError("رقم الهاتف الرئيسي مطلوب");
      return;
    }
    if (payload.phoneSecondary.replace(/\D/g, "").length < 8) {
      showError("رقم الهاتف الثاني مطلوب");
      return;
    }
    if (!payload.emergencyName || !payload.emergencyPhone) {
      showError("جهة اتصال الطوارئ مطلوبة");
      return;
    }

    btn.disabled = true;
    btn.textContent = "جاري الإرسال…";
    try {
      const res = await fetch("/api/parent-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "فشل الإرسال");
      form.hidden = true;
      if (success) success.hidden = false;
      window.scrollTo(0, 0);
    } catch (err) {
      showError(err.message || "حدث خطأ. حاولوا مرة أخرى.");
      btn.disabled = false;
      btn.textContent = "إرسال الاستمارة";
    }
  });
})();

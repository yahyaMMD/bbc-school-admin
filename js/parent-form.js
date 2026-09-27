(() => {
  const form = document.getElementById("parent-form");
  const errEl = document.getElementById("form-error");
  const btn = document.getElementById("submit-btn");
  const success = document.getElementById("success");
  const classSelect = document.getElementById("class-select");

  function showError(msg) {
    if (!errEl) return;
    errEl.hidden = !msg;
    errEl.textContent = msg || "";
    if (msg) errEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function loadClasses() {
    try {
      const res = await fetch("/api/parent-form/meta");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const classes = data.classes || [];
      const primary = classes.filter((c) => c.departmentId === "primary");
      const middle = classes.filter((c) => c.departmentId === "middle");
      const other = classes.filter(
        (c) => c.departmentId !== "primary" && c.departmentId !== "middle"
      );

      const addGroup = (label, list) => {
        if (!list.length) return;
        const og = document.createElement("optgroup");
        og.label = label;
        list.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.code || c.label;
          opt.textContent = c.code || c.label;
          og.appendChild(opt);
        });
        classSelect.appendChild(og);
      };

      addGroup("ابتدائي / Primaire", primary);
      addGroup("متوسط / Moyen", middle);
      addGroup("أخرى", other);

      // Free-text fallback option
      const free = document.createElement("option");
      free.value = "__other__";
      free.textContent = "قسم غير موجود في القائمة — سأكتبه";
      classSelect.appendChild(free);
    } catch (e) {
      console.warn(e);
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "تعذر تحميل الأقسام — اكتبوا القسم يدوياً لاحقاً";
      // Replace select with text input if meta fails
      const input = document.createElement("input");
      input.name = "className";
      input.type = "text";
      input.required = true;
      input.placeholder = "مثال: 1AP أو 2M3";
      classSelect.replaceWith(input);
    }
  }

  // If user picks "other", swap to text field
  classSelect?.addEventListener("change", () => {
    if (classSelect.value !== "__other__") return;
    const input = document.createElement("input");
    input.name = "className";
    input.type = "text";
    input.required = true;
    input.placeholder = "اكتبوا القسم هنا (مثال: 1AP)";
    input.className = classSelect.className;
    classSelect.replaceWith(input);
    input.focus();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const fd = new FormData(form);
    const payload = {
      studentLastName: String(fd.get("studentLastName") || "").trim(),
      studentFirstName: String(fd.get("studentFirstName") || "").trim(),
      className: String(fd.get("className") || "").trim(),
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

    if (payload.className === "__other__") {
      showError("اكتبوا اسم القسم");
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

  loadClasses();
})();

(() => {
  const form = document.getElementById("parent-form");
  const errEl = document.getElementById("form-error");
  const btn = document.getElementById("submit-btn");
  const success = document.getElementById("success");

  if (success) success.hidden = true;
  if (form) form.hidden = false;

  function showError(msg) {
    if (!errEl) return;
    errEl.hidden = !msg;
    errEl.textContent = msg || "";
    if (msg) errEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function setNested(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function collectFormData(el) {
    const data = {};
    const fd = new FormData(el);
    // radios / checked
    el.querySelectorAll("input, textarea, select").forEach((input) => {
      const name = input.name;
      if (!name || !name.includes(".")) return;
      if (input.type === "radio") {
        if (input.checked) setNested(data, name, input.value);
        return;
      }
      if (input.type === "checkbox") {
        if (input.checked) setNested(data, name, input.value || "yes");
        return;
      }
      setNested(data, name, String(input.value || "").trim());
    });
    // ensure unchecked radios that were never checked don't leave gaps — FormData already handled checked ones
    void fd;
    return data;
  }

  function syncConditional() {
    document.querySelectorAll("[data-show-when]").forEach((node) => {
      const rule = node.getAttribute("data-show-when") || "";
      const [name, expected] = rule.split("=");
      const checked = form.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
      const show = checked && checked.value === expected;
      node.hidden = !show;
      node.querySelectorAll("input, textarea, select").forEach((inp) => {
        if (!show && inp.type !== "radio") {
          // keep values but don't require when hidden
        }
      });
    });
  }

  form?.addEventListener("change", (e) => {
    if (e.target && e.target.matches("input[type=radio]")) syncConditional();
  });
  syncConditional();

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const formData = collectFormData(form);
    const student = formData.student || {};
    const father = formData.father || {};
    const mother = formData.mother || {};
    const contact = formData.contact || {};

    if (!student.lastName || !student.firstName) {
      showError("اسم ولقب التلميذ مطلوبان");
      return;
    }
    if (!student.sex) {
      showError("الجنس مطلوب");
      return;
    }
    if (!student.dateOfBirth) {
      showError("تاريخ الميلاد مطلوب");
      return;
    }
    if (!student.placeOfBirth) {
      showError("مكان الميلاد مطلوب");
      return;
    }
    if (!father.name || !father.phone || father.phone.replace(/\D/g, "").length < 8) {
      showError("بيانات الأب ورقم هاتفه مطلوبان");
      return;
    }
    if (!mother.name || !mother.phone || mother.phone.replace(/\D/g, "").length < 8) {
      showError("بيانات الأم ورقم هاتفها مطلوبان");
      return;
    }
    if (!contact.phoneBackup || contact.phoneBackup.replace(/\D/g, "").length < 8) {
      showError("رقم الهاتف الاحتياطي مطلوب");
      return;
    }
    if (!contact.address) {
      showError("العنوان مطلوب");
      return;
    }

    btn.disabled = true;
    btn.textContent = "جاري الإرسال…";
    try {
      const res = await fetch("/api/parent-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData }),
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

(() => {
  const form = document.getElementById("parent-form");
  const errEl = document.getElementById("form-error");
  const btn = document.getElementById("submit-btn");
  const success = document.getElementById("success");
  const idFileInput = document.getElementById("companion-id-file");
  const idFileNameEl = document.getElementById("companion-id-name");

  if (success) success.hidden = true;
  if (form) form.hidden = false;

  const MAX_ID_BYTES = 5 * 1024 * 1024;
  const ALLOWED_ID_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
  ]);

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
    el.querySelectorAll("input, textarea, select").forEach((input) => {
      const name = input.name;
      if (!name || !name.includes(".")) return;
      if (input.type === "file") return;
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
    return data;
  }

  function isAdoptedSelected() {
    const checked = form?.querySelector('input[name="family.adopted"]:checked');
    return Boolean(checked && checked.value === "yes");
  }

  function parentComplete(person) {
    const p = person || {};
    return Boolean(p.name && p.phone && p.phone.replace(/\D/g, "").length >= 8);
  }

  /** When adopted: father/mother HTML required is off (only one parent needed). */
  function syncParentRequired() {
    const adopted = isAdoptedSelected();
    form?.querySelectorAll("[data-parent-required]").forEach((input) => {
      if (adopted) input.removeAttribute("required");
      else input.setAttribute("required", "");
    });
  }

  function syncConditional() {
    document.querySelectorAll("[data-show-when]").forEach((node) => {
      const rule = node.getAttribute("data-show-when") || "";
      const eq = rule.indexOf("=");
      if (eq < 0) return;
      const name = rule.slice(0, eq);
      const expected = rule.slice(eq + 1).split("|");
      const checked = form.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
      const show = Boolean(checked && expected.includes(checked.value));
      node.hidden = !show;
      if (!show && idFileInput && node.contains(idFileInput)) {
        idFileInput.value = "";
        if (idFileNameEl) {
          idFileNameEl.hidden = true;
          idFileNameEl.textContent = "";
        }
      }
    });
    syncParentRequired();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
      reader.readAsDataURL(file);
    });
  }

  idFileInput?.addEventListener("change", () => {
    const file = idFileInput.files && idFileInput.files[0];
    if (!idFileNameEl) return;
    if (!file) {
      idFileNameEl.hidden = true;
      idFileNameEl.textContent = "";
      return;
    }
    idFileNameEl.hidden = false;
    idFileNameEl.textContent = file.name;
  });

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
    if (!student.enrollmentYear) {
      showError("تاريخ الالتحاق بالمدرسة مطلوب");
      return;
    }
    if (!student.level) {
      showError("المستوى مطلوب");
      return;
    }
    if (!student.repeatedYear) {
      showError("يرجى الإجابة: هل أعاد السنة من قبل؟");
      return;
    }
    if (!student.studiedAbroad) {
      showError("يرجى الإجابة: هل أقام أو تمدرس بالخارج من قبل؟");
      return;
    }
    const adopted = (formData.family || {}).adopted === "yes";
    const fatherOk = parentComplete(father);
    const motherOk = parentComplete(mother);
    if (adopted) {
      if (!fatherOk && !motherOk) {
        showError("في حالة التبنّي يُرجى ملء بيانات الأب أو الأم على الأقل (الاسم ورقم الهاتف)");
        return;
      }
    } else {
      if (!fatherOk) {
        showError("بيانات الأب ورقم هاتفه مطلوبان");
        return;
      }
      if (!motherOk) {
        showError("بيانات الأم ورقم هاتفها مطلوبان");
        return;
      }
    }
    if (!contact.phoneBackup || contact.phoneBackup.replace(/\D/g, "").length < 8) {
      showError("رقم الهاتف الاحتياطي مطلوب");
      return;
    }
    if (!contact.address) {
      showError("العنوان مطلوب");
      return;
    }
    const cons = formData.consents || {};
    if (!cons.departureMode) {
      showError("يرجى اختيار طريقة السماح بالمغادرة");
      return;
    }
    if (cons.departureMode === "companion") {
      if (!cons.companionRole || !cons.companionName || !cons.companionPhone) {
        showError("يرجى إكمال بيانات المرافق (الصفة، الاسم، الهاتف)");
        return;
      }
    }
    if (cons.departureMode === "driver") {
      if (!cons.driverName || !cons.driverPhone) {
        showError("يرجى إكمال بيانات السائق (الاسم والهاتف)");
        return;
      }
    }

    const needsId = cons.departureMode === "companion" || cons.departureMode === "driver";
    let companionIdDataUrl = "";
    let companionIdFileName = "";
    if (needsId) {
      const file = idFileInput?.files && idFileInput.files[0];
      if (!file) {
        showError("يرجى إرفاق صورة بطاقة الهوية للحالة 3 أو 4");
        return;
      }
      const type = String(file.type || "").toLowerCase();
      const ext = String(file.name || "").split(".").pop()?.toLowerCase() || "";
      const okType =
        ALLOWED_ID_TYPES.has(type) ||
        (!type && ["jpg", "jpeg", "png", "webp", "gif", "pdf"].includes(ext));
      if (!okType) {
        showError("نوع الملف غير مدعوم. استخدموا JPG أو PNG أو PDF");
        return;
      }
      if (file.size > MAX_ID_BYTES) {
        showError("حجم الملف كبير جداً (الحد 5 ميغابايت)");
        return;
      }
      try {
        companionIdDataUrl = await readFileAsDataUrl(file);
        companionIdFileName = file.name || "";
        if (
          companionIdDataUrl.startsWith("data:;base64,") ||
          companionIdDataUrl.startsWith("data:application/octet-stream;base64,")
        ) {
          const mime =
            ext === "pdf"
              ? "application/pdf"
              : ext === "png"
                ? "image/png"
                : ext === "webp"
                  ? "image/webp"
                  : ext === "gif"
                    ? "image/gif"
                    : "image/jpeg";
          companionIdDataUrl = companionIdDataUrl.replace(/^data:[^;]*;base64,/, `data:${mime};base64,`);
        }
      } catch (err) {
        showError(err.message || "تعذر قراءة الملف");
        return;
      }
    }

    if (!cons.outings) {
      showError("يرجى اختيار الموافقة أو عدم الموافقة على الخرجات");
      return;
    }
    if (!cons.sports) {
      showError("يرجى اختيار الموافقة أو عدم الموافقة على الرياضة");
      return;
    }
    if (!cons.photoMedia) {
      showError("يرجى اختيار الموافقة أو عدم الموافقة على التصوير");
      return;
    }

    btn.disabled = true;
    btn.textContent = "جاري الإرسال…";
    try {
      const payload = { formData };
      if (needsId) {
        payload.companionIdDataUrl = companionIdDataUrl;
        payload.companionIdFileName = companionIdFileName;
      }
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

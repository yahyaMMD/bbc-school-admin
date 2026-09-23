/**
 * UI languages: English, French, Arabic.
 * Student names: Arabic script for `ar`, Latin for `en` / `fr`.
 */
const I18n = (() => {
  const KEY = "qea_lang";
  const SUPPORTED = ["en", "fr", "ar"];

  const STR = {
    en: {
      brand: "Quality education Algerie (Q.E.A)",
      brandShort: "Q.E.A",
      portal: "Administration Portal",
      academicYear: "Academic year",
      signOut: "Sign out",
      manage: "Manage",
      staff: "Staff",
      director: "Director",
      searchPlaceholder: "Search student or go to directories…",
      search: "Search",
      password: "Password",
      passwordPlaceholder: "Enter password",
      access: "Access interface",
      loginHint: "Enter your password to open the school portal.",
      loginError: "Incorrect password",
      loading: "Loading live data…",
      welcomeAddress: "Bouchaoui 03, Cheraga, Algiers",
      home: "Home",
      dashboard: "Dashboard",
      dashboardLede: "Official rosters — academic year {year}.",
      yearGroups: "Year groups",
      classes: "Classes",
      students: "Students",
      teachers: "Teachers",
      teachersListed: "Teachers listed",
      ourTeachers: "Our teachers",
      ourTeachersDesc: "{n} teachers — filter by name, ID, department, subject, or class.",
      browseTeachers: "Browse teachers →",
      ourStudents: "Our students",
      ourStudentsDesc: "{n} students — filter by name, ID, department, year, class, or gender.",
      browseStudents: "Browse students →",
      departments: "Departments",
      openDepartment: "Open department",
      primary: "Primary",
      middle: "Middle School",
      breadcrumb: "Breadcrumb",
      firstName: "First name",
      lastName: "Last name",
      fullName: "Full name",
      firstNameAr: "First name (Arabic)",
      lastNameAr: "Last name (Arabic)",
      firstNameLatin: "First name (Latin)",
      lastNameLatin: "Last name (Latin)",
      gender: "Gender",
      female: "Female",
      male: "Male",
      dob: "Date of birth",
      class: "Class",
      phone: "Phone",
      notes: "Notes",
      actions: "Actions",
      edit: "Edit",
      save: "Save changes",
      delete: "Delete",
      transfer: "Transfer",
      back: "Back",
      notOnFile: "Not on file",
      language: "Language",
      adminConsole: "Staff console",
      overview: "Overview",
      classesRosters: "Classes & rosters",
      allStudents: "All students",
      missingInfo: "Missing info",
      directorView: "Browse view →",
      dataManagement: "Data management",
      dataManagementLede: "Live database — every save updates the browse view immediately.",
      missingFields: "Missing fields",
      directories: "Directories",
      photo: "Profile photo",
      photoHint: "Upload a photo — stored on the school server (JPG, PNG, WEBP, GIF · max 4 MB).",
      photoUpload: "Upload photo",
      photoChange: "Change photo",
      photoRemove: "Remove photo",
      photoUploading: "Uploading…",
      photoSaved: "Photo saved",
    },
    fr: {
      brand: "Quality education Algerie (Q.E.A)",
      brandShort: "Q.E.A",
      portal: "Portail d’administration",
      academicYear: "Année scolaire",
      signOut: "Déconnexion",
      manage: "Gérer",
      staff: "Personnel",
      director: "Direction",
      searchPlaceholder: "Rechercher un élève ou ouvrir les annuaires…",
      search: "Rechercher",
      password: "Mot de passe",
      passwordPlaceholder: "Saisir le mot de passe",
      access: "Accéder",
      loginHint: "Saisissez votre mot de passe pour ouvrir le portail.",
      loginError: "Mot de passe incorrect",
      loading: "Chargement des données…",
      welcomeAddress: "Bouchaoui 03, Chéraga, Alger",
      home: "Accueil",
      dashboard: "Tableau de bord",
      dashboardLede: "Listes officielles — année scolaire {year}.",
      yearGroups: "Niveaux",
      classes: "Classes",
      students: "Élèves",
      teachers: "Enseignants",
      teachersListed: "Enseignants",
      ourTeachers: "Nos enseignants",
      ourTeachersDesc: "{n} enseignants — filtrer par nom, ID, département, matière ou classe.",
      browseTeachers: "Voir les enseignants →",
      ourStudents: "Nos élèves",
      ourStudentsDesc: "{n} élèves — filtrer par nom, ID, département, année, classe ou genre.",
      browseStudents: "Voir les élèves →",
      departments: "Départements",
      openDepartment: "Ouvrir le département",
      primary: "Primaire",
      middle: "Moyen",
      breadcrumb: "Fil d’Ariane",
      firstName: "Prénom",
      lastName: "Nom",
      fullName: "Nom complet",
      firstNameAr: "Prénom (arabe)",
      lastNameAr: "Nom (arabe)",
      firstNameLatin: "Prénom (latin)",
      lastNameLatin: "Nom (latin)",
      gender: "Genre",
      female: "Fille",
      male: "Garçon",
      dob: "Date de naissance",
      class: "Classe",
      phone: "Téléphone",
      notes: "Notes",
      actions: "Actions",
      edit: "Modifier",
      save: "Enregistrer",
      delete: "Supprimer",
      transfer: "Transférer",
      back: "Retour",
      notOnFile: "Non renseigné",
      language: "Langue",
      adminConsole: "Console personnel",
      overview: "Vue d’ensemble",
      classesRosters: "Classes & listes",
      allStudents: "Tous les élèves",
      missingInfo: "Infos manquantes",
      directorView: "Vue consultation →",
      dataManagement: "Gestion des données",
      dataManagementLede: "Base en direct — chaque enregistrement met à jour la vue consultation.",
      missingFields: "Champs manquants",
      directories: "Annuaires",
      photo: "Photo de profil",
      photoHint: "Téléversez une photo — stockée sur le serveur (JPG, PNG, WEBP, GIF · max 4 Mo).",
      photoUpload: "Téléverser",
      photoChange: "Changer la photo",
      photoRemove: "Supprimer la photo",
      photoUploading: "Envoi…",
      photoSaved: "Photo enregistrée",
    },
    ar: {
      brand: "جودة التعليم الجزائر (Q.E.A)",
      brandShort: "Q.E.A",
      portal: "بوابة الإدارة",
      academicYear: "السنة الدراسية",
      signOut: "خروج",
      manage: "إدارة",
      staff: "موظف",
      director: "المديرة",
      searchPlaceholder: "ابحث عن تلميذ أو افتح الدليل…",
      search: "بحث",
      password: "كلمة المرور",
      passwordPlaceholder: "أدخل كلمة المرور",
      access: "الدخول",
      loginHint: "أدخل كلمة المرور لفتح بوابة المدرسة.",
      loginError: "كلمة المرور غير صحيحة",
      loading: "جاري تحميل البيانات…",
      welcomeAddress: "بوشاوي 03، الشراقة، الجزائر",
      home: "الرئيسية",
      dashboard: "لوحة التحكم",
      dashboardLede: "القوائم الرسمية — السنة الدراسية {year}.",
      yearGroups: "المستويات",
      classes: "الأقسام",
      students: "التلاميذ",
      teachers: "الأساتذة",
      teachersListed: "الأساتذة",
      ourTeachers: "أساتذتنا",
      ourTeachersDesc: "{n} أستاذ — صفِّ حسب الاسم أو المعرّف أو القسم أو المادة.",
      browseTeachers: "عرض الأساتذة ←",
      ourStudents: "تلاميذنا",
      ourStudentsDesc: "{n} تلميذ — صفِّ حسب الاسم أو المعرّف أو المستوى أو الجنس.",
      browseStudents: "عرض التلاميذ ←",
      departments: "الأطوار",
      openDepartment: "فتح الطور",
      primary: "الابتدائي",
      middle: "المتوسط",
      breadcrumb: "مسار التنقل",
      firstName: "الاسم",
      lastName: "اللقب",
      fullName: "الاسم الكامل",
      firstNameAr: "الاسم (عربي)",
      lastNameAr: "اللقب (عربي)",
      firstNameLatin: "الاسم (لاتيني)",
      lastNameLatin: "اللقب (لاتيني)",
      gender: "الجنس",
      female: "أنثى",
      male: "ذكر",
      dob: "تاريخ الميلاد",
      class: "القسم",
      phone: "الهاتف",
      notes: "ملاحظات",
      actions: "إجراءات",
      edit: "تعديل",
      save: "حفظ",
      delete: "حذف",
      transfer: "نقل",
      back: "رجوع",
      notOnFile: "غير مسجّل",
      language: "اللغة",
      adminConsole: "لوحة الموظفين",
      overview: "نظرة عامة",
      classesRosters: "الأقسام والقوائم",
      allStudents: "كل التلاميذ",
      missingInfo: "معلومات ناقصة",
      directorView: "عرض الاستشارة ←",
      dataManagement: "إدارة البيانات",
      dataManagementLede: "قاعدة مباشرة — كل حفظ يحدّث عرض الاستشارة فورًا.",
      missingFields: "حقول ناقصة",
      directories: "الأدلة",
      photo: "صورة الملف",
      photoHint: "ارفع صورة — تُحفظ على خادم المدرسة (JPG, PNG, WEBP, GIF · حد أقصى 4 ميجا).",
      photoUpload: "رفع صورة",
      photoChange: "تغيير الصورة",
      photoRemove: "إزالة الصورة",
      photoUploading: "جاري الرفع…",
      photoSaved: "تم حفظ الصورة",
    },
  };

  function getLang() {
    const stored = localStorage.getItem(KEY);
    if (SUPPORTED.includes(stored)) return stored;
    return "en";
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    localStorage.setItem(KEY, lang);
    applyDocument();
  }

  function t(key, vars = {}) {
    const table = STR[getLang()] || STR.en;
    let s = table[key] ?? STR.en[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  }

  function isRtl() {
    return getLang() === "ar";
  }

  /** Prefer Arabic names in AR; Latin in EN/FR. */
  function useArabicNames() {
    return getLang() === "ar";
  }

  function applyDocument() {
    const lang = getLang();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }

  function langSwitcher(extraClass = "") {
    const cur = getLang();
    const opts = [
      { id: "ar", label: "العربية" },
      { id: "fr", label: "Français" },
      { id: "en", label: "English" },
    ];
    return `
      <div class="lang-switch ${esc(extraClass)}" role="group" aria-label="${esc(t("language"))}">
        ${opts
          .map(
            (o) =>
              `<button type="button" class="lang-btn${cur === o.id ? " active" : ""}" data-lang="${o.id}">${esc(o.label)}</button>`
          )
          .join("")}
      </div>
    `;
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bind(root, onChange) {
    root.querySelectorAll("[data-lang]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setLang(btn.getAttribute("data-lang"));
        if (typeof onChange === "function") onChange(getLang());
      });
    });
  }

  applyDocument();

  return {
    SUPPORTED,
    getLang,
    setLang,
    t,
    isRtl,
    useArabicNames,
    applyDocument,
    langSwitcher,
    bind,
  };
})();

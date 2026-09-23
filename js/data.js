/**
 * BBC School — data accessors over live SCHOOL_DATA
 */

const BBC_DATA = (() => {
  let D = typeof SCHOOL_DATA !== "undefined" ? SCHOOL_DATA : null;

  function setData(data) {
    D = data;
    if (typeof window !== "undefined") window.SCHOOL_DATA = data;
  }

  function getD() {
    if (!D) throw new Error("School data not loaded");
    return D;
  }

  function departments() {
    const d = getD();
    return [d.primary, d.middle];
  }

  function getDepartment(id) {
    return departments().find((d) => d.id === id) || null;
  }

  function getLevel(deptId, levelId) {
    const dept = getDepartment(deptId);
    if (!dept) return null;
    return dept.levels.find((l) => String(l.id) === String(levelId)) || null;
  }

  function getClass(deptId, levelId, classId) {
    const level = getLevel(deptId, levelId);
    if (!level) return null;
    return level.classes.find((c) => c.id === classId) || null;
  }

  function findClassById(classId) {
    for (const dept of departments()) {
      for (const level of dept.levels) {
        const cls = level.classes.find((c) => c.id === classId);
        if (cls) return { dept, level, cls };
      }
    }
    return null;
  }

  function getTeacher(id) {
    return getD().teachers.find((t) => t.id === id) || null;
  }

  function getStudent(id) {
    for (const dept of departments()) {
      for (const level of dept.levels) {
        for (const cls of level.classes) {
          const s = cls.students.find((x) => x.id === id);
          if (s) return { student: s, dept, level, cls };
        }
      }
    }
    return null;
  }

  function searchStudents(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return [];
    const results = [];
    for (const dept of departments()) {
      for (const level of dept.levels) {
        for (const cls of level.classes) {
          for (const s of cls.students) {
            const hay = `${s.searchName || ""} ${s.fullName || ""} ${s.fullNameLatin || ""} ${s.firstName || ""} ${s.firstNameLatin || ""} ${s.lastName || ""} ${s.lastNameLatin || ""}`.toLowerCase();
            if (hay.includes(q)) results.push({ student: s, dept, level, cls });
          }
        }
      }
    }
    return results;
  }

  function useArabicNames() {
    return typeof I18n !== "undefined" ? I18n.useArabicNames() : true;
  }

  function studentFullName(s) {
    if (!s) return "—";
    if (useArabicNames()) {
      return s.fullName || `${s.lastName || ""} ${s.firstName || ""}`.trim() || s.fullNameLatin || "—";
    }
    return (
      s.fullNameLatin ||
      `${s.firstNameLatin || ""} ${s.lastNameLatin || ""}`.trim() ||
      s.fullName ||
      `${s.lastName || ""} ${s.firstName || ""}`.trim() ||
      "—"
    );
  }

  function studentFirstName(s) {
    if (!s) return "—";
    if (useArabicNames()) return s.firstName || s.firstNameLatin || "—";
    return s.firstNameLatin || s.firstName || "—";
  }

  function studentLastName(s) {
    if (!s) return "—";
    if (useArabicNames()) return s.lastName || s.lastNameLatin || "—";
    return s.lastNameLatin || s.lastName || "—";
  }

  function teacherDisplayName(t) {
    if (!t) return "—";
    const ar = [t.firstName, t.lastName].filter(Boolean).join(" ").trim();
    const latin =
      (t.nameLatin || "").trim() ||
      [t.firstNameLatin, t.lastNameLatin].filter(Boolean).join(" ").trim() ||
      ar;
    if (useArabicNames()) {
      const hasAr = /[\u0600-\u06FF]/.test(ar);
      return (hasAr ? ar : "") || latin || "—";
    }
    return latin || ar || "—";
  }

  function brandName() {
    try {
      const s = getD().school;
      return s?.name || (typeof I18n !== "undefined" ? I18n.t("brand") : "Quality education Algerie (Q.E.A)");
    } catch {
      return typeof I18n !== "undefined" ? I18n.t("brand") : "Quality education Algerie (Q.E.A)";
    }
  }

  function stats() {
    const m = getD().meta || {};
    return {
      floors: getD().primary.levels.length + getD().middle.levels.length,
      levels: getD().primary.levels.length + getD().middle.levels.length,
      classes: (m.primaryClasses || 0) + (m.middleClasses || 0),
      students: m.totalStudents || 0,
      teachers: m.teachers || (getD().teachers || []).length,
      primaryStudents: m.primaryStudents || 0,
      middleStudents: m.middleStudents || 0,
    };
  }

  function classCode(cls) {
    return (cls && (cls.code || cls.name)) || "";
  }

  function getClassLabel(classId) {
    const found = findClassById(classId);
    if (!found) return null;
    const code = classCode(found.cls);
    return {
      class: found.cls,
      floorName: found.level.name,
      departmentId: found.dept.id,
      departmentName: found.dept.name,
      code,
      path: `${found.dept.label} · ${found.level.name} · ${code}`,
    };
  }

  function listAllStudents() {
    const results = [];
    for (const dept of departments()) {
      for (const level of dept.levels) {
        for (const cls of level.classes) {
          for (const s of cls.students || []) {
            results.push({ student: s, dept, level, cls });
          }
        }
      }
    }
    return results;
  }

  function listAllTeachers() {
    return (getD().teachers || []).map((t) => ({
      teacher: t,
      classes: (t.classIds || []).map(findClassById).filter(Boolean),
    }));
  }

  function listClassOptions() {
    const opts = [];
    for (const dept of departments()) {
      for (const level of dept.levels) {
        for (const cls of level.classes) {
          opts.push({
            id: cls.id,
            code: cls.code || cls.name,
            label: `${dept.label} · ${cls.code || cls.name}`,
            departmentId: dept.id,
            levelId: level.id,
          });
        }
      }
    }
    return opts;
  }

  function listModules() {
    const set = new Set();
    for (const t of getD().teachers || []) {
      for (const m of t.modules || []) set.add(m);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function listIssues() {
    return [...(getD().operationsIssues || [])];
  }

  function getIssue(id) {
    return (getD().operationsIssues || []).find((x) => x.id === id) || null;
  }

  return {
    get school() {
      return getD().school;
    },
    get departments() {
      return departments();
    },
    get teachers() {
      return getD().teachers;
    },
    get primary() {
      return getD().primary;
    },
    get middle() {
      return getD().middle;
    },
    setData,
    getDepartment,
    getLevel,
    getClass,
    findClassById,
    getTeacher,
    getStudent,
    searchStudents,
    studentFullName,
    studentFirstName,
    studentLastName,
    teacherDisplayName,
    brandName,
    classCode,
    getClassLabel,
    listAllStudents,
    listAllTeachers,
    listClassOptions,
    listModules,
    listIssues,
    getIssue,
    stats,
  };
})();

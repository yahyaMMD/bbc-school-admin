/**
 * BBC School — data accessors over SCHOOL_DATA (official 2026/2027 rosters)
 */

const BBC_DATA = (() => {
  const D = SCHOOL_DATA;

  const departments = [D.primary, D.middle];

  function getDepartment(id) {
    return departments.find((d) => d.id === id) || null;
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
    for (const dept of departments) {
      for (const level of dept.levels) {
        const cls = level.classes.find((c) => c.id === classId);
        if (cls) {
          return { dept, level, cls };
        }
      }
    }
    return null;
  }

  function getTeacher(id) {
    return D.teachers.find((t) => t.id === id) || null;
  }

  function getStudent(id) {
    for (const dept of departments) {
      for (const level of dept.levels) {
        for (const cls of level.classes) {
          const s = cls.students.find((x) => x.id === id);
          if (s) {
            return { student: s, dept, level, cls };
          }
        }
      }
    }
    return null;
  }

  function searchStudents(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return [];
    const results = [];
    for (const dept of departments) {
      for (const level of dept.levels) {
        for (const cls of level.classes) {
          for (const s of cls.students) {
            const hay = `${s.fullName || ""} ${s.firstName || ""} ${s.lastName || ""}`.toLowerCase();
            if (hay.includes(q)) {
              results.push({ student: s, dept, level, cls });
            }
          }
        }
      }
    }
    return results;
  }

  function stats() {
    return {
      floors: D.primary.levels.length + D.middle.levels.length,
      levels: D.primary.levels.length + D.middle.levels.length,
      classes: D.meta.primaryClasses + D.meta.middleClasses,
      students: D.meta.totalStudents,
      teachers: D.meta.teachers,
      primaryStudents: D.meta.primaryStudents,
      middleStudents: D.meta.middleStudents,
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
    for (const dept of departments) {
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
    return (D.teachers || []).map((t) => ({
      teacher: t,
      classes: (t.classIds || []).map(findClassById).filter(Boolean),
    }));
  }

  function listClassOptions() {
    const opts = [];
    for (const dept of departments) {
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
    for (const t of D.teachers || []) {
      for (const m of t.modules || []) set.add(m);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  return {
    school: D.school,
    departments,
    teachers: D.teachers,
    primary: D.primary,
    middle: D.middle,
    getDepartment,
    getLevel,
    getClass,
    findClassById,
    getTeacher,
    getStudent,
    searchStudents,
    classCode,
    getClassLabel,
    listAllStudents,
    listAllTeachers,
    listClassOptions,
    listModules,
    stats,
  };
})();

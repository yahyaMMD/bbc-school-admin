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

  function getClassLabel(classId) {
    const found = findClassById(classId);
    if (!found) return null;
    return {
      class: found.cls,
      floorName: found.level.name,
      departmentId: found.dept.id,
      departmentName: found.dept.name,
      path: `${found.dept.label} · ${found.level.name} · ${found.cls.name}`,
    };
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
    getClassLabel,
    stats,
  };
})();

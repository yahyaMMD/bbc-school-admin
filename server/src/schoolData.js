import { query } from "./db.js";

function mapTeacher(r) {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    nameLatin: r.name_latin || "",
    phone: r.phone,
    wilaya: r.wilaya,
    commune: r.commune,
    modules: r.modules || [],
    departments: r.departments || [],
    classIds: r.class_ids || [],
  };
}

function mapStudent(r) {
  const s = {
    id: r.id,
    number: r.number,
    firstName: r.first_name,
    lastName: r.last_name,
    fullName: r.full_name,
    dateOfBirth: r.date_of_birth,
    gender: r.gender,
    notes: r.notes,
    classId: r.class_id,
    departmentId: r.department_id,
    searchName: r.search_name || r.full_name,
  };
  if (r.previous_year_details) s.previousYearDetails = r.previous_year_details;
  return s;
}

function mapClass(r, students) {
  const stats = r.stats || {};
  const total = students.length;
  return {
    id: r.id,
    name: r.name,
    nameAr: r.name_ar,
    code: r.code,
    year: r.year,
    floor: r.floor || undefined,
    floorRaw: r.floor_raw || undefined,
    floorNumber: r.floor_number,
    classOnFloor: r.class_on_floor,
    section: r.section,
    sourceImage: r.source_image || undefined,
    sourceExcel: r.source_excel || undefined,
    studentCount: total,
    stats: {
      total: stats.total ?? total,
      males: stats.males ?? null,
      females: stats.females ?? null,
    },
    teacherIds: r.teacher_ids || [],
    modules: r.modules || [],
    students,
  };
}

function mapIssue(r) {
  return {
    id: r.id,
    status: r.status,
    severity: r.severity,
    title: r.title,
    titleAr: r.title_ar,
    area: r.area,
    updated: r.updated,
    summary: r.summary,
    currentProcess: r.current_process || [],
    impact: r.impact || [],
    goal: r.goal,
    notes: r.notes,
  };
}

export async function buildSchoolData() {
  const metaRes = await query("SELECT data FROM school_meta WHERE id = 1");
  if (!metaRes.rows.length) {
    throw new Error("school_meta missing — run seed");
  }
  const base = metaRes.rows[0].data;

  const teachersRes = await query("SELECT * FROM teachers ORDER BY last_name, first_name");
  const classesRes = await query(
    "SELECT * FROM classes ORDER BY department_id, year, code"
  );
  const studentsRes = await query(
    "SELECT * FROM students ORDER BY class_id, number, full_name"
  );
  const issuesRes = await query("SELECT * FROM operations_issues ORDER BY id");

  const studentsByClass = new Map();
  for (const s of studentsRes.rows) {
    if (!studentsByClass.has(s.class_id)) studentsByClass.set(s.class_id, []);
    studentsByClass.get(s.class_id).push(mapStudent(s));
  }

  const classesByDeptLevel = new Map();
  for (const c of classesRes.rows) {
    const key = `${c.department_id}:${c.level_id}`;
    if (!classesByDeptLevel.has(key)) classesByDeptLevel.set(key, []);
    classesByDeptLevel
      .get(key)
      .push(mapClass(c, studentsByClass.get(c.id) || []));
  }

  function attachDept(deptMeta) {
    return {
      ...deptMeta,
      levels: (deptMeta.levels || []).map((lvl) => ({
        ...lvl,
        classes: classesByDeptLevel.get(`${deptMeta.id}:${lvl.id}`) || [],
      })),
    };
  }

  const primaryStudents = studentsRes.rows.filter((s) => s.department_id === "primary").length;
  const middleStudents = studentsRes.rows.filter((s) => s.department_id === "middle").length;
  const primaryClasses = classesRes.rows.filter((c) => c.department_id === "primary").length;
  const middleClasses = classesRes.rows.filter((c) => c.department_id === "middle").length;

  return {
    school: base.school,
    primaryModules: base.primaryModules,
    middleModules: base.middleModules,
    teachers: teachersRes.rows.map(mapTeacher),
    primary: attachDept(base.primary),
    middle: attachDept(base.middle),
    meta: {
      ...(base.meta || {}),
      primaryClasses,
      middleClasses,
      primaryStudents,
      middleStudents,
      teachers: teachersRes.rows.length,
      totalStudents: primaryStudents + middleStudents,
      live: true,
    },
    operationsIssues: issuesRes.rows.map(mapIssue),
  };
}

export { mapTeacher, mapStudent, mapClass, mapIssue };

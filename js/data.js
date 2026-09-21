/**
 * BBC School — Local institutional data
 * Structure: Department → Floors → Classes
 */

const BBC_DATA = (() => {
  const firstNames = [
    "Amine", "Yasmine", "Karim", "Sara", "Mohamed", "Fatima", "Rania", "Nabil",
    "Amina", "Sofiane", "Imane", "Walid", "Nour", "Bilal", "Lina", "Youcef",
    "Meriem", "Hichem", "Salma", "Reda", "Kahina", "Tarek", "Dina", "Samir",
    "Asma", "Farid", "Nada", "Omar", "Chahrazed", "Ismail", "Rym", "Adel",
    "Houda", "Anis", "Sihem", "Mehdi", "Lynda", "Hakim", "Soraya", "Riad"
  ];

  const lastNames = [
    "Benali", "Bouzidi", "Khelifi", "Mansouri", "Cherif", "Haddad", "Saadi",
    "Bensalem", "Amrani", "Touati", "Belkacem", "Djebbar", "Mebarki", "Ziani",
    "Boudiaf", "Hamidi", "Larbi", "Guerroudj", "Benaissa", "Mokhtar",
    "Abdallah", "Rahmani", "Slimani", "Brahimi", "Chaib", "Ferhat", "Medjber",
    "Ouadah", "Taleb", "Yahiaoui", "Kaci", "Nazim", "Seddiki", "Ait Ahmed"
  ];

  const locations = [
    { wilaya: "Algiers", commune: "Cheraga" },
    { wilaya: "Algiers", commune: "Hydra" },
    { wilaya: "Algiers", commune: "Bab Ezzouar" },
    { wilaya: "Algiers", commune: "Birkhadem" },
    { wilaya: "Algiers", commune: "Draria" },
    { wilaya: "Algiers", commune: "El Biar" },
    { wilaya: "Algiers", commune: "Kouba" },
    { wilaya: "Algiers", commune: "Dély Ibrahim" },
    { wilaya: "Blida", commune: "Blida" },
    { wilaya: "Blida", commune: "Boufarik" },
    { wilaya: "Tipaza", commune: "Tipaza" },
    { wilaya: "Tipaza", commune: "Cherchell" },
    { wilaya: "Boumerdès", commune: "Boumerdès" },
    { wilaya: "Boumerdès", commune: "Thenia" },
    { wilaya: "Algiers", commune: "Bordj El Kiffan" }
  ];

  const modulesPool = [
    "Arabic",
    "French",
    "Mathematics",
    "Natural Sciences",
    "History & Geography",
    "Islamic Education",
    "Art Education",
    "English",
    "Physical Education",
    "Computer Science"
  ];

  const primaryFloorMeta = [
    { id: 1, name: "Floor 1", subtitle: "Preparatory cycle", accent: "#F26522", classCount: 10 },
    { id: 2, name: "Floor 2", subtitle: "1st & 2nd year", accent: "#E85A1A", classCount: 10 },
    { id: 3, name: "Floor 3", subtitle: "3rd year", accent: "#D94F14", classCount: 10 },
    { id: 4, name: "Floor 4", subtitle: "4th year", accent: "#C94412", classCount: 10 },
    { id: 5, name: "Floor 5", subtitle: "5th year", accent: "#B83A10", classCount: 10 }
  ];

  const middleFloorMeta = [
    { id: 1, name: "Floor 1", subtitle: "1st year middle", accent: "#F26522", classCount: 6 },
    { id: 2, name: "Floor 2", subtitle: "2nd year middle", accent: "#E85A1A", classCount: 5 },
    { id: 3, name: "Floor 3", subtitle: "3rd & 4th year middle", accent: "#D94F14", classCount: 5 }
  ];

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function phone(rng) {
    const prefixes = ["0555", "0556", "0557", "0661", "0662", "0770", "0771", "0540", "0541"];
    const p = pick(rng, prefixes);
    const n = String(Math.floor(rng() * 1e6)).padStart(6, "0");
    return `${p}${n}`;
  }

  function formatPhone(raw) {
    return raw.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4");
  }

  function buildTeachers() {
    const rng = seeded(20260921);
    const teachers = [];
    for (let i = 0; i < 64; i++) {
      const loc = pick(rng, locations);
      const moduleCount = 1 + Math.floor(rng() * 2);
      const mods = [];
      while (mods.length < moduleCount) {
        const m = pick(rng, modulesPool);
        if (!mods.includes(m)) mods.push(m);
      }
      teachers.push({
        id: `T${String(i + 1).padStart(3, "0")}`,
        firstName: pick(rng, firstNames),
        lastName: pick(rng, lastNames),
        phone: formatPhone(phone(rng)),
        wilaya: loc.wilaya,
        commune: loc.commune,
        modules: mods,
        classIds: []
      });
    }
    return teachers;
  }

  const teachers = buildTeachers();

  function buildDepartment({ id, name, label, description, image, prefix, floorMeta, seed }) {
    const rng = seeded(seed);
    const floors = floorMeta.map((floor) => {
      const classes = [];
      for (let c = 1; c <= floor.classCount; c++) {
        const classId = `${prefix}-E${floor.id}-C${String(c).padStart(2, "0")}`;
        const studentCount = 18 + Math.floor(rng() * 10);
        const teacherCount = 2 + Math.floor(rng() * 2);
        const assigned = [];
        while (assigned.length < teacherCount) {
          const t = pick(rng, teachers);
          if (!assigned.includes(t.id)) {
            assigned.push(t.id);
            if (!t.classIds.includes(classId)) t.classIds.push(classId);
          }
        }
        classes.push({
          id: classId,
          name: `Class ${c}`,
          code: `${floor.id}${String(c).padStart(2, "0")}`,
          studentCount,
          teacherIds: assigned
        });
      }
      return {
        id: floor.id,
        name: floor.name,
        subtitle: floor.subtitle,
        accent: floor.accent,
        classes
      };
    });

    return { id, name, label, description, image, floors };
  }

  const primary = buildDepartment({
    id: "primary",
    name: "Primary Department",
    label: "Primary Department",
    description: "Primary education — 5 floors, 10 classes per floor",
    image: "assets/primary-department.png",
    prefix: "P",
    floorMeta: primaryFloorMeta,
    seed: 9112026
  });

  const middle = buildDepartment({
    id: "middle",
    name: "Middle School Department",
    label: "Middle School Department",
    description: "Middle school — 3 floors · 6 + 5 + 5 classes",
    image: "assets/middle-department.png",
    prefix: "M",
    floorMeta: middleFloorMeta,
    seed: 3182026
  });

  const school = {
    name: "BBC School",
    tagline: "Administration — Cheraga, Algiers",
    address: "Bouchaoui 03, Cheraga, Algiers",
    phone: "0540 27 98 01",
    website: "https://www.bbcschool-dz.com",
    academicYear: "2026 — 2027"
  };

  const departments = [primary, middle];

  function getDepartment(id) {
    return departments.find((d) => d.id === id) || null;
  }

  function getTeacher(id) {
    return teachers.find((t) => t.id === id) || null;
  }

  function getClassLabel(classId) {
    for (const dept of departments) {
      for (const floor of dept.floors) {
        const cls = floor.classes.find((x) => x.id === classId);
        if (cls) {
          return {
            class: cls,
            floorName: floor.name,
            departmentId: dept.id,
            departmentName: dept.name,
            path: `${dept.label} · ${floor.name} · ${cls.name}`
          };
        }
      }
    }
    return null;
  }

  function stats() {
    let floors = 0;
    let classes = 0;
    let students = 0;
    departments.forEach((dept) => {
      floors += dept.floors.length;
      dept.floors.forEach((f) => {
        classes += f.classes.length;
        f.classes.forEach((c) => {
          students += c.studentCount;
        });
      });
    });
    return {
      floors,
      classes,
      students,
      teachers: teachers.length
    };
  }

  return {
    school,
    departments,
    teachers,
    primary,
    middle,
    getDepartment,
    getTeacher,
    getClassLabel,
    stats
  };
})();

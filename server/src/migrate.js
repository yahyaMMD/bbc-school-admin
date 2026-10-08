import bcrypt from "bcryptjs";
import { query } from "./db.js";

export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS app_users (
      role TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS school_meta (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      name_latin TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      wilaya TEXT NOT NULL DEFAULT '',
      commune TEXT NOT NULL DEFAULT '',
      modules JSONB NOT NULL DEFAULT '[]'::jsonb,
      departments JSONB NOT NULL DEFAULT '[]'::jsonb,
      class_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      photo TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      department_id TEXT NOT NULL,
      level_id INT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      name_ar TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL,
      year INT NOT NULL,
      floor TEXT NOT NULL DEFAULT '',
      floor_raw TEXT NOT NULL DEFAULT '',
      floor_number INT,
      class_on_floor INT,
      section INT,
      source_image TEXT NOT NULL DEFAULT '',
      source_excel TEXT NOT NULL DEFAULT '',
      modules JSONB NOT NULL DEFAULT '[]'::jsonb,
      teacher_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      stats JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE (department_id, code)
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      department_id TEXT NOT NULL,
      number INT NOT NULL DEFAULT 0,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL DEFAULT '',
      first_name_latin TEXT NOT NULL DEFAULT '',
      last_name_latin TEXT NOT NULL DEFAULT '',
      full_name_latin TEXT NOT NULL DEFAULT '',
      date_of_birth TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      search_name TEXT NOT NULL DEFAULT '',
      photo TEXT NOT NULL DEFAULT '',
      previous_year_details JSONB
    );

    CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
    CREATE INDEX IF NOT EXISTS idx_students_name ON students(search_name);
    CREATE INDEX IF NOT EXISTS idx_classes_dept ON classes(department_id);

    CREATE TABLE IF NOT EXISTS operations_issues (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'open',
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      title_ar TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT '',
      updated TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      current_process JSONB NOT NULL DEFAULT '[]'::jsonb,
      impact JSONB NOT NULL DEFAULT '[]'::jsonb,
      goal TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );
  `);

  // Additive columns for existing databases
  await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name_latin TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS last_name_latin TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS full_name_latin TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS photo TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS photo TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS first_name_latin TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS last_name_latin TEXT NOT NULL DEFAULT ''`);

  await query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL DEFAULT '',
      group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      group_names JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'draft',
      send_results JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scheduled_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
  `);
  await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`);
  await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`);
  await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS wa_phone TEXT NOT NULL DEFAULT ''`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_announcements_scheduled
     ON announcements (scheduled_at)
     WHERE status = 'scheduled' AND scheduled_at IS NOT NULL`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_announcements_wa_phone_created
     ON announcements (wa_phone, created_at DESC)`
  );

  await query(`
    CREATE TABLE IF NOT EXISTS teacher_accounts (
      teacher_id TEXT PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS parent_form_submissions (
      id TEXT PRIMARY KEY,
      -- Indexed summary columns (match current public form)
      student_last_name TEXT NOT NULL DEFAULT '',
      student_first_name TEXT NOT NULL DEFAULT '',
      date_of_birth TEXT NOT NULL DEFAULT '',
      home_address TEXT NOT NULL DEFAULT '',
      phone_primary TEXT NOT NULL DEFAULT '',
      phone_secondary TEXT NOT NULL DEFAULT '',
      phone_backup TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      photo_media TEXT NOT NULL DEFAULT '',
      -- Full ordered payload: student → father → mother → contact → family → medical → consents
      form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      form_version INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      -- Legacy columns kept for older rows (no longer written by v3 form)
      class_name TEXT NOT NULL DEFAULT '',
      marital_status TEXT NOT NULL DEFAULT '',
      family_situation TEXT NOT NULL DEFAULT '',
      health_notes TEXT NOT NULL DEFAULT '',
      emergency_name TEXT NOT NULL DEFAULT '',
      emergency_phone TEXT NOT NULL DEFAULT '',
      emergency_relation TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_parent_form_created ON parent_form_submissions (created_at DESC);
  `);

  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS date_of_birth TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS form_data JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS form_version INTEGER NOT NULL DEFAULT 1`);
  // form_version 7+: consents.departureMode may be withParent | motherOnly | fatherOnly | alone | companion | driver
  // (stored in form_data JSONB — no extra column required)
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS phone_backup TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS photo_media TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS enrollment_year TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS student_level TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS repeated_year TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS studied_abroad TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS companion_id_url TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE parent_form_submissions ADD COLUMN IF NOT EXISTS student_id TEXT`);
  await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_form_id TEXT`);
  await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_profile JSONB`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_parent_form_student_id ON parent_form_submissions (student_id)
     WHERE student_id IS NOT NULL AND student_id <> ''`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_students_parent_form_id ON students (parent_form_id)
     WHERE parent_form_id IS NOT NULL AND parent_form_id <> ''`
  );

  // Teacher portal login codes (TR001, TR002, …) — separate from internal teacher id
  await query(`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS login_code TEXT`);
  await assignTeacherLoginCodes();
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_login_code
     ON teachers (login_code)
     WHERE login_code IS NOT NULL AND login_code <> ''`
  );

  // WhatsApp bulk / personalized DM campaigns
  await query(`
    CREATE TABLE IF NOT EXISTS wa_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      template TEXT NOT NULL DEFAULT '',
      columns JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'draft',
      interval_min_ms INTEGER NOT NULL DEFAULT 8000,
      interval_max_ms INTEGER NOT NULL DEFAULT 12000,
      scheduled_at TIMESTAMPTZ,
      next_send_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_by TEXT NOT NULL DEFAULT 'whatsapp',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_wa_campaigns_status_next
      ON wa_campaigns (status, next_send_at);
  `);
  await query(
    `ALTER TABLE wa_campaigns ADD COLUMN IF NOT EXISTS max_consecutive_fails INTEGER NOT NULL DEFAULT 0`
  );
  await query(`
    CREATE TABLE IF NOT EXISTS wa_campaign_recipients (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES wa_campaigns(id) ON DELETE CASCADE,
      phone TEXT NOT NULL DEFAULT '',
      chat_id TEXT NOT NULL DEFAULT '',
      variables JSONB NOT NULL DEFAULT '{}'::jsonb,
      rendered_text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT NOT NULL DEFAULT '',
      row_index INTEGER NOT NULL DEFAULT 0,
      sent_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_wa_recipients_campaign_status
      ON wa_campaign_recipients (campaign_id, status, row_index);
  `);

  // Teacher daily class register: one session per class + teacher + date + subject
  await query(`
    CREATE TABLE IF NOT EXISTS class_sessions (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      session_date DATE NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      homework TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (class_id, teacher_id, session_date, subject)
    );
    CREATE INDEX IF NOT EXISTS idx_class_sessions_teacher_date
      ON class_sessions (teacher_id, session_date DESC);
    CREATE INDEX IF NOT EXISTS idx_class_sessions_class_date
      ON class_sessions (class_id, session_date DESC);

    CREATE TABLE IF NOT EXISTS class_session_entries (
      session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'present'
        CHECK (status IN ('present', 'absent', 'late')),
      remark TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (session_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_class_session_entries_student
      ON class_session_entries (student_id);
  `);

  // Primary floor managers (one account per floor / étage)
  await query(`
    CREATE TABLE IF NOT EXISTS floor_managers (
      id TEXT PRIMARY KEY,
      login_code TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      department_id TEXT NOT NULL DEFAULT 'primary',
      floor_number INT NOT NULL,
      floor_label TEXT NOT NULL DEFAULT '',
      floor_label_ar TEXT NOT NULL DEFAULT '',
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (department_id, floor_number)
    );
    CREATE INDEX IF NOT EXISTS idx_floor_managers_dept_floor
      ON floor_managers (department_id, floor_number);

    CREATE TABLE IF NOT EXISTS floor_action_logs (
      id TEXT PRIMARY KEY,
      floor_manager_id TEXT NOT NULL REFERENCES floor_managers(id) ON DELETE CASCADE,
      class_id TEXT,
      student_id TEXT,
      session_id TEXT,
      action_type TEXT NOT NULL DEFAULT 'custom',
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      message TEXT NOT NULL DEFAULT '',
      recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
      result JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_floor_actions_manager_created
      ON floor_action_logs (floor_manager_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS floor_daily_reports (
      id TEXT PRIMARY KEY,
      floor_manager_id TEXT NOT NULL REFERENCES floor_managers(id) ON DELETE CASCADE,
      report_date DATE NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent')),
      submitted_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (floor_manager_id, report_date)
    );
    ALTER TABLE floor_daily_reports
      ADD COLUMN IF NOT EXISTS form_data JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE INDEX IF NOT EXISTS idx_floor_daily_reports_date
      ON floor_daily_reports (report_date DESC);
    CREATE INDEX IF NOT EXISTS idx_floor_daily_reports_manager_date
      ON floor_daily_reports (floor_manager_id, report_date DESC);
  `);

  // Weekly timetables (primary 2026–2027 from school DOCX files)
  await query(`
    CREATE TABLE IF NOT EXISTS timetable_slots (
      id TEXT PRIMARY KEY,
      school_year TEXT NOT NULL DEFAULT '2026-2027',
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
      teacher_name TEXT NOT NULL DEFAULT '',
      module TEXT NOT NULL DEFAULT '',
      day_of_week TEXT NOT NULL
        CHECK (day_of_week IN ('sun','mon','tue','wed','thu')),
      shift TEXT NOT NULL DEFAULT 'morning'
        CHECK (shift IN ('morning','evening')),
      role TEXT NOT NULL DEFAULT 'general'
        CHECK (role IN ('general','arabic','french','english_principal','english_activity')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tt_slots_teacher
      ON timetable_slots (teacher_id, day_of_week);
    CREATE INDEX IF NOT EXISTS idx_tt_slots_class
      ON timetable_slots (class_id, day_of_week);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tt_slots_uniq
      ON timetable_slots (school_year, class_id, day_of_week, shift, module, role);

    CREATE TABLE IF NOT EXISTS class_module_teachers (
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
      teacher_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'principal'
        CHECK (role IN ('principal','activity','homeroom')),
      school_year TEXT NOT NULL DEFAULT '2026-2027',
      PRIMARY KEY (class_id, module, role, school_year)
    );
  `);

  await query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS default_shift TEXT NOT NULL DEFAULT ''`);

  // Préscolaire / BBC Kids portal
  await query(`
    CREATE TABLE IF NOT EXISTS preschool_form_submissions (
      id TEXT PRIMARY KEY,
      form_type TEXT NOT NULL
        CHECK (form_type IN ('printing', 'concern', 'filming', 'followup')),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'seen', 'in_progress', 'done', 'rejected')),
      teacher_name TEXT NOT NULL DEFAULT '',
      class_code TEXT NOT NULL DEFAULT '',
      manager_note TEXT NOT NULL DEFAULT '',
      unread BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      seen_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_preschool_forms_type_created
      ON preschool_form_submissions (form_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_preschool_forms_status
      ON preschool_form_submissions (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_preschool_forms_unread
      ON preschool_form_submissions (unread) WHERE unread = TRUE;

    CREATE TABLE IF NOT EXISTS preschool_content (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL
        CHECK (kind IN ('announcement', 'drama', 'curriculum', 'contact')),
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      youtube_url TEXT NOT NULL DEFAULT '',
      youtube_id TEXT NOT NULL DEFAULT '',
      audience TEXT NOT NULL DEFAULT 'both'
        CHECK (audience IN ('teachers', 'parents', 'both')),
      published BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_preschool_content_kind
      ON preschool_content (kind, published, sort_order);
  `);

  await ensureYearManagers();
  await ensureStaffUsers();
  await ensurePreschoolDepartmentMeta();
  await ensurePreschoolContentSeed();
}

/** Staff passwords: director (limited), global (full), admin, whatsapp, preschool */
async function ensureStaffUsers() {
  const users = [
    { role: "director", pass: process.env.DIRECTOR_PASSWORD || "Director2026" },
    { role: "global", pass: process.env.GLOBAL_VIEW_PASSWORD || "GlobalView2026" },
    { role: "admin", pass: process.env.ADMIN_PASSWORD || "AdminBBC2026" },
    { role: "whatsapp", pass: process.env.WHATSAPP_PASSWORD || "WhatsApp2026" },
    { role: "preschool", pass: process.env.PRESCHOOL_PASSWORD || "Preschool2026" },
  ];
  for (const u of users) {
    const existing = await query("SELECT role FROM app_users WHERE role = $1", [u.role]);
    if (existing.rows.length) continue;
    const hash = await bcrypt.hash(u.pass, 10);
    await query(
      `INSERT INTO app_users (role, password_hash) VALUES ($1, $2)
       ON CONFLICT (role) DO NOTHING`,
      [u.role, hash]
    );
  }
}

const PRESCHOOL_DEPT = {
  id: "preschool",
  name: "Preschool Department",
  label: "Préscolaire",
  description: "Grande Section — Arabic & English",
  image: "assets/preschool-department.png",
  levels: [
    {
      id: 0,
      name: "Grande Section",
      nameAr: "التحضيري",
      subtitle: "GS A–F",
    },
  ],
};

const PRESCHOOL_CLASSES = [
  { id: "CL-GSA", code: "GSA", name: "GS A", nameAr: "التحضيري أ", section: 1 },
  { id: "CL-GSB", code: "GSB", name: "GS B", nameAr: "التحضيري ب", section: 2 },
  { id: "CL-GSC", code: "GSC", name: "GS C", nameAr: "التحضيري ج", section: 3 },
  { id: "CL-GSD", code: "GSD", name: "GS D", nameAr: "التحضيري د", section: 4 },
  { id: "CL-GSE", code: "GSE", name: "GS E", nameAr: "التحضيري هـ", section: 5 },
  { id: "CL-GSF", code: "GSF", name: "GS F", nameAr: "التحضيري و", section: 6 },
];

/** Ensure school_meta has preschool dept + empty GS classes exist */
async function ensurePreschoolDepartmentMeta() {
  const metaRes = await query("SELECT data FROM school_meta WHERE id = 1");
  if (!metaRes.rows.length) return;
  const data = metaRes.rows[0].data || {};
  if (!data.preschool || data.preschool.id !== "preschool") {
    data.preschool = PRESCHOOL_DEPT;
    if (!data.preschoolModules) data.preschoolModules = ["Arabic", "English"];
    await query(`UPDATE school_meta SET data = $1::jsonb WHERE id = 1`, [JSON.stringify(data)]);
  } else if (!data.preschool.image) {
    data.preschool.image = PRESCHOOL_DEPT.image;
    await query(`UPDATE school_meta SET data = $1::jsonb WHERE id = 1`, [JSON.stringify(data)]);
  }
  for (const c of PRESCHOOL_CLASSES) {
    await query(
      `INSERT INTO classes
         (id, department_id, level_id, name, name_ar, code, year, floor, floor_number, class_on_floor, section, stats)
       VALUES ($1, 'preschool', 0, $2, $3, $4, 0, 'GS', 0, $5, $5, '{}'::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         name_ar = EXCLUDED.name_ar,
         code = EXCLUDED.code,
         department_id = 'preschool',
         level_id = 0,
         year = 0`,
      [c.id, c.name, c.nameAr, c.code, c.section]
    );
  }
}

async function ensurePreschoolContentSeed() {
  const count = await query(`SELECT COUNT(*)::int AS n FROM preschool_content`);
  if ((count.rows[0]?.n || 0) > 0) return;

  const drama = [
    "Red Colour Day _2024/2025_Ms. Khadidja Hannache",
    "Winter Is Here_2024/2025_Ms. Khadidja Hannache",
    "My Healthy Body_2024/2025_Ms. Khadidja Hannache",
    "International Volunteer Day_2024/2025_Collab.English Teachers",
    "The Magical Forest_2024/2025_Ms. Khadidja Hannache",
    "Creative Learning Activities_2024/2025_Ms. Khadidja Hannache",
    "Orange Day_2024/2025_Ms.Khadidja Hannache",
    "The Lion and the Mouse_2024/2025_Ms.Khadidja Hannache",
    "Radio Day, Kids on Air_2024/2025_Ms.Khadidja Hannache",
    "Healthy Habits_2024/2025_Ms. Khadidja",
    "Pizza Time_2024/2025_Ms.Khadidja Hannache",
    "All About Me_2023/2024_Ms. Khadidja",
    "Food Competition_2023/2024_Ms. Khadidja",
    "Shapes_2023/2024_Ms. Khadidja",
    "Clothes_2023/2024_Ms.Khadidja",
    "Face Review_2023/2024_Ms. Khadidja",
    "Fun Learning Activities_2024/2025_Ms.Khadidja Hannache",
  ];

  let i = 0;
  for (const title of drama) {
    i += 1;
    await query(
      `INSERT INTO preschool_content
         (id, kind, title, body, youtube_url, youtube_id, audience, published, sort_order)
       VALUES ($1, 'drama', $2, '', '', '', 'teachers', TRUE, $3)`,
      [`PSK-DRAMA-${String(i).padStart(2, "0")}`, title, i]
    );
  }

  await query(
    `INSERT INTO preschool_content
       (id, kind, title, body, audience, published, sort_order)
     VALUES
       ('PSK-CONTACT', 'contact', 'Contact & Availability',
        $1, 'both', TRUE, 0),
       ('PSK-ANN-WELCOME', 'announcement', 'Welcome to BBC Kids Préscolaire',
        $2, 'both', TRUE, 1),
       ('PSK-CURR-1', 'curriculum', 'Curriculum & Planning',
        $3, 'teachers', TRUE, 1)`,
    [
      "English Department — Préscolaire\nBouchaoui 03, Cheraga, Algiers\nPhone: 0540 27 98 01\n\nOffice hours: Sunday–Thursday, mornings.\nFor filming or printing requests, use the Teachers hub forms.",
      "Welcome to our shared space for collaboration, creativity, and growth.\nThis hub replaces the previous Google Site — forms, announcements, and drama resources live here.",
      "Use this space to share weekly plans, themes, and coordination notes for Grande Section English.\nUpload links or paste planning notes below as you go.",
    ]
  );
}

/** One manager per year — owns every class in that year (teacher registers → manager board). */
const YEAR_MANAGERS = [
  // Primary years 1–5 (keep FLOOR00x login codes for existing accounts)
  { n: 0, code: "FLOOR001", dept: "primary", label: "Primary Year 1", labelAr: "السنة الأولى ابتدائي" },
  { n: 1, code: "FLOOR002", dept: "primary", label: "Primary Year 2", labelAr: "السنة الثانية ابتدائي" },
  { n: 2, code: "FLOOR003", dept: "primary", label: "Primary Year 3", labelAr: "السنة الثالثة ابتدائي" },
  { n: 3, code: "FLOOR004", dept: "primary", label: "Primary Year 4", labelAr: "السنة الرابعة ابتدائي" },
  { n: 4, code: "FLOOR005", dept: "primary", label: "Primary Year 5", labelAr: "السنة الخامسة ابتدائي" },
  // Middle years 1–4
  { n: 0, code: "MID001", dept: "middle", label: "Middle Year 1", labelAr: "السنة الأولى متوسط" },
  { n: 1, code: "MID002", dept: "middle", label: "Middle Year 2", labelAr: "السنة الثانية متوسط" },
  { n: 2, code: "MID003", dept: "middle", label: "Middle Year 3", labelAr: "السنة الثالثة متوسط" },
  { n: 3, code: "MID004", dept: "middle", label: "Middle Year 4", labelAr: "السنة الرابعة متوسط" },
];

async function ensureYearManagers() {
  const defaultPass = process.env.FLOOR_PASSWORD || "Floor2026";
  for (const f of YEAR_MANAGERS) {
    const existing = await query("SELECT id FROM floor_managers WHERE id = $1", [f.code]);
    if (existing.rows.length) {
      await query(
        `UPDATE floor_managers
         SET floor_label = $2, floor_label_ar = $3, department_id = $4, floor_number = $5,
             must_change_password = FALSE, updated_at = NOW()
         WHERE id = $1`,
        [f.code, f.label, f.labelAr, f.dept, f.n]
      );
      continue;
    }
    const hash = await bcrypt.hash(defaultPass, 10);
    await query(
      `INSERT INTO floor_managers
         (id, login_code, password_hash, department_id, floor_number, floor_label, floor_label_ar, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)`,
      [f.code, f.code, hash, f.dept, f.n, f.label, f.labelAr]
    );
  }
  // Never force year managers to reset password on login
  await query(`UPDATE floor_managers SET must_change_password = FALSE WHERE must_change_password = TRUE`);
}

/** Assign TR001… to teachers missing a login_code (stable order). */
async function assignTeacherLoginCodes() {
  const existing = await query(
    `SELECT login_code FROM teachers
     WHERE login_code ~ '^TR[0-9]+$'
     ORDER BY login_code DESC
     LIMIT 1`
  );
  let next = 1;
  if (existing.rows.length) {
    const n = Number(String(existing.rows[0].login_code).replace(/^TR/i, ""));
    if (Number.isFinite(n) && n >= next) next = n + 1;
  }
  const missing = await query(
    `SELECT id FROM teachers
     WHERE login_code IS NULL OR BTRIM(login_code) = ''
     ORDER BY
       NULLIF(BTRIM(last_name_latin), '') NULLS LAST,
       NULLIF(BTRIM(first_name_latin), '') NULLS LAST,
       NULLIF(BTRIM(last_name), '') NULLS LAST,
       NULLIF(BTRIM(first_name), '') NULLS LAST,
       id`
  );
  for (const row of missing.rows) {
    const code = `TR${String(next).padStart(3, "0")}`;
    await query(`UPDATE teachers SET login_code = $2 WHERE id = $1`, [row.id, code]);
    next += 1;
  }
}

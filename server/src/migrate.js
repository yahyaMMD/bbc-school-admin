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
  await query(
    `CREATE INDEX IF NOT EXISTS idx_announcements_scheduled
     ON announcements (scheduled_at)
     WHERE status = 'scheduled' AND scheduled_at IS NOT NULL`
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
  `);

  await ensurePrimaryFloorManagers();
}

const PRIMARY_FLOORS = [
  { n: 0, code: "FLOOR001", label: "Ground Floor", labelAr: "الطابق الأرضي" },
  { n: 1, code: "FLOOR002", label: "Floor 1", labelAr: "الطابق الأول" },
  { n: 2, code: "FLOOR003", label: "Floor 2", labelAr: "الطابق الثاني" },
  { n: 3, code: "FLOOR004", label: "Floor 3", labelAr: "الطابق الثالث" },
  { n: 4, code: "FLOOR005", label: "Floor 4", labelAr: "الطابق الرابع" },
];

async function ensurePrimaryFloorManagers() {
  const defaultPass = process.env.FLOOR_PASSWORD || "Floor2026";
  for (const f of PRIMARY_FLOORS) {
    const existing = await query("SELECT id FROM floor_managers WHERE id = $1", [f.code]);
    if (existing.rows.length) {
      await query(
        `UPDATE floor_managers
         SET floor_label = $2, floor_label_ar = $3, department_id = 'primary', floor_number = $4, updated_at = NOW()
         WHERE id = $1`,
        [f.code, f.label, f.labelAr, f.n]
      );
      continue;
    }
    const hash = await bcrypt.hash(defaultPass, 10);
    await query(
      `INSERT INTO floor_managers
         (id, login_code, password_hash, department_id, floor_number, floor_label, floor_label_ar, must_change_password)
       VALUES ($1, $2, $3, 'primary', $4, $5, $6, TRUE)`,
      [f.code, f.code, hash, f.n, f.label, f.labelAr]
    );
  }
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

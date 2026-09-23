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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
  `);
}

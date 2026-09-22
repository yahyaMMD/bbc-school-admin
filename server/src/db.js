import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://bbc:bbc@localhost:5432/bbc_school",
});

export async function query(text, params) {
  return pool.query(text, params);
}

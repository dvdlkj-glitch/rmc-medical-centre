// Database access. Production uses Supabase Postgres through DATABASE_URL.
// For local development only, set LOCAL_DB_DIR to run an embedded Postgres
// (PGlite) on disk — never a silent fallback, so a misconfigured server on
// Railway fails loudly instead of storing bookings somewhere temporary.
//
// Queries cast dates/times to text in SQL so both drivers return the same
// shapes ('2026-10-26', '08:30').

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

let driver = null;

function supabaseConnectionString(raw) {
  // Supabase uses its own CA; node-postgres turns "sslmode=require" into full
  // certificate verification, so strip it and configure TLS explicitly below.
  const url = new URL(raw);
  url.searchParams.delete('sslmode');
  return url.toString();
}

export async function connect() {
  if (driver) return driver;

  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const ssl = process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false };
    const pool = new pg.Pool({
      connectionString: supabaseConnectionString(process.env.DATABASE_URL),
      ssl,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idleTimeoutMillis: 30_000,
    });
    pool.on('error', (err) => console.error('[db] idle client error:', err.message));
    driver = {
      kind: 'postgres',
      query: (text, params = []) => pool.query(text, params),
      exec: (text) => pool.query(text),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const result = await fn({
            query: (text, params = []) => client.query(text, params),
            exec: (text) => client.query(text),
          });
          await client.query('commit');
          return result;
        } catch (err) {
          await client.query('rollback').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else if (process.env.LOCAL_DB_DIR) {
    let PGlite;
    try {
      ({ PGlite } = await import('@electric-sql/pglite'));
    } catch {
      throw new Error('LOCAL_DB_DIR is set but @electric-sql/pglite is not installed (run `npm install`).');
    }
    const db = await PGlite.create(path.resolve(process.env.LOCAL_DB_DIR));
    driver = {
      kind: 'pglite',
      query: (text, params = []) => db.query(text, params),
      exec: (text) => db.exec(text),
      transaction: (fn) => db.transaction((tx) => fn({
        query: (text, params = []) => tx.query(text, params),
        exec: (text) => tx.exec(text),
      })),
      close: () => db.close(),
    };
  } else {
    throw new Error(
      'No database configured. Set DATABASE_URL to your Supabase connection string ' +
      '(or LOCAL_DB_DIR=./.localdb for local development).'
    );
  }
  return driver;
}

export async function query(text, params) {
  const d = await connect();
  return d.query(text, params);
}

export async function one(text, params) {
  const { rows } = await query(text, params);
  return rows[0] ?? null;
}

export async function many(text, params) {
  const { rows } = await query(text, params);
  return rows;
}

export async function migrate({ log = console.log } = {}) {
  const d = await connect();
  await d.exec(`create table if not exists rmc_schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  ); alter table rmc_schema_migrations enable row level security;`);

  const done = new Set((await d.query('select name from rmc_schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await d.transaction(async (tx) => {
        await tx.exec(sql);
        await tx.query('insert into rmc_schema_migrations (name) values ($1)', [file]);
      });
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
    log(`[db] applied migration ${file}`);
  }
}

export async function transaction(fn) {
  const d = await connect();
  return d.transaction(fn);
}

export function isUniqueViolation(err) {
  return err && (err.code === '23505' || /duplicate key value/i.test(err.message || ''));
}

// Utilitaires partagés par les scripts (migrations, base locale, démo, tests)
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOCAL_PORT = Number(process.env.LOCAL_PG_PORT || 54329);
export const LOCAL_URL = `postgresql://postgres@127.0.0.1:${LOCAL_PORT}/caractere`;

export function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

export function databaseUrl() {
  loadEnv();
  return process.env.DATABASE_URL || LOCAL_URL;
}

export async function connect(url = databaseUrl()) {
  const ssl = /supabase\.(co|com)|pooler/.test(url) ? { rejectUnauthorized: false } : undefined;
  const client = new pg.Client({ connectionString: url, ssl });
  await client.connect();
  return client;
}

// Stubs Supabase (rôles + schéma auth) pour une base Postgres locale.
// Sur Supabase, ces objets existent déjà et ce bloc ne fait rien.
export const SUPABASE_STUBS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$f$;
`;

export async function migrate(client, { log = console.log } = {}) {
  await client.query("create schema if not exists erp; create table if not exists erp.schema_migrations(name text primary key, applied_at timestamptz not null default now())");
  const dir = path.join(ROOT, "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await client.query("select name from erp.schema_migrations")).rows.map((r) => r.name));
  let n = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(path.join(dir, f), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into erp.schema_migrations(name) values ($1)", [f]);
      await client.query("commit");
      log(`  ✓ ${f}`);
      n++;
    } catch (e) {
      await client.query("rollback");
      throw new Error(`Migration ${f} : ${e.message}`);
    }
  }
  if (!n) log("  Base à jour, aucune migration à appliquer.");
  return n;
}

// Applique les migrations manquantes (registre erp.schema_migrations). Non destructif.
// Usage : DATABASE_URL=postgresql://... npm run db:migrate   [--check]
import { connect, migrate, databaseUrl, SUPABASE_STUBS } from "./lib.mjs";
const url = databaseUrl();
const client = await connect(url);
try {
  const isSupabase = (await client.query("select to_regnamespace('auth') is not null and to_regclass('auth.users') is not null as ok")).rows[0].ok;
  if (!isSupabase) await client.query(SUPABASE_STUBS);
  console.log(`Migrations sur ${url.replace(/:[^:@/]+@/, ":***@")}`);
  await migrate(client);
} finally {
  await client.end();
}

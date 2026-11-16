// Applique les migrations manquantes (registre erp.schema_migrations). Non destructif et rejouable.
// Usage : DATABASE_URL=postgresql://... npm run db:migrate
//   --if-configured : ne fait rien si aucune base n'est configurée (utilisé au build Vercel)
import { connect, migrate, databaseUrl, configuredUrl, SUPABASE_STUBS } from "./lib.mjs";

if (process.argv.includes("--if-configured") && !configuredUrl()) {
  console.log("Aucune base configurée (DATABASE_URL / POSTGRES_URL) : migrations ignorées.");
  process.exit(0);
}
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

// Base PostgreSQL locale pour la démo et les tests (aucun compte Supabase requis).
// Usage : node scripts/db-local.mjs start | stop | reset | status
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { ROOT, LOCAL_PORT, LOCAL_URL, connect, migrate, SUPABASE_STUBS } from "./lib.mjs";

const DATA = path.join(ROOT, ".data", "pg");
const SOCK = path.join(ROOT, ".data");
function pgBin(name) {
  if (process.env.PG_BIN) return path.join(process.env.PG_BIN, name);
  const base = "/usr/lib/postgresql";
  if (existsSync(base)) {
    const v = readdirSync(base).sort().reverse()[0];
    if (v && existsSync(path.join(base, v, "bin", name))) return path.join(base, v, "bin", name);
  }
  return name; // dans le PATH (Homebrew, Postgres.app…)
}
const asRoot = process.getuid && process.getuid() === 0;
function run(name, args, opts = {}) {
  const bin = pgBin(name);
  const [cmd, a] = asRoot ? ["runuser", ["-u", "postgres", "--", bin, ...args]] : [bin, args];
  return spawnSync(cmd, a, { encoding: "utf8", ...opts });
}
function running() {
  return run("pg_ctl", ["-D", DATA, "status"]).status === 0;
}
async function start() {
  mkdirSync(path.join(ROOT, ".data"), { recursive: true });
  if (asRoot) spawnSync("chown", ["postgres:postgres", path.join(ROOT, ".data")]);
  if (!existsSync(path.join(DATA, "PG_VERSION"))) {
    const r = run("initdb", ["-D", DATA, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C.UTF-8"]);
    if (r.status !== 0) throw new Error("initdb : " + (r.stderr || r.error));
  }
  if (!running()) {
    const r = run("pg_ctl", ["-D", DATA, "-l", path.join(SOCK, "pg.log"), "-w", "-o", `-p ${LOCAL_PORT} -k ${SOCK} -c timezone=Africa/Algiers`, "start"]);
    if (r.status !== 0) throw new Error("pg_ctl start : " + r.stderr + r.stdout);
  }
  const admin = await connect(`postgresql://postgres@127.0.0.1:${LOCAL_PORT}/postgres`);
  const exists = (await admin.query("select 1 from pg_database where datname = 'caractere'")).rowCount;
  if (!exists) await admin.query("create database caractere");
  await admin.end();
  console.log(`PostgreSQL local prêt : ${LOCAL_URL}`);
  const envFile = path.join(ROOT, ".env.local");
  if (!existsSync(envFile)) {
    writeFileSync(envFile, `# Généré par npm run db:local — démo locale\nDATABASE_URL=${LOCAL_URL}\nAUTH_MODE=demo\nSESSION_SECRET=${randomBytes(24).toString("hex")}\n`);
    console.log("  .env.local créé (mode démo).");
  }
}
async function reset({ seed = true } = {}) {
  await start();
  const admin = await connect(`postgresql://postgres@127.0.0.1:${LOCAL_PORT}/postgres`);
  await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = 'caractere' and pid <> pg_backend_pid()");
  await admin.query("drop database if exists caractere");
  await admin.query("create database caractere");
  await admin.end();
  const c = await connect(LOCAL_URL);
  await c.query(SUPABASE_STUBS);
  await migrate(c);
  await c.end();
  if (seed) execFileSync(process.execPath, [path.join(ROOT, "scripts", "seed-demo.mjs")], { stdio: "inherit", env: { ...process.env, DATABASE_URL: LOCAL_URL } });
}
const cmd = process.argv[2] || "start";
if (cmd === "start") {
  await start();
  const c = await connect(LOCAL_URL);
  await c.query(SUPABASE_STUBS);
  await migrate(c);
  await c.end();
} else if (cmd === "reset") await reset({ seed: !process.argv.includes("--no-seed") });
else if (cmd === "stop") { run("pg_ctl", ["-D", DATA, "-m", "fast", "stop"]); console.log("PostgreSQL local arrêté."); }
else if (cmd === "status") console.log(running() ? "En marche" : "Arrêté");
else { console.error("Commande inconnue"); process.exit(1); }

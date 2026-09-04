#!/usr/bin/env node
/**
 * Applique les migrations SQL de supabase/migrations sur la base pointée par
 * DATABASE_URL, et retient celles déjà passées.
 *
 * Le dépôt numérote ses migrations 0001, 0002… tandis que l'historique tenu
 * par Supabase utilise des horodatages et ne couvre qu'une partie d'entre
 * elles : les deux ont divergé, et « supabase db push » rejouerait des
 * migrations déjà appliquées. Ce script tient donc son propre registre, dans
 * public.schema_migrations_repo, et ne s'occupe que des fichiers du dépôt.
 *
 *   node scripts/db-migrate.mjs --baseline   marque tout comme appliqué, sans
 *                                            rien exécuter (à lancer une fois,
 *                                            sur une base déjà construite)
 *   node scripts/db-migrate.mjs --check      liste ce qui manque, sort en
 *                                            échec s'il en reste (pour la CI)
 *   node scripts/db-migrate.mjs              applique les migrations absentes
 *
 * Chaque migration s'exécute dans sa propre transaction : en cas d'erreur,
 * elle est annulée entièrement et les suivantes ne sont pas tentées.
 */

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const DOSSIER = path.join(process.cwd(), "supabase", "migrations");

const REGISTRE = `
  create table if not exists public.schema_migrations_repo (
    version     text primary key,
    checksum    text not null,
    applied_at  timestamptz not null default now()
  )
`;

async function fichiersMigration() {
  const noms = (await readdir(DOSSIER)).filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(
    noms.map(async (nom) => {
      const sql = await readFile(path.join(DOSSIER, nom), "utf8");
      return {
        version: nom.replace(/\.sql$/, ""),
        sql,
        checksum: createHash("sha256").update(sql).digest("hex").slice(0, 16),
      };
    })
  );
}

async function main() {
  const mode = process.argv.includes("--baseline")
    ? "baseline"
    : process.argv.includes("--check")
      ? "check"
      : "apply";

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DATABASE_URL absent. Le renseigner depuis Supabase : Settings > Database > Connection string (URI)."
    );
    process.exit(1);
  }

  const migrations = await fichiersMigration();
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query(REGISTRE);
    const { rows } = await client.query("select version, checksum from public.schema_migrations_repo");
    const connues = new Map(rows.map((r) => [r.version, r.checksum]));

    // Un fichier modifié après coup ne sera pas rejoué : on le signale plutôt
    // que de laisser croire que la base reflète son contenu actuel.
    const modifiees = migrations.filter((m) => connues.has(m.version) && connues.get(m.version) !== m.checksum);
    for (const m of modifiees) {
      console.warn(`⚠ ${m.version} a changé depuis son application — la base garde l'ancienne version.`);
    }

    const manquantes = migrations.filter((m) => !connues.has(m.version));

    if (mode === "baseline") {
      for (const m of manquantes) {
        await client.query(
          "insert into public.schema_migrations_repo (version, checksum) values ($1, $2) on conflict (version) do nothing",
          [m.version, m.checksum]
        );
      }
      console.log(`Référence posée : ${manquantes.length} migration(s) marquée(s) comme appliquée(s), aucune exécutée.`);
      return;
    }

    if (manquantes.length === 0) {
      console.log(`Base à jour — ${migrations.length} migration(s) déjà appliquée(s).`);
      return;
    }

    if (mode === "check") {
      console.error(`${manquantes.length} migration(s) non appliquée(s) :`);
      for (const m of manquantes) console.error(`  - ${m.version}`);
      process.exit(1);
    }

    for (const m of manquantes) {
      process.stdout.write(`→ ${m.version} … `);
      try {
        await client.query("begin");
        await client.query(m.sql);
        await client.query(
          "insert into public.schema_migrations_repo (version, checksum) values ($1, $2)",
          [m.version, m.checksum]
        );
        await client.query("commit");
        console.log("appliquée");
      } catch (err) {
        await client.query("rollback");
        console.error(`échec — annulée.\n${err.message}`);
        process.exit(1);
      }
    }
    console.log(`${manquantes.length} migration(s) appliquée(s).`);
  } finally {
    await client.end();
  }
}

// Les deux échecs de connexion rencontrés en CI, traduits en action concrète :
// l'erreur brute de pg ("tenant/user not found", ENETUNREACH) ne dit pas quoi
// corriger dans le secret DATABASE_URL.
function expliquerErreurConnexion(err) {
  const msg = String(err?.message ?? "");
  if (/tenant|user .* not found/i.test(msg)) {
    return (
      `${msg}\n` +
      "→ Le pooler Supabase ne reconnaît pas l'utilisateur ou la région. DATABASE_URL doit être la chaîne « Session pooler » du projet\n" +
      "  (Supabase > Connect > Session pooler), de la forme :\n" +
      "  postgresql://postgres.<ref-projet>:<mot-de-passe>@aws-0-<région>.pooler.supabase.com:5432/postgres\n" +
      "  L'utilisateur est bien « postgres.<ref-projet> » et la région celle du projet (ex. eu-west-1)."
    );
  }
  if (/ENETUNREACH|EHOSTUNREACH/i.test(msg)) {
    return (
      `${msg}\n` +
      "→ L'hôte direct db.<ref>.supabase.co n'est joignable qu'en IPv6, ce que les runners GitHub n'ont pas.\n" +
      "  Utiliser la chaîne « Session pooler » (aws-0-<région>.pooler.supabase.com:5432), joignable en IPv4."
    );
  }
  return msg;
}

main().catch((err) => {
  console.error(expliquerErreurConnexion(err));
  process.exit(1);
});

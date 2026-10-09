// Replay all repository migrations on isolated PostgreSQL (PGlite).
// Supabase Auth/Storage schemas are fixtures; pgcrypto and ERP SQL are real.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key default gen_random_uuid(), instance_id uuid, email text unique, encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz, aud text, role text, confirmation_token text, recovery_token text, email_change_token_new text, email_change text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    create table storage.buckets(id text primary key,name text,public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
    alter table storage.objects enable row level security;`);
  const folder = new URL("../supabase/migrations/", import.meta.url);
  const files = readdirSync(folder)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(new URL(file, folder), "utf8"));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`, { cause: error });
    }
  }
  const rows = (
    await db.query(
      "select count(*) n from pg_policies where tablename='cash_closures'",
    )
  ).rows;
  assert.equal(Number(rows[0].n), 1);
  assert.equal(
    (
      await db.query(
        "select to_regprocedure('public.create_pipeline_invoice(uuid)') f",
      )
    ).rows[0].f,
    "create_pipeline_invoice(uuid)",
  );
  // Exercise the bridge against the complete migrated schema and all its triggers.
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values('10000000-0000-4000-8000-000000000041','chain@test.local','{"full_name":"Test chaîne"}');
    select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000041',false);
    insert into chart_of_accounts(code,name,type) values('411','Clients','actif'),('512','Banque','actif'),('706','Ventes','produit'),('4457','TVA','passif') on conflict(code) do nothing;
    grant usage on schema public,auth to authenticated;
    grant select,insert,update,delete on all tables in schema public to authenticated;
    set role authenticated;`);
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const contact = (
    await one("insert into contacts(name) values('Client chaîne') returning id")
  ).id;
  const product = (
    await one(
      "insert into products(sku,name,track_inventory,sale_price) values('CHAIN-POLO','Polo chaîne',true,1000) returning id",
    )
  ).id;
  const warehouse = (
    await one(
      "insert into warehouses(name,is_default) values('Atelier chaîne',true) returning id",
    )
  ).id;
  await db.query(
    "insert into stock_moves(product_id,warehouse_id,quantity,type) values($1,$2,10,'entree')",
    [product, warehouse],
  );
  const order = (
    await one(
      "insert into pipeline_orders(contact_id,status,technique,order_total) values($1,'prete','dtf',2000) returning id",
      [contact],
    )
  ).id;
  await db.query(
    "insert into pipeline_order_items(pipeline_order_id,product_id,product_name,quantity) values($1,$2,'Polo chaîne',2)",
    [order, product],
  );
  await db.query(
    "insert into order_payments(pipeline_order_id,amount,payment_method) values($1,500,'cash')",
    [order],
  );
  const invoice = (await one("select create_pipeline_invoice($1) id", [order]))
    .id;
  await db.query("update invoices set status='validee' where id=$1", [invoice]);
  await db.query("update pipeline_orders set status='livree' where id=$1", [
    order,
  ]);
  await db.query(
    "insert into order_payments(pipeline_order_id,amount,payment_method) values($1,1500,'transfer')",
    [order],
  );
  assert.equal(
    (await one("select status from invoices where id=$1", [invoice])).status,
    "payee",
  );
  assert.equal(
    Number(
      (
        await one(
          "select quantity from product_stock_summary where product_id=$1",
          [product],
        )
      ).quantity,
    ),
    8,
  );
  assert.equal(
    Number(
      (await one("select amount_paid from invoices where id=$1", [invoice]))
        .amount_paid,
    ),
    2000,
  );
  console.log(
    "PASS complete-schema atelier → invoice → delivery → final payment.",
  );
  console.log(
    `PASS ${files.length} migrations replayed from an empty database (Auth/Storage fixtures).`,
  );
} catch (error) {
  console.error(error.message, error.where || "");
  process.exitCode = 1;
} finally {
  await db.close();
}

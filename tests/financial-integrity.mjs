// Focused PostgreSQL tests. Uses real document schema/triggers and a minimal
// pipeline dependency fixture; does not claim to replay all legacy migrations.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const migration = (name) =>
  readFileSync(
    new URL(`../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
const admin = "10000000-0000-4000-8000-000000000001";
await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
  select set_config('app.user_id','${admin}',false);`);
await db.exec(
  migration("0001_init.sql").replace(
    'create extension if not exists "pgcrypto";',
    "",
  ),
);
await db.exec("alter type public.user_role add value if not exists 'atelier'");
await db.exec(migration("0002_functions_triggers.sql"));
await db.exec(migration("0003_rls.sql"));
await db.exec(migration("0007_fix_new_user_trigger.sql"));
process.on("uncaughtException", (error) => {
  console.error(error.message, error.where ?? "");
  process.exit(1);
});
await db.exec(migration("0017_financial_integrity_guards.sql"));
// Apply the actual latest invoice posting implementation (0021 also refers to
// unrelated production/security functions absent from this focused fixture).
const hardening = migration("0021_security_hardening.sql");
await db.exec(
  hardening.slice(
    hardening.indexOf(
      "create or replace function public.post_invoice_journal()",
    ),
    hardening.indexOf(
      "create or replace function public.post_payment_journal()",
    ),
  ),
);
await db.exec(`insert into auth.users(id,email) values('${admin}','admin@test.local');
  alter table contacts add column balance numeric(12,2) default 0;
  create table pipeline_orders(id uuid primary key default gen_random_uuid(),number text,contact_id uuid references contacts(id),order_total numeric(12,2),payment_status text default 'unpaid',paid_at timestamptz);
  create table order_payments(id uuid primary key default gen_random_uuid(),pipeline_order_id uuid references pipeline_orders(id) on delete cascade,amount numeric(12,2) not null,payment_method text not null,notes text,recorded_by uuid references profiles(id),created_at timestamptz default now(),updated_at timestamptz default now());
  alter table pipeline_orders enable row level security; alter table order_payments enable row level security;
  create policy pipeline_test on pipeline_orders for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
  create policy order_payments_select on order_payments for select to authenticated using(public.is_active_user());
  insert into chart_of_accounts(code,name,type) values ('411','Clients','actif'),('512','Banque','actif'),('706','Ventes','produit'),('4457','TVA','passif'),('606','Fournitures','charge');`);
const recompute = migration("0037_paiements_objectifs_securite.sql");
await db.exec(
  recompute.slice(
    recompute.indexOf(
      "create or replace function public.recompute_contact_balance",
    ),
    recompute.indexOf("-- Aligne les commandes existantes"),
  ),
);
await db.exec(migration("0039_commercial_cash_integrity.sql"));
// Extend the fixture with actual atelier delivery/catalog dependencies.
await db.exec(`alter table pipeline_orders add column status text default 'prete';
  create table pipeline_order_items(id uuid primary key default gen_random_uuid(),pipeline_order_id uuid references pipeline_orders(id) on delete cascade,product_id uuid references products(id),product_name text not null,color text,size text,quantity numeric(12,2) default 1,position int default 0);
  create table inventory_movements(id uuid primary key,product_id uuid,pipeline_order_id uuid,quantity numeric,movement_type text,reason text,recorded_by uuid,created_at timestamptz);
  alter table pipeline_order_items enable row level security;
  create policy items_test on pipeline_order_items for all to authenticated using(public.is_active_user()) with check(public.is_active_user());`);
await db.exec(migration("0038_stock_source_unique.sql"));
await db.exec(migration("0040_journal_immuable.sql"));
await db.exec(migration("0041_caractere_order_invoice_bridge.sql"));
await db.exec(migration("0042_caractere_operations_controls.sql"));
await db.exec(`create trigger post_order_payment_journal_trigger after insert on order_payments for each row execute function post_order_payment_journal();
  grant usage on schema public,auth to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated;
  grant execute on function auth.uid() to authenticated; set role authenticated;`);
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
let tests = 0;
async function test(name, fn) {
  await fn();
  tests++;
  console.log(`PASS ${name}`);
}
async function rejects(sql, params = []) {
  await assert.rejects(
    db.query(sql, params),
    { message: /./ },
    `Expected rejection: ${sql}`,
  );
}
const client = (
  await one("insert into contacts(name) values('Client test') returning id")
).id;
const header = {
  contact_id: client,
  status: "brouillon",
  issue_date: "2026-01-01",
  due_date: "2026-01-31",
};
const lines = [
  {
    product_id: null,
    description: "Polo personnalisé",
    quantity: 10,
    price: 1000,
    tax_rate: 0,
  },
];
async function save(kind, id, h, l) {
  return (
    await one("select save_commercial_document($1,$2,$3,$4) id", [
      kind,
      id,
      h,
      JSON.stringify(l),
    ])
  ).id;
}
let invoice;
await test("Invoice save computes totals and preserves all lines on a later FK failure", async () => {
  invoice = await save("invoices", null, header, lines);
  assert.equal(
    Number(
      (await one("select total from invoices where id=$1", [invoice])).total,
    ),
    10000,
  );
  await assert.rejects(
    save("invoices", invoice, { ...header, notes: "must rollback" }, [
      ...lines,
      { ...lines[0], product_id: "99999999-9999-4999-8999-999999999999" },
    ]),
  );
  assert.equal(
    Number(
      (
        await one("select count(*) n from invoice_lines where invoice_id=$1", [
          invoice,
        ])
      ).n,
    ),
    1,
  );
  assert.equal(
    (await one("select notes from invoices where id=$1", [invoice])).notes,
    null,
  );
});
await test("Rejects empty documents, negative amounts, invalid types and premature validation", async () => {
  await assert.rejects(save("invoices", null, header, []));
  await assert.rejects(
    save("invoices", null, header, [{ ...lines[0], price: -1 }]),
  );
  await assert.rejects(save("profiles", null, header, lines));
  await assert.rejects(
    save("invoices", null, { ...header, status: "validee" }, lines),
  );
  await rejects("insert into invoices(contact_id,status) values($1,'payee')", [
    client,
  ]);
});
await test("Posting creates balanced journal and freezes invoice header/lines", async () => {
  await db.query("update invoices set status='validee' where id=$1", [invoice]);
  assert.equal(
    Number(
      (
        await one(
          "select sum(debit-credit) diff from journal_lines join journal_entries on journal_entries.id=entry_id where source_id=$1",
          [invoice],
        )
      ).diff,
    ),
    0,
  );
  await rejects("update invoices set total=1 where id=$1", [invoice]);
  await rejects("delete from invoice_lines where invoice_id=$1", [invoice]);
  await rejects("update invoices set status='annulee' where id=$1", [invoice]);
  await rejects(
    "update invoices set status='payee',amount_paid=total where id=$1",
    [invoice],
  );
});
await test("Cash invoice payment debits cash, not bank; overpayment rejected", async () => {
  await db.query(
    "insert into payments(invoice_id,amount,method,paid_at) values($1,4000,'especes','2026-02-01')",
    [invoice],
  );
  assert.equal(
    Number(
      (
        await one(
          "select sum(debit) n from journal_lines join chart_of_accounts a on a.id=account_id where a.code='53'",
        )
      ).n,
    ),
    4000,
  );
  await rejects(
    "insert into payments(invoice_id,amount,method) values($1,7000,'especes')",
    [invoice],
  );
  await rejects("insert into payments(invoice_id,amount) values($1,-5)", [
    invoice,
  ]);
  await rejects("insert into payments(invoice_id,amount) values($1,'NaN')", [
    invoice,
  ]);
  assert.equal(
    (await one("select status from invoices where id=$1", [invoice])).status,
    "validee",
  );
  await db.query(
    "insert into payments(invoice_id,amount,method,paid_at) values($1,6000,'virement','2026-02-02')",
    [invoice],
  );
  assert.equal(
    (await one("select status from invoices where id=$1", [invoice])).status,
    "payee",
  );
  await db.query("delete from payments where invoice_id=$1", [invoice]);
  assert.equal(
    Number(
      (
        await one("select count(*) n from payments where invoice_id=$1", [
          invoice,
        ])
      ).n,
    ),
    2,
  );
});
await test("Retrying a payment request never inserts a second receipt", async () => {
  const draft = await save("invoices", null, header, lines);
  await db.query("update invoices set status='validee' where id=$1", [draft]);
  const token = "30000000-0000-4000-8000-000000000003";
  await db.query(
    "insert into payments(invoice_id,amount,method,paid_at,request_id) values($1,10000,'virement','2019-01-01',$2)",
    [draft, token],
  );
  await db.query(
    "insert into payments(invoice_id,amount,method,paid_at,request_id) values($1,10000,'virement','2019-01-01',$2)",
    [draft, token],
  );
  assert.equal(
    Number(
      (
        await one("select count(*) n from payments where invoice_id=$1", [
          draft,
        ])
      ).n,
    ),
    1,
  );
  await rejects(
    "insert into payments(invoice_id,amount,method,request_id) values($1,5000,'virement',$2)",
    [draft, token],
  );
});
await test("Quote/order conversions are atomic and repeated conversions reuse the document", async () => {
  const quote = await save(
    "sales_quotes",
    null,
    { contact_id: client, status: "accepte" },
    lines,
  );
  const order = (
    await one("select convert_commercial_document('quote',$1) id", [quote])
  ).id;
  assert.equal(
    (await one("select convert_commercial_document('quote',$1) id", [quote]))
      .id,
    order,
  );
  await db.query("update sales_orders set status='confirmee' where id=$1", [
    order,
  ]);
  const fact = (
    await one("select convert_commercial_document('order',$1) id", [order])
  ).id;
  assert.equal(
    (await one("select convert_commercial_document('order',$1) id", [order]))
      .id,
    fact,
  );
  assert.equal(
    Number((await one("select total from invoices where id=$1", [fact])).total),
    10000,
  );
});
let order;
await test("Order payment posts two balanced lines and updates its balance", async () => {
  order = (
    await one(
      "insert into pipeline_orders(number,contact_id,order_total) values('AT-TEST',$1,5000) returning id",
      [client],
    )
  ).id;
  const payment = (
    await one(
      "insert into order_payments(pipeline_order_id,amount,payment_method) values($1,2000,'cash') returning id",
      [order],
    )
  ).id;
  const journal = await one(
    "select count(*) n,sum(debit-credit) diff from journal_lines join journal_entries on journal_entries.id=entry_id where source_id=$1",
    [payment],
  );
  assert.equal(Number(journal.n), 2);
  assert.equal(Number(journal.diff), 0);
  assert.equal(
    (
      await one("select payment_status from pipeline_orders where id=$1", [
        order,
      ])
    ).payment_status,
    "partial",
  );
  assert.equal(
    Number(
      (await one("select balance from contacts where id=$1", [client])).balance,
    ),
    3000,
  );
  await rejects("update pipeline_orders set order_total=100 where id=$1", [
    order,
  ]);
  await rejects(
    "update pipeline_orders set payment_status='paid' where id=$1",
    [order],
  );
});
await test("Manual cash expenses are balanced and idempotent", async () => {
  const account = (
    await one("select id from chart_of_accounts where code='606'")
  ).id;
  const token = "20000000-0000-4000-8000-000000000002";
  const args = [500, "out", account, "Fournitures test", "2026-02-03", token];
  const entry = (
    await one("select record_cash_movement($1,$2,$3,$4,$5,$6) id", args)
  ).id;
  assert.equal(
    (await one("select record_cash_movement($1,$2,$3,$4,$5,$6) id", args)).id,
    entry,
  );
  assert.equal(
    Number(
      (
        await one(
          "select sum(debit-credit) diff from journal_lines where entry_id=$1",
          [entry],
        )
      ).diff,
    ),
    0,
  );
  await rejects(
    "select record_cash_movement(500,'in',$1,'Incorrect',current_date,gen_random_uuid())",
    [account],
  );
});
await test("Cash book totals are aggregated across every movement, with distinct noncash receipts", async () => {
  const row = await one("select cash_book('2020-01-01','2099-01-01',0) data");
  assert.equal(Number(row.data.incoming), 6000);
  assert.equal(Number(row.data.outgoing), 500);
  assert.equal(Number(row.data.closing), 5500);
  assert.equal(Number(row.data.invoice_receipts), 10000);
  assert.equal(Number(row.data.order_receipts), 2000);
});
await test("Linked atelier invoice attributes advances without receiving cash or exiting stock twice", async () => {
  await db.query("insert into warehouses(name,is_default) values('Atelier',true)");
  const product=(await one("insert into products(sku,name,track_inventory) values('POLO-TEST','Polo',true) returning id")).id;
  const wh=(await one("select id from warehouses where is_default limit 1")).id;
  await db.query("insert into stock_moves(product_id,warehouse_id,quantity,type) values($1,$2,100,'entree')",[product,wh]);
  const atelier=(await one("insert into pipeline_orders(number,contact_id,order_total) values('AT-LINK',$1,10000) returning id",[client])).id;
  await db.query("insert into pipeline_order_items(pipeline_order_id,product_id,product_name,quantity) values($1,$2,'Polo',10)",[atelier,product]);
  await db.query("insert into order_payments(pipeline_order_id,amount,payment_method) values($1,4000,'cash')",[atelier]);
  await db.query("update pipeline_orders set status='livree' where id=$1",[atelier]);
  const linked=(await one("select create_pipeline_invoice($1) id",[atelier])).id;
  assert.equal((await one("select create_pipeline_invoice($1) id",[atelier])).id,linked);
  assert.equal(Number((await one("select amount_paid from invoices where id=$1",[linked])).amount_paid),0);
  const cashBefore=Number((await one("select cash_book('2020-01-01','2099-01-01',0) data")).data.closing);
  await db.query("update invoices set status='validee' where id=$1",[linked]);
  const inv=await one("select amount_paid,status from invoices where id=$1",[linked]);
  assert.equal(Number(inv.amount_paid),4000); assert.equal(inv.status,'validee');
  assert.equal(Number((await one("select quantity from product_stock_summary where product_id=$1",[product])).quantity),90);
  assert.equal(Number((await one("select cash_book('2020-01-01','2099-01-01',0) data")).data.closing),cashBefore);
  await rejects("insert into payments(invoice_id,amount,method) values($1,6000,'especes')",[linked]);
  await db.query("insert into order_payments(pipeline_order_id,amount,payment_method) values($1,6000,'transfer')",[atelier]);
  const paid=await one("select amount_paid,status from invoices where id=$1",[linked]);
  assert.equal(Number(paid.amount_paid),10000); assert.equal(paid.status,'payee');
  assert.equal((await one("select payment_status from pipeline_orders where id=$1",[atelier])).payment_status,'paid');
  assert.equal(Number((await one("select sum(debit-credit) n from journal_lines join chart_of_accounts a on a.id=account_id where a.code='4191' and entry_id in (select id from journal_entries where source_id=$1 or source_id in (select id from order_payments where pipeline_order_id=$2))",[linked,atelier])).n),0);
  await rejects("update pipeline_orders set order_total=12000 where id=$1",[atelier]);
  await rejects("delete from pipeline_orders where id=$1",[atelier]);
  await rejects("update pipeline_order_items set quantity=20 where pipeline_order_id=$1",[atelier]);
  await db.query("update pipeline_orders set status='prete' where id=$1",[atelier]);
  await db.query("update pipeline_orders set status='livree' where id=$1",[atelier]);
  assert.equal(Number((await one("select quantity from product_stock_summary where product_id=$1",[product])).quantity),90);
});
await test("Invoice first, delivery later exits stock once; fully paid advances mark invoice paid",async()=>{
  const product=(await one("select id from products where sku='POLO-TEST'")).id;
  const atelier=(await one("insert into pipeline_orders(number,contact_id,order_total) values('AT-SECOND',$1,2000) returning id",[client])).id;
  await db.query("insert into pipeline_order_items(pipeline_order_id,product_id,product_name,quantity) values($1,$2,'Polo',2)",[atelier,product]);
  await db.query("insert into order_payments(pipeline_order_id,amount,payment_method) values($1,2000,'cash')",[atelier]);
  const linked=(await one("select create_pipeline_invoice($1) id",[atelier])).id;
  await db.query("update invoices set status='validee' where id=$1",[linked]);
  assert.equal((await one("select status from invoices where id=$1",[linked])).status,'payee');
  assert.equal(Number((await one("select quantity from product_stock_summary where product_id=$1",[product])).quantity),90);
  await db.query("update pipeline_orders set status='livree' where id=$1",[atelier]);
  assert.equal(Number((await one("select quantity from product_stock_summary where product_id=$1",[product])).quantity),88);
});
await test("Linked invoice cannot validate a different client or amount",async()=>{
  const atelier=(await one("insert into pipeline_orders(number,contact_id,order_total) values('AT-MISMATCH',$1,2000) returning id",[client])).id;
  await db.query("insert into pipeline_order_items(pipeline_order_id,product_name,quantity) values($1,'Impression',1)",[atelier]);
  const linked=(await one("select create_pipeline_invoice($1) id",[atelier])).id;
  await save('invoices',linked,header,[{...lines[0],quantity:1,price:1000}]);
  await rejects("update invoices set status='validee' where id=$1",[linked]);
  const other=(await one("insert into contacts(name) values('Autre client') returning id")).id;
  await rejects("update invoices set contact_id=$2 where id=$1",[linked,other]);
});
await test("CRM balance includes standalone invoices but never counts a linked invoice twice",async()=>{
  const c=(await one("insert into contacts(name) values('Client solde unifié') returning id")).id;
  const atelier=(await one("insert into pipeline_orders(number,contact_id,order_total) values('AT-BALANCE',$1,2000) returning id",[c])).id;
  await db.query("insert into pipeline_order_items(pipeline_order_id,product_name,quantity) values($1,'Service',1)",[atelier]);
  await db.query("insert into order_payments(pipeline_order_id,amount,payment_method) values($1,500,'transfer')",[atelier]);
  const linked=(await one("select create_pipeline_invoice($1) id",[atelier])).id;
  await db.query("update invoices set status='validee' where id=$1",[linked]);
  assert.equal(Number((await one("select balance from contacts where id=$1",[c])).balance),1500);
  const standalone=await save('invoices',null,{...header,contact_id:c},[{...lines[0],quantity:1,price:1000}]);
  await db.query("update invoices set status='validee' where id=$1",[standalone]);
  assert.equal(Number((await one("select balance from contacts where id=$1",[c])).balance),2500);
  await db.query("insert into payments(invoice_id,amount,method) values($1,500,'virement')",[standalone]);
  assert.equal(Number((await one("select balance from contacts where id=$1",[c])).balance),2000);
});
await test("Stock transfers are atomic, bounded by availability and restricted by role",async()=>{
  const product=(await one("select id from products where sku='POLO-TEST'")).id;
  const from=(await one("select id from warehouses where is_default limit 1")).id;
  const to=(await one("insert into warehouses(name) values('Boutique') returning id")).id;
  await rejects("select stock_transfer($1,$2,$3,1000,null)",[product,from,to]);
  await rejects("select stock_transfer($1,$2,$3,'NaN',null)",[product,from,to]);
  await db.query("select stock_transfer($1,$2,$3,8,'Réassort boutique')",[product,from,to]);
  assert.equal(Number((await one("select quantity from product_stock_summary where product_id=$1",[product])).quantity),88);
  assert.equal(Number((await one("select quantity from product_stock_levels where product_id=$1 and warehouse_id=$2",[product,to])).quantity),8);
  await db.exec("reset role; insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000004','atelier@test.local'); update profiles set role='atelier' where id='10000000-0000-4000-8000-000000000004'; set role authenticated; select set_config('app.user_id','10000000-0000-4000-8000-000000000004',false);");
  await rejects("select stock_transfer($1,$2,$3,1,null)",[product,from,to]);
  await rejects("insert into stock_moves(product_id,warehouse_id,quantity,type) values($1,$2,1,'entree')",[product,from]);
  assert.equal(Number((await one("select count(*) n from invoices")).n),0);
  assert.equal(Number((await one("select count(*) n from order_payments")).n),0);
  await db.exec("select set_config('app.user_id','"+admin+"',false)");
  await db.exec("reset role");
  await rejects("update stock_moves set quantity=1 where product_id=$1",[product]);
  await db.exec("set role authenticated");
});
await test("Preparation records promised date, BAT, blockers and quality checks",async()=>{
  await db.query("select save_order_preparation($1,'2026-10-10','envoye','Logo à vectoriser',true,false)",[order]);
  const prep=await one("select due_date,bat_status,blocked_reason,quality_checked,packaging_checked from pipeline_orders where id=$1",[order]);
  assert.equal(prep.bat_status,'envoye'); assert.equal(prep.blocked_reason,'Logo à vectoriser'); assert.equal(prep.quality_checked,true); assert.equal(prep.packaging_checked,false);
  await rejects("select save_order_preparation($1,current_date,'fake',null,false,false)",[order]);
});
await test("Cash counting freezes the period, preserves discrepancies, and rolls back a backdated receipt",async()=>{
  const book=(await one("select cash_book('2020-01-01',(now() at time zone 'Africa/Algiers')::date,0) data")).data;
  const counted=Number(book.closing)-100;
  await rejects("select close_cash_day((now() at time zone 'Africa/Algiers')::date,$1,'')",[counted]);
  const closing=(await one("select close_cash_day((now() at time zone 'Africa/Algiers')::date,$1,'Écart à rapprocher') id",[counted])).id;
  assert.equal((await one("select close_cash_day((now() at time zone 'Africa/Algiers')::date,$1,'Écart à rapprocher') id",[counted])).id,closing);
  assert.equal(Number((await one("select difference from cash_closures where id=$1",[closing])).difference),-100);
  await rejects("select close_cash_day((now() at time zone 'Africa/Algiers')::date,$1,'Autre comptage')",[counted]);
  await rejects("insert into order_payments(pipeline_order_id,amount,payment_method) values($1,500,'cash')",[order]);
  assert.equal(Number((await one("select sum(amount) n from order_payments where pipeline_order_id=$1",[order])).n),2000);
  assert.equal(Number((await one("select cash_book('2020-01-01',(now() at time zone 'Africa/Algiers')::date,0) data")).data.closing),Number(book.closing));
  // Closing cash does not block noncash receipts on the same date.
  await db.query("insert into order_payments(pipeline_order_id,amount,payment_method) values($1,500,'transfer')",[order]);
});
await test("Readonly user cannot save, receive money or create a cash movement", async () => {
  await db.exec(
    `reset role; insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000003','reader@test.local'); set role authenticated; select set_config('app.user_id','10000000-0000-4000-8000-000000000003',false);`,
  );
  await assert.rejects(save("invoices", null, header, lines));
  await rejects(
    "insert into order_payments(pipeline_order_id,amount,payment_method) values($1,100,'cash')",
    [order],
  );
  await rejects("select cash_book('2026-01-01','2026-12-31',0)");
  await rejects("select create_pipeline_invoice($1)",[order]);
  await rejects("select close_cash_day(current_date,0,'Non autorisé')");
  await rejects("select save_order_preparation($1,current_date,'valide',null,true,true)",[order]);
});
console.log(`${tests} financial integration checks passed.`);
await db.close();

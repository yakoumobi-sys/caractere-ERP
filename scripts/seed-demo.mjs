// Données fictives de démonstration : équipe, machines, catalogue, clients et commandes à toutes les étapes.
// Usage : npm run db:seed (après npm run db:reset). Ne pas lancer sur la base de production.
import pg from "pg";
import { databaseUrl } from "./lib.mjs";

const url = databaseUrl();
if (/supabase\.(co|com)|pooler/.test(url) && !process.argv.includes("--force")) {
  console.error("Refus : la base semble être une base Supabase distante. Ajoutez --force si c'est bien une base de démonstration.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 4 });

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const STAFF = [
  [1, "Karim Haddad", ["gerant"], true],
  [2, "Sara Benali", ["commercial"], false],
  [3, "Nadia Cherif", ["caissier"], false],
  [4, "Yanis Infographe", ["infographiste"], false],
  [5, "Amine Floqueur", ["floqueur"], false],
  [6, "Lina Contrôle", ["controleur", "magasinier"], true],
  [7, "Samir Brodeur", ["brodeur"], false],
  [8, "Mehdi Commercial", ["commercial"], false],
];
const as = (sub) => async (sql, args = []) => {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated" })]);
    const r = await c.query(sql, args.map((a) => (a && typeof a === "object" ? JSON.stringify(a) : a)));
    await c.query("commit");
    return r.rows;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
};
const rpc = (who) => async (fn, ...args) => (await as(who)(`select erp.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) r`, args))[0].r;
const sys = async (sql, args = []) => {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('erp.system','on',true)");
    const r = await c.query(sql, args);
    await c.query("commit");
    return r.rows;
  } finally {
    c.release();
  }
};

const g = rpc(ID(1)), com = rpc(ID(2)), com2 = rpc(ID(8)), caisse = rpc(ID(3)), info = rpc(ID(4)), flo = rpc(ID(5)), ctrl = rpc(ID(6)), bro = rpc(ID(7));

const exists = await sys("select count(*)::int n from erp.staff");
if (exists[0].n > 0) {
  console.log("Données déjà présentes : seed ignoré.");
  await pool.end();
  process.exit(0);
}
for (const [n, name, roles, fp] of STAFF) {
  await sys("insert into erp.staff(id, auth_user_id, full_name, email, roles, can_validate_first_piece) values ($1,$1,$2,$3,$4,$5)", [ID(n), name, `${name.split(" ")[0].toLowerCase()}@caractere.demo`, roles, fp]);
}
await sys(`insert into erp.machines(name, kind, laize_cm) values ('Imprimante DTF 60', 'dtf', 60), ('Imprimante DTF 30', 'dtf', 30), ('Presse 40×50', 'presse', null), ('Brodeuse 6 têtes', 'brodeuse', null)`);
await sys(`update erp.settings set value = '{"name":"Caractère","legal_name":"SARL Caractère (fictif)","activity":"Personnalisation textile — DTF, broderie, flocage","address":"Aïn Benian, Alger","phone":"+213 555 00 00 00","email":"contact@caractere.demo","nif":"000000000000000","nis":"000000000000000","rc":"16/00-0000000B00","ai":"00000000000","rib":"00000000000000000000","logo_url":"/logo-caractere.svg"}' where key = 'company'`);

const catalogue = [
  ["POLO-PIQ", "Polo piqué 220g", 1200, 650, ["Noir", "Blanc", "Marine"], ["S", "M", "L", "XL", "XXL"], 25],
  ["TS-180", "T-shirt coton 180g", 800, 380, ["Blanc", "Noir", "Rouge"], ["S", "M", "L", "XL"], 40],
  ["HOOD-300", "Sweat à capuche 300g", 2600, 1500, ["Noir", "Gris"], ["M", "L", "XL"], 8],
  ["CASQ-COT", "Casquette coton", 600, 250, ["Noir", "Blanc"], ["U"], 30],
];
for (const [ref, name, price, cost, colors, sizes, qty] of catalogue) {
  const pid = await g("upsert_product", { ref, name, sale_price: price, cost });
  for (const c of colors) for (const s of sizes) {
    const iid = await g("upsert_stock_item", pid, c, s, 5);
    await g("stock_move", iid, "reception", qty, "Stock initial (démo)");
  }
}
for (const [ref, name, qty] of [["FILM-DTF-60", "Film DTF 60 cm (m)", 120], ["ENCRE-DTF-W", "Encre DTF blanche (L)", 3], ["POUDRE-DTF", "Poudre DTF (kg)", 6], ["FIL-BROD", "Fil à broder (cône)", 40]]) {
  const pid = await g("upsert_product", { ref, name, kind: "consommable", unit: ref.includes("FILM") ? "m" : "unité" });
  const iid = await g("upsert_stock_item", pid, "", "", ref === "ENCRE-DTF-W" ? 4 : 5);
  await g("stock_move", iid, "reception", qty, "Stock initial (démo)");
}
const pids = Object.fromEntries((await sys("select ref, id from erp.products")).map((r) => [r.ref, r.id]));
await caisse("open_cash", 10000);

const client = async (who, name, phone, extra = {}) => who("create_client", { name, phone, source: extra.source || "instagram", ...extra });
async function runAll(orderId, stopAt) {
  for (let k = 0; k < 40; k++) {
    const t = (await as(ID(1))("select * from erp.v_tasks where order_id = $1 and status not in ('terminee','annulee') and is_ready order by seq limit 1", [orderId]))[0];
    if (!t || t.step === stopAt) return t;
    const who = { controle: ctrl, flocage: flo, broderie: bro, preparation: ctrl, emballage: ctrl }[t.step] || info;
    await who("start_task", t.id);
    if (t.needs_first_piece) await ctrl("validate_first_piece", t.id, true, null);
    await who("finish_task", t.id);
  }
}
async function personalizedOrder(who, clientId, lines, { deposit = true, confirm = true } = {}) {
  const q = await who("save_quote", { client_id: clientId, lines });
  await who("send_quote", q);
  const o = await who("convert_quote", q);
  await who("set_bat", o, "valide", null);
  await who("set_agreement", o, "Accord WhatsApp (capture enregistrée)", null);
  if (deposit) {
    const req = (await as(ID(1))("select deposit_required from erp.v_orders where id = $1", [o]))[0].deposit_required;
    if (req > 0) await caisse("record_payment", { order_id: o, amount: req, method: "especes" });
  }
  if (confirm) await who("confirm_order", o, null);
  return o;
}

// 1. Prospects à contacter
await client(com, "Association Les Mouettes", "0550 11 22 33", { company: "Association", source: "facebook" });
await client(com2, "Lycée Ibn Khaldoun", "0661 44 55 66", { company: "Lycée", source: "bouche_a_oreille" });
const resto = await client(com, "Restaurant La Corniche", "0770 98 76 54", { source: "whatsapp" });
await com("add_simulation", { client_id: resto, garment: "Tablier noir", placement: "poitrine", sent: true });
await com("create_deal", resto, "Tabliers brodés pour le personnel", ID(2), "Envoyer le devis broderie", null, 30000);

// 2. Devis envoyé sans réponse depuis 5 jours
const startup = await client(com, "Startup Sahel Tech", "0555 66 77 88", { company: "Sahel Tech", source: "site" });
const qs = await com("save_quote", { client_id: startup, title: "T-shirts événement", lines: [{ product_id: pids["TS-180"], color: "Noir", sizes: { M: 15, L: 15 }, unit_price: 800, services: ["dtf"], service_price: 350, placement: "poitrine", print_width_cm: 25 }] });
await com("send_quote", qs);
await sys("update erp.quotes set sent_at = now() - interval '5 days' where id = $1", [qs]);

// 3. Commande 20 polos DTF+flocage en production : première pièce à valider
const club = await client(com, "Club Sportif Aïn Benian", "0555 12 34 56", { company: "CSAB", source: "instagram", wilaya: "Alger", commune: "Aïn Benian" });
const o1 = await personalizedOrder(com, club, [{ product_id: pids["POLO-PIQ"], color: "Noir", sizes: { M: 10, L: 10 }, unit_price: 1200, services: ["dtf", "flocage"], service_price: 600, placement: "coeur", print_width_cm: 10 }]);
const t1 = await runAll(o1, "flocage");
await flo("start_task", t1.id);

// 4. Commande DTF + broderie (sweats) à l'infographie, en retard
const ent = await client(com2, "Entreprise BTP Zéralda", "0661 23 45 67", { company: "BTP Zéralda" });
const o2 = await personalizedOrder(com2, ent, [
  { product_id: pids["HOOD-300"], color: "Gris", sizes: { L: 6, XL: 4 }, unit_price: 2600, services: ["broderie"], service_price: 700, placement: "coeur" },
  { product_id: pids["TS-180"], color: "Blanc", sizes: { M: 8, L: 8 }, unit_price: 800, services: ["dtf"], service_price: 300, placement: "dos_haut", print_width_cm: 28 },
]);
await com2("update_order_meta", o2, { promised_date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10) }, "Délai initial client");

// 5. Commande en rupture (sweats noirs XL : 8 en stock pour 12)
const asso = await client(com, "Scouts Aïn Benian", "0770 12 12 12", { company: "Scouts" });
await personalizedOrder(com, asso, [{ product_id: pids["HOOD-300"], color: "Noir", sizes: { XL: 12 }, unit_price: 2600, services: ["dtf"], service_price: 400, placement: "dos_complet", print_width_cm: 35 }]);

// 6. Commande prête au retrait, solde à encaisser
const salle = await client(com, "Salle de sport Iron Gym", "0555 33 44 55", { company: "Iron Gym" });
const o3 = await personalizedOrder(com, salle, [{ product_id: pids["TS-180"], color: "Noir", sizes: { S: 5, M: 10, L: 5 }, unit_price: 800, services: ["flocage"], service_price: 250, placement: "poitrine" }]);
await runAll(o3);

// 7. Commande expédiée Yalidine (COD) + 8. livrée avec carte Privilège et reversement à rapprocher
const mariage = await client(com2, "Famille Bouzid (mariage)", "0661 77 88 99", { wilaya: "Blida", commune: "Boufarik", address: "Cité 100 logements" });
const o4 = await personalizedOrder(com2, mariage, [{ product_id: pids["TS-180"], color: "Blanc", sizes: { M: 6, L: 6 }, unit_price: 800, services: ["dtf"], service_price: 300, placement: "coeur", print_width_cm: 12, is_characterized: true }]);
await runAll(o4);
await com2("update_order_meta", o4, { delivery_mode: "yalidine", ship_wilaya: "Blida", ship_commune: "Boufarik", ship_address: "Cité 100 logements" }, null);
const bal4 = (await as(ID(1))("select balance from erp.v_orders where id = $1", [o4]))[0].balance;
await com2("create_shipment", { order_id: o4, mode: "yalidine", tracking: "YAL-DEMO-0001", cod_amount: bal4, fee: 450 });

const fidele = await client(com, "Karima Saadi", "0550 55 66 77", { wilaya: "Alger", commune: "Chéraga" });
const o5 = await personalizedOrder(com, fidele, [{ product_id: pids["POLO-PIQ"], color: "Marine", sizes: { M: 2, L: 1 }, unit_price: 1200, services: ["broderie"], service_price: 500, placement: "coeur" }]);
await runAll(o5);
await com("update_order_meta", o5, { delivery_mode: "yalidine", ship_wilaya: "Alger", ship_commune: "Chéraga" }, null);
const bal5 = (await as(ID(1))("select balance from erp.v_orders where id = $1", [o5]))[0].balance;
await com("create_shipment", { order_id: o5, mode: "yalidine", tracking: "YAL-DEMO-0002", cod_amount: bal5, fee: 400 });
await sys("select erp.ingest_carrier_event('yalidine','demo-1','YAL-DEMO-0002','livre','Livré',now(),'{}')");

// 9. Échec de livraison à rappeler
const etud = await client(com2, "Rayan Merabet", "0770 44 33 22", { wilaya: "Tipaza" });
const o6 = await personalizedOrder(com2, etud, [{ product_id: pids["CASQ-COT"], color: "Noir", sizes: { U: 3 }, unit_price: 600, services: ["broderie"], service_price: 400, placement: "poitrine" }]);
await runAll(o6);
await com2("update_order_meta", o6, { delivery_mode: "yalidine", ship_wilaya: "Tipaza" }, null);
await com2("create_shipment", { order_id: o6, mode: "yalidine", tracking: "YAL-DEMO-0003", cod_amount: 0 });
await sys("select erp.ingest_carrier_event('yalidine','demo-2','YAL-DEMO-0003','echec','Client injoignable',now(),'{}')");

// 10. Brouillon en attente de BAT + vente comptoir
const coif = await client(com, "Salon Élégance", "0555 90 80 70", { company: "Salon Élégance" });
const q7 = await com("save_quote", { client_id: coif, lines: [{ product_id: pids["TS-180"], color: "Noir", sizes: { S: 3, M: 3 }, unit_price: 800, services: ["dtf"], service_price: 300, placement: "dos_haut", print_width_cm: 22 }] });
await com("send_quote", q7);
await com("convert_quote", q7);
const item = (await sys("select si.id from erp.stock_items si join erp.products p on p.id = si.product_id where p.ref = 'TS-180' and si.color = 'Blanc' and si.size = 'L'"))[0].id;
await caisse("counter_sale", { client_name: "Passant comptoir", items: [{ item_id: item, qty: 2 }], method: "especes" });

console.log("✓ Données de démonstration chargées (8 profils, 4 machines, catalogue, 13 clients, commandes à toutes les étapes).");
await pool.end();

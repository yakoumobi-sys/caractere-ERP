// Scénarios complémentaires : comptoir, devis sans réponse, rupture, défaut, annulation après acompte,
// livraison partielle, événement reçu deux fois, droits par profil, imports CSV, documents figés.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, baseFixtures, actor, IDS, item, expectError, system, runWorkshop } from "./helpers.mjs";

let pool, fx, g, com, caisse, flo, ctrl, mag, info;
before(async () => {
  pool = await freshDb();
  fx = await baseFixtures(pool);
  g = actor(pool, IDS.gerant);
  com = actor(pool, IDS.commercial);
  caisse = actor(pool, IDS.caissier);
  flo = actor(pool, IDS.floqueur);
  ctrl = actor(pool, IDS.controleur);
  mag = actor(pool, IDS.magasinier);
  info = actor(pool, IDS.infographiste);
  await caisse.rpc("open_cash", 2000);
});
after(async () => pool && (await pool.end()));

let n = 0;
async function newClient(extra = {}) {
  n++;
  return com.rpc("create_client", { name: `Client ${n}`, phone: `0661 00 00 ${String(n).padStart(2, "0")}`, source: "test", ...extra });
}
async function draftOrder(lines, extra = {}) {
  const clientId = extra.client_id || (await newClient());
  const id = await com.rpc("create_order", { client_id: clientId, lines, deposit_pct: extra.deposit_pct ?? 0, delivery_mode: extra.delivery_mode || "retrait" });
  const personalized = lines.some((l) => (l.services || []).length);
  if (personalized) {
    await com.rpc("set_bat", id, "valide", null);
    await com.rpc("set_agreement", id, "OK client", null);
  }
  return { id, clientId };
}

test("normalisation des numéros algériens", async () => {
  const cases = [["0555 12 34 56", "+213555123456"], ["+213 555 12 34 56", "+213555123456"], ["00213555123456", "+213555123456"], ["555123456", "+213555123456"], ["021 30 12 34", "+21321301234"], ["06-61-22-33-44", "+213661223344"], ["12", null], ["+33 6 12 34 56 78", "+33612345678"]];
  for (const [input, expected] of cases) {
    const r = await g.one("select erp.normalize_phone($1) r", [input]);
    assert.equal(r.r, expected, input);
  }
});

test("vente comptoir immédiate", async () => {
  const blanc = await item(pool, "TS-180", "Blanc", "M");
  const key = "comptoir-1";
  const [a, b] = await Promise.all([
    caisse.rpc("counter_sale", { client_name: "Passant", client_phone: "0770 11 22 33", items: [{ item_id: blanc.id, qty: 2 }], method: "especes", idempotency_key: key }),
    caisse.rpc("counter_sale", { client_name: "Passant", client_phone: "0770 11 22 33", items: [{ item_id: blanc.id, qty: 2 }], method: "especes", idempotency_key: key }),
  ]).catch(async () => {
    // la seconde requête simultanée peut échouer sur la clé unique : on rejoue, elle renvoie la vente existante
    const x = await caisse.rpc("counter_sale", { client_name: "Passant", client_phone: "0770 11 22 33", items: [{ item_id: blanc.id, qty: 2 }], method: "especes", idempotency_key: key });
    return [x, x];
  });
  assert.equal(a, b);
  const o = await caisse.one("select * from erp.v_orders where id = $1", [a]);
  assert.equal(o.status, "retiree");
  assert.equal(o.kind, "comptoir");
  assert.equal(Number(o.balance), 0);
  assert.equal(Number(o.total_ttc), 1904); // 2 × 800 HT + 19 %
  const after_ = await item(pool, "TS-180", "Blanc", "M");
  assert.equal(after_.physical, blanc.physical - 2);
  assert.equal(after_.reserved, blanc.reserved);
  const moves = await caisse.q("select * from erp.v_cash_moves where payment_id in (select id from erp.v_payments where order_id = $1)", [a]);
  assert.equal(moves.length, 1);
  assert.equal(Number(moves[0].amount), 1904);
  const receipt = await caisse.q("select * from erp.v_documents where order_id = $1 and kind = 'recu'", [a]);
  assert.equal(receipt.length, 1);
  await expectError(caisse.rpc("counter_sale", { items: [{ item_id: blanc.id, qty: 999 }], method: "especes" }), /Stock insuffisant/);
});

test("devis sans réponse → à contacter aujourd'hui, sans doublon", async () => {
  const clientId = await newClient();
  const qid = await com.rpc("save_quote", { client_id: clientId, lines: [{ product_id: fx.tee, color: "Blanc", sizes: { M: 5 }, unit_price: 800, services: ["dtf"], service_price: 300, print_width_cm: 20 }] });
  await com.rpc("send_quote", qid);
  await system(pool, (c) => c.query("update erp.quotes set sent_at = now() - interval '5 days' where id = $1", [qid]));
  await g.rpc("refresh_followups");
  await g.rpc("refresh_followups");
  const f = await com.q("select * from erp.v_followups where quote_id = $1 and status = 'a_faire'", [qid]);
  assert.equal(f.length, 1);
  assert.equal(f[0].reason, "devis_sans_reponse");
  assert.equal(f[0].owner_name, "Sara Commerciale");
  await expectError(com.rpc("complete_followup", f[0].id, "", null, "whatsapp"), /résultat/);
  await com.rpc("complete_followup", f[0].id, "Client absent, rappeler jeudi", "2030-01-01", "appel");
  const after_ = await com.q("select * from erp.v_followups where quote_id = $1 order by created_at", [qid]);
  assert.equal(after_.length, 2);
  assert.equal(after_[0].status, "fait");
  assert.equal(after_[0].done_by_name, "Sara Commerciale");
  assert.equal(after_[1].due_date.toISOString().slice(0, 10), "2030-01-01");
});

test("refus marketing : exclu des réactivations", async () => {
  const clientId = await newClient({ kind: "client", marketing_opt_out: true, opt_out_reason: "Ne veut pas de messages" });
  await expectError(com.rpc("create_followup", clientId, "reactivation", null, "test", null, null), /refuse/);
  const ok = await com.rpc("create_followup", clientId, "solde", null, "Solde", null, null);
  assert.ok(ok, "les relances non marketing restent possibles");
});

test("rupture : manque affiché, production bloquée, achat à valider puis réception", async () => {
  const { id } = await draftOrder([{ product_id: fx.tee, color: "Blanc", sizes: { L: 10 }, unit_price: 800, services: ["dtf"], service_price: 300, print_width_cm: 25 }]);
  await com.rpc("confirm_order", id, null);
  let o = await com.one("select * from erp.v_orders where id = $1", [id]);
  assert.equal(o.shortage, 6, "4 en stock pour 10 demandés");
  assert.equal(o.is_blocked, true);
  assert.match(o.next_action, /Réapprovisionner : 6/);
  const line = await com.one("select * from erp.v_lines where order_id = $1", [id]);
  assert.deepEqual(line.missing, { L: 6 });
  const pr = await g.q("select * from erp.v_purchase_requests where order_id = $1 and status = 'a_valider'", [id]);
  assert.equal(pr[0].qty, 6);
  await expectError(mag.rpc("decide_purchase", pr[0].id, true), /Accès refusé/);
  await g.rpc("decide_purchase", pr[0].id, true);
  const tasks = Object.fromEntries((await com.q("select id, step from erp.v_tasks where order_id = $1", [id])).map((x) => [x.step, x.id]));
  await expectError(info.rpc("start_task", tasks.impression_dtf), /Rupture/);
  const it = await item(pool, "TS-180", "Blanc", "L");
  await expectError(info.rpc("stock_move", it.id, "reception", 10, "Livraison fournisseur"), /Accès refusé/);
  await mag.rpc("stock_move", it.id, "reception", 10, "Livraison fournisseur");
  o = await com.one("select * from erp.v_orders where id = $1", [id]);
  assert.equal(o.shortage, 0, "réservation complétée à la réception");
  assert.equal((await g.one("select status from erp.v_purchase_requests where id = $1", [pr[0].id])).status, "recue");
  await info.rpc("start_task", tasks.impression_dtf);
});

test("défaut atelier : perte remplacée et tracée, reprise", async () => {
  const { id } = await draftOrder([{ product_id: fx.polo, color: "Noir", sizes: { L: 3 }, unit_price: 1200, services: ["flocage"], service_price: 400 }]);
  await com.rpc("confirm_order", id, null);
  const tasks = Object.fromEntries((await com.q("select id, step from erp.v_tasks where order_id = $1", [id])).map((x) => [x.step, x.id]));
  assert.deepEqual(Object.keys(tasks), ["flocage"], "une seule file : flocage");
  await flo.rpc("start_task", tasks.flocage);
  const before_ = await item(pool, "POLO-PIQ", "Noir", "L");
  await flo.rpc("report_defect", tasks.flocage, "L", 1, "Flex décollé", "perte");
  const after_ = await item(pool, "POLO-PIQ", "Noir", "L");
  assert.equal(after_.physical, before_.physical - 1, "pièce de remplacement sortie du stock");
  const mv = await mag.q("select * from erp.v_stock_moves where order_id = $1 and kind = 'perte'", [id]);
  assert.equal(mv.length, 1);
  await flo.rpc("report_defect", tasks.flocage, "L", 1, "Placement décalé", "reprise");
  const d = await flo.q("select * from erp.v_defects where order_id = $1 order by at", [id]);
  assert.deepEqual(d.map((x) => [x.outcome, x.qty, x.staff_name]), [["perte", 1, "Amine Floqueur"], ["reprise", 1, "Amine Floqueur"]]);
  // blocage avec motif et personne à prévenir
  await flo.rpc("block_task", tasks.flocage, "Encre manquante pour retouche", IDS.gerant);
  const b = await g.one("select * from erp.v_tasks where id = $1", [tasks.flocage]);
  assert.equal(b.notify_name, "Karim Gérant");
  assert.equal((await com.one("select is_blocked from erp.v_orders where id = $1", [id])).is_blocked, true);
  await expectError(flo.rpc("finish_task", tasks.flocage), /Démarrez/);
  await flo.rpc("unblock_task", tasks.flocage, "Encre reçue");
  await flo.rpc("finish_task", tasks.flocage);
  assert.equal((await com.one("select status from erp.v_orders where id = $1", [id])).status, "prete");
});

test("annulation après acompte : réservations libérées, remboursement à traiter", async () => {
  const { id } = await draftOrder([{ product_id: fx.tee, color: "Noir", sizes: { S: 4 }, unit_price: 800, services: ["dtf"], service_price: 300, print_width_cm: 10 }], { deposit_pct: 50 });
  await caisse.rpc("record_payment", { order_id: id, amount: 2618, method: "especes" });
  await com.rpc("confirm_order", id, null);
  assert.equal((await item(pool, "TS-180", "Noir", "S")).reserved, 4);
  await expectError(com.rpc("cancel_order", id, ""), /motif/);
  await com.rpc("cancel_order", id, "Client a changé d'avis");
  await com.rpc("cancel_order", id, "Double clic");
  assert.equal((await item(pool, "TS-180", "Noir", "S")).reserved, 0);
  const o = await com.one("select * from erp.v_orders where id = $1", [id]);
  assert.equal(o.status, "annulee");
  assert.equal(Number(o.refund_due), 2618);
  assert.match(o.next_action, /Rembourser 2618 DA/);
  assert.equal((await com.q("select * from erp.v_tasks where order_id = $1 and status <> 'annulee'", [id])).length, 0);
  assert.equal((await com.q("select * from erp.v_followups where order_id = $1 and reason = 'remboursement' and status = 'a_faire'", [id])).length, 1);
  assert.equal((await com.q("select * from erp.v_order_events where order_id = $1 and kind = 'annulation'", [id])).length, 1);
  await caisse.rpc("record_refund", id, 2618, "especes", "Annulation client", "refund-1");
  assert.equal(Number((await com.one("select refund_due from erp.v_orders where id = $1", [id])).refund_due), 0);
});

test("modification de quantité après confirmation : réservations, tâches et historique", async () => {
  const { id } = await draftOrder([{ product_id: fx.tee, color: "Blanc", sizes: { M: 5 }, unit_price: 800, services: [] }], { deposit_pct: 0 });
  await com.rpc("confirm_order", id, null);
  const line = await com.one("select * from erp.v_lines where order_id = $1", [id]);
  const before_ = await item(pool, "TS-180", "Blanc", "M");
  await expectError(com.rpc("update_line_sizes", line.id, { M: 3 }, ""), /motif/);
  await com.rpc("update_line_sizes", line.id, { M: 3 }, "Client réduit sa commande");
  assert.equal((await item(pool, "TS-180", "Blanc", "M")).reserved, before_.reserved - 2);
  const tasks = await com.q("select qty_target from erp.v_tasks where order_id = $1", [id]);
  assert.ok(tasks.every((t) => t.qty_target === 3));
  const ev = await com.one("select * from erp.v_order_events where order_id = $1 and kind = 'quantite'", [id]);
  assert.deepEqual(ev.before.sizes, { M: 5 });
  assert.deepEqual(ev.after.sizes, { M: 3 });
  assert.equal(ev.staff_name, "Sara Commerciale");
});

test("livraison partielle en deux colis et événement de livraison reçu deux fois", async () => {
  const clientId = await newClient();
  const { id } = await draftOrder([
    { product_id: fx.polo, color: "Noir", sizes: { M: 2 }, unit_price: 1200, services: [] },
    { product_id: fx.tee, color: "Blanc", sizes: { M: 3 }, unit_price: 800, services: [] },
  ], { client_id: clientId, delivery_mode: "yalidine" });
  await com.rpc("confirm_order", id, null);
  await runWorkshop(pool, id);
  const lines = await com.q("select * from erp.v_lines where order_id = $1 order by position", [id]);
  const s1 = await com.rpc("create_shipment", { order_id: id, mode: "yalidine", tracking: "YAL-PART-1", items: [{ line_id: lines[0].id, size: "M", qty: 2 }, { line_id: lines[1].id, size: "M", qty: 1 }] });
  await expectError(com.rpc("create_shipment", { order_id: id, mode: "yalidine", tracking: "YAL-PART-X", items: [{ line_id: lines[1].id, size: "M", qty: 3 }] }), /maximum/);
  await com.rpc("set_shipment_status", s1, "livre", "Livré au client");
  let o = await com.one("select * from erp.v_orders where id = $1", [id]);
  assert.equal(o.status, "expediee", "livraison partielle : la commande reste ouverte");
  assert.equal(o.progress.livraison, 60);
  assert.match(o.next_action, /Expédier le reste \(2/);
  // échec de livraison → action assignée au commercial
  const s2 = await com.rpc("create_shipment", { order_id: id, mode: "yalidine", items: [{ line_id: lines[1].id, size: "M", qty: 2 }] });
  await com.rpc("set_tracking", s2, "yal-part-2");
  const at = new Date();
  await system(pool, (c) => c.query("select erp.ingest_carrier_event('yalidine','p2-a','YAL-PART-2','echec','Client injoignable',$1,'{}')", [at]));
  const inc = await com.q("select * from erp.v_followups where order_id = $1 and reason = 'incident_livraison' and status = 'a_faire'", [id]);
  assert.equal(inc.length, 1);
  assert.equal(inc[0].owner_name, "Sara Commerciale");
  assert.match((await com.one("select next_action from erp.v_orders where id = $1", [id])).next_action, /tentative de livraison échouée/);
  // livraison reçue deux fois (même identifiant, puis rejouée avec un autre identifiant)
  const r1 = await system(pool, async (c) => (await c.query("select erp.ingest_carrier_event('yalidine','p2-b','YAL-PART-2','livre','Livré',$1,'{}') r", [new Date(+at + 1000)])).rows[0].r);
  const r2 = await system(pool, async (c) => (await c.query("select erp.ingest_carrier_event('yalidine','p2-b','YAL-PART-2','livre','Livré',$1,'{}') r", [new Date(+at + 1000)])).rows[0].r);
  const r3 = await system(pool, async (c) => (await c.query("select erp.ingest_carrier_event('yalidine','p2-c','YAL-PART-2','livre','Livré',$1,'{}') r", [new Date(+at + 2000)])).rows[0].r);
  assert.deepEqual([r1, r2, r3], ["applique", "doublon", "deja_applique"]);
  o = await com.one("select * from erp.v_orders where id = $1", [id]);
  assert.equal(o.status, "livree");
  const l2 = await com.one("select delivered from erp.v_lines where id = $1", [lines[1].id]);
  assert.deepEqual(l2.delivered, { M: 3 }, "pas de double comptage");
  const benefits = await com.q("select * from erp.v_loyalty where client_id = $1", [clientId]);
  assert.equal(benefits.length, 1, "une seule carte, un seul avantage");
  // le cadeau s'applique une fois, à la commande suivante
  const next = await com.rpc("create_order", { client_id: clientId, lines: [{ product_id: fx.tee, color: "Blanc", sizes: { M: 1 }, unit_price: 800 }] });
  await expectError(com.rpc("apply_benefit", id, benefits[0].benefit_id, "M", "Blanc"), /avant la confirmation/);
  await com.rpc("apply_benefit", next, benefits[0].benefit_id, "L", "Blanc");
  await expectError(com.rpc("apply_benefit", next, benefits[0].benefit_id, "L", "Blanc"), /déjà utilisé/);
  const gift = await com.one("select * from erp.v_lines where order_id = $1 and is_gift", [next]);
  assert.equal(Number(gift.amount), 0);
  assert.equal(gift.is_characterized, true);
  assert.equal((await com.one("select used_ref from erp.v_loyalty where benefit_id = $1", [benefits[0].benefit_id])).used_ref, (await com.one("select ref from erp.v_orders where id = $1", [next])).ref);
});

test("T-shirt caractérisé : laize 30 cm et impression au-dessus de l'ourlet", async () => {
  const cid = await newClient();
  const base = { product_id: fx.tee, color: "Blanc", sizes: { M: 1 }, unit_price: 800, services: ["dtf"], service_price: 300, is_characterized: true };
  await expectError(com.rpc("save_quote", { client_id: cid, lines: [{ ...base, print_width_cm: 32, placement: "coeur" }] }), /30 cm/);
  await expectError(com.rpc("save_quote", { client_id: cid, lines: [{ ...base, print_width_cm: 25, placement: "manche_gauche" }] }), /col et manches unis/);
  assert.ok(await com.rpc("save_quote", { client_id: cid, lines: [{ ...base, print_width_cm: 28, placement: "dos_haut" }] }));
  await expectError(com.rpc("save_quote", { client_id: cid, lines: [{ ...base, is_characterized: false, print_width_cm: 70 }] }), /laize/);
  // affectation à une machine trop étroite
  const { id } = await draftOrder([{ ...base, is_characterized: false, print_width_cm: 45 }]);
  await com.rpc("confirm_order", id, null);
  const t = await com.one("select * from erp.v_tasks where order_id = $1 and step = 'impression_dtf'", [id]);
  assert.equal(t.machine_name, "DTF 60", "machine choisie selon la laize");
  const dtf30 = await g.one("select id from erp.v_machines where name = 'DTF 30'");
  await expectError(info.rpc("assign_task", t.id, IDS.infographiste, dtf30.id), /Laize/);
});

test("droits par profil côté base", async () => {
  const cid = await newClient();
  await expectError(flo.rpc("create_client", { name: "X" }), /Accès refusé/);
  await expectError(info.rpc("save_quote", { client_id: cid, lines: [] }), /Accès refusé/);
  await expectError(mag.rpc("open_cash", 0), /Accès refusé/);
  await expectError(com.rpc("close_cash", 0, null), /Accès refusé/);
  await expectError(caisse.rpc("cash_correction", "00000000-0000-0000-0000-000000000000", 10, "x"), /Accès refusé/);
  await expectError(flo.rpc("record_payment", { order_id: "00000000-0000-0000-0000-000000000000", amount: 1, method: "especes" }), /Accès refusé/);
  await expectError(com.rpc("save_setting", "tva_rate", "9"), /Accès refusé/);
  assert.equal((await flo.q("select * from erp.v_clients")).length, 0);
  assert.equal((await flo.q("select * from erp.v_quotes")).length, 0);
  assert.equal((await mag.q("select * from erp.v_cash_moves")).length, 0);
  // accès direct aux tables refusé
  await expectError(com.q("select * from erp.orders"), /permission denied/);
  await expectError(com.q("update erp.payments set amount = 1"), /permission denied/);
  await expectError(com.q("select erp.reserve_line('00000000-0000-0000-0000-000000000000')"), /permission denied/);
  // le gérant peut confirmer sans acompte, avec motif tracé
  const { id } = await draftOrder([{ product_id: fx.tee, color: "Noir", sizes: { S: 1 }, unit_price: 800, services: [] }], { deposit_pct: 100 });
  await g.rpc("confirm_order", id, "Client institutionnel, paiement à 30 jours");
  assert.equal((await g.one("select deposit_waived_reason from erp.v_orders where id = $1", [id])).deposit_waived_reason, "Client institutionnel, paiement à 30 jours");
  // non authentifié
  const anon = await pool.connect();
  try {
    await anon.query("begin; set local role anon");
    await expectError(anon.query("select * from erp.v_orders"), /permission denied/);
    await anon.query("rollback");
  } finally {
    anon.release();
  }
});

test("documents émis figés, corrections historisées", async () => {
  const { id } = await draftOrder([{ product_id: fx.tee, color: "Noir", sizes: { S: 1 }, unit_price: 800, services: [] }]);
  await com.rpc("confirm_order", id, null);
  const d1 = await com.rpc("issue_document", "facture", id, null, null, null, null);
  await expectError(system(pool, (c) => c.query("update erp.documents set snapshot = '{}' where id = $1", [d1])), /figé/);
  await expectError(system(pool, (c) => c.query("delete from erp.documents where id = $1", [d1])), /interdite/);
  const d2 = await com.rpc("issue_document", "facture", id, null, null, null, "Erreur d'adresse");
  const docs = await com.q("select number, status, version, correction_reason from erp.v_documents where order_id = $1 and kind = 'facture' order by version", [id]);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].status, "remplace");
  assert.equal(docs[1].number, docs[0].number + "-v2");
  assert.equal(docs[1].correction_reason, "Erreur d'adresse");
  assert.notEqual(d1, d2);
});

test("caisse : dépense, clôture avec écart justifié, correction du gérant", async () => {
  await caisse.rpc("cash_out", "depense", 500, "Achat scotch");
  const sess = await caisse.one("select * from erp.v_cash_sessions where closed_at is null");
  const expected = Number(sess.current_expected);
  await expectError(caisse.rpc("close_cash", expected - 100, ""), /justifiez/);
  const r = await caisse.rpc("close_cash", expected - 100, "Erreur de rendu monnaie");
  assert.equal(Number(r.gap), -100);
  await g.rpc("cash_correction", sess.id, -100, "Rendu monnaie erroné constaté");
  const s = await caisse.one("select * from erp.v_cash_sessions where id = $1", [sess.id]);
  assert.equal(Number(s.corrections), -100);
  assert.equal(Number(s.counted_cash) - (Number(s.expected_cash) + Number(s.corrections)), 0);
});

test("imports CSV avec aperçu et doublons", async () => {
  const rows = [
    { name: "Import A", phone: "0550 99 88 77" },
    { name: "Import B", phone: "+213550998877" },
    { name: "Client 1", phone: "0661 00 00 01" },
    { name: "", phone: "0550000000" },
    { name: "Import C", phone: "abc" },
    { name: "Import D", phone: "" },
  ];
  const prev = await com.rpc("preview_client_import", rows);
  assert.deepEqual(prev.map((r) => r.status), ["nouveau", "doublon_fichier", "doublon_base", "invalide: nom manquant", "invalide: téléphone", "nouveau"]);
  const res = await com.rpc("import_clients", rows);
  assert.deepEqual(res, { created: 2, skipped: 4 });
  const stockRows = [
    { ref: "HOODIE-300", name: "Sweat capuche", color: "Gris", size: "XL", qty: "12", threshold: "3" },
    { ref: "hoodie-300", name: "Sweat capuche", color: "Gris", size: "xl", qty: "5" },
    { ref: "POLO-PIQ", color: "Noir", size: "M", qty: "20" },
    { ref: "", qty: "1" },
  ];
  const sp = await mag.rpc("preview_stock_import", stockRows);
  assert.deepEqual(sp.map((r) => r.status), ["nouveau", "doublon_fichier", "existant", "invalide: référence manquante"]);
  const sr = await mag.rpc("import_stock", stockRows, "ignorer");
  assert.deepEqual(sr, { created: 1, updated: 0, skipped: 3 });
  const h = await item(pool, "HOODIE-300", "Gris", "XL");
  assert.equal(h.physical, 12);
  assert.equal(h.alert_threshold, 3);
});

test("reprise non destructive des contacts de l'ancien ERP", async () => {
  await system(pool, async (c) => {
    await c.query("create type public.contact_type as enum ('client','prospect','fournisseur')");
    await c.query("create table public.contacts(id uuid primary key default gen_random_uuid(), type public.contact_type, name text, company_name text, email text, phone text, address text, city text, notes text, created_at timestamptz default now())");
    await c.query("insert into public.contacts(type, name, phone) values ('client','Ancien client','0555 44 33 22'), ('prospect','Sans tel',null), ('fournisseur','Fournisseur',null), ('client','Doublon','+213555443322')");
  });
  const sql = (await import("node:fs")).readFileSync(new URL("../supabase/migrations/0007_erp_legacy_import.sql", import.meta.url), "utf8");
  await system(pool, (c) => c.query(sql));
  await system(pool, (c) => c.query(sql)); // rejouable
  const rows = await g.q("select name, source from erp.v_clients where source = 'ancien_erp' order by name");
  assert.deepEqual(rows.map((r) => r.name), ["Ancien client", "Sans tel"]);
  assert.equal((await system(pool, (c) => c.query("select count(*)::int n from public.contacts"))).rows[0].n, 4, "anciennes données intactes");
});

test("transactions manuelles : solde, rejeu, droits et session fermée", async () => {
  const session = await caisse.rpc("open_cash", 0);
  const balance = async () => Number((await caisse.one("select current_expected from erp.v_cash_sessions where id=$1", [session])).current_expected);
  const opening = await balance();
  const move = (kind, amount, key) => caisse.rpc("manual_cash_move", session, kind, amount, "Mouvement de test", key);
  const [first, retry] = await Promise.all([move("entree", 1500, "test-in"), move("entree", 1500, "test-in")]);
  assert.equal(first, retry);
  await move("depense", 400, "test-out");
  assert.equal(await balance(), opening + 1100);
  await assert.rejects(move("entree", -5, "bad-amount"), /montant positif/i);
  await assert.rejects(flo.rpc("manual_cash_move", session, "entree", 10, "Test", "forbidden"), /refusé/i);
  await caisse.rpc("close_cash", opening + 1100, "");
  await assert.rejects(move("entree", 10, "closed"), /fermée/i);
});

test("photos de commande et boutons Commencer / Terminer la commande", async () => {
  const { id } = await draftOrder([{ product_id: fx.polo, color: "Noir", sizes: { L: 1 }, unit_price: 1200, services: ["flocage"], service_price: 400 }]);
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const photo = await com.rpc("add_order_photo", id, "maquette.png", "image/png", png);
  await expectError(com.rpc("add_order_photo", id, "x.pdf", "application/pdf", png), /images/);
  const f = await flo.one("select * from erp.v_files where id = $1", [photo]);
  assert.equal(f.kind, "photo");
  assert.equal(f.storage, "db");
  const d = await flo.one("select erp.file_data($1) d", [photo]);
  assert.ok(d.d.length > 10, "l'atelier voit la photo");
  await expectError(flo.rpc("start_order", id), /Confirmez/);
  await com.rpc("confirm_order", id, null);
  assert.equal(await flo.rpc("start_order", id), "en_production");
  assert.equal(await flo.rpc("finish_order", id), "prete");
  await com.rpc("remove_order_photo", photo);
  assert.equal((await com.q("select * from erp.v_files where id = $1", [photo])).length, 0);
});

test("« Commande terminée » sur un brouillon : gérant seulement, sans paiement créé", async () => {
  const { id } = await draftOrder([{ product_id: fx.polo, color: "Noir", sizes: { L: 1 }, unit_price: 1200 }], { deposit_pct: 50 });
  await expectError(flo.rpc("complete_order", id), /seul le gérant/);
  assert.equal(await g.rpc("complete_order", id), "prete");
  const o = await g.one("select status, paid from erp.v_orders where id = $1", [id]);
  assert.equal(o.status, "prete");
  assert.equal(Number(o.paid), 0, "aucun paiement inventé");
  assert.equal(await g.rpc("complete_order", id), "prete", "deuxième clic sans effet");
});

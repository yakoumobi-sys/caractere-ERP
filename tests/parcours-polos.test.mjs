// Parcours complet : 20 polos DTF + flocage, deux tailles, acompte, première pièce, contrôle croisé,
// facture, bon de livraison, Yalidine, carte fidélité et rapprochement du reversement.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, baseFixtures, actor, IDS, item, expectError, system } from "./helpers.mjs";

let pool, fx;
before(async () => {
  pool = await freshDb();
  fx = await baseFixtures(pool);
});
after(async () => pool && (await pool.end()));

test("commande de 20 polos de bout en bout", async () => {
  const com = actor(pool, IDS.commercial);
  const caisse = actor(pool, IDS.caissier);
  const flo = actor(pool, IDS.floqueur);
  const ctrl = actor(pool, IDS.controleur);
  const info = actor(pool, IDS.infographiste);
  const mag = actor(pool, IDS.magasinier);

  // 1. Prospect + normalisation + doublon
  const clientId = await com.rpc("create_client", { name: "Club Sportif Aïn Benian", phone: "0555 12 34 56", source: "instagram" });
  const c = await com.one("select * from erp.v_clients where id = $1", [clientId]);
  assert.equal(c.phone, "+213555123456");
  const dups = await com.q("select * from erp.find_duplicates($1, $2)", ["", "+213 555-12-34-56"]);
  assert.equal(dups.length, 1);
  await expectError(com.rpc("create_client", { name: "Autre", phone: "00213555123456" }), /DOUBLON/);
  const todo = await com.q("select * from erp.v_followups where client_id = $1 and status = 'a_faire'", [clientId]);
  assert.equal(todo[0].reason, "nouveau_prospect");

  // 2. Simulation, devis, envoi
  await com.rpc("add_simulation", { client_id: clientId, garment: "Polo noir", placement: "coeur", sent: true });
  const quoteId = await com.rpc("save_quote", {
    client_id: clientId, title: "Polos du club", promised_days: 10, deposit_pct: 50,
    lines: [{ product_id: fx.polo, color: "Noir", sizes: { M: 10, L: 10 }, unit_price: 1200, services: ["dtf", "flocage"], service_price: 600, placement: "coeur", print_width_cm: 10 }],
  });
  const devisDoc = await com.rpc("send_quote", quoteId);
  const q = await com.one("select * from erp.v_quotes where id = $1", [quoteId]);
  assert.equal(q.status, "envoye");
  assert.equal(Number(q.totals.ttc), 42840); // 20 × 1800 = 36 000 HT + TVA 19 %
  assert.ok(devisDoc);

  // 3. Conversion idempotente : même référence, même commande
  const orderId = await com.rpc("convert_quote", quoteId);
  assert.equal(await com.rpc("convert_quote", quoteId), orderId);
  let o = await com.one("select * from erp.v_orders where id = $1", [orderId]);
  assert.equal(o.ref, q.ref);
  assert.equal(o.status, "brouillon");
  assert.equal(Number(o.deposit_required), 21420);
  assert.equal(o.next_action, "Envoyer le BAT au client");

  // 4. BAT, accord, acompte exigé avant confirmation
  await com.rpc("set_bat", orderId, "valide", null);
  await com.rpc("set_agreement", orderId, "Accord WhatsApp du 16/11 (capture)", null);
  await expectError(com.rpc("confirm_order", orderId, null), /Acompte insuffisant/);
  await expectError(com.rpc("confirm_order", orderId, "urgence"), /gérant/);
  await expectError(caisse.rpc("record_payment", { order_id: orderId, amount: 21420, method: "especes" }), /Ouvrez la caisse/);
  await caisse.rpc("open_cash", 5000);
  const key = "pay-acompte-1";
  const [p1, p2] = await Promise.all([
    caisse.rpc("record_payment", { order_id: orderId, amount: 21420, method: "especes", idempotency_key: key }),
    caisse.rpc("record_payment", { order_id: orderId, amount: 21420, method: "especes", idempotency_key: key }),
  ]);
  assert.equal(p1, p2, "double clic : un seul paiement");
  assert.equal((await caisse.q("select * from erp.v_payments where order_id = $1", [orderId])).length, 1);

  // 5. Double clic sur Confirmer : une seule confirmation, un seul jeu de réservations et de tâches
  const res = await Promise.all([com.rpc("confirm_order", orderId, null), com.rpc("confirm_order", orderId, null)]);
  assert.deepEqual(res.sort(), ["confirmee", "confirmee"]);
  const events = await com.q("select * from erp.v_order_events where order_id = $1 and kind = 'confirmation'", [orderId]);
  assert.equal(events.length, 1);
  const tasks = await com.q("select step from erp.v_tasks where order_id = $1 order by seq", [orderId]);
  assert.deepEqual(tasks.map((t) => t.step), ["impression_dtf"], "une seule file : DTF");
  const m = await item(pool, "POLO-PIQ", "Noir", "M");
  assert.equal(m.reserved, 10);
  assert.equal(m.physical, 15);

  // 6. Atelier : file DTF, puis commande prête
  const myQueue = await info.q("select * from erp.v_tasks where assignee_id = $1 and order_id = $2", [IDS.infographiste, orderId]);
  assert.equal(myQueue.length, 1, "la commande est dans la file DTF");
  const t = Object.fromEntries((await com.q("select id, step from erp.v_tasks where order_id = $1", [orderId])).map((x) => [x.step, x.id]));
  await info.rpc("start_task", t.impression_dtf);
  assert.equal((await item(pool, "POLO-PIQ", "Noir", "M")).physical, 5, "sortie du stock au démarrage de la file DTF");
  const started = await info.one("select started_by_name, started_at from erp.v_tasks where id = $1", [t.impression_dtf]);
  assert.ok(started.started_at);
  await info.rpc("finish_task", t.impression_dtf);
  o = await com.one("select * from erp.v_orders where id = $1", [orderId]);
  assert.equal(o.status, "prete");
  assert.equal(o.next_action, "Prévenir le client : commande prête au retrait");
  assert.equal(o.progress.fabrication, 100);

  // 7. Facture, colis Yalidine en contre-remboursement, BL
  const fac = await com.rpc("issue_document", "facture", orderId, null, null, null, null);
  assert.equal(await com.rpc("issue_document", "facture", orderId, null, null, null, null), fac, "facture idempotente");
  await com.rpc("update_order_meta", orderId, { delivery_mode: "yalidine", ship_wilaya: "Alger", ship_commune: "Aïn Benian", ship_address: "Rue du port" }, null);
  const shipId = await com.rpc("create_shipment", { order_id: orderId, mode: "yalidine", tracking: "yal-test-001", cod_amount: 21420, fee: 400 });
  const bl = await com.one("select * from erp.v_documents where shipment_id = $1 and kind = 'bon_livraison'", [shipId]);
  assert.equal(bl.snapshot.ref, o.ref, "même référence du devis au BL");
  o = await com.one("select * from erp.v_orders where id = $1", [orderId]);
  assert.equal(o.status, "expediee");
  assert.equal(Number(o.balance), 21420, "le contre-remboursement attendu ne solde pas la commande");
  const cashBefore = await caisse.one("select current_expected from erp.v_cash_sessions where closed_at is null");

  // 8. Événements transporteur : doublon, désordre
  const at = new Date();
  assert.equal(await system(pool, async (cl) => (await cl.query("select erp.ingest_carrier_event('yalidine','evt-1','YAL-TEST-001','livre','Livré',$1,'{}') r", [at])).rows[0].r), "applique");
  assert.equal(await system(pool, async (cl) => (await cl.query("select erp.ingest_carrier_event('yalidine','evt-1','YAL-TEST-001','livre','Livré',$1,'{}') r", [at])).rows[0].r), "doublon");
  assert.equal(await system(pool, async (cl) => (await cl.query("select erp.ingest_carrier_event('yalidine','evt-0','YAL-TEST-001','en_transit','En transit',$1,'{}') r", [new Date(at - 3600e3)])).rows[0].r), "ignore_ancien");
  assert.equal(await system(pool, async (cl) => (await cl.query("select erp.ingest_carrier_event('yalidine','evt-2','YAL-TEST-001','livre','Livré',$1,'{}') r", [new Date(+at + 60e3)])).rows[0].r), "deja_applique");
  o = await com.one("select * from erp.v_orders where id = $1", [orderId]);
  assert.equal(o.status, "livree");
  assert.equal(Number(o.balance), 0, "COD encaissé par Yalidine pour le compte de Caractère");
  const cashAfter = await caisse.one("select current_expected from erp.v_cash_sessions where closed_at is null");
  assert.equal(cashAfter.current_expected, cashBefore.current_expected, "aucun mouvement de caisse physique pour le COD");

  // 9. Carte Privilège : une carte, un cadeau, pas de doublon
  const cards = await com.q("select * from erp.v_loyalty where client_id = $1", [clientId]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].benefit_status, "disponible");
  const pub = await system(pool, async (cl) => (await cl.query("select erp.public_card($1) r", [cards[0].token])).rows[0].r);
  assert.equal(pub.offer, "Au prochain achat, vous aurez un T-shirt caractérisé gratuit.");
  assert.equal(pub.gift_available, true);
  assert.equal(pub.phone, undefined, "le lien public ne montre que la carte et l'offre");

  // 10. Reversement Yalidine rapproché
  const cod = await caisse.one("select * from erp.v_payments where shipment_id = $1", [shipId]);
  assert.equal(cod.status, "encaisse_transporteur");
  const remId = await caisse.rpc("record_remittance", { reference: "YAL-VIR-0001", amount_received: 21020, items: [{ shipment_id: shipId, fee: 400 }] });
  assert.equal(await caisse.rpc("record_remittance", { reference: "YAL-VIR-0001", amount_received: 21020, items: [{ shipment_id: shipId, fee: 400 }] }), remId);
  const rem = await caisse.one("select * from erp.v_remittances where id = $1", [remId]);
  assert.equal(Number(rem.expected), 21020);
  assert.equal(Number(rem.gap), 0);
  assert.equal((await caisse.one("select status from erp.v_payments where shipment_id = $1", [shipId])).status, "rapproche");

  // 11. Clôture de caisse : attendu = fond + acompte espèces
  const close = await caisse.rpc("close_cash", 26420, null);
  assert.equal(Number(close.expected), 26420);
  assert.equal(Number(close.gap), 0);

  // 12. Même commande visible partout, selon les droits
  assert.ok((await com.q("select 1 from erp.v_interactions where client_id = $1 and order_id = $2", [clientId, orderId])).length > 0, "fiche client");
  assert.equal((await com.q("select id from erp.search($1)", [o.ref])).length, 1, "recherche par référence");
  assert.ok((await com.q("select id from erp.search('YAL-TEST-001')")).some((r) => r.id === orderId), "recherche par tracking");
  assert.ok((await com.q("select id from erp.search('0555123456')")).some((r) => r.id === orderId), "recherche par téléphone");
  const floOrder = await flo.one("select * from erp.v_orders where id = $1", [orderId]);
  assert.equal(floOrder.ref, o.ref, "atelier voit la commande");
  assert.equal(floOrder.total_ttc, null, "atelier ne voit pas les montants");
  assert.equal(floOrder.client_phone, null);
  assert.equal((await flo.q("select * from erp.v_payments")).length, 0, "atelier ne voit pas les paiements");
  assert.equal((await flo.q("select * from erp.v_cash_sessions")).length, 0, "atelier ne voit pas la caisse");
  assert.equal((await flo.q("select cost from erp.v_stock where cost is not null")).length, 0, "atelier ne voit pas les coûts");
  assert.ok((await caisse.q("select * from erp.v_payments where order_id = $1", [orderId])).length >= 2, "caisse");
  assert.equal((await mag.q("select * from erp.v_tasks where order_id = $1", [orderId])).length, 1);
});

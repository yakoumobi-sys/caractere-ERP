// Tests que PGlite ne permet pas : PGlite n'a qu'une seule connexion, donc ni
// les encaissements concurrents ni le verrou « for update » de
// guard_commercial_payment n'y sont réellement exercés. Ceux-ci tournent sur un
// vrai PostgreSQL, sur une base où toutes les migrations ont été appliquées.
//
//   DATABASE_URL=postgresql://… node tests/financial-concurrency.mjs
//
// Sans DATABASE_URL, le script s'arrête proprement en le disant : il ne doit ni
// échouer la CI, ni laisser croire que ces vérifications ont eu lieu.
import assert from "node:assert/strict";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(
    "DATABASE_URL absent — vérifications de concurrence NON exécutées.",
  );
  process.exit(0);
}

const ADMIN = "10000000-0000-4000-8000-0000000000c1";
const MARQUEUR = "TEST-CONCURRENCE";
let reussis = 0;

async function connecter() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  // Les gardes financières lisent auth.uid() : chaque connexion doit porter
  // l'identité de l'utilisateur, sinon current_role() renvoie NULL.
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [
    ADMIN,
  ]);
  return client;
}

async function test(nom, fn) {
  await fn();
  reussis++;
  console.log(`PASS ${nom}`);
}

const db = await connecter();

// --- Préparation ------------------------------------------------------------
await db.query("begin");
await db.query(
  `insert into auth.users(id,email) values($1,'concurrence@test.local')
     on conflict (id) do nothing`,
  [ADMIN],
);
await db.query(
  `insert into public.profiles(id,full_name,role,is_active)
     values($1,'Test concurrence','admin',true)
     on conflict (id) do update set role='admin', is_active=true`,
  [ADMIN],
);
// Le plan comptable vient de supabase/seed.sql, pas des migrations : sur une
// base seulement migrée, la validation de facture échouerait sur « Plan
// comptable incomplet ». On garantit ici les comptes dont les triggers ont
// besoin, sans toucher à ceux qui existent déjà.
await db.query(
  `insert into public.chart_of_accounts(code,name,type) values
     ('411','Clients','actif'),('512','Banque','actif'),
     ('706','Ventes de services','produit'),('4457','TVA collectée','passif'),
     ('607','Achats de marchandises','charge'),('530','Caisse (historique)','actif')
   on conflict (code) do nothing`,
);
const { rows: contactRows } = await db.query(
  "insert into public.contacts(name) values($1) returning id",
  [`${MARQUEUR} client`],
);
const contact = contactRows[0].id;
await db.query("commit");

// Une facture validée de 10 000, pour laquelle le reste dû est de 10 000.
async function factureValidee(total) {
  const { rows } = await db.query(
    "select public.save_commercial_document('invoices',null,$1,$2) id",
    [
      JSON.stringify({ contact_id: contact, status: "brouillon" }),
      JSON.stringify([
        {
          product_id: null,
          description: `${MARQUEUR} prestation`,
          quantity: 1,
          price: total,
          tax_rate: 0,
        },
      ]),
    ],
  );
  const id = rows[0].id;
  await db.query("update public.invoices set status='validee' where id=$1", [
    id,
  ]);
  return id;
}

// --- 1. Encaissements concurrents -------------------------------------------
await test(
  "Deux encaissements simultanés ne peuvent pas dépasser le reste dû",
  async () => {
    const facture = await factureValidee(10000);
    const a = await connecter();
    const b = await connecter();

    // Les deux transactions tentent d'encaisser 8 000 sur une facture de
    // 10 000. Le « for update » de guard_commercial_payment doit sérialiser :
    // la première passe, la seconde doit être refusée.
    await a.query("begin");
    await b.query("begin");

    await a.query(
      "insert into public.payments(invoice_id,amount,method,paid_at) values($1,8000,'especes',current_date)",
      [facture],
    );

    // b bloque sur le verrou de ligne tant que a n'a pas terminé.
    const encaissementB = b.query(
      "insert into public.payments(invoice_id,amount,method,paid_at) values($1,8000,'especes',current_date)",
      [facture],
    );

    await a.query("commit");

    await assert.rejects(
      encaissementB,
      /dépasse le reste à payer/,
      "Le second encaissement concurrent aurait dû être refusé",
    );
    await b.query("rollback");

    const { rows } = await db.query(
      "select coalesce(sum(amount),0) total from public.payments where invoice_id=$1",
      [facture],
    );
    assert.equal(
      Number(rows[0].total),
      8000,
      "Un seul des deux encaissements doit avoir été enregistré",
    );

    const { rows: etat } = await db.query(
      "select amount_paid,status from public.invoices where id=$1",
      [facture],
    );
    assert.equal(Number(etat[0].amount_paid), 8000);
    assert.equal(etat[0].status, "validee");

    await a.end();
    await b.end();
  },
);

// --- 2. Jeton d'idempotence sous concurrence --------------------------------
await test(
  "Le même identifiant de requête rejoué en parallèle ne crée qu'un règlement",
  async () => {
    const facture = await factureValidee(5000);
    const jeton = "20000000-0000-4000-8000-0000000000c2";
    const a = await connecter();
    const b = await connecter();

    const insertion = (client) =>
      client
        .query(
          "insert into public.payments(invoice_id,amount,method,paid_at,request_id) values($1,1000,'especes',current_date,$2)",
          [facture, jeton],
        )
        .then(
          () => "ok",
          (e) => e.message,
        );

    const [ra, rb] = await Promise.all([insertion(a), insertion(b)]);

    const { rows } = await db.query(
      "select count(*) n from public.payments where request_id=$1",
      [jeton],
    );
    assert.equal(
      Number(rows[0].n),
      1,
      `Un seul règlement attendu (a=${ra}, b=${rb})`,
    );

    await a.end();
    await b.end();
  },
);

// --- 3. Double sortie de stock : livraison atelier + facturation ------------
// Section 3 du dossier : « L'absence de double sortie de stock lors de la
// livraison et de la facturation d'une même vente. » Ce test constate le
// comportement réel plutôt que de le supposer.
await test(
  "Livraison atelier puis facture liée : une seule sortie de stock",
  async () => {
    const { rows: p } = await db.query(
      `insert into public.products(sku,name,purchase_cost,sale_price,track_inventory)
         values($1,$2,100,200,true) returning id`,
      [`${MARQUEUR}-SKU`, `${MARQUEUR} article`],
    );
    const produit = p[0].id;
    const { rows: w } = await db.query(
      "select id from public.warehouses where is_default limit 1",
    );
    if (!w.length) {
      await db.query(
        "insert into public.warehouses(name,is_default) values($1,true)",
        [`${MARQUEUR} entrepôt`],
      );
    }
    await db.query(
      `insert into public.stock_moves(product_id,warehouse_id,quantity,type,reference)
         select $1,id,100,'entree',$2 from public.warehouses where is_default limit 1`,
      [produit, MARQUEUR],
    );

    const stock = async () =>
      Number(
        (
          await db.query(
            "select coalesce(sum(quantity),0) q from public.stock_moves where product_id=$1",
            [produit],
          )
        ).rows[0].q,
      );
    assert.equal(await stock(), 100);

    // a) Livraison d'une commande atelier portant 10 unités.
    const { rows: o } = await db.query(
      `insert into public.pipeline_orders(number,contact_id,status,technique,order_total)
         values($1,$2,'prete','dtf',2000) returning id`,
      [`${MARQUEUR}-CMD`, contact],
    );
    const commande = o[0].id;
    await db.query(
      "insert into public.pipeline_order_items(pipeline_order_id,product_name,quantity,product_id) values($1,$2,10,$3)",
      [commande, `${MARQUEUR} article`, produit],
    );
    await db.query(
      "update public.pipeline_orders set status='livree' where id=$1",
      [commande],
    );
    const apresLivraison = await stock();
    assert.equal(apresLivraison, 90, "La livraison sort 10 unités");

    // b) Invoice created from the explicit atelier relationship.
    const { rows: f } = await db.query("select public.create_pipeline_invoice($1) id",[commande]);
    await db.query("update public.invoices set status='validee' where id=$1", [
      f[0].id,
    ]);

    const apresFacture = await stock();
    assert.equal(
      apresFacture,
      90,
      "La facture liée ne sort pas le stock déjà livré.",
    );
  },
);

// --- 4. Immuabilité des écritures générées (migration 0040) -----------------
await test(
  "Une écriture générée ne peut être ni modifiée ni supprimée, une écriture manuelle si",
  async () => {
    const facture = await factureValidee(3000);
    await db.query(
      "insert into public.payments(invoice_id,amount,method,paid_at) values($1,3000,'especes',current_date)",
      [facture],
    );
    const { rows } = await db.query(
      "select id from public.journal_entries where source_type='payment' order by created_at desc limit 1",
    );
    const ecriture = rows[0].id;

    await assert.rejects(
      db.query("update public.journal_entries set description='falsifiée' where id=$1", [ecriture]),
      /contre-écriture/,
      "Une écriture générée ne doit pas être modifiable",
    );
    await assert.rejects(
      db.query("delete from public.journal_entries where id=$1", [ecriture]),
      /contre-écriture/,
      "Une écriture générée ne doit pas être supprimable",
    );
    await assert.rejects(
      db.query("update public.journal_lines set debit=1 where entry_id=$1", [ecriture]),
      /contre-écriture/,
      "Les lignes d'une écriture générée ne doivent pas être modifiables",
    );

    // Le règlement et son écriture restent cohérents.
    const { rows: verif } = await db.query(
      "select count(*) n from public.journal_lines where entry_id=$1",
      [ecriture],
    );
    assert.equal(Number(verif[0].n), 2);

    // Une écriture manuelle (source_type nul) reste corrigeable.
    const { rows: m } = await db.query(
      `insert into public.journal_entries(entry_date,reference,description)
         values(current_date,$1,'saisie manuelle') returning id`,
      [MARQUEUR],
    );
    await db.query(
      "update public.journal_entries set description='corrigée' where id=$1",
      [m[0].id],
    );
    await db.query("delete from public.journal_entries where id=$1", [m[0].id]);
  },
);

// The journal is immutable: retain evidence on this disposable test database.
// Never try to delete posted financial data to clean up a test run.
console.log(`${reussis} vérification(s) de concurrence passée(s).`);
console.log(
  "Note : les données de test portent le marqueur " +
    MARQUEUR +
    " ; cette base est jetable.",
);
await db.end();

# Caractère ERP

ERP interne de l'atelier de personnalisation textile **Caractère** (Aïn Benian) : ce qu'il faut **vendre, produire, expédier, relancer ou encaisser aujourd'hui**, en français, sur téléphone.

Parcours : Prospect → Simulation du logo → Devis → Accord + acompte → Production ou préparation → Contrôle → Livraison → Fidélité et relance. Une commande garde **la même référence du devis au bon de livraison**. Six modules : **Clients, Ventes, Commandes, Atelier, Stock, Caisse**, plus l'accueil **Aujourd'hui** et la recherche (téléphone, nom, référence, tracking).

Stack : Next.js 14 (App Router, server actions) + TypeScript + Tailwind · Supabase Postgres / Auth / Storage · Vercel. Montants en DZD, fuseau Africa/Algiers.

## Lancer la démo (5 minutes, sans compte Supabase)

Prérequis : Node 20+, PostgreSQL 14+ installé localement (binaires `initdb`/`pg_ctl` dans le PATH ou `PG_BIN=/chemin/bin`).

```bash
npm install
npm run db:reset      # crée la base locale (port 54329), applique les migrations, charge les données fictives, écrit .env.local
npm run dev           # http://localhost:3000 → choisir un profil
```

Profils de démo : Karim (gérant), Sara et Mehdi (commerciaux), Nadia (caisse), Yanis (infographiste), Amine (floqueur), Lina (contrôle + magasin, habilitée 1re pièce), Samir (brodeur). Pour montrer à l'équipe : `npm run build && npm start`.

## Mise en production (Supabase + Vercel)

1. **Supabase** : créer le projet, puis appliquer les migrations : `DATABASE_URL=<Session pooler> npm run db:migrate`. Elles créent le schéma `erp` sans toucher aux tables existantes (`public.*` de l'ancien ERP) ; la migration 0007 reprend les anciens contacts `public.contacts` en clients, sans doublon. Ne **pas** exposer le schéma `erp` dans l'API REST Supabase : l'application y accède côté serveur.
2. **Storage** : créer un bucket **privé** `erp-prive` (logos, BAT, preuves d'accord). Les fichiers ne sont servis que par `/api/files/:id`, après contrôle des droits.
3. **Équipe** : créer le premier gérant en SQL (SQL Editor Supabase) :
   `insert into erp.staff(full_name, email, roles, can_validate_first_piece) values ('Nom', 'gerant@…', '{gerant}', true);`
   puis créer son compte dans Supabase Auth (même e-mail) : il est rattaché à la première connexion. Les autres membres s'ajoutent dans **Réglages**.
4. **Vercel** : importer le dépôt, renseigner les variables de `.env.example` (`AUTH_MODE=supabase`). Le cron `/api/cron/yalidine` (quotidien sur le plan gratuit) synchronise les colis si les clés Yalidine sont fournies.

## Import CSV

Clients (`/clients/import`) et stock (`/stock/import`) : fichier `;` ou `,`, aperçu avant import, numéros normalisés (+213), doublons (fichier et base) et lignes invalides signalés puis ignorés. Modèles : `public/modeles/clients.csv`, `public/modeles/stock.csv`.

## Tests

```bash
npm test                                   # 16 scénarios métier sur une vraie base PostgreSQL (caractere_test)
npm run build && npm start &               # puis, base de démo fraîche (npm run db:reset) :
npm run test:e2e                           # parcours navigateur, mobile (Pixel 7) et bureau
```

`npm test` couvre : 20 polos DTF + flocage (deux tailles, acompte, double clic, première pièce, contrôle croisé, facture, BL, Yalidine COD, événements en double et hors ordre, carte Privilège, reversement rapproché, clôture de caisse, visibilité par rôle), vente comptoir, devis sans réponse, refus marketing, rupture + achat + réception, défaut atelier, annulation après acompte, modification de quantité, livraison partielle, règles du T-shirt caractérisé et de laize, droits en base, documents figés, caisse et corrections, imports CSV, reprise de l'ancien ERP.
En CI, définir `TEST_DATABASE_URL` (voir `.github/workflows/ci.yml`). Si Playwright ne trouve pas son navigateur : `npx playwright install chromium` ou `PW_CHROMIUM=/chemin/chrome`.

## Architecture et sécurité

- `supabase/migrations/` : schéma `erp`, logique métier en fonctions PostgreSQL **transactionnelles** (verrous de ligne, clés d'idempotence) : confirmation, réservations, paiements, documents, colis. Double clic et accès simultanés ne créent ni doublon ni réservation en trop.
- Droits par poste **en base** : les rôles n'ont accès à aucune table ; ils lisent des vues filtrées (lignes et colonnes) et écrivent via des fonctions qui vérifient `erp.can()`. Montants, caisse et coûts masqués à l'atelier. La matrice est dans `erp.role_can` (miroir d'affichage : `lib/perms.ts`).
- Le serveur Next.js ouvre chaque requête avec `set local role authenticated` et les claims de l'utilisateur, comme PostgREST.
- Documents émis figés (trigger) ; une correction crée une nouvelle version, l'ancienne est conservée.
- Yalidine : création de colis via API (facultative), saisie manuelle, webhook `/api/webhooks/yalidine` et synchronisation planifiée ; les événements sont idempotents et tolérants au désordre.

## Paramètres à renseigner (Réglages)

Identité légale (raison sociale, NIF, NIS, RC, AI, RIB, mentions), taux et application de la TVA, préfixes de numérotation, conditions d'acompte, délais, photo du T-shirt caractérisé, laize réelle des machines, équipe et habilitations « première pièce ». Côté intégrations : clés et secret webhook Yalidine, bucket Storage, `CRON_SECRET`.

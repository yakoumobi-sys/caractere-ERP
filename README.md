# Caractère ERP

ERP interne pour **Caractère** — CRM, ventes & facturation, achats, stock et comptabilité de base,
construit avec Next.js 14 (App Router), TypeScript, Tailwind CSS et Supabase (Postgres + Auth + RLS).

## Modules

| Module | État | Contenu |
|---|---|---|
| Suivi de production | ✅ Complet | Parcours réel de la commande : Réception WhatsApp → Commercial → Atelier DTF/Broderie → Flocage → retour Commercial → Client. Kanban, assignation par employé/département, historique horodaté ("depuis quand"), statut auto (en cours/livré) |
| CRM | ✅ Complet | Contacts (clients/prospects/fournisseurs), opportunités (pipeline kanban), historique d'activités |
| Ventes & Facturation | ✅ Complet | Devis → Commande → Facture → Paiement, numérotation auto, comptabilisation auto |
| Achats | ✅ Complet | Fournisseurs, commandes fournisseurs, réception avec entrée de stock automatique |
| Stock | ✅ Complet | Produits, catégories, entrepôts, journal des mouvements, niveaux calculés, alertes de rupture |
| Comptabilité | ✅ Base fonctionnelle | Plan comptable, journal (écritures auto + saisie manuelle équilibrée), balance & résultat |
| RH | 🚧 Socle | Fiches employés (CRUD) — congés, paie à ajouter |
| Projets | 🚧 Socle | Suivi de projets liés aux clients (CRUD) — tâches, temps passé à ajouter |
| Point de vente | ⏳ À venir | Non démarré |

Le cœur technique (auth, rôles, base de données, sécurité RLS, comptabilisation automatique) est
posé pour l'ensemble de l'ERP : ajouter un nouveau module consiste à ajouter une table + une
configuration d'écran plutôt qu'à reconstruire l'infrastructure.

## Stack technique

- **Next.js 14** (App Router, Server Actions, Server Components)
- **Supabase** : Postgres, Auth (email/mot de passe), Row Level Security
- **TypeScript**, **Tailwind CSS**
- Comptabilisation et mouvements de stock automatisés par **triggers Postgres** (voir
  `supabase/migrations/0002_functions_triggers.sql`) — au plus près du modèle des ERP historiques
  (la base de données garantit la cohérence, pas seulement l'application).

## Démarrage

### 1. Créer le projet Supabase

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, exécuter dans l'ordre :
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_functions_triggers.sql`
   - `supabase/migrations/0003_rls.sql`
   - `supabase/seed.sql`
3. Dans **Project Settings → API**, récupérer l'URL du projet et la clé `anon public`.

### 2. Configurer l'application

```bash
cp .env.example .env.local
# renseigner NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) → tu es redirigé vers `/login`.

### 3. Premier compte

Clique sur **"Premier lancement ? Créer le compte administrateur"** : le tout premier utilisateur
créé devient automatiquement `admin` (voir le trigger `handle_new_user` dans la migration 0002).
Les comptes suivants sont créés en rôle `readonly` par défaut — à changer depuis
**Paramètres → Utilisateurs**.

### 4. Warehouse & plan comptable

Le fichier `supabase/seed.sql` crée un entrepôt par défaut et un plan comptable simplifié
(comptes 411, 706, 4457, 512...) nécessaires à la comptabilisation automatique des factures et
paiements. Sans ces comptes, les factures se valident mais aucune écriture n'est générée
(un message est simplement affiché dans les logs Postgres).

### 5. Équipe & parcours de commande

`supabase/seed.sql` crée aussi les fiches RH de l'équipe (Lilia, Lydia, Kholoud, Abderahmane,
Hafid, Imene, Nesro, Manel, Ikram, Hanane, Aymen) rattachées à leur département, utilisées pour
l'assignation dans **Suivi de production**.

## Suivi de production

Le module central de Caractère : chaque commande suit un parcours fixe, modélisé en base
(`pipeline_orders` + `pipeline_stage_log`, migration `0004_production_pipeline.sql`) :

```
Réception WhatsApp (Lilia/Lydia)
      ↓
  Commercial (Kholoud/Abderahmane/Hafid)
      ↓
  Atelier DTF (Imene/Nesro)  ─ ou ─  Atelier Broderie (Manel)
      ↓
  Flocage (Ikram/Hanane/Aymen)
      ↓
  retour Commercial
      ↓
  Livré au client
```

- Chaque commande entre en base dès la réception (le client est créé/rattaché immédiatement).
- Le sélecteur "assigné à" ne propose que les employés du département correspondant à l'étape.
- Chaque changement d'étape est journalisé (`pipeline_stage_log`) : on sait qui a fait quoi et
  **depuis quand** la commande est dans son étape actuelle (affiché sur chaque carte).
- Le `status` (`en_cours` / `livre`) est une colonne générée par Postgres à partir de l'étape —
  impossible qu'il se désynchronise.

## Rôles

`admin`, `manager`, `sales`, `purchasing`, `accounting`, `stock`, `hr`, `readonly`.

- Tout utilisateur actif peut lire l'ensemble des données (application interne mono-société).
- L'écriture est bloquée pour le rôle `readonly`.
- Le plan comptable et le journal comptable ne sont modifiables que par `admin` / `accounting`.
- La fiche société et la gestion des rôles utilisateurs sont réservées à `admin`.

Voir `supabase/migrations/0003_rls.sql` pour le détail des policies.

## Automatisations métier (triggers Postgres)

- **Numérotation** : `DEV-2026-0001`, `CMD-2026-0001`, `FAC-2026-0001`, `BC-2026-0001`.
- **Totaux** : recalculés automatiquement à chaque ajout/modification/suppression de ligne.
- **Facture validée** → écriture comptable (Client / Vente / TVA collectée) + sortie de stock des
  produits suivis.
- **Paiement enregistré** → écriture comptable (Banque / Client), mise à jour du solde et passage
  au statut "payée" si le solde est nul.
- **Commande fournisseur marquée "reçue"** → entrée de stock automatique sur l'entrepôt par défaut.
- **Écriture manuelle** : un contrôle bloque toute écriture dont débit ≠ crédit.

## Déploiement

Le projet est prêt pour [Vercel](https://vercel.com) : connecter le repo, renseigner les variables
d'environnement (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) et déployer.

## Roadmap suggérée

1. RH : congés, notes de frais, plannings.
2. Projets : tâches, temps passé, facturation au temps passé.
3. Point de vente (POS) pour la vente en boutique.
4. Export PDF des devis/factures, envoi par email.
5. Rapprochement bancaire, export FEC (obligation légale française).
6. Multi-entrepôts avancé (transferts, inventaires tournants).

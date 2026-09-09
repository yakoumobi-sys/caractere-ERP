# Caractère — CRM, facturation et caisse

Audit du code et première refonte, 9 septembre 2026. Base de travail : commit `2f869774410b2051aa9aaffec58c13469f0a2e63`.

Mise à jour : intégration du commit `5c18a47efbc227e777807fa8c28e7f054eea2795` (stock et réparation des migrations) avant livraison. La migration de cette refonte porte le numéro 0039 afin de préserver la nouvelle migration stock 0038.

## Conclusion

L’ERP dispose déjà de nombreux modules, mais leur articulation financière est incomplète. La priorité est de fiabiliser les opérations avant d’ajouter des modules. Cette livraison corrige les parcours CRM, documents commerciaux, encaissements et caisse sans remplacer l’architecture Next.js/Supabase ni modifier les données de production.

## Défauts constatés dans le code

| Priorité | Constat | Conséquence | Correction livrée |
|---|---|---|---|
| Critique | `saveDocument` modifiait l’en-tête, supprimait les lignes, puis les réinsérait dans des requêtes séparées | Document partiellement enregistré en cas d’échec | Transaction PostgreSQL : tout réussit, ou tout est annulé |
| Critique | `post_order_payment_journal` créait un en-tête sans lignes comptables | Encaissement absent des soldes comptables | Deux lignes équilibrées ; paiement bloqué si comptes manquants |
| Élevée | `post_payment_journal` débitait 512 quel que soit le moyen de règlement | Espèces confondues avec la banque | 53 espèces, 512 virements, 511 règlements à remettre, en conservant la numérotation du dépôt |
| Élevée | Pas de contrôle robuste des montants et trop-perçus | Paiements négatifs, excessifs ou doublés | Contrôles serveur et base, verrou du document, identifiant de requête pour les formulaires de paiement |
| Élevée | Contenu des en-têtes de factures validées encore modifiable | Facture désynchronisée du journal | En-tête et lignes figés, statut payé dérivé des règlements |
| Élevée | Conversion en plusieurs requêtes sans reprise fiable | Documents incomplets ou dupliqués | Conversion atomique ; une nouvelle tentative retrouve la destination existante |
| Élevée | Échec de l’acompte initial uniquement journalisé côté serveur | Utilisateur non averti | Alerte sur la commande créée |
| Fonctionnelle | Opportunités sans relance ni prochaine action | Prospects difficiles à suivre | Action, échéance, responsable, origine, motif de perte et filtres |
| Fonctionnelle | Menu CRM contenant stock/comptabilité, sans accès au pipeline ni aux factures | Parcours peu lisibles | Espaces Commercial, Catalogue/achats, Comptabilité |

## Parcours livrés

- **Clients** : recherche nom/entreprise/téléphone, filtrage par type, pagination, accès WhatsApp et historique des dernières commandes et factures.
- **Opportunités** : étapes commerciales adaptées, recherche, vues en cours/à relancer/sans date/mes opportunités/clôturées, totaux du périmètre chargé. Limite explicitement indiquée à 1 000 opportunités.
- **Factures** : indicateurs agrégés dans la base, échéances, impayés, paiements partiels, recherche par numéro, pagination, aperçu imprimable/PDF via le navigateur. Pas de prestataire PDF ajouté.
- **Documents commerciaux** : sauvegarde atomique pour devis, commandes, factures et commandes fournisseur ; dates par défaut ; validation des lignes ; facture validée uniquement après sauvegarde du brouillon. Les nouveaux taux manuels sont à 0 pour éviter d’imposer arbitrairement le taux 20 présent dans l’ancien formulaire. Les taux des produits existants sont conservés et doivent être vérifiés selon le dossier.
- **Caisse** : solde comptable initial/final de la période, entrées/sorties, journal paginé, encaissements factures et commandes présentés séparément, dépenses et transferts banque/caisse avec motif. Saisie des mouvements manuels réservée à l’administrateur et à la comptabilité.
- **Paiements** : les quatre rôles admin/manager/ventes/comptabilité peuvent encaisser ; règlements enregistrés immuables. L’interface n’envoie aucun message automatiquement et le lien WhatsApp ouvre simplement la conversation.

## Limites importantes et suite recommandée

1. **Deux circuits de vente distincts subsistent.** `pipeline_orders`/`order_payments` suivent l’atelier ; `sales_orders`/`invoices`/`payments` suivent les documents commerciaux. Il n’existe pas de correspondance fiable permettant de les fusionner automatiquement. La caisse les expose séparément. Ne pas ressaisir sur une facture un paiement déjà enregistré à l’atelier. La prochaine évolution structurante doit relier explicitement chaque commande atelier à sa facture et imputer les acomptes via une transaction, après rapprochement des données existantes.
2. **Pas de reprise automatique de l’historique comptable.** Les anciens en-têtes sans lignes et les espèces déjà enregistrées en banque restent à rapprocher des justificatifs. Le nouveau solde de caisse reflète les écritures du compte 53, pas un comptage physique certifié. Définir et reprendre le solde initial avec la personne qui tient la comptabilité.
3. **Avoirs, remboursements, clôture quotidienne et rapprochement Yalidine** ne sont pas implémentés. Les annulations et modifications directes de paiements sont bloquées plutôt que de laisser des soldes incohérents. Les règlements non bancaires/non espèces sont en compte d’attente et nécessitent une remise/conciliation.
4. **Édition de factures** : la vue imprimable reprend les informations existantes de l’entreprise. Elle ne constitue pas une certification de conformité fiscale. Les identifiants et paramètres fiscaux de l’entreprise doivent être complétés et vérifiés ; aucun numéro ni taux légal n’a été inventé.
5. **Stock** : la mise à jour parallèle intégrée à cette branche consolide les mouvements dans `stock_moves` (migration 0038), conserve l’ancien journal pour historique et ajoute la gestion de stock. Cette refonte préserve ces changements ; ses tests financiers ciblés ne certifient pas la reprise du stock réel.
6. **CRM** : recherche et suivi opérationnel ajoutés, mais pas de fusion automatique des doublons ni d’import massif de conversations. Les sélecteurs de relations existants restent limités par la configuration Supabase ; un sélecteur distant sera à prévoir pour les grands volumes.
7. **Montants non renseignés** : une commande doit avoir un total positif avant encaissement. Cette règle évite de présenter un reste dû fictif et peut demander une correction préalable de commandes anciennes.

## Vérification réalisée

- Compilation de production Next.js réussie, avec deux avertissements préexistants dans `components/production/order-details-fields.tsx` concernant les dépendances d’un `useEffect`.
- Dix scénarios d’intégration PostgreSQL via PGlite : rollback intégral après erreur de ligne ; rejets des documents invalides ; verrouillage après validation ; imputation espèces et paiement partiel/final ; rejet des trop-perçus ; reprise idempotente d’un paiement ; conversions répétées ; écritures et soldes de commande ; mouvement manuel de caisse ; agrégats de caisse et refus du rôle lecture seule.
- Tests exécutés sur le vrai schéma commercial et ses triggers, avec une fixture minimale pour les dépendances du pipeline. Cela ne rejoue pas toutes les migrations historiques ni toutes les intégrations externes. Le test ne simule pas plusieurs connexions PostgreSQL concurrentes.
- Aucune connexion à la base de production, aucun envoi WhatsApp/SMS, aucune commande de livraison créée. Pas de test visuel dans un navigateur ni de vérification sur des données réelles.

## Installation et vérification avant mise en service

La migration `0039_commercial_cash_integrity.sql` et le code doivent être livrés ensemble, après la migration stock 0038. Le script existant `npm run db:migrate` possède la transaction et le registre de migrations : ne pas marquer 0039 comme appliquée avec `--baseline`.

1. Restaurer une sauvegarde récente sur une base de test et comparer son schéma aux migrations du dépôt. Le dépôt documente déjà un historique Supabase divergent : un build réussi ne prouve pas que le schéma réel est identique.
2. Appliquer les migrations manquantes jusqu’à 0039 sur cette copie avec le script de migration. Le workflow du dépôt applique les migrations lors d’un push sur `main` ; cette livraison reste dans une branche séparée.
3. Vérifier les comptes 53/512/511/4191/411, les droits commerciaux et les montants des commandes ouvertes. Rapprocher les encaissements historiques, sans inventer de montant initial.
4. Rejouer une opération complète avec un rôle ventes et un rôle comptabilité : devis, commande, facture brouillon, validation, paiement partiel puis solde, contrôle caisse/journal et impression.
5. Exécuter `npm ci`, `npm run test:finance` et `npm run build`. Les tests sont autonomes et ne requièrent aucune clé Supabase.
6. Organiser la mise à jour du schéma et de l’application ensemble. L’ancien formulaire écrit les documents en plusieurs requêtes ; éviter les saisies pendant le basculement.

Les vérifications de la base réelle et la reprise comptable sont encore nécessaires avant de qualifier cet ERP de fiable en production sur l’ensemble de ses modules.

---

## Revue d'intégration (session Claude Code)

Le patch a été intégré fichier par fichier plutôt qu'appliqué en bloc, puis
vérifié. Ce qui suit corrige ou complète la livraison ci-dessus.

### Corrections apportées au patch

| Constat | Conséquence | Correction |
|---|---|---|
| `0039` posait quatre `create trigger` et une `create policy` sans `drop … if exists` | La migration n'était pas rejouable : elle cassait la propriété acquise en 0038, où toute la chaîne se rejoue sur une base déjà construite | `drop trigger/policy if exists` avant chaque création ; rejeu vérifié |
| Les sections `Commercial` et `Catalogue & achats` renommées dans la barre latérale n'existaient pas dans `NAV_ICONS` | Seules sections du menu affichées sans icône | Entrées ajoutées dans `components/icons.tsx` |
| Immuabilité du journal non traitée, alors que la revue la demandait | `journal_entries_write` donne à `admin`/`accounting` un droit `for all` : un `UPDATE` ou `DELETE` direct désynchronisait une écriture de son règlement, sans trace | Migration `0040_journal_immuable.sql` : les écritures portant un `source_type` sont figées ; les saisies manuelles restent corrigeables |

### Vérifications ajoutées

Le patch signalait ne pas pouvoir tester la concurrence — PGlite n'ouvre qu'une
connexion. Un PostgreSQL 16 réel étant disponible, `tests/financial-concurrency.mjs`
(`npm run test:concurrency`, sur `DATABASE_URL`) couvre ce que PGlite ne peut pas :

1. **Encaissements concurrents.** Deux transactions tentent 8 000 sur une facture
   de 10 000 : le `for update` de `guard_commercial_payment` sérialise, la seconde
   est refusée, la facture reste à 8 000 payés. Le verrou fait bien son travail.
2. **Jeton d'idempotence en parallèle.** Deux insertions simultanées du même
   `request_id` ne produisent qu'un règlement.
3. **Double sortie de stock** (point ouvert de la revue, voir ci-dessous).
4. **Immuabilité du journal**, apportée par 0040.

Le script s'arrête proprement sans `DATABASE_URL` : il ne fait pas échouer la CI
et n'affirme pas avoir vérifié ce qu'il n'a pas pu exécuter.

### Point ouvert confirmé : la double sortie de stock est réelle

La revue demandait de vérifier « l'absence de double sortie de stock lors de la
livraison et de la facturation d'une même vente ». Le test 3 la reproduit :

    stock initial                              100
    commande atelier livrée (10 unités)         90   ← trigger de 0038
    facture validée pour les mêmes 10 unités    80   ← post_invoice_journal (0021)

Les deux circuits décrémentent chacun de leur côté. Ce n'est corrigeable qu'en
reliant explicitement commande atelier et facture — le chantier de la section 4
du dossier, qui demande un modèle métier et des données de rapprochement que je
n'ai pas. Je ne l'ai donc pas inventé. Le test verrouille le comportement
constaté : le jour où la liaison existera, il échouera et devra être réécrit
avec la règle retenue.

**En attendant, la consigne opérationnelle est stricte** : une vente livrée par
l'atelier ne doit pas être re-facturée par le circuit commercial pour les mêmes
articles suivis en stock, sous peine de sortir la marchandise deux fois.

### Ce qui n'a pas été vérifié

- Aucun accès à la base de production : le schéma réel n'a pas été comparé.
- Aucun test navigateur : impression A4, navigation mobile, contraste et états
  vide/erreur/chargement restent à contrôler à l'œil.
- Le reformatage Prettier du patch n'a pas été repris sur les fichiers modifiés
  (aucune vérification de format en CI) ; seules les modifications de
  comportement l'ont été.

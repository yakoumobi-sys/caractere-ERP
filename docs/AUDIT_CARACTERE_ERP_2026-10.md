# Caractère ERP — audit et refonte opérationnelle du 9 octobre 2026

Ce livrable améliore le dépôt existant. Il ne certifie pas un ERP « parfait » : les données de production, le paramétrage fiscal, les connexions externes et l’usage réel par l’équipe n’ont pas été vérifiés. Les migrations sont préparées sur une branche dédiée pour examen avant fusion, sans déploiement en production. Le paquet de revue contient les sources modifiées et un patch applicable.

## Changements livrés

| Domaine | Problème constaté dans le code | Comportement après modification |
|---|---|---|
| Ventes / atelier | Aucune liaison commande atelier–facture, donc deux sources d’encaissement et de sortie de stock | Une commande atelier peut créer sa facture liée. Une liaison unique empêche la création répétée de brouillons pour la même commande. |
| Stock | Livraison puis facture des mêmes articles : double sortie | Pour une facture liée, le stock sort exclusivement à la livraison atelier. Les factures indépendantes conservent leur sortie lors de la validation. |
| Acomptes | Les avances restaient dans leur circuit atelier | La validation de la facture impute les avances déjà reçues du compte 4191 au compte 411, sans nouvel encaissement. Les règlements suivants passent par la commande et mettent aussi la facture à jour. |
| Base neuve | `recompute_order_payment` utilisait `paid_at`, absent des migrations | La migration 0041 crée la colonne manquante. Le test du parcours complet reproduisait l’échec avant ce correctif. |
| Conservation | Commandes et lignes encore supprimables ou modifiables malgré livraison / historique | Suppression des commandes avec règlement, facture ou livraison interdite. Articles figés après livraison ou facture validée. Une commande vierge reste supprimable par la direction. |
| Stock manuel | Toute personne active hors lecture seule pouvait intervenir | Mouvements / transferts réservés à admin, manager, stock et achats, avec politiques de base et contrôles serveur. Journal append-only : correction par un nouveau mouvement. |
| Transferts | Aucun contrôle du disponible | Transfert atomique, rejet du stock insuffisant et des quantités nulles, négatives ou non finies. Verrou produit partagé avec les écritures de stock. |
| Préparation | Date promise, BAT et blocages non centralisés | Fiche commande : date promise, état du BAT, blocage, qualité et emballage. Écran `/operations` avec filtres et pagination, plus alertes de réapprovisionnement. |
| Caisse | Aucun comptage / clôture quotidienne | Comptage physique comparé au solde comptable. Écart expliqué et conservé. Les espèces de la période clôturée ne peuvent plus être ajoutées ou modifiées. Les virements restent possibles. |
| CRM | Client non segmenté, dette calculée sur l’atelier seulement | Segments entreprise / POD / particulier / partenaire, origine du contact. Solde intégrant atelier et factures indépendantes, sans additionner les factures liées une seconde fois. |
| Permissions génériques | Matrices dupliquées et incohérentes ; configuration des champs transmise par le navigateur | Matrice unique application, matrices restrictives en base. Le serveur choisit désormais les tables, champs et routes depuis sa propre configuration. Les rôles RH / comptabilité / stock disposent des formulaires métier correspondants. |
| Confidentialité | Lecture des documents financiers par tous les profils actifs | Factures, devis, règlements et journal sont réservés en lecture aux rôles direction / ventes / comptabilité. Cela ne masque pas encore toutes les colonnes financières des tables opérationnelles. |

## Mode d’emploi

### Commande → facture → paiement → livraison

1. Créer la commande via le parcours atelier existant, renseigner ses articles et son total TTC.
2. Enregistrer les versements sur la commande, une seule fois.
3. Sur sa fiche, cliquer **Créer la facture liée**.
4. Vérifier le brouillon avant validation : le modèle atelier ne stocke pas les prix unitaires négociés ni la fiscalité. Le brouillon utilise donc un **lot global**, avec les articles, couleurs et tailles dans sa désignation ; le taux zéro est une valeur de brouillon à vérifier, pas une décision fiscale. On peut remplacer ses lignes avant validation, en conservant le total TTC de la commande.
5. À la validation, les avances sont imputées à la facture. On continue à encaisser sur la commande ; sa facture reprend le payé et le reste dû. Une tentative d’encaissement supplémentaire sur la facture liée est refusée en base.
6. La livraison atelier sort le stock. L’ordre facture / livraison est indifférent : la facture liée ne le décrémente jamais.

Les devis et commandes commerciales historiques restent disponibles. Leur conversion n’a pas été fusionnée automatiquement avec le parcours atelier. Pour une commande atelier, utiliser sa facture liée plutôt que créer une facture indépendante pour les mêmes articles.

### Préparation et priorités

Renseigner une date promise et la préparation sur la fiche commande. L’écran **Priorités atelier** montre les commandes ouvertes, les retards, les blocages et les BAT à traiter. Les contrôles sont un suivi explicite ; ils ne bloquent pas automatiquement le passage en production ou la livraison. Le type « BAT non requis » doit être choisi pour les commandes qui n’en nécessitent pas.

### Caisse

Compter réellement les espèces, puis clôturer depuis **Caisse & encaissements**. L’écart nécessite un motif. La clôture conserve un instantané ; elle ne crée pas une écriture destinée à faire disparaître cet écart. Une correction nécessite un traitement comptable justifié. Clôturer une date fige également les dates précédentes. Le solde d’ouverture doit avoir été repris et rapproché au préalable.

## Fonctions à compléter pour une couverture complète de Caractère

| Priorité | Chantier | Résultat attendu / décision nécessaire |
|---|---|---|
| P0 avant production | Reprise / rapprochement | Vérifier migrations appliquées, commandes déjà facturées, avances existantes, stock physique et solde initial de caisse. Aucun rapprochement automatique par nom ou montant n’est effectué. |
| P0 | Recette avec l’équipe | Parcours commerciaux, atelier DTF, broderie, flocage, stock et comptabilité, sur une copie de la base. Vérifier aussi mobile et impression A4. |
| P0 | Accès et comptes | Vérifier les rôles réels, les comptes actifs, les mots de passe initiaux et les connexions Supabase / Yalidine. Les anciennes migrations de comptes ne sont pas rejouées ni modifiées. |
| P1 | Prix détaillés en atelier | Conserver les prix unitaires, remises, taxes, coût et marge par ligne dès le devis / la commande ; supprimer le besoin du brouillon au lot global. |
| P1 | Stock textile | Un SKU par article / couleur / taille, emplacements, stock réservé et disponible, inventaires physiques validés et consommation des films, encres, poudre et fils. Le stock actuel reste au niveau produit catalogue. |
| P1 | Création de commande atomique | En-tête, articles, fichiers de référence et acompte dans un processus transactionnel / reprise explicite. Le parcours actuel comporte encore plusieurs appels successifs. |
| P1 | Achats | Réceptions partielles, reliquats, délais fournisseurs et propositions de réassort reliées aux besoins des commandes. La réception existante reste globale. |
| P1 | Retours / avoirs | Avoirs liés à la facture, remboursements contrôlés, remise en stock après vérification, historique et contre-écritures. La suppression d’une facture validée n’est pas un substitut. |
| P1 | Expédition / COD | Rapprochement livraisons, sommes collectées, commissions, retours et versements effectifs Yalidine. Les connexions existantes ne sont pas certifiées par ce travail. |
| P1 | Confidentialité complète | Séparer les champs financiers des tables atelier et filtrer la navigation par rôle. Les documents financiers sont protégés ; `pipeline_orders.order_total` reste accessible aux profils autorisés à lire la table opérationnelle. |
| P2 | CRM | Fusion contrôlée des doublons, attribution commerciale, rendez-vous, relances après devis et après livraison, métriques de conversion par canal et segment. Les opportunités et relances manuelles existantes sont conservées. Aucun message n’est envoyé automatiquement. |
| P2 | Pilotage | Marges réelles par commande / technique, temps atelier, déchets / reprises, capacité, taux de livraison à temps, rentabilité par client. Distinguer commande reçue, CA facturé et encaissement. |
| P2 | Autres modules | Point de vente rapide, exports / sauvegardes vérifiés, restauration testée ; paie et congés si ces usages sont réellement requis. |

## Validation et limites

- `npm run test:finance` : **17 scénarios d’intégration PostgreSQL PGlite**, incluant avance partielle et intégrale, facture avant / après livraison, reprise idempotente, trop-perçu, documents figés, transfert, permissions atelier / lecture seule, solde CRM unifié, clôture et rollback d’un encaissement antidaté.
- `npm run test:migrations` : les **42 migrations** sont rejouées depuis zéro avec l’extension pgcrypto réelle. Auth et Storage sont des fixtures. Le parcours atelier → facture → livraison → solde est aussi exécuté sur le schéma complet, avec tous ses triggers.
- Compilation Next.js de production et contrôle TypeScript. Le problème de dépendances `useEffect` du calcul de montant a également été corrigé.
- `test:concurrency` est adapté à la nouvelle liaison et garde les traces comptables sur sa base jetable. **Non exécuté ici**, faute de PostgreSQL multi-connexion / `DATABASE_URL` de test. PGlite ne valide pas la concurrence entre connexions.
- Aucun test navigateur authentifié ni test sur données réelles. Aucune migration appliquée à la production. Aucun envoi WhatsApp/SMS ni création de livraison externe.
- La confidentialité métier complète, la conformité fiscale et le rapprochement historique nécessitent encore une recette et le paramétrage réel de l’entreprise.

## Mise en service

Livrer le code avec **0041 puis 0042**, après les migrations 0001–0040 déjà présentes. Le dépôt utilise son registre `schema_migrations_repo` et `npm run db:migrate`, pas le registre horodaté de `supabase db push`. Les nouvelles migrations ont été créées par la CLI puis adaptées à la numérotation existante du dépôt. Ne pas modifier les migrations déjà appliquées.

1. Sauvegarder et tester la restauration ; reproduire la base en environnement de recette.
2. Vérifier le registre via `npm run db:check`. Comparer aussi le schéma réel : le registre ne prouve pas qu’une colonne existe.
3. Exécuter les migrations sur la recette, puis les tests et les parcours ci-dessus.
4. Rapprocher l’ancien stock et les documents non liés. Le calcul des soldes reste fondé sur les liens explicites ; des doublons historiques non rapprochés restent des doublons.
5. Mettre en service le code et le schéma ensemble, puis surveiller les premiers encaissements et livraisons. Le workflow de migration sur `main` et un éventuel déploiement Vercel sont indépendants : leur ordre doit être coordonné.

Références techniques utilisées : [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [changelog Supabase](https://supabase.com/changelog), et les migrations / tests du présent dépôt. Aucun taux légal ou identifiant fiscal n’a été inventé.

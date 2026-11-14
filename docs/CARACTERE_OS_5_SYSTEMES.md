# Caractère OS 5/5 — MVP de pilotage (14 novembre 2026)

Ce module ajoute une surcouche de direction à l'ERP Caractère. Il ne remplace pas le CRM, les ventes, l'atelier ni la comptabilité. Aucun contact, acompte ou commande historique n'est modifié par cette branche.

## Accès et sécurité

- URL interne : /os (menu « Caractère OS · Direction »).
- Lecture et écriture : utilisateur connecté, actif, rôle admin.
- Tables : os_priorities, os_campaigns, os_candidates ; RLS activé, aucun accès anonyme, aucun droit de suppression.
- Formulaires : Server Actions, validation et contrôle de rôle serveur.

## Les cinq systèmes

| Système | Indicateurs | Source | Opérations |
| --- | --- | --- | --- |
| Sales | Opportunités et relances dues | opportunities | Qualifier, simuler, devis, relancer |
| Marketing | Campagnes, budget, leads, commandes et CA attribué | os_campaigns (manuel) | Saisir résultats, arbitrer campagnes |
| Delivery | Commandes, retards, blocages, BAT | pipeline_orders | Contrôler première pièce, qualité, sortie |
| Finance | CA facturé mensuel et impayés | invoices | Vérifier caisse, rapprocher paiements |
| Hiring | Effectif actif et candidats | employees, os_candidates | Entretien, test, offre et intégration |

Les priorités transverses sont stockées dans os_priorities avec responsable, échéance, état et système. Les checklists sont des instructions, pas des automatisations.

## Définition des chiffres et limites

- CA facturé mensuel : factures validées ou payées depuis le premier du mois, distinct des ventes encaissées.
- Impayés : reste dû des factures validées, sans ajout séparé des acomptes déjà imputés.
- Commandes ouvertes : toutes les commandes non « livrées », à adapter à tout nouveau statut terminal.
- Coût par commande publicitaire : dépenses manuelles divisées par commandes attribuées manuellement, pas un CAC certifié.
- Les campagnes ne sont pas automatiquement synchronisées avec Meta Ads, WhatsApp ou Gmail.
- Les candidats recrutés ne deviennent pas automatiquement des fiches employés.
- Les listes marketing, candidats et priorités chargent respectivement 80, 80 et 150 lignes au maximum : les résumés associés ne sont donc pas exhaustifs si ces limites sont dépassées.
- Les sommes comptables sont masquées si la récupération atteint la limite de 1 000 lignes ou si la requête échoue.

## Mise en service SÛRE

1. Préparer une base de recette distincte ou une copie anonymisée de l'ERP : ne pas utiliser la base de la boutique Caractere.store ni une base DZ Builders/StopRetours.
2. Sauvegarder et tester la restauration. Vérifier le registre de migrations existant avant toute opération.
3. Vérifier que les migrations 0001 à 0042 sont déjà appliquées. Puis appliquer 0043_caractere_os.sql uniquement en recette, via le processus db:migrate du dépôt. Ne jamais réexécuter les migrations historiques sur une base non amorcée.
4. Vérifier que les trois tables os_ ont rowsecurity=true dans pg_tables et lancer les security advisors Supabase.
5. Vérifier l'authentification et les secrets de l'ERP dans Vercel sans les afficher ni les copier dans du code. Aucun service_role ne doit être exposé au navigateur.
6. Tester avec un admin la création et le changement d'état d'une priorité, campagne et candidature, puis les recharger.
7. Vérifier qu'un utilisateur ordinaire ne peut ni accéder à /os, ni interroger les trois tables par l'API.
8. Confronter les chiffres aux modules CRM, atelier, ventes et caisse.
9. Lancer les tests financiers et de migration du dépôt, compiler Next.js, puis tester sur mobile.
10. Après approbation et recette, fusionner puis déployer l'ERP seul, pas la boutique.

Attention sécurité : le README historique du dépôt mentionne des mots de passe initiaux très faibles. Vérifier qu'ils ont tous été changés et que les sessions actives sont maîtrisées avant de généraliser l'accès.

## Routine du dirigeant

Chaque matin : 5 min production et blocages, 3 min relances et devis, 3 min encaissements/impayés, 2 min performance des campagnes, 2 min recrutement et priorités.

## Non inclus dans ce MVP

Aucun envoi WhatsApp/SMS, aucun achat média, aucun règlement, aucun changement de stock, aucune migration de production automatique. Les marges réelles par commande restent hors périmètre tant que les coûts unitaires ne sont pas validés.

Critère de sortie : cockpit accessible par admin, chiffres vérifiés, 3 workflows persistants, RLS validé et absence de régression financière.

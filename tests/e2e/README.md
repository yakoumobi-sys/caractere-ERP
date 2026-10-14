# Tests E2E de Caractère ERP

La suite couvre la création de commandes depuis l'interface, la sélection des clients, les callbacks Twilio signés (formulaire et JSON), la mise à jour réelle du statut SMS, l'authentification du webhook site, le refus d'une modification CRM par un profil readonly et l'absence de clé privilégiée dans le navigateur.

Les tests financiers et les migrations ont leurs suites distinctes : `npm run test:finance` et `npm run test:migrations`. Cette suite E2E ne couvre pas encore tous les parcours financiers dans le navigateur.

## En CI

Le workflow démarre Supabase local avec les migrations du dépôt, puis crée deux comptes fictifs. Aucune clé ni aucun compte de production n'est utilisé. Les écritures de test refusent les URL Supabase hébergées. La base et les comptes sont jetés à la fin du job.

## En local

Docker et Supabase CLI 2.120.0 sont requis.

```bash
supabase start
supabase status -o env --override-name api.url=NEXT_PUBLIC_SUPABASE_URL,auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY,auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY > .e2e.env
set -a
. ./.e2e.env
export TWILIO_AUTH_TOKEN=local-e2e-twilio-token
export TWILIO_WEBHOOK_URL=http://localhost:3000/api/webhooks/twilio
export SITE_ORDERS_WEBHOOK_SECRET=local-e2e-site-secret
export TEST_USERNAME=E2EAdmin
export TEST_PASSWORD=CaractereE2E-2026!
set +a
node tests/e2e/setup-local.mjs
npx playwright install chromium
npm run test:e2e
```

Le script de comptes s'exécute une fois sur une base locale neuve. Pour repartir de zéro : `supabase db reset --local --no-seed`, puis recréer les comptes. Ne pas charger `supabase/seed.sql` pour cette suite.

Les rapports sont dans `tests/results/`. Les captures et traces sont dans `test-results/`. Les scénarios n'acceptent pas un HTTP 500 comme preuve de succès.

## Callback Twilio en production

Configurer `TWILIO_AUTH_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` et `TWILIO_WEBHOOK_URL` sur le serveur. Cette dernière doit être l'URL HTTPS exacte enregistrée chez Twilio, avec le chemin `/api/webhooks/twilio`. Le callback utilise le validateur officiel du SDK et ne journalise aucune signature. Il écrit avec le client serveur privilégié seulement après validation de la signature, puisqu'un callback fournisseur n'a pas de session utilisateur.

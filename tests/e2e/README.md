# 🧪 Tests E2E — Caractère ERP

Suite de tests automatisés pour les workflows critiques de l'ERP.

## 📋 Coverage

✅ Création de commande (simple & bulk)  
✅ Facturation & comptabilisation automatique  
✅ Paiements & solde client  
✅ Stock & mouvements automatiques  
✅ Sécurité (RLS, webhooks)  
✅ Performance (N+1 fixes)

## 🚀 Setup

### 1. Installer Playwright

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

### 2. Variables d'environnement

Créer `.env.test` :

```env
# Supabase (teste sur staging si possible)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# App
BASE_URL=http://localhost:3000
TEST_PASSWORD=123456
```

### 3. Démarrer l'app

```bash
npm run dev
```

### 4. Lancer les tests

```bash
# Tous les tests
npx playwright test

# Un seul fichier
npx playwright test workflows.spec.ts

# Mode debug
npx playwright test --debug

# Mode UI (visuel)
npx playwright test --ui

# Reporter HTML
npx playwright show-report
```

## 📊 Tests Inclus

### Création de Commande
- ✅ DTF simple avec 1 client nouveau
- ✅ Bulk 100 articles (perf test du N+1 fix)
- ✅ Vérifier autoincrémentation du numéro

### Facturation
- ✅ Créer facture depuis commande
- ✅ Ajouter lignes de facture
- ✅ Vérifier comptabilisation auto
- ✅ Enregistrer paiement
- ✅ Vérifier équilibreur de solde

### Stock
- ✅ Mouvements automatiques
- ✅ Journal des stocks
- ✅ Alertes rupture

### Sécurité
- ✅ RLS: User readonly bloqué
- ✅ Webhook Twilio: Signature validée

### Performance
- ✅ Order creation 100 articles < 5s

## 📈 Résultats

Après chaque test run, voir les résultats :

```bash
# HTML report
npx playwright show-report

# Terminal output
npm run test:e2e

# JUnit (CI/CD)
cat tests/results/junit.xml
```

## 🔄 CI/CD Integration

Ajouter à `.github/workflows/test.yml` :

```yaml
- name: Run E2E tests
  run: |
    npm install
    npx playwright install --with-deps chromium
    npm run test:e2e
  env:
    BASE_URL: ${{ secrets.BASE_URL }}
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: tests/results/
```

## 🐛 Debugging

```bash
# Mode debug avec UI
npx playwright test --debug

# Trace inspection
npx playwright show-trace tests/results/trace.zip

# Screenshots & videos
# Auto-sauvegardés dans tests/results/ en cas d'erreur
```

## 💡 Tips

- Utiliser `test.only()` pour run un seul test
- Utiliser `test.skip()` pour sauter un test
- Utiliser `page.pause()` pour debug interactif
- Utiliser `test.setTimeout()` pour augmenter timeout

## 📝 Ajouter un nouveau test

```typescript
test('Description du test', async ({ page, login, adminUser }) => {
  // Authentifier
  await login(adminUser.email, adminUser.password);

  // Naviguer
  await page.goto('/path');

  // Interagir
  await page.click('button');
  await page.fill('input', 'value');

  // Vérifier
  await expect(page.locator('text=Success')).toBeVisible();
});
```

## 🎯 Avant de mettre en prod

```bash
# 1. Tous les tests doivent passer
npm run test:e2e

# 2. Pas de warnings ou errors
npm run lint

# 3. Performance OK
npm run test:e2e -- --grep "Performance"

# 4. Sécurité OK
npm run test:e2e -- --grep "Sécurité"
```

---

**Statut**: ✅ Suite complète prête pour production


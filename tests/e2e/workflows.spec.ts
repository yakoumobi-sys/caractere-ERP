import { test, expect, createTestContact, cleanupTestData } from './fixtures';

/**
 * Tests E2E des workflows critiques de Caractère ERP.
 *
 * Réécrits sur l'interface réelle (2026-09) : l'ancienne version visait des
 * écrans qui n'existent pas dans l'application (/sales/payments,
 * /stock/products, `select[name="contact_id"]`, `input[name="product_name"]`…)
 * et n'avait jamais pu passer.
 *
 * Prérequis : Supabase local avec les comptes fictifs de setup-local.mjs.
 */

const SUFFIX = Date.now().toString(36);

test.describe('🎯 Création de commande', () => {
  const ids = { contacts: [] as string[], orders: [] as string[] };

  test.afterAll(async () => {
    await cleanupTestData(ids);
  });

  test('Commande DTF avec acompte → flocage → livraison → facture réglée', async ({ page, login, adminUser }) => {
    test.slow();
    await login(adminUser.email, adminUser.password);

    await page.goto('/production/new');
    await page.waitForLoadState('networkidle');

    // Le bouton reste inactif tant qu'il manque le client et l'article.
    const submit = page.getByRole('button', { name: 'Créer la commande' });
    await expect(submit).toBeDisabled();

    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await expect(page.locator('[name="logo_placement"]')).toBeHidden();
    await expect(page.locator('[name="initial_payment"]')).toBeHidden();

    // 1. Client : nouveau
    await page.getByRole('button', { name: '+ Nouveau client' }).click();
    await page.fill('input[name="client_new_name"]', `Client E2E ${SUFFIX}`);
    await page.fill('input[name="client_new_phone"]', '0550000000');

    // 2. Article : créer un article dans le stock depuis la ligne
    const productName = `Article E2E ${SUFFIX}`;
    await page.getByPlaceholder('Rechercher dans le stock…').first().fill(productName);
    await page.getByRole('button', { name: `+ Créer « ${productName} » dans le stock` }).click();
    await expect(page.getByText(productName).first()).toBeVisible();

    // 3. Impression : DTF est sélectionnée par défaut
    // 4. Prix
    await page.fill('input[name="order_total"]', '5000');
    await page.locator('summary').filter({ hasText: 'Couleur et taille' }).click();
    await page.getByRole('button', { name: 'Noir', exact: true }).click();
    await expect(page.locator('[name="order_total"]')).toHaveValue('5000');
    await page.locator('summary').filter({ hasText: 'Acompte' }).click();
    await page.locator('[name="initial_payment"]').fill('1500');

    await expect(submit).toBeEnabled();
    await submit.click();

    // Redirection vers la fiche commande
    await expect(page).toHaveURL(/\/production\/[0-9a-f-]{36}$/);
    const orderId = page.url().split('/').pop()!;
    // La base locale jetable conserve la trace comptable de cette vente.

    await expect(page.getByText(`Client E2E ${SUFFIX}`).first()).toBeVisible();
    await expect(page.getByText(productName).first()).toBeVisible();
    // toLocaleString("fr-DZ") sépare les milliers par une espace insécable.
    await expect(page.getByText(/5\s?000 DA/).first()).toBeVisible();

    await page.goto('/dashboard');
    const table = page.getByRole('table', { name: 'Commandes en cours' });
    const link = table.locator(`a[href="/production/${orderId}"]`);
    await expect(link).toBeVisible();
    const stock = page.getByRole('heading', { name: 'À acheter' });
    const alerts = page.getByRole('heading', { name: 'Alertes en cours' });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 850 });
      const tableTop = (await table.boundingBox())!.y;
      expect((await stock.boundingBox())!.y).toBeLessThan(tableTop);
      expect((await alerts.boundingBox())!.y).toBeLessThan(tableTop);
      expect((await link.boundingBox())!.x).toBeLessThan(width);
    }
    await link.click();
    await page.getByRole('button', { name: 'Prendre la commande' }).click();
    await expect(page.getByRole('button', { name: 'Marquer terminée' })).toBeVisible();
    await page.getByRole('button', { name: 'Marquer terminée' }).click();
    await expect(page.getByText(/En attente \(Flocage\)/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Prendre la commande' }).click();
    await page.getByRole('button', { name: 'Marquer terminée' }).click();
    await page.getByRole('button', { name: 'Livrer au client' }).click();
    await expect(page.locator('main').getByText(/Créée le .*Livrée/)).toBeVisible();

    await page.getByRole('button', { name: 'Créer la facture liée' }).click();
    await expect(page).toHaveURL(/\/sales\/invoices\/[0-9a-f-]{36}$/);
    const invoiceUrl = page.url();
    await page.getByRole('button', { name: 'Valider la facture' }).click();
    await expect(page.getByText(/Solde restant.*3\s?500/)).toBeVisible();
    await page.getByRole('link', { name: 'Commande & encaissements' }).click();
    await page.locator('#payment_amount').fill('3500');
    await page.getByRole('button', { name: 'Enregistrer le paiement' }).click();
    await expect(page.getByText('Payée', { exact: true }).first()).toBeVisible();

    await page.goto(invoiceUrl + '/print');
    const print = page.locator('#invoice-print');
    await expect(print).toContainText(productName);
    await expect(print.getByText('Reste à payer').locator('..')).toContainText(/0,00/);
    await page.goto('/dashboard');
    await expect(page.locator(`#commandes a[href="/production/${orderId}"]`)).toHaveCount(0);
  });

  test('Client existant tapé mais non sélectionné → bouton inactif, aucune commande', async ({
    page,
    login,
    adminUser,
  }) => {
    await login(adminUser.email, adminUser.password);

    const contact = await createTestContact({ name: `Existant E2E ${SUFFIX}`, phone: '0551111111' });
    ids.contacts.push(contact.id);

    await page.goto('/production/new');
    await page.waitForLoadState('networkidle');

    // Taper le nom sans toucher la liste : c'était la cause de « Le client
    // est requis » en production.
    await page.getByPlaceholder('Chercher un client…').fill(`Existant E2E ${SUFFIX}`);
    await expect(page.getByRole('button', { name: 'Créer la commande' })).toBeDisabled();
    await expect(page.getByText(/Il manque encore .*un client/)).toBeVisible();

    // Sélectionner dans la liste → le client passe en "retenu"
    await page.getByRole('button', { name: `Existant E2E ${SUFFIX}` }).click();
    await expect(page.getByText(`✓ Existant E2E ${SUFFIX}`)).toBeVisible();
    await expect(page.getByText(/Il manque encore .*un client/)).toHaveCount(0);
  });
});

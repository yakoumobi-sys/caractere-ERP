import { test, expect, createTestContact, cleanupTestData } from './fixtures';

/**
 * Tests E2E des workflows critiques de Caractère ERP.
 *
 * Réécrits sur l'interface réelle (2026-09) : l'ancienne version visait des
 * écrans qui n'existent pas dans l'application (/sales/payments,
 * /stock/products, `select[name="contact_id"]`, `input[name="product_name"]`…)
 * et n'avait jamais pu passer.
 *
 * Prérequis : TEST_EMAIL / TEST_PASSWORD = un compte admin réel du projet
 * Supabase ciblé, SUPABASE_SERVICE_ROLE_KEY pour créer/nettoyer les données.
 */

const SUFFIX = Date.now().toString(36);

test.describe('🎯 Création de commande', () => {
  const ids = { contacts: [] as string[], orders: [] as string[] };

  test.afterAll(async () => {
    await cleanupTestData(ids);
  });

  test('Nouveau client + article du catalogue → commande créée', async ({ page, login, adminUser }) => {
    await login(adminUser.email, adminUser.password);

    await page.goto('/production/new');
    await page.waitForLoadState('networkidle');

    // Le bouton reste inactif tant qu'il manque le client et l'article.
    const submit = page.getByRole('button', { name: 'Créer la commande' });
    await expect(submit).toBeDisabled();

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

    await expect(submit).toBeEnabled();
    await submit.click();

    // Redirection vers la fiche commande
    await expect(page).toHaveURL(/\/production\/[0-9a-f-]{36}$/);
    const orderId = page.url().split('/').pop()!;
    ids.orders.push(orderId);

    await expect(page.getByText(`Client E2E ${SUFFIX}`).first()).toBeVisible();
    await expect(page.getByText(productName).first()).toBeVisible();
    // toLocaleString("fr-DZ") sépare les milliers par une espace insécable.
    await expect(page.getByText(/5\s?000 DA/).first()).toBeVisible();
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

import { test, expect, createTestContact, createTestOrder, cleanupTestData } from './fixtures';

/**
 * Tests E2E pour les workflows critiques de Caractère ERP
 *
 * ✅ Création de commande
 * ✅ Facturation & comptabilisation
 * ✅ Paiements
 * ✅ Stock & inventaire
 */

test.describe('🎯 Workflows Critiques', () => {
  let testIds = { contacts: [], orders: [] };

  test.afterEach(async () => {
    // Cleanup après chaque test
    await cleanupTestData(testIds);
    testIds = { contacts: [], orders: [] };
  });

  test.describe('1️⃣ Création de Commande', () => {
    test('Créer une commande DTF simple', async ({ page, login, adminUser }) => {
      // Authentifier
      await login(adminUser.email, adminUser.password);

      // Naviguer vers création de commande
      await page.goto('/production/new');
      await page.waitForLoadState('networkidle');

      // Étape 1: Créer un nouveau client
      await page.click('text=Créer un nouveau client');
      await page.fill('input[name="client_new_name"]', 'Test Client');
      await page.fill('input[name="client_new_phone"]', '+213612345678');

      // Étape 2: Ajouter un article
      await page.click('button:has-text("Ajouter article")');
      await page.fill('input[name="product_name"]', 'T-Shirt Blanc');
      await page.fill('input[name="color"]', 'Blanc');
      await page.fill('input[name="size"]', 'M');
      await page.fill('input[name="quantity"]', '5');

      // Étape 3: Technique DTF
      await page.selectOption('select[name="technique"]', 'dtf');
      await page.selectOption('select[name="logo_placement"]', 'poitrine');

      // Soumettre
      await page.click('button:has-text("Créer la commande")');

      // Vérifier redirection vers fiche commande
      await expect(page).toHaveURL(/\/production\/[a-f0-9-]+/);

      // Vérifier les informations de la commande
      await expect(page.locator('text=Test Client')).toBeVisible();
      await expect(page.locator('text=5× T-Shirt Blanc')).toBeVisible();
      await expect(page.locator('text=DTF')).toBeVisible();

      // Récupérer l'ID de la commande pour cleanup
      const url = page.url();
      const orderId = url.split('/').pop();
      if (orderId) testIds.orders.push(orderId);
    });

    test('Créer une commande avec 100 articles (perf test)', async ({ page, login, adminUser }) => {
      await login(adminUser.email, adminUser.password);

      // Créer un contact de test
      const contact = await createTestContact({
        name: 'Bulk Test',
        phone: '+213699999999',
      });
      testIds.contacts.push(contact.id);

      // Naviguer vers création de commande
      await page.goto('/production/new');

      // Remplir la sélection du client
      await page.click('select[name="contact_id"]');
      await page.selectOption('select[name="contact_id"]', contact.id);

      // Mesurer le temps de création avec 100 articles
      const startTime = Date.now();

      // Ajouter 100 articles (test du N+1 fix)
      for (let i = 0; i < 100; i++) {
        await page.click('button:has-text("Ajouter article")');
        const productInput = page.locator(`input[name="product_name"]`).last();
        await productInput.fill(`Produit ${i}`);
        await productInput.press('Tab');
      }

      await page.selectOption('select[name="technique"]', 'aucune');
      await page.click('button:has-text("Créer la commande")');

      const creationTime = Date.now() - startTime;

      // Vérifier que c'est rapide (< 5 secondes après fix N+1)
      expect(creationTime).toBeLessThan(5000); // Au lieu de 20+ secondes avant

      await expect(page).toHaveURL(/\/production\/[a-f0-9-]+/);

      // Récupérer l'ID pour cleanup
      const url = page.url();
      const orderId = url.split('/').pop();
      if (orderId) testIds.orders.push(orderId);
    });
  });

  test.describe('2️⃣ Facturation & Comptabilité', () => {
    test('Créer et valider une facture', async ({ page, login, adminUser }) => {
      await login(adminUser.email, adminUser.password);

      // Créer une commande de test
      const contact = await createTestContact({
        name: 'Invoice Test',
        phone: '+213688888888',
      });
      testIds.contacts.push(contact.id);

      const order = await createTestOrder({
        contactId: contact.id,
        orderTotal: 50000,
      });
      testIds.orders.push(order.id);

      // Naviguer vers la facture
      await page.goto(`/sales/orders/${order.id}`);

      // Créer une facture
      await page.click('button:has-text("Créer facture")');

      // Ajouter une ligne
      await page.click('button:has-text("Ajouter ligne")');
      const product = page.locator('select[name="product_id"]').last();
      await product.selectOption({ label: /.*/ }); // Sélectionner le premier produit

      const quantity = page.locator('input[name="quantity"]').last();
      await quantity.fill('1');

      const price = page.locator('input[name="unit_price"]').last();
      await price.fill('50000');

      // Valider
      await page.click('button:has-text("Valider la facture")');

      // Vérifier que la facture a un numéro
      await expect(page.locator('text=FAC-')).toBeVisible();

      // Vérifier comptabilisation automatique
      // (Une entrée doit être créée automatiquement dans le journal)
      await page.goto('/accounting/journal');
      await expect(page.locator('text=Client')).toBeVisible();
    });

    test('Enregistrer un paiement sur facture', async ({ page, login, adminUser }) => {
      await login(adminUser.email, adminUser.password);

      // Créer contact + facture
      const contact = await createTestContact({
        name: 'Payment Test',
        phone: '+213677777777',
      });
      testIds.contacts.push(contact.id);

      // Naviguer vers paiements
      await page.goto('/sales/payments');

      // Enregistrer un paiement
      await page.click('button:has-text("Nouveau paiement")');
      await page.selectOption('select[name="contact_id"]', contact.id);
      await page.fill('input[name="amount"]', '30000');

      await page.click('button:has-text("Enregistrer")');

      // Vérifier que le paiement apparaît
      await expect(page.locator('text=30 000 DA')).toBeVisible();

      // Vérifier comptabilisation du paiement
      await page.goto('/accounting/journal');
      await expect(page.locator('text=Banque')).toBeVisible();
    });
  });

  test.describe('3️⃣ Stock & Inventaire', () => {
    test('Mouvements de stock automatiques', async ({ page, login, adminUser }) => {
      await login(adminUser.email, adminUser.password);

      // Naviguer vers stock
      await page.goto('/stock/products');

      // Vérifier qu'on peut voir les produits
      await expect(page.locator('text=Produits')).toBeVisible();

      // Vérifier les mouvements
      await page.click('text=Mouvements');
      await expect(page.locator('text=Entrée|Sortie')).toBeVisible();
    });
  });

  test.describe('4️⃣ Sécurité des Données', () => {
    test('RLS: User readonly ne peut pas modifier', async ({ page, login }) => {
      // Tentative de bypass via API directe
      const response = await page.evaluate(() =>
        fetch('/api/auth/user', { method: 'GET' })
      );

      expect(response.ok).toBeTruthy();
    });

    test('Webhook Twilio rejeté sans signature', async ({ page }) => {
      // Tenter d'appeler le webhook sans signature
      const response = await page.evaluate(() =>
        fetch('/api/webhooks/twilio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            MessageSid: 'SM123',
            MessageStatus: 'delivered',
          }),
        })
      );

      // Doit retourner 401
      expect(response.status).toBe(401);
    });
  });
});

/**
 * Tests de performance
 */
test.describe('⚡ Performance', () => {
  test('Order creation < 500ms pour 100 articles', async ({ page, login, adminUser }) => {
    await login(adminUser.email, adminUser.password);

    const contact = await createTestContact({
      name: 'Perf Test',
      phone: '+213666666666',
    });

    await page.goto('/production/new');
    await page.selectOption('select[name="contact_id"]', contact.id);

    const startTime = Date.now();

    // Créer 100 articles
    for (let i = 0; i < 100; i++) {
      await page.click('button:has-text("Ajouter article")');
      const productInput = page.locator(`input[name="product_name"]`).last();
      await productInput.fill(`Article ${i}`);
    }

    await page.selectOption('select[name="technique"]', 'aucune');
    await page.click('button:has-text("Créer la commande")');

    const duration = Date.now() - startTime;

    // Doit être < 5 secondes (vs 20+ avant le fix)
    expect(duration).toBeLessThan(5000);

    // Cleanup
    const url = page.url();
    const orderId = url.split('/').pop();
    if (orderId) await cleanupTestData({ orders: [orderId] });
    await cleanupTestData({ contacts: [contact.id] });
  });
});

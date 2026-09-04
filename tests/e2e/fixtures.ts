import { test as base, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Fixtures Playwright pour authentification et données de test
 */

interface AuthFixture {
  page: Page;
  adminUser: {
    email: string;
    password: string;
  };
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Fixture: Authentification admin
 */
export const test = base.extend<AuthFixture>({
  // Compte utilisé par les tests. « admin@caractere.com » n'existe sur aucun
  // projet : renseigner TEST_EMAIL / TEST_PASSWORD (secrets Actions) avec un
  // compte admin réel du projet Supabase ciblé.
  adminUser: {
    email: process.env.TEST_EMAIL || 'admin@caractere.com',
    password: process.env.TEST_PASSWORD || '123456',
  },

  login: async ({ page }, use) => {
    await use(async (email: string, password: string) => {
      await page.goto('/login');
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button[type="submit"]');

      // Attendre la redirection vers le dashboard
      await page.waitForURL('/dashboard', { timeout: 10000 });
      await page.waitForLoadState('networkidle');
    });
  },

  logout: async ({ page }, use) => {
    await use(async () => {
      // Cliquer sur le menu utilisateur (généralement en haut à droite)
      await page.click('[data-testid="user-menu"]');
      await page.click('text=Déconnexion');
      await page.waitForURL('/login');
    });
  },
});

export { expect };

/**
 * Helpers pour créer des données de test via Supabase
 */
export async function createTestContact(data: {
  name: string;
  phone: string;
  email?: string;
  type?: string;
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      type: data.type || 'client',
      country: 'Algérie',
    })
    // contacts n'a pas de colonne "number" : l'ancien select faisait échouer
    // la création avant le premier test.
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create contact: ${error.message}`);
  return contact;
}

/**
 * Créer une commande de test
 */
export async function createTestOrder(data: {
  contactId: string;
  description?: string;
  technique?: 'dtf' | 'broderie' | 'aucune';
  orderTotal?: number;
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: order, error } = await supabase
    .from('pipeline_orders')
    .insert({
      contact_id: data.contactId,
      description: data.description || 'Test order',
      technique: data.technique || 'dtf',
      status: 'attente_dtf',
      order_total: data.orderTotal || null,
    })
    .select('id, number')
    .single();

  if (error) throw new Error(`Failed to create order: ${error.message}`);
  return order;
}

/**
 * Nettoyer les données de test
 */
export async function cleanupTestData(ids: { contacts?: string[]; orders?: string[] }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (ids.orders?.length) {
    await supabase.from('pipeline_orders').delete().in('id', ids.orders);
  }

  if (ids.contacts?.length) {
    await supabase.from('contacts').delete().in('id', ids.contacts);
  }
}

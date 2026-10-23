import { test, expect, createTestContact, createTestOrder, cleanupTestData, createLocalAdmin } from './fixtures';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const endpoint = '/api/webhooks/twilio';
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
function signedForm(params: Record<string, string>) {
  const text = Object.keys(params).sort().reduce((s, key) => s + key + params[key], baseUrl + endpoint);
  return {
    headers: { 'x-twilio-signature': crypto.createHmac('sha1', process.env.TWILIO_AUTH_TOKEN!).update(text).digest('base64') },
    form: params,
  };
}

test.describe('Sécurité des webhooks', () => {
  test('Twilio sans signature est refusé', async ({ request }) => {
    const response = await request.post(endpoint, { form: { MessageSid: 'SMtest', MessageStatus: 'delivered' } });
    expect(response.status()).toBe(401);
  });

  test('Twilio avec signature invalide est refusé sans erreur serveur', async ({ request }) => {
    const response = await request.post(endpoint, {
      headers: { 'x-twilio-signature': 'INVALID_SIGNATURE' },
      form: { MessageSid: 'SMtest', MessageStatus: 'delivered' },
    });
    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe('Signature invalide');
  });

  test('Twilio signé met réellement à jour le SMS sans session utilisateur', async ({ request }) => {
    const db = createLocalAdmin();
    const contact = await createTestContact({ name: 'SMS E2E', phone: '0550000001' });
    let order: { id: string } | undefined;
    try {
      order = await createTestOrder({ contactId: contact.id });
      const sid = `SM${crypto.randomBytes(16).toString('hex')}`;
      const { data: sms, error } = await db.from('sms_delivery').insert({
        order_id: order.id, customer_phone: '0550000001', stage: 'production', status: 'pending', twilio_sid: sid,
      }).select('id').single();
      expect(error).toBeNull();
      const response = await request.post(endpoint, signedForm({ MessageSid: sid, MessageStatus: 'delivered', ExtraProviderField: 'preserved' }));
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ success: true, updated: 1 });
      const { data } = await db.from('sms_delivery').select('status, sent_at').eq('id', sms!.id).single();
      expect(data?.status).toBe('sent');
      expect(data?.sent_at).toBeTruthy();
    } finally {
      await cleanupTestData({ contacts: [contact.id], orders: order ? [order.id] : [] });
    }
  });

  for (const missing of ['MessageSid', 'MessageStatus']) {
    test(`Twilio signé sans ${missing} est refusé`, async ({ request }) => {
      const params: Record<string, string> = { MessageSid: 'SMtest', MessageStatus: 'delivered' };
      delete params[missing];
      const response = await request.post(endpoint, signedForm(params));
      expect(response.status()).toBe(400);
    });
  }

  test('JSON signé puis altéré est refusé', async ({ request }) => {
    const raw = JSON.stringify({ MessageSid: 'SMtest', MessageStatus: 'delivered' });
    const url = `${baseUrl}${endpoint}?bodySHA256=${crypto.createHash('sha256').update(raw).digest('hex')}`;
    const signature = crypto.createHmac('sha1', process.env.TWILIO_AUTH_TOKEN!).update(url).digest('base64');
    const response = await request.post(url, { headers: { 'x-twilio-signature': signature, 'Content-Type': 'application/json' }, data: raw.replace('delivered', 'failed') });
    expect(response.status()).toBe(401);
  });

  test('Twilio JSON signé valide est accepté', async ({ request }) => {
    const raw = JSON.stringify({ MessageSid: 'SMnonexistent', MessageStatus: 'delivered' });
    const url = `${baseUrl}${endpoint}?bodySHA256=${crypto.createHash('sha256').update(raw).digest('hex')}`;
    const signature = crypto.createHmac('sha1', process.env.TWILIO_AUTH_TOKEN!).update(url).digest('base64');
    const response = await request.post(url, { headers: { 'x-twilio-signature': signature, 'Content-Type': 'application/json' }, data: raw });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true, updated: 0 });
  });

  test('JSON invalide est rejeté', async ({ request }) => {
    const response = await request.post(endpoint, { headers: { 'x-twilio-signature': 'invalid', 'Content-Type': 'application/json' }, data: Buffer.from('INVALID_JSON{{{') });
    expect(response.status()).toBe(400);
  });

  for (const secret of [undefined, 'INVALID_SECRET']) {
    test(`Site-orders ${secret ? 'avec secret invalide' : 'sans secret'} est refusé`, async ({ request }) => {
      const response = await request.post('/api/webhooks/site-orders', {
        headers: secret ? { 'x-webhook-secret': secret } : {}, data: { quantite: 1 },
      });
      expect(response.status()).toBe(401);
    });
  }

  test('Site-orders authentifié sans champs requis est refusé', async ({ request }) => {
    const response = await request.post('/api/webhooks/site-orders', {
      headers: { 'x-webhook-secret': process.env.SITE_ORDERS_WEBHOOK_SECRET! }, data: { quantite: 1 },
    });
    expect(response.status()).toBe(400);
  });
});

test('Un profil readonly ne peut réellement pas modifier un contact', async () => {
  const contact = await createTestContact({ name: 'Readonly original', phone: '0550000002' });
  const readonly = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  try {
    const { error } = await readonly.auth.signInWithPassword({ email: 'e2ereadonly@example.test', password: process.env.TEST_PASSWORD || 'CaractereE2E-2026!' });
    expect(error).toBeNull();
    const result = await readonly.from('contacts').update({ name: 'Forbidden edit' }).eq('id', contact.id).select('id');
    expect(result.error?.code === '42501' || result.data?.length === 0).toBeTruthy();
    const { data } = await createLocalAdmin().from('contacts').select('name').eq('id', contact.id).single();
    expect(data?.name).toBe('Readonly original');
  } finally { await readonly.auth.signOut(); await cleanupTestData({ contacts: [contact.id] }); }
});

test('La clé privilégiée est absente du contenu et du stockage navigateur', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('select[name="username"]')).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  expect(storage).not.toContain(key);
  expect(await page.content()).not.toContain(key);
  for (const script of await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => (node as HTMLScriptElement).src))) {
    expect(await (await page.request.get(script)).text()).not.toContain(key);
  }
});

test('La route protégée redirige un visiteur vers la connexion', async ({ page }) => {
  await page.goto('/production/new');
  await expect(page).toHaveURL(/\/login/);
});

/** Fail before any browser writes if a hosted database is configured. */
export default function checkEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
    throw new Error('E2E nécessite Supabase local : les bases hébergées sont refusées.');
  }
  for (const name of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'TWILIO_AUTH_TOKEN', 'SITE_ORDERS_WEBHOOK_SECRET']) {
    if (!process.env[name]) throw new Error(`Variable de test manquante : ${name}`);
  }
}

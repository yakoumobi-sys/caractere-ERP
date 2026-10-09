import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('E2E setup requires a local Supabase instance; hosted databases are refused.');
}
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const check = ({ error }) => { if (error) throw new Error(error.message); };
for (const [name, role] of [['E2EAdmin', 'admin'], ['E2EReadonly', 'readonly']]) {
  const email = `${name.toLowerCase()}@example.test`;
  const { data, error } = await db.auth.admin.createUser({
    email, password: 'CaractereE2E-2026!', email_confirm: true, user_metadata: { full_name: name },
  });
  if (error) throw error;
  check(await db.from('profiles').update({ role, is_active: true, must_change_password: false }).eq('id', data.user.id));
  check(await db.from('employees').insert({ first_name: name, last_name: '', email, profile_id: data.user.id }));
}
check(await db.from('companies').insert({ name: 'Caractère E2E', country: 'Algérie' }));
check(await db.from('warehouses').insert({ name: 'Entrepôt E2E', is_default: true }));
console.log('Local E2E admin and readonly accounts ready.');

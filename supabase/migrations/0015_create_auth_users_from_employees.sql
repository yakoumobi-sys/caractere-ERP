-- ============================================================================
-- Caractère ERP — Créer les auth.users pour tous les employés
-- ============================================================================

-- Créer les auth.users pour tous les employés qui n'en ont pas
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  aud,
  role
)
SELECT
  gen_random_uuid(),
  LOWER(e.first_name) || '@caractere.com' as email,
  crypt('123456', gen_salt('bf')) as encrypted_password,
  now(),
  now(),
  now(),
  'authenticated',
  'authenticated'
FROM public.employees e
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u
  WHERE u.email = LOWER(e.first_name) || '@caractere.com'
)
ON CONFLICT(email) DO NOTHING;

-- Mettre à jour TOUS les mots de passe à 123456 (pour simplifier les tests)
UPDATE auth.users
SET encrypted_password = crypt('123456', gen_salt('bf'))
WHERE email LIKE '%@caractere.com';

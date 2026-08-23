-- Ajoute la colonne email à la table profiles pour permettre le lookup lors de la connexion
alter table public.profiles add column if not exists email text;

-- Remplir les emails existants à partir de auth.users si possible
-- (Cette approche n'est pas directement possible avec des requêtes SQL,
-- donc la colonne reste vide jusqu'à la prochaine inscription)

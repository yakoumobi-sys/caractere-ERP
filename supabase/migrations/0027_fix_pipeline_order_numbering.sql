-- ============================================================================
-- Caractère ERP — Corrige la numérotation cassée des commandes de production.
--
-- BUG CRITIQUE : pipeline_orders avait DEUX triggers BEFORE INSERT concurrents
-- pour générer son numéro :
--   - set_order_number   -> auto_number_order()   -> generate_order_number()
--   - set_pipeline_number -> set_pipeline_number() -> next_document_number()
--
-- Les deux ont le même garde-fou "if new.number is null", et comme
-- "set_order_number" < "set_pipeline_number" alphabétiquement, Postgres
-- exécute toujours le premier en premier — le second ne s'est donc jamais
-- déclenché depuis son introduction. Or generate_order_number() calcule le
-- numéro via un simple "count(*) + 1" sur l'année en cours : dès qu'une
-- commande est supprimée (deletePipelineOrder existe et est utilisé) ou que
-- la numérotation dérive un peu, ce compte ne correspond plus aux numéros
-- réellement attribués et finit par recalculer un numéro déjà pris —
-- violation de la contrainte unique pipeline_orders_number_key, qui fait
-- échouer TOUTE création de commande (peu importe client existant ou
-- nouveau), avec une erreur non gérée par l'action serveur.
--
-- generate_order_number() a aussi un bug de format indépendant :
-- format('CMD-%s-%05s', ...) — le spécificateur %s ne remplit PAS les zéros
-- de gauche, contrairement à %d ; il complète avec des ESPACES. D'où les
-- numéros observés en base du style "CMD-2026-    4" (avec espaces au lieu
-- de zéros), déjà visibles avant même la collision fatale.
--
-- Repéré suite au signalement du propriétaire : "je n'arrive pas à créer de
-- commande d'ancien client" / "quand je crée une commande de nouveau client,
-- les infos restent vides" — les deux symptômes viennent du même crash, qui
-- survient après la résolution du client (le contact, lui, est bien créé
-- côté "nouveau client", ce qui explique la confusion).
--
-- Le même bug existe pour claims (auto_number_claim -> generate_claim_number,
-- identique : count(*) + %05s), pas encore déclenché faute de suppression de
-- réclamation à ce jour, mais corrigé ici aussi avant qu'il ne le soit.
-- ============================================================================

-- 1) pipeline_orders : on ne garde que le trigger fiable (next_document_number,
--    compteur atomique en base, déjà utilisé par devis/factures/BC/etc.).
drop trigger if exists set_order_number on public.pipeline_orders;
drop function if exists public.auto_number_order();
drop function if exists public.generate_order_number();

-- 2) Répare les 2 commandes déjà créées avec le schéma bugué (numéros avec
--    espaces, potentiellement en conflit avec le compteur ci-dessous) : on
--    les renumérote à la suite des CMD-P-2026-000N existants, dans l'ordre
--    chronologique de création.
do $$
declare
  r record;
  v_year text := to_char(current_date, 'YYYY');
  v_next int;
begin
  select coalesce(max(substring(number from '\d+$')::int), 0)
    into v_next
    from public.pipeline_orders
    where number ~ ('^CMD-P-' || v_year || '-\d+$');

  for r in
    select id from public.pipeline_orders
    where number !~ ('^CMD-P-' || v_year || '-\d+$')
      and extract(year from created_at)::text = v_year
    order by created_at
  loop
    v_next := v_next + 1;
    update public.pipeline_orders
      set number = 'CMD-P-' || v_year || '-' || lpad(v_next::text, 4, '0')
      where id = r.id;
  end loop;

  -- Aligne le compteur partagé sur le dernier numéro réellement utilisé, pour
  -- que la prochaine vraie commande continue la séquence sans collision.
  insert into public.document_number_counters (prefix, year, last_number)
  values ('CMD-P', v_year, v_next)
  on conflict (prefix, year) do update set last_number = excluded.last_number
  where public.document_number_counters.last_number < excluded.last_number;
end $$;

-- 3) claims : même bug (compteur non atomique + %05s), pas encore déclenché
--    (aucune réclamation créée à ce jour) mais corrigé avant utilisation —
--    aligné sur le schéma commun next_document_number (préfixe "REC").
-- generate_claim_number est une FONCTION DE TRIGGER depuis la migration 0011
-- (trigger generate_claim_number_trigger sur claims). La passer en
-- "returns text" échouait ("cannot change return type of existing function")
-- et, si elle avait abouti, aurait cassé le trigger. On conserve donc la
-- signature trigger et on remplace seulement le calcul racy par le compteur
-- atomique next_document_number.
create or replace function public.generate_claim_number()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.number is null then
    new.number := public.next_document_number('REC', 'claims');
  end if;
  return new;
end;
$function$;

-- ============================================================================
-- Caractère ERP — Les lignes de commande pointent vers la fiche catalogue
--
-- pipeline_order_items ne conservait que le nom de l'article, recopié depuis
-- une saisie libre. Deux conséquences observées en production : des libellés
-- divergents pour un même article (« TSHIRT », « TSHIRT » avec espace final,
-- « Tsgirt », « Tshurt ») et un tableau des ventes qui comptait chacun d'eux
-- comme un produit distinct.
--
-- product_name est conservé à côté de la clé, volontairement : une commande
-- doit garder trace de ce qui a été vendu, même si la fiche produit est
-- renommée ou retirée du catalogue plus tard. La clé sert aux regroupements
-- et aux statistiques, le nom au document commercial.
--
-- ON DELETE SET NULL plutôt que RESTRICT : retirer un article du catalogue ne
-- doit pas être bloqué par des commandes anciennes, dont le libellé subsiste.
-- ============================================================================

alter table public.pipeline_order_items
  add column if not exists product_id uuid references public.products(id) on delete set null;

-- Rattachement de l'historique. Les libellés ayant été normalisés au préalable
-- sur les noms du catalogue, la correspondance est exhaustive.
update public.pipeline_order_items i
   set product_id = p.id
  from public.products p
 where lower(trim(p.name)) = lower(trim(i.product_name))
   and i.product_id is null;

create index if not exists pipeline_order_items_product_idx
  on public.pipeline_order_items(product_id);

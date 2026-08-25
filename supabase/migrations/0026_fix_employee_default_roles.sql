-- ============================================================================
-- Caractère ERP — Correctif critique : tous les employés (sauf l'admin)
-- étaient bloqués en rôle "readonly" depuis la création de leurs comptes
-- (migrations 0015/0016), et ne pouvaient donc RIEN écrire dans l'ERP —
-- ni créer de commande, ni faire avancer une commande en production, ni
-- ajouter un contact CRM, etc. (presque toutes les policies RLS d'écriture
-- sont de la forme "current_role() <> 'readonly'").
--
-- handle_new_user() (voir 0007_fix_new_user_trigger.sql) assigne 'readonly'
-- par défaut à tout nouveau compte auth (sauf le tout premier, promu
-- 'admin') — un choix de sécurité raisonnable, mais personne n'était
-- ensuite repassé sur un rôle correspondant à son poste. Symptôme observé :
-- "new row violates row-level security policy for table pipeline_orders"
-- dès qu'un employé (hors admin) tentait de créer une commande.
--
-- Ce correctif attribue un rôle fonctionnel selon le département de chaque
-- employé actif. Les rôles futurs restent modifiables depuis
-- Paramètres > Utilisateurs (déjà disponible, voir components/settings/user-row.tsx).
-- ============================================================================
update public.profiles p
set role = 'atelier'
from public.employees e
where e.profile_id = p.id
  and e.department in ('Atelier DTF', 'Atelier Flocage', 'Atelier Broderie')
  and p.role = 'readonly';

update public.profiles p
set role = 'sales'
from public.employees e
where e.profile_id = p.id
  and e.department in ('Commercial', 'Réception WhatsApp')
  and p.role = 'readonly';

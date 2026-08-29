# 🔐 Système de Permissions - Caractère ERP

## Vue d'ensemble

Le système de permissions contrôle qui peut créer, modifier et supprimer les ressources dans l'application. Les permissions sont basées sur le **rôle** de l'utilisateur.

## 🎯 Rôles disponibles

| Rôle | Description | Tableau de bord |
|------|-------------|-----------------|
| `admin` | Administrateur système | Accès complet à toutes les ressources |
| `manager` | Manager/Responsable | Gestion équipe, supervisions |
| `sales` | Commercial | **Clients, Articles, Opportunités** |
| `purchasing` | Acheteur/Approvisionneur | Produits, Catégories, Achats |
| `accounting` | Comptable | Factures, Paiements |
| `stock` | Responsable stock | Stock, Mouvements |
| `hr` | Ressources Humaines | Employés, Formations, Absences |
| `atelier` | Opérateur atelier | Production (lecture seule) |
| `readonly` | Lecture seule | Aucune modification |

## 📋 Matrice de permissions

### Contacts/Clients
```
✅ admin       - Créer, modifier, supprimer
✅ manager     - Créer, modifier, supprimer
✅ sales       - Créer, modifier, supprimer  [Hafid, Abderrahmane]
❌ autres      - Lecture seule
```

### Produits/Articles
```
✅ admin       - Créer, modifier, supprimer
✅ manager     - Créer, modifier, supprimer
✅ purchasing  - Créer, modifier, supprimer
✅ sales       - Créer, modifier, supprimer  [Hafid, Abderrahmane]
❌ autres      - Lecture seule
```

### Opportunités
```
✅ admin       - Créer, modifier, supprimer
✅ manager     - Créer, modifier, supprimer
✅ sales       - Créer, modifier, supprimer
❌ autres      - Lecture seule
```

### Catégories de produits
```
✅ admin       - Créer, modifier, supprimer
✅ manager     - Créer, modifier, supprimer
✅ purchasing  - Créer, modifier, supprimer
❌ autres      - Lecture seule
```

## 👥 Cas spécifique : Hafid & Abderrahmane

**Hafid** et **Abderrahmane** (Commerciaux) ont le rôle **`sales`** qui leur permet de :

✅ **Modifier les informations des clients**
- Nom, type, email, téléphone
- Adresse, ville, code postal
- Notes et commentaires

✅ **Modifier les informations des articles**
- Nom de l'article
- Prix
- Description
- Catégorie
- Disponibilité

✅ **Gérer les opportunités**
- Créer de nouvelles opportunités
- Mettre à jour le statut
- Ajouter des montants

## 🔧 Comment assigner les rôles

### Via la base de données Supabase

```sql
-- Assigner le rôle "sales" à Hafid
UPDATE public.profiles 
SET role = 'sales'
WHERE id IN (
  SELECT e.profile_id FROM public.employees e 
  WHERE e.first_name = 'Hafid'
);

-- Vérifier le rôle assigné
SELECT e.first_name, p.role 
FROM public.employees e
LEFT JOIN public.profiles p ON p.id = e.profile_id
WHERE e.first_name IN ('Hafid', 'Abderrahmane');
```

### Via l'interface d'administration (une fois implémentée)

1. Aller à **Paramètres** → **Utilisateurs**
2. Cliquer sur l'utilisateur (Hafid ou Abderrahmane)
3. Modifier le **Rôle** en **"Sales"**
4. Sauvegarder

## 📁 Fichiers concernés

- `lib/actions/entity-actions.ts` - Vérification des permissions côté serveur
- `components/entity/entity-list.tsx` - Affichage conditionnel des boutons
- `components/entity/entity-form-page.tsx` - Vérification d'accès au formulaire
- `lib/roles.ts` - Définition des rôles

## ⚠️ Notes de sécurité

1. Les permissions sont **vérifiées côté serveur** dans les server actions
2. Les boutons d'action sont **masqués côté client** si l'utilisateur n'a pas de permissions
3. Un message d'erreur s'affiche si quelqu'un tente d'accéder à une ressource sans permissions
4. Row-Level Security (RLS) peut être ajouté à PostgreSQL pour plus de sécurité

## 🚀 Cas d'usage

### Scénario 1 : Hafid modifie un client
1. Hafid navigue vers **CRM** → **Contacts**
2. Clique sur un contact pour l'éditer
3. ✅ Formulaire s'affiche (rôle `sales` autorisé)
4. Modifie les infos du client
5. Clique **Enregistrer**

### Scénario 2 : Hafid met à jour un prix d'article
1. Hafid navigue vers **Inventory** → **Produits**
2. Clique sur un produit
3. ✅ Formulaire s'affiche (rôle `sales` autorisé)
4. Change le prix
5. Clique **Enregistrer**

### Scénario 3 : Opérateur atelier (rôle `atelier`) tente de modifier
1. Opérateur navigue vers **CRM** → **Contacts**
2. Clique sur un contact
3. ❌ Message d'erreur : "Vous n'avez pas la permission de modifier les contacts"
4. Le formulaire ne s'affiche pas

## 🔄 Ajouter une nouvelle permission

Pour ajouter une nouvelle table aux permissions :

1. Ouvrir `lib/actions/entity-actions.ts`
2. Ajouter à `TABLE_PERMISSIONS` :
```typescript
const TABLE_PERMISSIONS: Record<string, string[]> = {
  // ...
  ma_nouvelle_table: ["admin", "manager", "mon_role"],
};
```

3. Ouvrir `components/entity/entity-list.tsx`
4. Ajouter à `TABLE_PERMISSIONS` :
```typescript
const TABLE_PERMISSIONS: Record<string, string[]> = {
  // ...
  ma_nouvelle_table: ["admin", "manager", "mon_role"],
};
```

5. Ouvrir `components/entity/entity-form-page.tsx`
6. Ajouter à `TABLE_PERMISSIONS` :
```typescript
const TABLE_PERMISSIONS: Record<string, string[]> = {
  // ...
  ma_nouvelle_table: ["admin", "manager", "mon_role"],
};
```

## ✅ Checklist pour Hafid & Abderrahmane

- [ ] Vérifier que Hafid a le rôle `sales` dans la base
- [ ] Vérifier que Abderrahmane a le rôle `sales` dans la base
- [ ] Tester la modification d'un client
- [ ] Tester la modification d'un article (prix, nom)
- [ ] Tester l'accès refusé avec un autre rôle

---

**Dernière mise à jour**: 2026-08-29  
**Version**: 1.0

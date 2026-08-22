// Framework CRUD générique : chaque module "simple" (sans lignes de document)
// est décrit ici par une configuration plutôt que par du code dupliqué —
// approche inspirée des ORM/vues déclaratives des grands ERP (Odoo, etc.).

import { EMPLOYEE_COLORS } from "@/lib/colors";

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "textarea"
  | "number"
  | "date"
  | "checkbox"
  | "select"
  | "relation";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  step?: string;
  options?: { value: string; label: string }[]; // pour type "select"
  relationTable?: string; // pour type "relation"
  relationLabelField?: string; // colonne à afficher dans les <option>
  hideInTable?: boolean;
}

export interface ColumnConfig {
  key: string;
  label: string;
}

export interface EntityConfig {
  table: string;
  basePath: string; // ex: /crm/contacts
  titleSingular: string;
  titlePlural: string;
  columns: ColumnConfig[];
  fields: FieldConfig[];
  orderBy?: string;
  ascending?: boolean;
}

export const contactsConfig: EntityConfig = {
  table: "contacts",
  basePath: "/crm/contacts",
  titleSingular: "Contact",
  titlePlural: "Contacts",
  orderBy: "created_at",
  ascending: false,
  columns: [
    { key: "name", label: "Nom" },
    { key: "type", label: "Type" },
    { key: "company_name", label: "Société" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Téléphone" },
  ],
  fields: [
    { name: "name", label: "Nom", type: "text", required: true },
    {
      name: "type",
      label: "Type",
      type: "select",
      required: true,
      options: [
        { value: "client", label: "Client" },
        { value: "prospect", label: "Prospect" },
        { value: "fournisseur", label: "Fournisseur" },
        { value: "autre", label: "Autre" },
      ],
    },
    { name: "company_name", label: "Société", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Téléphone", type: "tel" },
    { name: "address", label: "Adresse", type: "text" },
    { name: "city", label: "Ville", type: "text" },
    { name: "postal_code", label: "Code postal", type: "text" },
    { name: "country", label: "Pays", type: "text" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
};

export const opportunitiesConfig: EntityConfig = {
  table: "opportunities",
  basePath: "/crm/opportunities",
  titleSingular: "Opportunité",
  titlePlural: "Opportunités",
  orderBy: "created_at",
  ascending: false,
  columns: [
    { key: "title", label: "Titre" },
    { key: "stage", label: "Étape" },
    { key: "amount", label: "Montant" },
  ],
  fields: [
    { name: "title", label: "Titre", type: "text", required: true },
    {
      name: "contact_id",
      label: "Contact",
      type: "relation",
      relationTable: "contacts",
      relationLabelField: "name",
    },
    {
      name: "stage",
      label: "Étape",
      type: "select",
      required: true,
      options: [
        { value: "nouveau", label: "Nouveau" },
        { value: "qualification", label: "Qualification" },
        { value: "proposition", label: "Proposition" },
        { value: "negociation", label: "Négociation" },
        { value: "gagne", label: "Gagné" },
        { value: "perdu", label: "Perdu" },
      ],
    },
    { name: "amount", label: "Montant (DA)", type: "number", step: "0.01" },
    { name: "expected_close_date", label: "Date de clôture prévue", type: "date" },
  ],
};

export const productCategoriesConfig: EntityConfig = {
  table: "product_categories",
  basePath: "/inventory/categories",
  titleSingular: "Catégorie",
  titlePlural: "Catégories de produits",
  orderBy: "name",
  ascending: true,
  columns: [
    { key: "name", label: "Nom" },
    { key: "description", label: "Description" },
  ],
  fields: [
    { name: "name", label: "Nom", type: "text", required: true },
    { name: "description", label: "Description", type: "textarea" },
  ],
};

export const productsConfig: EntityConfig = {
  table: "products",
  basePath: "/inventory/products",
  titleSingular: "Produit",
  titlePlural: "Produits",
  orderBy: "name",
  ascending: true,
  columns: [
    { key: "sku", label: "Référence" },
    { key: "name", label: "Nom" },
    { key: "sale_price", label: "Prix de vente" },
    { key: "purchase_cost", label: "Coût d'achat" },
    { key: "track_inventory", label: "Suivi stock" },
  ],
  fields: [
    { name: "sku", label: "Référence (SKU)", type: "text", required: true },
    { name: "name", label: "Nom", type: "text", required: true },
    { name: "description", label: "Description", type: "textarea" },
    {
      name: "category_id",
      label: "Catégorie",
      type: "relation",
      relationTable: "product_categories",
      relationLabelField: "name",
    },
    { name: "unit", label: "Unité", type: "text" },
    { name: "sale_price", label: "Prix de vente HT", type: "number", step: "0.01", required: true },
    { name: "purchase_cost", label: "Coût d'achat HT", type: "number", step: "0.01" },
    { name: "tax_rate", label: "Taux de TVA (%)", type: "number", step: "0.01" },
    { name: "track_inventory", label: "Suivre le stock", type: "checkbox" },
    { name: "reorder_point", label: "Seuil de réapprovisionnement", type: "number", step: "0.01" },
    { name: "is_active", label: "Actif", type: "checkbox" },
  ],
};

export const warehousesConfig: EntityConfig = {
  table: "warehouses",
  basePath: "/inventory/warehouses",
  titleSingular: "Entrepôt",
  titlePlural: "Entrepôts",
  columns: [
    { key: "name", label: "Nom" },
    { key: "address", label: "Adresse" },
    { key: "is_default", label: "Par défaut" },
  ],
  fields: [
    { name: "name", label: "Nom", type: "text", required: true },
    { name: "address", label: "Adresse", type: "textarea" },
    { name: "is_default", label: "Entrepôt par défaut", type: "checkbox" },
  ],
};

export const suppliersConfig: EntityConfig = {
  table: "suppliers",
  basePath: "/purchasing/suppliers",
  titleSingular: "Fournisseur",
  titlePlural: "Fournisseurs",
  orderBy: "name",
  ascending: true,
  columns: [
    { key: "name", label: "Nom" },
    { key: "contact_name", label: "Contact" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Téléphone" },
  ],
  fields: [
    { name: "name", label: "Nom", type: "text", required: true },
    { name: "contact_name", label: "Nom du contact", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Téléphone", type: "tel" },
    { name: "address", label: "Adresse", type: "text" },
    { name: "city", label: "Ville", type: "text" },
    { name: "postal_code", label: "Code postal", type: "text" },
    { name: "country", label: "Pays", type: "text" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
};

export const employeesConfig: EntityConfig = {
  table: "employees",
  basePath: "/hr/employees",
  titleSingular: "Employé",
  titlePlural: "Employés",
  orderBy: "last_name",
  ascending: true,
  columns: [
    { key: "color", label: "Couleur" },
    { key: "last_name", label: "Nom" },
    { key: "first_name", label: "Prénom" },
    { key: "position", label: "Poste" },
    { key: "department", label: "Service" },
    { key: "status", label: "Statut" },
  ],
  fields: [
    { name: "first_name", label: "Prénom", type: "text", required: true },
    { name: "last_name", label: "Nom", type: "text", required: true },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Téléphone", type: "tel" },
    { name: "position", label: "Poste", type: "text" },
    { name: "color", label: "Couleur (repérage sur les commandes)", type: "select", options: EMPLOYEE_COLORS },
    {
      name: "department",
      label: "Service",
      type: "select",
      options: [
        { value: "Réception WhatsApp", label: "Réception WhatsApp" },
        { value: "Commercial", label: "Commercial" },
        { value: "Atelier DTF", label: "Atelier DTF" },
        { value: "Atelier Broderie", label: "Atelier Broderie" },
        { value: "Atelier Flocage", label: "Atelier Flocage" },
        { value: "Administration", label: "Administration" },
      ],
    },
    { name: "hire_date", label: "Date d'embauche", type: "date" },
    {
      name: "status",
      label: "Statut",
      type: "select",
      options: [
        { value: "actif", label: "Actif" },
        { value: "conge", label: "En congé" },
        { value: "sorti", label: "Sorti des effectifs" },
      ],
    },
    {
      name: "profile_id",
      label: "Compte utilisateur lié",
      type: "relation",
      relationTable: "profiles",
      relationLabelField: "full_name",
    },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
};

export const projectsConfig: EntityConfig = {
  table: "projects",
  basePath: "/projects",
  titleSingular: "Projet",
  titlePlural: "Projets",
  orderBy: "created_at",
  ascending: false,
  columns: [
    { key: "name", label: "Nom" },
    { key: "status", label: "Statut" },
    { key: "start_date", label: "Début" },
    { key: "budget", label: "Budget" },
  ],
  fields: [
    { name: "name", label: "Nom du projet", type: "text", required: true },
    {
      name: "contact_id",
      label: "Client",
      type: "relation",
      relationTable: "contacts",
      relationLabelField: "name",
    },
    {
      name: "status",
      label: "Statut",
      type: "select",
      options: [
        { value: "planifie", label: "Planifié" },
        { value: "en_cours", label: "En cours" },
        { value: "termine", label: "Terminé" },
        { value: "annule", label: "Annulé" },
      ],
    },
    { name: "start_date", label: "Date de début", type: "date" },
    { name: "end_date", label: "Date de fin", type: "date" },
    { name: "budget", label: "Budget (DA)", type: "number", step: "0.01" },
    { name: "description", label: "Description", type: "textarea" },
  ],
};

export const chartOfAccountsConfig: EntityConfig = {
  table: "chart_of_accounts",
  basePath: "/accounting/chart-of-accounts",
  titleSingular: "Compte",
  titlePlural: "Plan comptable",
  orderBy: "code",
  ascending: true,
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Libellé" },
    { key: "type", label: "Type" },
    { key: "is_active", label: "Actif" },
  ],
  fields: [
    { name: "code", label: "Code compte", type: "text", required: true },
    { name: "name", label: "Libellé", type: "text", required: true },
    {
      name: "type",
      label: "Type",
      type: "select",
      required: true,
      options: [
        { value: "actif", label: "Actif" },
        { value: "passif", label: "Passif" },
        { value: "charge", label: "Charge" },
        { value: "produit", label: "Produit" },
        { value: "capitaux", label: "Capitaux propres" },
      ],
    },
    { name: "is_active", label: "Actif", type: "checkbox" },
  ],
};

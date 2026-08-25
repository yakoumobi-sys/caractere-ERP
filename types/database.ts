// Types hand-écrits reflétant le schéma Supabase (supabase/migrations).
// Pour un typage 100% généré : `supabase gen types typescript --project-id <id> > types/database.ts`

export type UserRole =
  | "admin"
  | "manager"
  | "sales"
  | "purchasing"
  | "accounting"
  | "stock"
  | "hr"
  | "atelier"
  | "readonly";

export type ContactType = "client" | "prospect" | "fournisseur" | "autre";
export type OpportunityStage =
  | "nouveau"
  | "qualification"
  | "proposition"
  | "negociation"
  | "gagne"
  | "perdu";

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  type: ContactType;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  notes: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  contact_id: string | null;
  title: string;
  stage: OpportunityStage;
  amount: number;
  expected_close_date: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  contact_id: string;
  opportunity_id: string | null;
  type: "note" | "appel" | "email" | "reunion";
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category_id: string | null;
  unit: string;
  sale_price: number;
  purchase_cost: number;
  tax_rate: number;
  track_inventory: boolean;
  reorder_point: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  is_default: boolean;
  created_at: string;
}

export interface StockMove {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  type: "entree" | "sortie" | "ajustement" | "transfert";
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ProductStockLevel {
  product_id: string;
  sku: string;
  name: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PurchaseOrderStatus = "brouillon" | "envoyee" | "recue" | "annulee";

export interface PurchaseOrder {
  id: string;
  number: string | null;
  supplier_id: string | null;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_date: string | null;
  notes: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentLine {
  id: string;
  product_id: string | null;
  description: string | null;
  quantity: number;
  tax_rate: number;
  position: number;
}

export interface PurchaseOrderLine extends DocumentLine {
  po_id: string;
  unit_cost: number;
  received_qty: number;
}

export type QuoteStatus = "brouillon" | "envoye" | "accepte" | "refuse" | "expire";

export interface SalesQuote {
  id: string;
  number: string | null;
  contact_id: string | null;
  status: QuoteStatus;
  quote_date: string;
  valid_until: string | null;
  notes: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesQuoteLine extends DocumentLine {
  quote_id: string;
  unit_price: number;
}

export type SalesOrderStatus = "brouillon" | "confirmee" | "livree" | "facturee" | "annulee";

export interface SalesOrder {
  id: string;
  number: string | null;
  quote_id: string | null;
  contact_id: string | null;
  status: SalesOrderStatus;
  order_date: string;
  notes: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesOrderLine extends DocumentLine {
  order_id: string;
  unit_price: number;
}

export type InvoiceStatus = "brouillon" | "validee" | "payee" | "annulee";

export interface Invoice {
  id: string;
  number: string | null;
  order_id: string | null;
  contact_id: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine extends DocumentLine {
  invoice_id: string;
  unit_price: number;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  method: "virement" | "carte" | "especes" | "cheque" | "autre";
  paid_at: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type AccountType = "actif" | "passif" | "charge" | "produit" | "capitaux";

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  is_active: boolean;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  reference: string | null;
  description: string | null;
  source_type: string | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface JournalLine {
  id: string;
  entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  label: string | null;
}

export type EmployeeStatus = "actif" | "conge" | "sorti";

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  hire_date: string | null;
  status: EmployeeStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = "planifie" | "en_cours" | "termine" | "annule";

export interface Project {
  id: string;
  name: string;
  contact_id: string | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  budget: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  siret: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  created_at: string;
}

// Typage générique minimal pour satisfaire le client Supabase (@supabase/ssr).
// Chaque table utilise Row/Insert/Update identiques (Partial pour Insert/Update),
// suffisant pour une app interne — remplacer par des types générés pour plus de rigueur.
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row> };

export interface Database {
  public: {
    Tables: {
      companies: Table<Company>;
      profiles: Table<Profile>;
      contacts: Table<Contact>;
      opportunities: Table<Opportunity>;
      activities: Table<Activity>;
      product_categories: Table<ProductCategory>;
      products: Table<Product>;
      warehouses: Table<Warehouse>;
      stock_moves: Table<StockMove>;
      suppliers: Table<Supplier>;
      purchase_orders: Table<PurchaseOrder>;
      purchase_order_lines: Table<PurchaseOrderLine>;
      sales_quotes: Table<SalesQuote>;
      sales_quote_lines: Table<SalesQuoteLine>;
      sales_orders: Table<SalesOrder>;
      sales_order_lines: Table<SalesOrderLine>;
      invoices: Table<Invoice>;
      invoice_lines: Table<InvoiceLine>;
      payments: Table<Payment>;
      chart_of_accounts: Table<ChartOfAccount>;
      journal_entries: Table<JournalEntry>;
      journal_lines: Table<JournalLine>;
      employees: Table<Employee>;
      projects: Table<Project>;
    };
    Views: {
      product_stock_levels: { Row: ProductStockLevel };
    };
  };
}

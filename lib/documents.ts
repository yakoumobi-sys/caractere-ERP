// Framework "documents" : en-tête + lignes (devis, commandes, factures, commandes fournisseur).
import type { FieldConfig } from "@/lib/entities";

export interface DocumentConfig {
  headerTable: string;
  lineTable: string;
  lineFk: string;
  basePath: string;
  priceField: "unit_price" | "unit_cost";
  contactField: "contact_id" | "supplier_id";
  contactTable: "contacts" | "suppliers";
  contactLabel: string;
  titleSingular: string;
  titlePlural: string;
  statusOptions: { value: string; label: string }[];
  extraHeaderFields: FieldConfig[];
  dateField: string;
}

export const quotesConfig: DocumentConfig = {
  headerTable: "sales_quotes",
  lineTable: "sales_quote_lines",
  lineFk: "quote_id",
  basePath: "/sales/quotes",
  priceField: "unit_price",
  contactField: "contact_id",
  contactTable: "contacts",
  contactLabel: "Client / prospect",
  titleSingular: "Devis",
  titlePlural: "Devis",
  dateField: "quote_date",
  statusOptions: [
    { value: "brouillon", label: "Brouillon" },
    { value: "envoye", label: "Envoyé" },
    { value: "accepte", label: "Accepté" },
    { value: "refuse", label: "Refusé" },
    { value: "expire", label: "Expiré" },
  ],
  extraHeaderFields: [
    { name: "quote_date", label: "Date du devis", type: "date" },
    { name: "valid_until", label: "Valide jusqu'au", type: "date" },
  ],
};

export const ordersConfig: DocumentConfig = {
  headerTable: "sales_orders",
  lineTable: "sales_order_lines",
  lineFk: "order_id",
  basePath: "/sales/orders",
  priceField: "unit_price",
  contactField: "contact_id",
  contactTable: "contacts",
  contactLabel: "Client",
  titleSingular: "Commande client",
  titlePlural: "Commandes clients",
  dateField: "order_date",
  statusOptions: [
    { value: "brouillon", label: "Brouillon" },
    { value: "confirmee", label: "Confirmée" },
    { value: "livree", label: "Livrée" },
    { value: "facturee", label: "Facturée" },
    { value: "annulee", label: "Annulée" },
  ],
  extraHeaderFields: [{ name: "order_date", label: "Date de commande", type: "date" }],
};

export const invoicesConfig: DocumentConfig = {
  headerTable: "invoices",
  lineTable: "invoice_lines",
  lineFk: "invoice_id",
  basePath: "/sales/invoices",
  priceField: "unit_price",
  contactField: "contact_id",
  contactTable: "contacts",
  contactLabel: "Client",
  titleSingular: "Facture",
  titlePlural: "Factures",
  dateField: "issue_date",
  statusOptions: [
    { value: "brouillon", label: "Brouillon" },
    { value: "validee", label: "Validée" },
    { value: "payee", label: "Payée" },
    { value: "annulee", label: "Annulée" },
  ],
  extraHeaderFields: [
    { name: "issue_date", label: "Date d'émission", type: "date" },
    { name: "due_date", label: "Date d'échéance", type: "date" },
  ],
};

export const purchaseOrdersConfig: DocumentConfig = {
  headerTable: "purchase_orders",
  lineTable: "purchase_order_lines",
  lineFk: "po_id",
  basePath: "/purchasing/orders",
  priceField: "unit_cost",
  contactField: "supplier_id",
  contactTable: "suppliers",
  contactLabel: "Fournisseur",
  titleSingular: "Commande fournisseur",
  titlePlural: "Commandes fournisseurs",
  dateField: "order_date",
  statusOptions: [
    { value: "brouillon", label: "Brouillon" },
    { value: "envoyee", label: "Envoyée" },
    { value: "recue", label: "Reçue" },
    { value: "annulee", label: "Annulée" },
  ],
  extraHeaderFields: [
    { name: "order_date", label: "Date de commande", type: "date" },
    { name: "expected_date", label: "Date attendue", type: "date" },
  ],
};

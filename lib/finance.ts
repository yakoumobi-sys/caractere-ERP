import { z } from "zod";

export const moneyInput = z
  .number()
  .finite()
  .positive()
  .max(9999999999.99)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001,
    "Deux décimales maximum.",
  );
export const documentLineSchema = z
  .object({
    product_id: z.string().uuid().nullable().or(z.literal("")),
    description: z.string().trim().max(2000),
    quantity: z.number().finite().positive().max(9999999999.99),
    price: z.number().finite().min(0).max(9999999999.99),
    tax_rate: z.number().finite().min(0).max(100),
  })
  .refine(
    (line) => !!line.product_id || !!line.description,
    "Ajoutez un produit ou une description.",
  );
export const documentLinesSchema = z
  .array(documentLineSchema)
  .min(1, "Ajoutez au moins une ligne.")
  .max(500);
export const invoiceMethods = [
  "virement",
  "carte",
  "especes",
  "cheque",
  "autre",
] as const;
export const orderMethods = [
  "cash",
  "transfer",
  "card",
  "check",
  "yalidine",
  "other",
] as const;
export const methodLabels: Record<string, string> = {
  virement: "Virement",
  transfer: "Virement",
  carte: "Carte",
  card: "Carte",
  especes: "Espèces",
  cash: "Espèces",
  cheque: "Chèque",
  check: "Chèque",
  yalidine: "Yalidine",
  autre: "Autre",
  other: "Autre",
};
export function invoiceBalance(invoice: {
  total: number | string;
  amount_paid: number | string;
}) {
  return Math.max(
    0,
    Math.round((Number(invoice.total) - Number(invoice.amount_paid)) * 100) /
      100,
  );
}
export function isOverdue(
  invoice: {
    status: string;
    due_date?: string | null;
    total: number | string;
    amount_paid: number | string;
  },
  today: string,
) {
  return (
    invoice.status === "validee" &&
    !!invoice.due_date &&
    invoice.due_date < today &&
    invoiceBalance(invoice) > 0
  );
}
export function businessDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

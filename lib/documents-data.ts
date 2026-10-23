import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DocumentConfig } from "@/lib/documents";

export async function getDocumentFormData(config: DocumentConfig, id?: string) {
  const supabase = createClient();
  const isNew = !id || id === "new";

  let record: Record<string, any> | null = null;
  let lines: Array<Record<string, any>> = [];
  if (!isNew) {
    const [{ data: headerData, error }, { data: linesData, error: linesError }] = await Promise.all([
      supabase.from(config.headerTable).select("*").eq("id", id).single(),
      supabase.from(config.lineTable).select("*").eq(config.lineFk, id).order("position"),
    ]);
    if (error || !headerData) notFound();
    if (linesError) throw new Error("Lignes indisponibles : le document ne peut pas être édité.");
    record = headerData;
    lines = linesData ?? [];
  }

  const priceColumn = config.priceField === "unit_cost" ? "purchase_cost" : "sale_price";
  const [{ data: contacts, error: contactError }, { data: products, error: productError }] = await Promise.all([
    supabase.from(config.contactTable).select("id, name").order("name"),
    supabase.from("products").select(`id, sku, name, tax_rate, quantity_prices, minimum_quantity, quote_required, ${priceColumn}`).eq("is_active", true).order("name"),
  ]);

  if (contactError || productError) throw new Error("Catalogue ou clients indisponibles : vérifiez les migrations.");
  return {
    record,
    lines,
    contacts: (contacts ?? []) as { id: string; name: string }[],
    products: (products ?? []).map((p: any) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      tax_rate: Number(p.tax_rate),
      price: Number(p[priceColumn]),
      quantity_prices: p.quantity_prices, minimum_quantity: p.minimum_quantity, quote_required: p.quote_required,
    })),
  };
}

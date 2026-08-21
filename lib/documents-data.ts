import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DocumentConfig } from "@/lib/documents";

export async function getDocumentFormData(config: DocumentConfig, id?: string) {
  const supabase = createClient();
  const isNew = !id || id === "new";

  let record: Record<string, any> | null = null;
  let lines: Array<Record<string, any>> = [];
  if (!isNew) {
    const [{ data: headerData, error }, { data: linesData }] = await Promise.all([
      supabase.from(config.headerTable).select("*").eq("id", id).single(),
      supabase.from(config.lineTable).select("*").eq(config.lineFk, id).order("position"),
    ]);
    if (error || !headerData) notFound();
    record = headerData;
    lines = linesData ?? [];
  }

  const priceColumn = config.priceField === "unit_cost" ? "purchase_cost" : "sale_price";
  const [{ data: contacts }, { data: products }] = await Promise.all([
    supabase.from(config.contactTable).select("id, name").order("name"),
    supabase.from("products").select(`id, sku, name, tax_rate, ${priceColumn}`).eq("is_active", true).order("name"),
  ]);

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
    })),
  };
}

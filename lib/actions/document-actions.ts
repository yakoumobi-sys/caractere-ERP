"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DocumentConfig } from "@/lib/documents";

interface LineInput {
  product_id: string | null;
  description: string;
  quantity: number;
  price: number;
  tax_rate: number;
}

export async function saveDocument(config: DocumentConfig, id: string | null, formData: FormData) {
  const supabase = createClient();

  const header: Record<string, unknown> = {
    [config.contactField]: formData.get(config.contactField) || null,
    status: formData.get("status") || "brouillon",
    notes: formData.get("notes") || null,
  };
  for (const field of config.extraHeaderFields) {
    const raw = formData.get(field.name);
    header[field.name] = raw ? String(raw) : null;
  }

  let headerId = id;
  if (id) {
    const { error } = await supabase.from(config.headerTable).update(header).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from(config.headerTable).insert(header).select("id").single();
    if (error) throw new Error(error.message);
    headerId = data.id as string;
  }

  const lines = JSON.parse(String(formData.get("lines_json") ?? "[]")) as LineInput[];

  await supabase.from(config.lineTable).delete().eq(config.lineFk, headerId as string);

  if (lines.length > 0) {
    const rows = lines
      .filter((l) => l.product_id || l.description)
      .map((l, i) => ({
        [config.lineFk]: headerId,
        product_id: l.product_id || null,
        description: l.description || null,
        quantity: Number(l.quantity) || 0,
        [config.priceField]: Number(l.price) || 0,
        tax_rate: Number(l.tax_rate) || 0,
        position: i,
      }));
    if (rows.length > 0) {
      const { error } = await supabase.from(config.lineTable).insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  revalidatePath(config.basePath);
  redirect(`${config.basePath}/${headerId}`);
}

export async function deleteDocument(config: DocumentConfig, id: string) {
  const supabase = createClient();
  const { error } = await supabase.from(config.headerTable).delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(config.basePath);
  redirect(config.basePath);
}

export async function setDocumentStatus(config: DocumentConfig, id: string, status: string) {
  const supabase = createClient();
  const { error } = await supabase.from(config.headerTable).update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(config.basePath);
  revalidatePath(`${config.basePath}/${id}`);
}

/** Devis accepté -> commande client (recopie l'en-tête et les lignes) */
export async function convertQuoteToOrder(quoteId: string) {
  const supabase = createClient();
  const { data: quote, error: qErr } = await supabase.from("sales_quotes").select("*").eq("id", quoteId).single();
  if (qErr || !quote) throw new Error(qErr?.message ?? "Devis introuvable");

  const { data: lines } = await supabase.from("sales_quote_lines").select("*").eq("quote_id", quoteId);

  const { data: order, error: oErr } = await supabase
    .from("sales_orders")
    .insert({ quote_id: quoteId, contact_id: quote.contact_id, notes: quote.notes, status: "brouillon" })
    .select("id")
    .single();
  if (oErr || !order) throw new Error(oErr?.message ?? "Erreur de création de la commande");

  if (lines && lines.length > 0) {
    const rows = lines.map((l: any) => ({
      order_id: order.id,
      product_id: l.product_id,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: l.tax_rate,
      position: l.position,
    }));
    await supabase.from("sales_order_lines").insert(rows);
  }

  revalidatePath("/sales/orders");
  redirect(`/sales/orders/${order.id}`);
}

/** Commande client confirmée -> facture (recopie l'en-tête et les lignes) */
export async function convertOrderToInvoice(orderId: string) {
  const supabase = createClient();
  const { data: order, error: oErr } = await supabase.from("sales_orders").select("*").eq("id", orderId).single();
  if (oErr || !order) throw new Error(oErr?.message ?? "Commande introuvable");

  const { data: lines } = await supabase.from("sales_order_lines").select("*").eq("order_id", orderId);

  const { data: invoice, error: iErr } = await supabase
    .from("invoices")
    .insert({ order_id: orderId, contact_id: order.contact_id, notes: order.notes, status: "brouillon" })
    .select("id")
    .single();
  if (iErr || !invoice) throw new Error(iErr?.message ?? "Erreur de création de la facture");

  if (lines && lines.length > 0) {
    const rows = lines.map((l: any) => ({
      invoice_id: invoice.id,
      product_id: l.product_id,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: l.tax_rate,
      position: l.position,
    }));
    await supabase.from("invoice_lines").insert(rows);
  }

  await supabase.from("sales_orders").update({ status: "facturee" }).eq("id", orderId);

  revalidatePath("/sales/invoices");
  redirect(`/sales/invoices/${invoice.id}`);
}

export async function addPayment(invoiceId: string, formData: FormData) {
  const supabase = createClient();
  const amount = Number(formData.get("amount") ?? 0);
  const method = String(formData.get("method") ?? "virement");
  const paid_at = String(formData.get("paid_at") ?? new Date().toISOString().slice(0, 10));
  const note = (formData.get("note") as string) || null;

  const { error } = await supabase.from("payments").insert({ invoice_id: invoiceId, amount, method, paid_at, note });
  if (error) throw new Error(error.message);

  revalidatePath(`/sales/invoices/${invoiceId}`);
}

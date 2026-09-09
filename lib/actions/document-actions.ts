"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  quotesConfig,
  ordersConfig,
  invoicesConfig,
  purchaseOrdersConfig,
  type DocumentConfig,
} from "@/lib/documents";
import {
  businessDate,
  documentLinesSchema,
  invoiceMethods,
  moneyInput,
} from "@/lib/finance";

function trustedConfig(input: DocumentConfig) {
  const config = [
    quotesConfig,
    ordersConfig,
    invoicesConfig,
    purchaseOrdersConfig,
  ].find((c) => c.headerTable === input.headerTable);
  if (!config) throw new Error("Type de document invalide.");
  return config;
}
async function authorize(config: DocumentConfig) {
  const profile = await getCurrentProfile();
  const allowed =
    config.headerTable === "purchase_orders"
      ? ["admin", "manager", "purchasing"]
      : ["admin", "manager", "sales", "accounting"];
  if (!profile?.is_active || !allowed.includes(profile.role))
    throw new Error("Accès refusé.");
  return profile;
}
function refresh(config: DocumentConfig, id?: string) {
  revalidatePath(config.basePath);
  if (id) revalidatePath(`${config.basePath}/${id}`);
  revalidatePath("/cash");
  revalidatePath("/dashboard");
}
export async function saveDocument(
  input: DocumentConfig,
  id: string | null,
  formData: FormData,
) {
  const config = trustedConfig(input);
  await authorize(config);
  const parsed = documentLinesSchema.safeParse(
    JSON.parse(String(formData.get("lines_json") ?? "[]")),
  );
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const header: Record<string, unknown> = {
    [config.contactField]: formData.get(config.contactField),
    status: formData.get("status") || "brouillon",
    notes: formData.get("notes") || null,
  };
  for (const field of config.extraHeaderFields)
    header[field.name] =
      formData.get(field.name) ||
      (field.name === config.dateField ? businessDate() : null);
  const { data, error } = await createClient().rpc("save_commercial_document", {
    p_kind: config.headerTable,
    p_id: id,
    p_header: header,
    p_lines: parsed.data,
  });
  if (error) throw new Error(error.message);
  refresh(config, data);
  return { id: String(data) };
}
export async function deleteDocument(input: DocumentConfig, id: string) {
  const config = trustedConfig(input);
  await authorize(config);
  const { data, error } = await createClient()
    .from(config.headerTable)
    .delete()
    .eq("id", id)
    .eq("status", "brouillon")
    .select("id")
    .single();
  if (error || !data) throw new Error("Seul un brouillon peut être supprimé.");
  refresh(config);
  redirect(config.basePath);
}
export async function setDocumentStatus(
  input: DocumentConfig,
  id: string,
  status: string,
) {
  const config = trustedConfig(input);
  await authorize(config);
  if (
    !config.statusOptions.some((s) => s.value === status) ||
    (config.headerTable === "invoices" && status !== "validee")
  )
    throw new Error("Transition non autorisée.");
  const { error } = await createClient()
    .from(config.headerTable)
    .update({ status })
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  refresh(config, id);
}
async function convert(kind: "quote" | "order", id: string) {
  const config = kind === "quote" ? ordersConfig : invoicesConfig;
  await authorize(config);
  const { data, error } = await createClient().rpc(
    "convert_commercial_document",
    { p_kind: kind, p_id: id },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/sales/orders");
  revalidatePath("/sales/quotes");
  refresh(config, data);
  redirect(`${config.basePath}/${data}`);
}
export async function convertQuoteToOrder(id: string) {
  return convert("quote", id);
}
export async function convertOrderToInvoice(id: string) {
  return convert("order", id);
}
export async function addPayment(invoiceId: string, formData: FormData) {
  const profile = await authorize(invoicesConfig);
  const amount = moneyInput.parse(Number(formData.get("amount")));
  const method = String(formData.get("method") || "virement");
  if (!invoiceMethods.includes(method as (typeof invoiceMethods)[number]))
    throw new Error("Mode de règlement invalide.");
  const paid_at = String(formData.get("paid_at") || businessDate());
  const { error } = await createClient()
    .from("payments")
    .insert({
      invoice_id: invoiceId,
      amount,
      method,
      paid_at,
      note: formData.get("note") || null,
      created_by: profile.id,
      request_id: formData.get("request_id"),
    });
  if (error && error.code !== "23505") throw new Error(error.message);
  refresh(invoicesConfig, invoiceId);
}

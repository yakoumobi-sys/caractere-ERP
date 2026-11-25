"use server";
import { revalidatePath } from "next/cache";
import { guard, s, n, json } from "@/lib/action";
import { rpc } from "@/lib/erp";
import { getMe } from "@/lib/auth";
import type { ActionResult } from "@/components/forms";

export async function stockMove(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "stock_move", s(fd, "item_id"), s(fd, "kind"), n(fd, "qty"), s(fd, "reason"));
    revalidatePath("/stock");
    return "Mouvement enregistré.";
  });
}

export async function saveProduct(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const p: Record<string, unknown> = { ref: s(fd, "ref"), name: s(fd, "name"), kind: s(fd, "kind"), unit: s(fd, "unit") };
    if (s(fd, "sale_price")) p.sale_price = n(fd, "sale_price");
    if (s(fd, "cost")) p.cost = n(fd, "cost");
    const pid = await rpc<string>(me, "upsert_product", p);
    const colors = s(fd, "colors").split(",").map((x) => x.trim()).filter(Boolean);
    const sizes = s(fd, "sizes").split(",").map((x) => x.trim()).filter(Boolean);
    for (const c of colors.length ? colors : [""]) for (const z of sizes.length ? sizes : [""]) await rpc(me, "upsert_stock_item", pid, c, z, n(fd, "threshold") ?? 5);
    revalidatePath("/stock");
    return "Article enregistré.";
  });
}

export async function requestPurchase(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "request_purchase", s(fd, "item_id"), n(fd, "qty"), s(fd, "reason"));
    revalidatePath("/stock/achats");
    return "Demande d'achat envoyée pour validation.";
  });
}

export async function decidePurchase(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "decide_purchase", s(fd, "id"), s(fd, "approve") === "1");
    revalidatePath("/stock/achats");
    return s(fd, "approve") === "1" ? "Achat validé." : "Achat refusé.";
  });
}

export async function previewStockImport(rows: Record<string, string>[]) {
  const me = await getMe();
  if (!me) throw new Error("Session expirée");
  return rpc<any[]>(me, "preview_stock_import", rows);
}

export async function importStock(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    const r = await rpc<{ created: number; updated: number; skipped: number }>(me, "import_stock", json(fd, "rows") || [], s(fd, "mode") || "ignorer");
    revalidatePath("/stock");
    return `${r.created} article(s) créé(s), ${r.updated} inventorié(s), ${r.skipped} ignoré(s).`;
  });
}

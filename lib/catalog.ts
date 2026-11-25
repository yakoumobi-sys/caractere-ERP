import type { Me } from "./auth";
import { q, one } from "./erp";
import type { Product } from "@/components/line-editor";

export async function catalog(me: Me): Promise<Product[]> {
  const rows = await q(me, `select p.id, p.ref, p.name, p.sale_price, coalesce(array_agg(distinct s.color) filter (where s.color <> ''), '{}') colors
    from erp.v_products p left join erp.v_stock s on s.product_id = p.id where p.active and p.kind = 'vetement' group by p.id, p.ref, p.name, p.sale_price order by p.ref`);
  return rows.map((r: any) => ({ ...r, colors: r.colors || [] }));
}
export async function tvaRate(me: Me): Promise<number> {
  const rows = await q(me, "select key, value from erp.v_settings where key in ('tva_rate','tva_enabled')");
  const m = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
  return m.tva_enabled === "false" ? 0 : Number(m.tva_rate ?? 19);
}
export async function setting(me: Me, key: string) {
  return (await one(me, "select value from erp.v_settings where key = $1", [key]))?.value;
}
export function toEditorLines(rows: any[]) {
  return rows.map((l) => ({
    product_id: l.product_id || "", label: l.label, color: l.color, sizes: l.sizes, unit_price: l.unit_price ?? "", services: l.services || [],
    service_price: l.service_price ?? "", discount_pct: l.discount_pct ?? "", placement: l.placement || "coeur", print_width_cm: l.print_width_cm ?? "",
    is_characterized: l.is_characterized, is_gift: l.is_gift,
  }));
}

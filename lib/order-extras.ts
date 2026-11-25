import type { Me } from "./auth";
import { q } from "./erp";

export type OrderExtra = { photos: string[]; lines: { label: string; color: string; sizes: Record<string, number> }[] };

/** Photos (2 premières) et articles de plusieurs commandes, pour les cartes des listes. */
export async function orderExtras(me: Me, ids: string[]): Promise<Record<string, OrderExtra>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return {};
  const [photos, lines] = await Promise.all([
    q(me, "select order_id, (array_agg(id order by created_at))[1:2] ids from erp.v_files where kind = 'photo' and order_id = any($1::uuid[]) group by order_id", [uniq]),
    q(me, "select order_id, label, color, sizes from erp.v_lines where order_id = any($1::uuid[]) order by order_id, position", [uniq]),
  ]);
  const out: Record<string, OrderExtra> = Object.fromEntries(uniq.map((id) => [id, { photos: [], lines: [] }]));
  for (const p of photos as any[]) out[p.order_id].photos = p.ids;
  for (const l of lines as any[]) out[l.order_id]?.lines.push({ label: l.label, color: l.color, sizes: l.sizes });
  return out;
}

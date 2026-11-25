"use client";
import { useMemo, useState } from "react";
import { inputCls, btn } from "./ui";
import { PLACEMENTS, SERVICES, SIZES } from "@/lib/format";

export type Product = { id: string; ref: string; name: string; sale_price: number | null; colors: string[] };
export type Line = {
  product_id: string; label: string; color: string; sizes: Record<string, number | string>; unit_price: number | string; services: string[];
  service_price: number | string; discount_pct: number | string; placement: string; print_width_cm: number | string; is_characterized: boolean; is_gift?: boolean;
};
const empty = (): Line => ({ product_id: "", label: "", color: "", sizes: {}, unit_price: "", services: [], service_price: "", discount_pct: "", placement: "coeur", print_width_cm: "", is_characterized: false });
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;

export function LineEditor({ products, initial, tva }: { products: Product[]; initial?: Line[]; tva: number }) {
  const [lines, setLines] = useState<Line[]>(initial?.length ? initial : [empty()]);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const totals = useMemo(() => {
    const ht = lines.reduce((a, l) => a + (l.is_gift ? 0 : Object.values(l.sizes).reduce((x: number, v) => x + num(v), 0) * (num(l.unit_price) + num(l.service_price)) * (1 - num(l.discount_pct) / 100)), 0);
    return { ht, ttc: ht * (1 + tva / 100) };
  }, [lines, tva]);
  return (
    <div className="space-y-3">
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      {lines.map((l, i) => {
        const p = products.find((x) => x.id === l.product_id);
        const qty = Object.values(l.sizes).reduce((x: number, v) => x + num(v), 0);
        return (
          <div key={i} className="rounded-xl border border-slate-200 p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="text-xs sm:col-span-2">Article
                <select className={inputCls} value={l.product_id} onChange={(e) => { const np = products.find((x) => x.id === e.target.value); set(i, { product_id: e.target.value, label: np?.name || l.label, unit_price: l.unit_price === "" && np?.sale_price ? np.sale_price : l.unit_price, color: np?.colors[0] || l.color }); }}>
                  <option value="">— Vêtement fourni par le client / hors stock —</option>
                  {products.map((x) => <option key={x.id} value={x.id}>{x.ref} · {x.name}</option>)}
                </select>
              </label>
              <label className="text-xs">Libellé<input className={inputCls} value={l.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={p?.name || "Polo brodé"} /></label>
              <label className="text-xs">Couleur
                <input className={inputCls} list={`colors-${i}`} value={l.color} onChange={(e) => set(i, { color: e.target.value })} />
                <datalist id={`colors-${i}`}>{(p?.colors || []).map((c) => <option key={c} value={c} />)}</datalist>
              </label>
            </div>
            <div className="mt-2">
              <div className="text-xs text-slate-600">Tailles et quantités <span className="text-slate-400">({qty} pcs)</span></div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {SIZES.map((sz) => (
                  <label key={sz} className="flex w-14 flex-col items-center rounded-lg border border-slate-200 px-1 py-1 text-[11px] text-slate-500">
                    {sz}
                    <input inputMode="numeric" className="w-full rounded border-0 bg-slate-50 p-1 text-center text-sm text-slate-900" value={l.sizes[sz] ?? ""} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); const s = { ...l.sizes }; if (v) s[sz] = v; else delete s[sz]; set(i, { sizes: s }); }} />
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-6">
              <label className="text-xs">Prix vêtement HT<input inputMode="decimal" className={inputCls} value={l.unit_price} onChange={(e) => set(i, { unit_price: e.target.value })} /></label>
              <div className="text-xs sm:col-span-2">Prestations
                <div className="mt-1 flex gap-2">{Object.entries(SERVICES).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={l.services.includes(k)} onChange={(e) => set(i, { services: e.target.checked ? [...l.services, k] : l.services.filter((x) => x !== k) })} />{v}</label>))}</div>
              </div>
              <label className="text-xs">Prestation HT / pièce<input inputMode="decimal" className={inputCls} value={l.service_price} onChange={(e) => set(i, { service_price: e.target.value })} /></label>
              <label className="text-xs">Remise %<input inputMode="decimal" className={inputCls} value={l.discount_pct} onChange={(e) => set(i, { discount_pct: e.target.value })} /></label>
              <div className="flex items-end justify-end text-sm font-medium">{Math.round(qty * (num(l.unit_price) + num(l.service_price)) * (1 - num(l.discount_pct) / 100)).toLocaleString("fr-FR")} DA HT</div>
            </div>
            {l.services.length > 0 && (
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <label className="text-xs">Placement du logo<select className={inputCls} value={l.placement} onChange={(e) => set(i, { placement: e.target.value })}>{PLACEMENTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-xs">Largeur d'impression (cm)<input inputMode="decimal" className={inputCls} value={l.print_width_cm} onChange={(e) => set(i, { print_width_cm: e.target.value })} /></label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={l.is_characterized} onChange={(e) => set(i, { is_characterized: e.target.checked, services: e.target.checked && !l.services.includes("dtf") ? [...l.services, "dtf"] : l.services })} />T-shirt caractérisé (DTF ≤ 30 cm, au-dessus de l'ourlet, col et manches unis)</label>
              </div>
            )}
            {l.is_gift && <p className="mt-2 text-xs text-brand-700">Cadeau Carte Privilège (offert)</p>}
            {lines.length > 1 && !l.is_gift && <button type="button" className="mt-2 text-xs text-red-600" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Retirer la ligne</button>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={btn("secondary")} onClick={() => setLines((ls) => [...ls, empty()])}>+ Ajouter une ligne</button>
        <div className="text-sm text-slate-700">Total : <strong>{Math.round(totals.ht).toLocaleString("fr-FR")} DA HT</strong> · {Math.round(totals.ttc).toLocaleString("fr-FR")} DA TTC</div>
      </div>
    </div>
  );
}

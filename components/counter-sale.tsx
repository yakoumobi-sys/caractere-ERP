"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, type ActionResult } from "./forms";
import { Field, inputCls } from "./ui";
import { PAY_METHOD } from "@/lib/format";

type Item = { id: string; ref: string; name: string; color: string; size: string; available: number; sale_price: number | null };
export function CounterSale({ items, action, tva }: { items: Item[]; action: (p: ActionResult, fd: FormData) => Promise<ActionResult>; tva: number }) {
  const [cart, setCart] = useState<{ item_id: string; qty: number; unit_price: number }[]>([]);
  const [filter, setFilter] = useState("");
  const shown = items.filter((i) => `${i.ref} ${i.name} ${i.color} ${i.size}`.toLowerCase().includes(filter.toLowerCase())).slice(0, 30);
  const total = cart.reduce((a, c) => a + c.qty * c.unit_price, 0);
  return (
    <ActionForm action={action} idempotent className="space-y-3">
      <input type="hidden" name="items" value={JSON.stringify(cart)} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Nom du client (facultatif)"><input name="client_name" className={inputCls} /></Field>
        <Field label="Téléphone (facultatif)"><input name="client_phone" inputMode="tel" className={inputCls} /></Field>
        <Field label="Paiement"><select name="method" className={inputCls}>{Object.entries(PAY_METHOD).filter(([k]) => k !== "yalidine_cod").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      <input placeholder="Filtrer les articles en stock…" value={filter} onChange={(e) => setFilter(e.target.value)} className={inputCls} />
      <div className="grid max-h-72 gap-1 overflow-auto">
        {shown.map((i) => (
          <button type="button" key={i.id} disabled={i.available <= 0} onClick={() => setCart((c) => { const e = c.find((x) => x.item_id === i.id); return e ? c.map((x) => (x.item_id === i.id ? { ...x, qty: Math.min(i.available, x.qty + 1) } : x)) : [...c, { item_id: i.id, qty: 1, unit_price: i.sale_price || 0 }]; })}
            className="flex justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40">
            <span>{i.ref} · {i.name} {i.color} {i.size}</span><span className="text-slate-500">dispo {i.available} · {i.sale_price ?? 0} DA</span>
          </button>
        ))}
      </div>
      {cart.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {cart.map((c) => { const i = items.find((x) => x.id === c.item_id)!; return (
            <li key={c.item_id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1">{i.name} {i.color} {i.size}</span>
              <input inputMode="numeric" className="w-16 rounded border border-slate-300 px-2 py-1" value={c.qty} onChange={(e) => setCart((cs) => cs.map((x) => (x.item_id === c.item_id ? { ...x, qty: Math.max(1, Math.min(i.available, Number(e.target.value) || 1)) } : x)))} />
              <span className="w-24 text-right">{(c.qty * c.unit_price).toLocaleString("fr-FR")} DA</span>
              <button type="button" className="text-red-600" onClick={() => setCart((cs) => cs.filter((x) => x.item_id !== c.item_id))}>×</button>
            </li>); })}
        </ul>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm">Total : <strong>{Math.round(total * (1 + tva / 100)).toLocaleString("fr-FR")} DA TTC</strong></span>
        <SubmitButton>Encaisser et remettre</SubmitButton>
      </div>
    </ActionForm>
  );
}

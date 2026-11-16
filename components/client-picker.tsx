"use client";
import { useEffect, useState } from "react";
import { inputCls } from "./ui";
import { searchClients } from "@/app/actions/search";

export function ClientPicker({ initial }: { initial?: { id: string; name: string; phone?: string } | null }) {
  const [sel, setSel] = useState(initial || null);
  const [term, setTerm] = useState("");
  const [res, setRes] = useState<any[]>([]);
  useEffect(() => {
    const t = setTimeout(async () => setRes(term.length >= 2 ? await searchClients(term) : []), 250);
    return () => clearTimeout(t);
  }, [term]);
  if (sel)
    return (
      <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
        <input type="hidden" name="client_id" value={sel.id} />
        <span><strong>{sel.name}</strong> {sel.phone && <span className="text-slate-500">· {sel.phone}</span>}</span>
        <button type="button" className="text-xs text-brand-700" onClick={() => setSel(null)}>Changer</button>
      </div>
    );
  return (
    <div className="relative">
      <input className={inputCls} placeholder="Rechercher un client (nom ou téléphone)…" value={term} onChange={(e) => setTerm(e.target.value)} />
      {res.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {res.map((c) => <li key={c.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setSel(c)}>{c.name} <span className="text-slate-500">{c.phone}{c.company ? ` · ${c.company}` : ""}</span></button></li>)}
        </ul>
      )}
      <a href="/clients/nouveau" className="mt-1 inline-block text-xs text-brand-700">+ Nouveau prospect</a>
    </div>
  );
}

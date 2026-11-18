"use client";
import { useEffect, useState } from "react";
import { inputCls } from "./ui";
import { searchClients } from "@/app/actions/search";

type Client = { id: string; name: string; phone?: string; company?: string };
const selectionHint = "Sélectionnez un client dans les résultats de recherche.";

export function ClientPicker({ initial }: { initial?: Client | null }) {
  const [sel, setSel] = useState(initial || null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Client[]>([]);
  const [notice, setNotice] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const query = term.trim();
    if (sel || query.length < 2) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const clients = await searchClients(query);
        if (current) {
          setResults(clients);
          setNotice(clients.length ? "" : "Aucun client trouvé. Essayez un autre nom ou créez une fiche.");
        }
      } catch {
        if (current) setNotice("La recherche a échoué. Modifiez votre recherche pour réessayer.");
      }
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [term, sel]);

  if (sel)
    return (
      <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
        <input type="hidden" name="client_id" value={sel.id} />
        <span><strong>{sel.name}</strong> {sel.phone && <span className="text-slate-500">· {sel.phone}</span>}</span>
        <button type="button" className="text-xs text-brand-700" onClick={() => { setSel(null); setTerm(""); setResults([]); setNotice(""); setMissing(false); }}>Changer</button>
      </div>
    );
  return (
    <div className="relative">
      <input className={inputCls} placeholder="Rechercher un client (nom ou téléphone)…" value={term}
        required ref={input => input?.setCustomValidity(selectionHint)} onInvalid={() => setMissing(true)}
        aria-invalid={missing} aria-describedby="client-selection-hint"
        onChange={e => { setTerm(e.target.value); setResults([]); setNotice(""); }} />
      <p id="client-selection-hint" className={missing ? "mt-1 text-sm text-red-700" : "mt-1 text-xs text-slate-500"}>{selectionHint}</p>
      {results.length > 0 && (
        <ul className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {results.map(c => <li key={c.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setSel(c)}>{c.name} <span className="text-slate-500">{c.phone}{c.company ? ` · ${c.company}` : ""}</span></button></li>)}
        </ul>
      )}
      {notice && <p role="status" className="mt-1 text-xs text-slate-600">{notice}</p>}
      <a href="/clients/nouveau" target="_blank" rel="noopener" className="mt-1 inline-block text-xs text-brand-700">+ Nouveau prospect (nouvel onglet)</a>
    </div>
  );
}

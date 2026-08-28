"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { LOGO_PLACEMENTS, LOGO_SOURCES, TECHNIQUES, type Technique } from "@/lib/pipeline";
import { fetchYalidineWilayas } from "@/lib/actions/yalidine-actions";
import { SmartArticleSelector } from "./smart-article-selector";

interface ItemRow {
  product_name: string;
  color: string;
  size: string;
  quantity: number;
}

interface ContactOption {
  id: string;
  name: string;
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="h-6 w-6 rounded-full bg-brand-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
        {n}
      </span>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
    </div>
  );
}

/**
 * Configurateur de commande en 3 étapes : Client, Article, Impression.
 * Pensé pour aller vite — un commercial doit pouvoir saisir une commande
 * WhatsApp en quelques secondes.
 */
export function OrderDetailsFields({ contacts }: { contacts: ContactOption[] }) {
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [items, setItems] = useState<ItemRow[]>([{ product_name: "", color: "", size: "", quantity: 1 }]);
  const [technique, setTechnique] = useState<Technique>("dtf");
  const [logoPlacement, setLogoPlacement] = useState("coeur");
  const [logoSource, setLogoSource] = useState("whatsapp");
  const [useYalidine, setUseYalidine] = useState(false);
  const [wilayas, setWilayas] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!useYalidine || wilayas.length > 0) return;
    fetchYalidineWilayas()
      .then(setWilayas)
      .catch(() => setWilayas([]));
  }, [useYalidine, wilayas.length]);

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <>
      {/* 1. Client */}
      <Card className="p-6">
        <StepLabel n={1} title="Client" />
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setClientMode("existing")}
            className={`rounded-md px-3.5 py-2 text-sm font-medium border ${clientMode === "existing" ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-300"}`}
          >
            Client existant
          </button>
          <button
            type="button"
            onClick={() => setClientMode("new")}
            className={`rounded-md px-3.5 py-2 text-sm font-medium border ${clientMode === "new" ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-300"}`}
          >
            + Nouveau client
          </button>
        </div>
        <input type="hidden" name="client_mode" value={clientMode} />

        {clientMode === "existing" ? (
          <Field label="Client" htmlFor="contact_id" required>
            <select id="contact_id" name="contact_id" required={clientMode === "existing"} className={inputClass}>
              <option value="">— Sélectionner —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Nom" htmlFor="client_new_name" required>
              <input id="client_new_name" name="client_new_name" required={clientMode === "new"} className={inputClass} />
            </Field>
            <Field label="Téléphone" htmlFor="client_new_phone">
              <input id="client_new_phone" name="client_new_phone" type="tel" className={inputClass} />
            </Field>
            <Field label="Type" htmlFor="client_new_type">
              <select id="client_new_type" name="client_new_type" defaultValue="client" className={inputClass}>
                <option value="client">Client</option>
                <option value="prospect">Prospect</option>
              </select>
            </Field>
          </div>
        )}

        <div className="mt-5 pt-5 border-t border-slate-200">
          <p className="text-sm font-medium text-slate-700 mb-2">Livraison</p>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setUseYalidine(false)}
              className={`rounded-md px-3.5 py-2 text-sm font-medium border ${!useYalidine ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-300"}`}
            >
              Livraison manuelle
            </button>
            <button
              type="button"
              onClick={() => setUseYalidine(true)}
              className={`rounded-md px-3.5 py-2 text-sm font-medium border ${useYalidine ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-300"}`}
            >
              Envoyer par Yalidine
            </button>
          </div>
          <input type="hidden" name="use_yalidine" value={useYalidine ? "on" : ""} />

          {useYalidine && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Wilaya" htmlFor="yalidine_wilaya" required>
                <select id="yalidine_wilaya" name="yalidine_wilaya" required={useYalidine} className={inputClass}>
                  <option value="">{wilayas.length === 0 ? "Chargement…" : "— Sélectionner —"}</option>
                  {wilayas.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Commune" htmlFor="yalidine_commune" required>
                <input id="yalidine_commune" name="yalidine_commune" required={useYalidine} className={inputClass} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Adresse" htmlFor="yalidine_address" required>
                  <input id="yalidine_address" name="yalidine_address" required={useYalidine} className={inputClass} />
                </Field>
              </div>
              <Field label="Montant à collecter (DA)" htmlFor="yalidine_price" required>
                <input id="yalidine_price" name="yalidine_price" type="number" step="1" min="0" required={useYalidine} className={inputClass} />
              </Field>
            </div>
          )}
        </div>
      </Card>

      {/* 2. Article */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <StepLabel n={2} title="Article" />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setItems((prev) => [...prev, { product_name: "", color: "", size: "", quantity: 1 }])}
          >
            + Ajouter
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-2 pr-2 font-medium">Article</th>
              <th className="py-2 pr-2 font-medium">Couleur</th>
              <th className="py-2 pr-2 font-medium w-24">Taille</th>
              <th className="py-2 pr-2 font-medium w-24">Qté</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((row, i) => (
              <SmartArticleSelector
                key={i}
                value={row}
                onChange={(patch) => updateItem(i, patch)}
                onRemove={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
          </tbody>
        </table>
        <input type="hidden" name="items_json" value={JSON.stringify(items)} />
      </Card>

      {/* 3. Impression */}
      <Card className="p-6">
        <StepLabel n={3} title="Impression" />
        <div className="grid grid-cols-3 gap-2 mb-4">
          {TECHNIQUES.map((t) => (
            <label
              key={t.value}
              className={`flex items-center justify-center text-center rounded-md border px-3 py-3 text-sm font-medium cursor-pointer ${
                technique === t.value ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="technique"
                value={t.value}
                checked={technique === t.value}
                onChange={() => setTechnique(t.value)}
                className="sr-only"
              />
              {t.label}
            </label>
          ))}
        </div>

        {technique === "dtf" && (
          <label className="flex items-center gap-2 mb-4 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" name="requires_flocage" className="h-4 w-4 rounded border-slate-300" />
            Envoyer en flocage après l&apos;impression
          </label>
        )}

        {technique !== "aucune" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Emplacement du logo" htmlFor="logo_placement" required>
              <select
                id="logo_placement"
                name="logo_placement"
                value={logoPlacement}
                onChange={(e) => setLogoPlacement(e.target.value)}
                required
                className={inputClass}
              >
                {LOGO_PLACEMENTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            {logoPlacement === "special" && (
              <Field label="Précisions" htmlFor="logo_placement_note">
                <input id="logo_placement_note" name="logo_placement_note" className={inputClass} />
              </Field>
            )}

            <Field label="Où récupérer le logo" htmlFor="logo_source" required>
              <select
                id="logo_source"
                name="logo_source"
                value={logoSource}
                onChange={(e) => setLogoSource(e.target.value)}
                required
                className={inputClass}
              >
                {LOGO_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={logoSource === "email" ? "Adresse email du client" : "Numéro du client"} htmlFor="logo_source_value">
              <input id="logo_source_value" name="logo_source_value" className={inputClass} />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Ou envoyer directement le fichier (optionnel)" htmlFor="logo">
                <input id="logo" name="logo" type="file" accept="image/*,.pdf,.ai,.eps" className={inputClass} />
              </Field>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Vêtements bruts, sans personnalisation — la commande part directement en préparation.</p>
        )}
      </Card>
    </>
  );
}

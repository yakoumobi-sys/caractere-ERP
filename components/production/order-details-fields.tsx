"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { LOGO_PLACEMENTS, LOGO_SOURCES, TECHNIQUES } from "@/lib/pipeline";

interface ItemRow {
  product_name: string;
  color: string;
  size: string;
  quantity: number;
}

interface PrintRow {
  placement: string;
  size_cm: string;
  text_content: string;
}

/**
 * Le configurateur de commande utilisé par le commercial : articles (vêtement/
 * couleur/taille/quantité), zones de personnalisation (emplacement/taille/
 * texte), emplacement du logo, où le récupérer, technique (DTF/broderie/
 * simple) et upload direct du visuel.
 */
export function OrderDetailsFields() {
  const [items, setItems] = useState<ItemRow[]>([{ product_name: "", color: "", size: "", quantity: 1 }]);
  const [prints, setPrints] = useState<PrintRow[]>([{ placement: "", size_cm: "", text_content: "" }]);
  const [logoPlacement, setLogoPlacement] = useState("coeur");
  const [logoSource, setLogoSource] = useState("whatsapp");

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function updatePrint(i: number, patch: Partial<PrintRow>) {
    setPrints((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">1. Articles commandés</h2>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setItems((prev) => [...prev, { product_name: "", color: "", size: "", quantity: 1 }])}
          >
            + Ajouter un article
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
              <tr key={i}>
                <td className="py-2 pr-2">
                  <input
                    value={row.product_name}
                    onChange={(e) => updateItem(i, { product_name: e.target.value })}
                    placeholder="T-shirt, Polo, Tote bag..."
                    className={inputClass}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input value={row.color} onChange={(e) => updateItem(i, { color: e.target.value })} className={inputClass} />
                </td>
                <td className="py-2 pr-2">
                  <input value={row.size} onChange={(e) => updateItem(i, { size: e.target.value })} className={inputClass} />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    step="1"
                    value={row.quantity}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                    className={inputClass}
                  />
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <input type="hidden" name="items_json" value={JSON.stringify(items)} />
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">2. Zones de personnalisation</h2>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPrints((prev) => [...prev, { placement: "", size_cm: "", text_content: "" }])}
          >
            + Ajouter une zone
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-2 pr-2 font-medium">Emplacement</th>
              <th className="py-2 pr-2 font-medium w-24">Taille</th>
              <th className="py-2 pr-2 font-medium">Texte</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {prints.map((row, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">
                  <input
                    value={row.placement}
                    onChange={(e) => updatePrint(i, { placement: e.target.value })}
                    placeholder="Coeur, Dos, Manche..."
                    className={inputClass}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    value={row.size_cm}
                    onChange={(e) => updatePrint(i, { size_cm: e.target.value })}
                    placeholder="8cm"
                    className={inputClass}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    value={row.text_content}
                    onChange={(e) => updatePrint(i, { text_content: e.target.value })}
                    placeholder="Texte à broder/imprimer"
                    className={inputClass}
                  />
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setPrints((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <input type="hidden" name="prints_json" value={JSON.stringify(prints)} />
      </Card>

      <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <h2 className="text-sm font-semibold text-slate-900 sm:col-span-2">3. Logo</h2>

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
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">4. Technique</h2>
        <div className="flex gap-6">
          {TECHNIQUES.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="technique" value={t.value} defaultChecked={t.value === "dtf"} required />
              {t.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          La commande partira automatiquement dans la file de l&apos;atelier correspondant.
        </p>
      </Card>
    </>
  );
}

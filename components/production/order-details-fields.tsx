"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";

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
  technique: string;
}

const PLACEMENT_SUGGESTIONS = ["Coeur", "Dos", "Manche gauche", "Manche droite", "Poche"];

/**
 * Champs "Articles" (vêtement / couleur / taille / quantité) et "Personnalisation"
 * (emplacement / taille / texte / technique) + upload du logo, pour la saisie
 * d'une commande telle que reçue sur WhatsApp.
 */
export function OrderDetailsFields() {
  const [items, setItems] = useState<ItemRow[]>([{ product_name: "", color: "", size: "", quantity: 1 }]);
  const [prints, setPrints] = useState<PrintRow[]>([
    { placement: "", size_cm: "", text_content: "", technique: "flocage" },
  ]);

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
          <h2 className="text-sm font-semibold text-slate-900">Articles commandés</h2>
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
          <h2 className="text-sm font-semibold text-slate-900">Personnalisation (flocage / broderie / DTF)</h2>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPrints((prev) => [...prev, { placement: "", size_cm: "", text_content: "", technique: "flocage" }])}
          >
            + Ajouter une zone
          </Button>
        </div>
        <datalist id="placement-suggestions">
          {PLACEMENT_SUGGESTIONS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-2 pr-2 font-medium">Emplacement</th>
              <th className="py-2 pr-2 font-medium w-24">Taille</th>
              <th className="py-2 pr-2 font-medium">Texte</th>
              <th className="py-2 pr-2 font-medium w-32">Technique</th>
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
                    list="placement-suggestions"
                    placeholder="Coeur, Dos..."
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
                <td className="py-2 pr-2">
                  <select value={row.technique} onChange={(e) => updatePrint(i, { technique: e.target.value })} className={inputClass}>
                    <option value="flocage">Flocage</option>
                    <option value="dtf">DTF</option>
                    <option value="broderie">Broderie</option>
                  </select>
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

      <Card className="p-6">
        <Field label="Logo / visuel à utiliser" htmlFor="logo">
          <input id="logo" name="logo" type="file" accept="image/*,.pdf,.ai,.eps" className={inputClass} />
        </Field>
      </Card>
    </>
  );
}

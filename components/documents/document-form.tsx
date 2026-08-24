"use client";

import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { DocumentConfig } from "@/lib/documents";
import { saveDocument } from "@/lib/actions/document-actions";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  price: number;
  tax_rate: number;
}

interface LineRow {
  product_id: string;
  description: string;
  quantity: number;
  price: number;
  tax_rate: number;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enregistrement..." : "Enregistrer"}
    </Button>
  );
}

export function DocumentForm({
  config,
  record,
  existingLines,
  contacts,
  products,
  locked = false,
  lockedMessage,
}: {
  config: DocumentConfig;
  record: Record<string, any> | null;
  existingLines: Array<Record<string, any>>;
  contacts: { id: string; name: string }[];
  products: ProductOption[];
  /** Formulaire en lecture seule (ex: facture déjà validée — la base de données refuse de toute façon la modification). */
  locked?: boolean;
  lockedMessage?: string;
}) {
  const [rows, setRows] = useState<LineRow[]>(
    existingLines.length > 0
      ? existingLines.map((l) => ({
          product_id: l.product_id ?? "",
          description: l.description ?? "",
          quantity: Number(l.quantity),
          price: Number(l[config.priceField]),
          tax_rate: Number(l.tax_rate),
        }))
      : [{ product_id: "", description: "", quantity: 1, price: 0, tax_rate: 20 }]
  );
  const formRef = useRef<HTMLFormElement>(null);

  const totals = useMemo(() => {
    const subtotal = rows.reduce((s, r) => s + r.quantity * r.price, 0);
    const tax = rows.reduce((s, r) => s + (r.quantity * r.price * r.tax_rate) / 100, 0);
    return { subtotal, tax, total: subtotal + tax };
  }, [rows]);

  function updateRow(index: number, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function onProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateRow(index, {
      product_id: productId,
      description: product ? product.name : "",
      price: product ? product.price : 0,
      tax_rate: product ? product.tax_rate : 20,
    });
  }

  function addRow() {
    setRows((prev) => [...prev, { product_id: "", description: "", quantity: 1, price: 0, tax_rate: 20 }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const action = saveDocument.bind(null, config, (record?.id as string) ?? null);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      {locked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {lockedMessage ?? "Ce document est validé et n'est plus modifiable — la base de données refuserait de toute façon l'enregistrement."}
        </div>
      )}
      <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={config.contactLabel} htmlFor={config.contactField} required>
          <select
            id={config.contactField}
            name={config.contactField}
            defaultValue={record?.[config.contactField] ?? ""}
            required
            disabled={locked}
            className={inputClass}
          >
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Statut" htmlFor="status">
          <select id="status" name="status" defaultValue={record?.status ?? "brouillon"} disabled={locked} className={inputClass}>
            {config.statusOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        {config.extraHeaderFields.map((f) => (
          <Field key={f.name} label={f.label} htmlFor={f.name}>
            <input
              id={f.name}
              name={f.name}
              type="date"
              defaultValue={record?.[f.name] ?? ""}
              disabled={locked}
              className={inputClass}
            />
          </Field>
        ))}
        <div className="sm:col-span-2">
          <Field label="Notes" htmlFor="notes">
            <textarea id="notes" name="notes" rows={2} defaultValue={record?.notes ?? ""} disabled={locked} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Lignes</h2>
          {!locked && (
            <Button type="button" variant="secondary" onClick={addRow}>
              + Ajouter une ligne
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 pr-2 font-medium">Produit</th>
                <th className="py-2 pr-2 font-medium">Description</th>
                <th className="py-2 pr-2 font-medium w-24">Qté</th>
                <th className="py-2 pr-2 font-medium w-28">Prix unit.</th>
                <th className="py-2 pr-2 font-medium w-20">TVA %</th>
                <th className="py-2 pr-2 font-medium text-right w-28">Total HT</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="py-2 pr-2">
                    <select
                      value={row.product_id}
                      onChange={(e) => onProductChange(i, e.target.value)}
                      disabled={locked}
                      className={inputClass}
                    >
                      <option value="">—</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      value={row.description}
                      onChange={(e) => updateRow(i, { description: e.target.value })}
                      disabled={locked}
                      className={inputClass}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      value={row.quantity}
                      onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })}
                      disabled={locked}
                      className={inputClass}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      value={row.price}
                      onChange={(e) => updateRow(i, { price: Number(e.target.value) })}
                      disabled={locked}
                      className={inputClass}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      value={row.tax_rate}
                      onChange={(e) => updateRow(i, { tax_rate: Number(e.target.value) })}
                      disabled={locked}
                      className={inputClass}
                    />
                  </td>
                  <td className="py-2 pr-2 text-right font-medium">{formatMoney(row.quantity * row.price)}</td>
                  <td className="py-2 text-right">
                    {!locked && (
                      <button type="button" onClick={() => removeRow(i)} className="text-xs text-red-500 hover:underline">
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mt-4">
          <div className="w-64 text-sm space-y-1">
            <div className="flex justify-between text-slate-600">
              <span>Sous-total HT</span>
              <span>{formatMoney(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>TVA</span>
              <span>{formatMoney(totals.tax)}</span>
            </div>
            <div className="flex justify-between font-semibold text-slate-900 border-t border-slate-200 pt-1">
              <span>Total TTC</span>
              <span>{formatMoney(totals.total)}</span>
            </div>
          </div>
        </div>
      </Card>

      {!locked && (
        <>
          <input type="hidden" name="lines_json" value={JSON.stringify(rows)} />
          <div>
            <SubmitButton />
          </div>
        </>
      )}
    </form>
  );
}

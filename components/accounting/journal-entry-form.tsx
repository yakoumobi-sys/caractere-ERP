"use client";

import { useMemo, useState, useRef, useTransition } from "react";
import { addManualJournalEntry } from "@/lib/actions/accounting-actions";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

import { businessDate } from "@/lib/finance";

interface Row {
  account_id: string;
  debit: number;
  credit: number;
  label: string;
}

export function JournalEntryForm({ accounts }: { accounts: { id: string; code: string; name: string }[] }) {
  const requestId = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<Row[]>([
    { account_id: "", debit: 0, credit: 0, label: "" },
    { account_id: "", debit: 0, credit: 0, label: "" },
  ]);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { account_id: "", debit: 0, credit: 0, label: "" }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const totalDebit = useMemo(() => rows.reduce((s, r) => s + Number(r.debit || 0), 0), [rows]);
  const totalCredit = useMemo(() => rows.reduce((s, r) => s + Number(r.credit || 0), 0), [rows]);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  return (
    <Card className="p-6 mb-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Nouvelle écriture manuelle</h2>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        requestId.current ??= crypto.randomUUID();
        data.set("request_id", requestId.current);
        setMessage("");
        startTransition(async () => {
          try {
            await addManualJournalEntry(data);
            requestId.current = null;
            setRows([{ account_id: "", debit: 0, credit: 0, label: "" }, { account_id: "", debit: 0, credit: 0, label: "" }]);
            setMessage("Écriture enregistrée.");
          } catch {
            setMessage("Écriture non confirmée. Vérifiez le journal avant de réessayer ; la même requête ne sera pas enregistrée deux fois.");
          }
        });
      }} className="flex flex-col gap-4">
        {message && <p role="status">{message}</p>}
        <fieldset disabled={pending} className="contents">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Date" htmlFor="entry_date">
            <input id="entry_date" name="entry_date" type="date" defaultValue={businessDate()} className={inputClass} />
          </Field>
          <Field label="Référence" htmlFor="reference">
            <input id="reference" name="reference" type="text" className={inputClass} />
          </Field>
          <Field label="Description" htmlFor="description">
            <input id="description" name="description" type="text" className={inputClass} />
          </Field>
        </div>

        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-2 pr-2 font-medium">Compte</th>
              <th className="py-2 pr-2 font-medium">Libellé</th>
              <th className="py-2 pr-2 font-medium w-28">Débit</th>
              <th className="py-2 pr-2 font-medium w-28">Crédit</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">
                  <select value={row.account_id} onChange={(e) => update(i, { account_id: e.target.value })} className={inputClass}>
                    <option value="">—</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <input value={row.label} onChange={(e) => update(i, { label: e.target.value })} className={inputClass} />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    step="0.01"
                    value={row.debit}
                    onChange={(e) => update(i, { debit: Number(e.target.value), credit: 0 })}
                    className={inputClass}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    step="0.01"
                    value={row.credit}
                    onChange={(e) => update(i, { credit: Number(e.target.value), debit: 0 })}
                    className={inputClass}
                  />
                </td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => removeRow(i)} className="text-xs text-red-500 hover:underline">
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between">
          <button type="button" onClick={addRow} className="text-sm text-brand-600 hover:underline">
            + Ajouter une ligne
          </button>
          <p className={`text-sm font-medium ${balanced ? "text-emerald-600" : "text-red-500"}`}>
            Débit {formatMoney(totalDebit)} / Crédit {formatMoney(totalCredit)}
            {!balanced && " — écriture déséquilibrée"}
          </p>
        </div>

        <input type="hidden" name="lines_json" value={JSON.stringify(rows)} />
        <div>
          <Button type="submit" disabled={!balanced || pending}>
            Enregistrer l&apos;écriture
          </Button>
        </div>
        </fieldset>
      </form>
    </Card>
  );
}

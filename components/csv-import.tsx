"use client";
import { useState } from "react";
import { parseCsv } from "@/lib/csv";
import { ActionForm, SubmitButton, type ActionResult } from "./forms";
import { Badge, btn } from "./ui";

export function CsvImport({ preview, commit, columns, extra }: {
  preview: (rows: Record<string, string>[]) => Promise<any[]>;
  commit: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  columns: [string, string][];
  extra?: React.ReactNode;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [prev, setPrev] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <input
        type="file"
        accept=".csv,text/csv"
        className="text-sm"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setErr(null); setPrev(null); setBusy(true);
          try {
            const parsed = parseCsv(await f.text());
            setRows(parsed);
            setPrev(await preview(parsed));
          } catch (x: any) {
            setErr(x?.message || "Fichier illisible");
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <p className="text-sm text-slate-500">Analyse…</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}
      {prev && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {Object.entries(prev.reduce((a: Record<string, number>, r) => ({ ...a, [r.status.split(":")[0]]: (a[r.status.split(":")[0]] || 0) + 1 }), {})).map(([k, v]) => <Badge key={k} tone={k === "nouveau" ? "green" : k === "existant" ? "blue" : "amber"}>{k} : {String(v)}</Badge>)}
          </div>
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50"><tr><th className="px-2 py-1 text-left">#</th>{columns.map(([k, l]) => <th key={k} className="px-2 py-1 text-left">{l}</th>)}<th className="px-2 py-1 text-left">Statut</th></tr></thead>
              <tbody>{prev.map((r) => (
                <tr key={r.row} className={r.status === "nouveau" ? "" : r.status === "existant" ? "bg-blue-50" : "bg-amber-50"}>
                  <td className="px-2 py-1">{r.row}</td>{columns.map(([k]) => <td key={k} className="px-2 py-1">{r[k]}</td>)}
                  <td className="px-2 py-1">{r.status}{r.existing_name ? ` (${r.existing_name})` : ""}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <ActionForm action={commit}>
            <input type="hidden" name="rows" value={JSON.stringify(rows)} />
            {extra}
            <SubmitButton>Importer les lignes valides</SubmitButton>
            <button type="button" className={btn("ghost") + " ml-2"} onClick={() => setPrev(null)}>Annuler</button>
          </ActionForm>
        </>
      )}
    </div>
  );
}

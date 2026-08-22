import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

export default async function Page() {
  const supabase = createClient();
  const { data: accounts } = await supabase.from("chart_of_accounts").select("id, code, name, type").order("code");
  const { data: lines } = await supabase.from("journal_lines").select("account_id, debit, credit");

  const totals = new Map<string, { debit: number; credit: number }>();
  for (const l of (lines ?? []) as { account_id: string; debit: number; credit: number }[]) {
    const t = totals.get(l.account_id) ?? { debit: 0, credit: 0 };
    t.debit += Number(l.debit);
    t.credit += Number(l.credit);
    totals.set(l.account_id, t);
  }

  const rows = ((accounts ?? []) as { id: string; code: string; name: string; type: string }[])
    .map((a) => {
      const t = totals.get(a.id) ?? { debit: 0, credit: 0 };
      return { ...a, ...t, solde: t.debit - t.credit };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);

  const grandTotalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const grandTotalCredit = rows.reduce((s, r) => s + r.credit, 0);

  const produits = rows.filter((r) => r.type === "produit").reduce((s, r) => s + (r.credit - r.debit), 0);
  const charges = rows.filter((r) => r.type === "charge").reduce((s, r) => s + (r.debit - r.credit), 0);

  return (
    <div>
      <PageHeader title="Rapports comptables" description="Balance générale et résultat" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-sm text-slate-500">Produits</p>
          <p className="mt-2 text-xl font-semibold text-emerald-600">{formatMoney(produits)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Charges</p>
          <p className="mt-2 text-xl font-semibold text-red-600">{formatMoney(charges)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Résultat (produits - charges)</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatMoney(produits - charges)}</p>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        {rows.length === 0 && <EmptyState title="Aucune écriture comptabilisée." />}
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 font-medium">Compte</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium text-right">Débit</th>
                <th className="px-4 py-2.5 font-medium text-right">Crédit</th>
                <th className="px-4 py-2.5 font-medium text-right">Solde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 text-slate-700">
                    {r.code} — {r.name}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{r.type}</td>
                  <td className="px-4 py-2.5 text-right">{formatMoney(r.debit)}</td>
                  <td className="px-4 py-2.5 text-right">{formatMoney(r.credit)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{formatMoney(r.solde)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold">
                <td className="px-4 py-2.5" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-2.5 text-right">{formatMoney(grandTotalDebit)}</td>
                <td className="px-4 py-2.5 text-right">{formatMoney(grandTotalCredit)}</td>
                <td className="px-4 py-2.5 text-right">{formatMoney(grandTotalDebit - grandTotalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { JournalEntryForm } from "@/components/accounting/journal-entry-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";

export default async function Page() {
  const supabase = createClient();
  const [{ data: accounts }, { data: entries }] = await Promise.all([
    supabase.from("chart_of_accounts").select("id, code, name").eq("is_active", true).order("code"),
    supabase
      .from("journal_entries")
      .select("id, entry_date, reference, description, source_type, journal_lines(debit, credit, label, chart_of_accounts(code,name))")
      .order("entry_date", { ascending: false })
      .limit(50),
  ]);

  return (
    <div>
      <PageHeader title="Journal comptable" description="Écritures générées automatiquement et saisies manuelles" />
      <JournalEntryForm accounts={accounts ?? []} />

      <Card className="p-4">
        {(!entries || entries.length === 0) && <EmptyState message="Aucune écriture pour l'instant." />}
        <div className="flex flex-col divide-y divide-slate-100">
          {entries?.map((entry: any) => {
            const total = entry.journal_lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
            return (
              <div key={entry.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {entry.reference ?? "—"} · {entry.description ?? ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDate(entry.entry_date)} · {entry.source_type === "manual" ? "Saisie manuelle" : "Automatique"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{formatMoney(total)}</p>
                </div>
                <table className="w-full text-xs mt-2">
                  <tbody>
                    {entry.journal_lines.map((l: any, i: number) => (
                      <tr key={i} className="text-slate-500">
                        <td className="py-0.5">
                          {l.chart_of_accounts?.code} — {l.chart_of_accounts?.name}
                        </td>
                        <td className="py-0.5">{l.label}</td>
                        <td className="py-0.5 text-right w-24">{l.debit > 0 ? formatMoney(l.debit) : ""}</td>
                        <td className="py-0.5 text-right w-24">{l.credit > 0 ? formatMoney(l.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

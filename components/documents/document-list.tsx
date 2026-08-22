import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { DocumentConfig } from "@/lib/documents";
import { Card, EmptyState, LinkButton, PageHeader, Badge } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";

const STATUS_TONE: Record<string, "gray" | "green" | "blue" | "red" | "blue"> = {
  brouillon: "gray",
  envoye: "blue",
  envoyee: "blue",
  accepte: "green",
  confirmee: "blue",
  validee: "blue",
  livree: "blue",
  recue: "green",
  facturee: "green",
  payee: "green",
  refuse: "red",
  annulee: "red",
  expire: "red",
};

export async function DocumentListPage({ config }: { config: DocumentConfig }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(config.headerTable)
    .select(`id, number, status, total, ${config.dateField}, ${config.contactTable}(name)`)
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title={config.titlePlural}
        action={<LinkButton href={`${config.basePath}/new`}>+ Nouveau {config.titleSingular.toLowerCase()}</LinkButton>}
      />
      <Card className="overflow-x-auto">
        {error && <div className="p-4 text-sm text-red-600">{error.message}</div>}
        {!error && (!data || data.length === 0) && (
          <EmptyState title={`Aucun ${config.titleSingular.toLowerCase()} pour l'instant.`} />
        )}
        {!error && data && data.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 font-medium">Numéro</th>
                <th className="px-4 py-2.5 font-medium">{config.contactLabel}</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((row: any) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-2.5">
                    <Link href={`${config.basePath}/${row.id}`} className="text-brand-600 dark:text-brand-400 hover:underline font-medium">
                      {row.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{row[config.contactTable]?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{formatDate(row[config.dateField])}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONE[row.status] ?? "gray"}>{row.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{formatMoney(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

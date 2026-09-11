import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Button,
  Card,
  Field,
  LinkButton,
  PageHeader,
  inputClass,
} from "@/components/ui";
import { businessDate, invoiceBalance, isOverdue } from "@/lib/finance";
import { formatDate, formatMoney } from "@/lib/utils";
const labels: Record<string, string> = {
  brouillon: "Brouillon",
  validee: "À régler",
  payee: "Payée",
  annulee: "Annulée",
};
export default async function Page({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string };
}) {
  const today = businessDate();
  const page = Math.max(1, Math.min(100000, Number(searchParams.page) || 1));
  const q = (searchParams.q ?? "")
    .replace(/[%_,().]/g, " ")
    .trim()
    .slice(0, 100);
  const status = searchParams.status ?? "";
  const db = createClient();
  let query = db
    .from("invoices")
    .select(
      "id,number,status,total,amount_paid,issue_date,due_date,contacts(name)",
      { count: "exact" },
    );
  if (q) query = query.ilike("number", `%${q}%`);
  if (status === "overdue")
    query = query.eq("status", "validee").lt("due_date", today);
  else if (Object.keys(labels).includes(status))
    query = query.eq("status", status);
  const [list, summary] = await Promise.all([
    query
      .order("created_at", { ascending: false })
      .range((page - 1) * 30, page * 30 - 1),
    db.rpc("invoice_receivables_summary", { p_today: today }),
  ]);
  const stats = summary.data;
  const url = (n: number) =>
    `/sales/invoices?${new URLSearchParams({ q, status, page: String(n) })}`;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Factures & impayés"
        action={
          <LinkButton href="/sales/invoices/new">+ Nouvelle facture</LinkButton>
        }
      />
      {summary.error ? (
        <p role="alert" className="text-red-600">
          Les indicateurs ne sont pas disponibles.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Reste à encaisser", formatMoney(stats?.outstanding ?? 0)],
            ["Dont en retard", formatMoney(stats?.overdue ?? 0)],
            ["Brouillons à finaliser", stats?.drafts ?? 0],
          ].map(([label, value]) => (
            <Card key={label} className="p-5">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-2xl font-semibold mt-2">{value}</p>
            </Card>
          ))}
        </div>
      )}
      <form className="flex flex-wrap gap-3 items-end">
        <Field label="Numéro de facture" htmlFor="q">
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="FAC-…"
            className={inputClass}
          />
        </Field>
        <Field label="Statut" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={status}
            className={inputClass}
          >
            <option value="">Toutes</option>
            <option value="overdue">En retard</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
      </form>
      <Card className="overflow-x-auto">
        {list.error ? (
          <p role="alert" className="p-5 text-red-600">
            Impossible de charger les factures.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left border-b bg-slate-50 dark:bg-slate-900">
              <tr>
                {[
                  "Facture / client",
                  "Émission",
                  "Échéance",
                  "Statut",
                  "Total TTC",
                  "Réglé",
                  "Reste dû",
                ].map((h) => (
                  <th key={h} className="p-4 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((row: any) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 dark:border-slate-700"
                >
                  <td className="p-4">
                    <Link
                      href={`/sales/invoices/${row.id}`}
                      className="font-semibold text-brand-600 hover:underline"
                    >
                      {row.number}
                    </Link>
                    <p className="text-slate-500 mt-1">
                      {row.contacts?.name ?? "Client manquant"}
                    </p>
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {formatDate(row.issue_date)}
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {formatDate(row.due_date)}
                  </td>
                  <td className="p-4">
                    <Badge
                      tone={
                        isOverdue(row, today)
                          ? "red"
                          : row.status === "payee"
                            ? "green"
                            : "slate"
                      }
                    >
                      {isOverdue(row, today)
                        ? "En retard"
                        : Number(row.amount_paid) > 0 &&
                            row.status === "validee"
                          ? "Partiellement réglée"
                          : labels[row.status]}
                    </Badge>
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {formatMoney(row.total)}
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {formatMoney(row.amount_paid)}
                  </td>
                  <td className="p-4 font-semibold whitespace-nowrap">
                    {["validee", "payee"].includes(row.status)
                      ? formatMoney(invoiceBalance(row))
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!list.error && !list.data?.length && (
          <p className="p-8 text-center text-slate-500">
            Aucune facture pour ces critères.
          </p>
        )}
      </Card>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <span>
          {list.count ?? 0} facture(s) · Page {page}
        </span>
        <div className="flex gap-4">
          {page > 1 && <Link href={url(page - 1)}>Précédente</Link>}
          {page * 30 < (list.count ?? 0) && (
            <Link href={url(page + 1)}>Suivante</Link>
          )}
        </div>
      </div>
    </div>
  );
}

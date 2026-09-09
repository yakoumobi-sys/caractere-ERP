import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { businessDate } from "@/lib/finance";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  Button,
  Card,
  Field,
  LinkButton,
  PageHeader,
  inputClass,
} from "@/components/ui";
import { CashMovementForm } from "@/components/finance/cash-movement-form";
export default async function Page({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; page?: string };
}) {
  const profile = await getCurrentProfile();
  if (
    !profile?.is_active ||
    !["admin", "manager", "sales", "accounting"].includes(profile.role)
  )
    return <p>Accès réservé au suivi des encaissements.</p>;
  const today = businessDate(),
    valid = (s?: string) =>
      !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  const from = valid(searchParams.from)
    ? searchParams.from!
    : today.slice(0, 7) + "-01";
  const to = valid(searchParams.to) ? searchParams.to! : today;
  const page = Math.max(1, Math.floor(Number(searchParams.page) || 1));
  const db = createClient();
  const [book, accounts] = await Promise.all([
    db.rpc("cash_book", { p_from: from, p_to: to, p_offset: (page - 1) * 50 }),
    db
      .from("chart_of_accounts")
      .select("id,code,name,type")
      .eq("is_active", true)
      .order("code"),
  ]);
  const data = book.data;
  const url = (n: number) =>
    `/cash?${new URLSearchParams({ from, to, page: String(n) })}`;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Caisse & encaissements"
        description="Espèces comptabilisées et règlements reçus sur la période."
        action={
          <LinkButton href="/sales/invoices" variant="secondary">
            Encaisser une facture
          </LinkButton>
        }
      />
      <form className="flex flex-wrap items-end gap-3">
        <Field label="Du" htmlFor="from">
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from}
            className={inputClass}
          />
        </Field>
        <Field label="Au" htmlFor="to">
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to}
            className={inputClass}
          />
        </Field>
        <Button variant="secondary" type="submit">
          Afficher
        </Button>
      </form>
      {book.error ? (
        <Card className="p-5">
          <p role="alert" className="text-red-600">
            Journal indisponible. Vérifiez les dates et la mise à jour de la
            base de données.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Solde avant la période", data.opening],
              ["Entrées en espèces", data.incoming],
              ["Sorties en espèces", data.outgoing],
              ["Solde comptable de caisse", data.closing],
            ].map(([label, value]) => (
              <Card key={label} className="p-5">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatMoney(value)}
                </p>
              </Card>
            ))}
          </div>
          <p className="text-sm text-slate-500">
            Le solde correspond au compte caisse 53. Il dépend de la reprise du
            solde initial et des écritures historiques. Les virements, cartes,
            chèques et règlements Yalidine ne sont pas des espèces en caisse.
          </p>
          <Card className="p-5">
            <h2 className="font-semibold mb-3">
              Règlements reçus · tous modes
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-slate-500">Factures</p>
                <p className="text-xl font-semibold">
                  {formatMoney(data.invoice_receipts)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Commandes atelier</p>
                <p className="text-xl font-semibold">
                  {formatMoney(data.order_receipts)}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-3">
              Deux circuits distincts. Un règlement déjà saisi sur une commande
              atelier ne doit pas être saisi une seconde fois sur une facture.
            </p>
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left bg-slate-50 dark:bg-slate-900 border-b">
                <tr>
                  {["Date", "Référence", "Motif", "Entrée", "Sortie"].map(
                    (h) => (
                      <th key={h} className="p-4 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 dark:border-slate-700"
                  >
                    <td className="p-4 whitespace-nowrap">
                      {formatDate(r.entry_date)}
                    </td>
                    <td className="p-4">{r.reference}</td>
                    <td className="p-4">{r.description}</td>
                    <td className="p-4 whitespace-nowrap">
                      {Number(r.debit) > 0 ? formatMoney(r.debit) : "—"}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {Number(r.credit) > 0 ? formatMoney(r.credit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.rows.length && (
              <p className="p-8 text-center text-slate-500">
                Aucun mouvement de caisse sur cette période.
              </p>
            )}
          </Card>
          <div className="flex justify-between gap-3 text-sm">
            <span>
              {data.count} mouvement(s) · Page {page}
            </span>
            <div className="flex gap-4">
              {page > 1 && <Link href={url(page - 1)}>Précédente</Link>}
              {page * 50 < data.count && (
                <Link href={url(page + 1)}>Suivante</Link>
              )}
            </div>
          </div>
        </>
      )}
      {["admin", "accounting"].includes(profile.role) && (
        <Card className="p-5">
          <h2 className="font-semibold mb-2">Dépense ou transfert d’espèces</h2>
          <p className="text-sm text-slate-500 mb-5">
            Pour un paiement client, utilisez sa facture ou sa commande. Ce
            formulaire sert aux dépenses et aux transferts avec la banque.
          </p>
          {accounts.error ? (
            <p role="alert">Comptes indisponibles.</p>
          ) : (
            <CashMovementForm accounts={accounts.data ?? []} today={today} />
          )}
        </Card>
      )}
    </div>
  );
}

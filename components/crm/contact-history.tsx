import { getCurrentProfile } from "@/lib/auth";
import { canRecordPayments } from "@/lib/roles";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatMoney, formatDate } from "@/lib/utils";
import { whatsappUrl } from "@/lib/crm";
export async function ContactHistory({ contactId }: { contactId: string }) {
  const db = createClient();
  const [contact, orders, invoices, opportunities, profile] = await Promise.all([
    db.from("contacts").select("name,phone,balance,segment,acquisition_source").eq("id", contactId).single(),
    db
      .from("pipeline_orders")
      .select("id,number,order_total,payment_status,created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(10),
    db
      .from("invoices")
      .select("id,number,total,amount_paid,status,due_date")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(10),
    db
      .from("opportunities")
      .select("id,title,next_action,next_follow_up")
      .eq("contact_id", contactId)
      .not("stage", "in", "(gagne,perdu)")
      .order("next_follow_up", { ascending: true, nullsFirst: false })
      .limit(10),
    getCurrentProfile(),
  ]);
  const url = whatsappUrl(contact.data?.phone);
  return (
    <div className="space-y-4 mb-6">
      {canRecordPayments(profile?.role) && contact.data && <Card className="p-5">
        <p className="text-sm text-slate-500">Reste à encaisser · commandes atelier et factures indépendantes</p>
        <p className="text-2xl font-semibold mt-2">{formatMoney(contact.data.balance)}</p>
        <p className="text-sm text-slate-500 mt-2">Les factures liées à l’atelier sont incluses une seule fois. Les anciens documents sans liaison doivent être rapprochés.</p>
      </Card>}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-lg px-4 py-3 bg-emerald-700 text-white text-sm font-semibold"
        >
          Ouvrir la conversation WhatsApp
        </a>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Suivi commercial</h2>
          {opportunities.error ? (
            <p role="alert">Suivi indisponible.</p>
          ) : opportunities.data?.length ? (
            opportunities.data.map((o) => (
              <div key={o.id} className="border-b py-3 text-sm">
                <Link
                  className="font-medium hover:underline"
                  href={`/crm/opportunities/${o.id}`}
                >
                  {o.title}
                </Link>
                <p className="mt-1">
                  {o.next_action || "Prochaine action à définir"}
                </p>
                <p className="text-slate-500">
                  Relance : {formatDate(o.next_follow_up)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              Aucune opportunité en cours.
            </p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold mb-1">Commandes atelier</h2>
          <p className="text-sm text-slate-500 mb-3">10 dernières commandes</p>
          {orders.error ? (
            <p role="alert">Commandes indisponibles.</p>
          ) : orders.data?.length ? (
            orders.data.map((o) => (
              <div key={o.id} className="border-b py-3 text-sm">
                <Link
                  href={`/production/${o.id}`}
                  className="font-medium hover:underline"
                >
                  {o.number}
                </Link>
                <p>
                  {o.order_total === null
                    ? "Montant à renseigner"
                    : formatMoney(o.order_total)}
                </p>
                <p className="text-slate-500">
                  {(
                    {
                      paid: "Réglée",
                      partial: "Partiellement réglée",
                      unpaid: "Non réglée",
                    } as Record<string, string>
                  )[o.payment_status] ?? o.payment_status}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">Aucune commande.</p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold mb-1">Facturation</h2>
          <p className="text-sm text-slate-500 mb-3">10 dernières factures</p>
          {invoices.error ? (
            <p role="alert">Factures indisponibles.</p>
          ) : invoices.data?.length ? (
            invoices.data.map((i) => (
              <div key={i.id} className="border-b py-3 text-sm">
                <Link
                  href={`/sales/invoices/${i.id}`}
                  className="font-medium hover:underline"
                >
                  {i.number}
                </Link>
                <p>{formatMoney(i.total)}</p>
                <p className="text-slate-500">
                  {["validee", "payee"].includes(i.status)
                    ? `Reste dû : ${formatMoney(Number(i.total) - Number(i.amount_paid))}`
                    : i.status === "brouillon"
                      ? "Brouillon"
                      : "Annulée"}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">Aucune facture.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

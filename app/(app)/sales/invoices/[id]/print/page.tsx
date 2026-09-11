import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/documents/print-button";
import { formatDate, formatMoney } from "@/lib/utils";
export default async function Page({ params }: { params: { id: string } }) {
  const db = createClient();
  const [invoice, lines, company] = await Promise.all([
    db.from("invoices").select("*,contacts(*)").eq("id", params.id).single(),
    db
      .from("invoice_lines")
      .select("*")
      .eq("invoice_id", params.id)
      .order("position"),
    db.from("companies").select("*").limit(1).single(),
  ]);
  if (invoice.error || !invoice.data) notFound();
  if (lines.error || company.error)
    throw new Error("Impossible de préparer l’impression.");
  const doc = invoice.data,
    seller = company.data,
    client = doc.contacts;
  return (
    <div>
      <style>{`@media print { body { background: white !important; } body * { visibility: hidden; } #invoice-print, #invoice-print * { visibility: visible; } #invoice-print { position: absolute; inset: 0; width: 100%; padding: 0; box-shadow: none; } #invoice-print tr { break-inside: avoid; } @page { size: A4; margin: 16mm; } }`}</style>
      <div className="flex flex-wrap gap-4 items-center mb-5 print:hidden">
        <PrintButton />
        <Link href={`/sales/invoices/${params.id}`}>Retour à la facture</Link>
      </div>
      <article
        id="invoice-print"
        className="max-w-4xl bg-white text-slate-900 p-6 sm:p-10 rounded-xl space-y-8"
      >
        <div className="flex flex-wrap justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold">
              {seller?.name ?? "Caractère"}
            </h1>
            <p className="whitespace-pre-line mt-3">{seller?.address}</p>
            <p>
              {seller?.city} {seller?.country}
            </p>
            <p>
              {seller?.phone} · {seller?.email}
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">FACTURE</h2>
            <p className="mt-2">{doc.number}</p>
            <p>Émise le {formatDate(doc.issue_date)}</p>
            <p>Échéance : {formatDate(doc.due_date)}</p>
            {doc.status === "brouillon" && (
              <p className="font-bold mt-2">BROUILLON — NON VALIDÉ</p>
            )}
            {doc.status === "annulee" && (
              <p className="font-bold mt-2">ANNULÉE</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-sm text-slate-500 mb-2">FACTURÉ À</p>
          <p className="font-semibold">
            {client?.company_name || client?.name}
          </p>
          {client?.company_name && <p>{client?.name}</p>}
          <p>{client?.address}</p>
          <p>{client?.city}</p>
          <p>{client?.phone}</p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-y border-slate-300">
            <tr>
              {["Désignation", "Qté", "Prix HT", "TVA", "Total HT"].map((h) => (
                <th key={h} className="py-3 text-left pr-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.data?.map((l) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="py-3 pr-3">{l.description}</td>
                <td>{l.quantity}</td>
                <td>{formatMoney(l.unit_price)}</td>
                <td>{l.tax_rate}%</td>
                <td>
                  {formatMoney(Number(l.quantity) * Number(l.unit_price))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto max-w-xs space-y-2">
          {[
            ["Total HT", doc.subtotal],
            ["TVA", doc.tax_total],
            ["Total TTC", doc.total],
            ["Déjà réglé", doc.amount_paid],
            ["Reste à payer", Number(doc.total) - Number(doc.amount_paid)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-5">
              <span>{label}</span>
              <strong>{formatMoney(value)}</strong>
            </div>
          ))}
        </div>
        {doc.notes && (
          <p className="whitespace-pre-line text-sm">{doc.notes}</p>
        )}
      </article>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/documents/print-button";
import { formatDate, formatMoney } from "@/lib/utils";

type Kind = "order" | "quote";

const KINDS: Record<Kind, { header: string; lines: string; fk: string; base: string; title: string; back: string; dateField: string; dateLabel: string }> = {
  order: { header: "sales_orders", lines: "sales_order_lines", fk: "order_id", base: "/sales/orders", title: "BON DE VENTE", back: "Retour à la commande", dateField: "order_date", dateLabel: "Date" },
  quote: { header: "sales_quotes", lines: "sales_quote_lines", fk: "quote_id", base: "/sales/quotes", title: "DEVIS", back: "Retour au devis", dateField: "quote_date", dateLabel: "Date du devis" },
};

export async function SalesPrint({ kind, id }: { kind: Kind; id: string }) {
  const k = KINDS[kind];
  const db = createClient();
  const [head, lines, company] = await Promise.all([
    db.from(k.header).select("*,contacts(*)").eq("id", id).single(),
    db.from(k.lines).select("*").eq(k.fk, id).order("position"),
    db.from("companies").select("*").limit(1).maybeSingle(),
  ]);
  if (head.error || !head.data) notFound();
  if (lines.error) throw new Error("Impossible de préparer l’impression.");
  const doc: any = head.data;
  const seller: any = company.data;
  const client: any = doc.contacts;

  return (
    <div>
      <style>{`@media print { body { background: white !important; } body * { visibility: hidden; } #doc-print, #doc-print * { visibility: visible; } #doc-print { position: absolute; inset: 0; width: 100%; padding: 0; box-shadow: none; } #doc-print tr { break-inside: avoid; } @page { size: A4; margin: 16mm; } }`}</style>
      <div className="flex flex-wrap gap-4 items-center mb-5 print:hidden">
        <PrintButton />
        <Link href={`${k.base}/${id}`}>{k.back}</Link>
      </div>
      <article id="doc-print" className="max-w-4xl bg-white text-slate-900 p-6 sm:p-10 rounded-xl space-y-8">
        <div className="flex flex-wrap justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold">{seller?.name ?? "Caractère"}</h1>
            {seller?.address && <p className="whitespace-pre-line mt-3">{seller.address}</p>}
            <p>{seller?.city} {seller?.country}</p>
            <p>{[seller?.phone, seller?.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{k.title}</h2>
            <p className="mt-2">{doc.number}</p>
            <p>{k.dateLabel} : {formatDate(doc[k.dateField])}</p>
            {kind === "quote" && doc.valid_until && <p>Valide jusqu’au {formatDate(doc.valid_until)}</p>}
            {doc.status === "brouillon" && <p className="font-bold mt-2">BROUILLON</p>}
            {(doc.status === "annulee" || doc.status === "refuse") && <p className="font-bold mt-2">ANNULÉ</p>}
          </div>
        </div>
        <div>
          <p className="text-sm text-slate-500 mb-2">CLIENT</p>
          <p className="font-semibold">{client?.company_name || client?.name}</p>
          {client?.company_name && <p>{client?.name}</p>}
          <p>{client?.address}</p>
          <p>{client?.city}</p>
          <p>{client?.phone}</p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-y border-slate-300">
            <tr>
              {["Désignation", "Qté", "Prix HT", "TVA", "Total HT"].map((h) => (
                <th key={h} className="py-3 text-left pr-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.data?.map((l: any) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="py-3 pr-3">{l.description}</td>
                <td>{l.quantity}</td>
                <td>{formatMoney(l.unit_price)}</td>
                <td>{l.tax_rate}%</td>
                <td>{formatMoney(Number(l.quantity) * Number(l.unit_price))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto max-w-xs space-y-2">
          {[
            ["Total HT", doc.subtotal],
            ["TVA", doc.tax_total],
            ["Total TTC", doc.total],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-5">
              <span>{label}</span>
              <strong>{formatMoney(value)}</strong>
            </div>
          ))}
        </div>
        {doc.notes && <p className="whitespace-pre-line text-sm">{doc.notes}</p>}
        {kind === "order" && (
          <div className="grid grid-cols-2 gap-10 pt-10 text-sm">
            <div className="border-t border-slate-300 pt-2">Signature Caractère</div>
            <div className="border-t border-slate-300 pt-2">Signature client</div>
          </div>
        )}
      </article>
    </div>
  );
}

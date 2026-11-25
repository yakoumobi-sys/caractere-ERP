import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { one } from "@/lib/erp";
import { PrintButton } from "./print-button";
import { dzd, fdate, PAY_METHOD, SERVICES, sizesText } from "@/lib/format";

export const dynamic = "force-dynamic";
const TITLE: Record<string, string> = { devis: "Devis", facture: "Facture", bon_livraison: "Bon de livraison", recu: "Reçu de paiement" };

export default async function DocumentPage({ params }: { params: { id: string } }) {
  const me = await requireMe();
  const d = await one(me, "select * from erp.v_documents where id = $1", [params.id]);
  if (!d || !d.snapshot) notFound();
  const s = d.snapshot;
  const co = s.company || {};
  const showPrices = d.kind !== "bon_livraison";
  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-sm text-slate-800 print:p-0">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={d.order_id ? `/commandes/${d.order_id}` : d.quote_id ? `/ventes/devis/${d.quote_id}` : "/"} className="text-brand-700">← Retour</Link>
        <PrintButton />
      </div>
      {d.status === "remplace" && <p className="mb-3 rounded bg-amber-50 p-2 text-amber-800">Document remplacé par une version corrigée.</p>}
      <header className="flex items-start justify-between border-b-2 border-brand-700 pb-3">
        <div>
          <div className="text-2xl font-bold text-brand-700">{co.name || "Caractère"}</div>
          <div className="text-xs text-slate-600">{co.activity}</div>
          <div className="mt-1 text-xs text-slate-600">{co.legal_name}<br />{co.address}<br />{co.phone} {co.email}</div>
          <div className="mt-1 text-[11px] text-slate-500">NIF {co.nif} · NIS {co.nis} · RC {co.rc} · AI {co.ai}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold">{TITLE[d.kind]}</div>
          <div className="font-mono">{d.number}</div>
          <div className="text-xs text-slate-500">Émis le {fdate(d.issued_at, true)}</div>
          <div className="mt-1 text-xs">Réf. commande : <span className="font-mono font-semibold">{s.ref}</span></div>
          {s.valid_until && <div className="text-xs">Valable jusqu'au {fdate(s.valid_until)}</div>}
          {d.correction_reason && <div className="text-xs text-amber-700">Correction : {d.correction_reason}</div>}
        </div>
      </header>
      <section className="my-4 grid grid-cols-2 gap-4 text-xs">
        <div><div className="font-semibold uppercase text-slate-500">Client</div><div className="text-sm font-medium">{s.client?.name}</div>{s.client?.company && <div>{s.client.company}</div>}<div>{s.client?.phone}</div><div>{[s.client?.address, s.client?.commune, s.client?.wilaya].filter(Boolean).join(", ")}</div></div>
        {d.kind === "bon_livraison" && <div><div className="font-semibold uppercase text-slate-500">Livraison</div><div>Colis {s.shipment?.number} · {s.shipment?.mode === "yalidine" ? "Yalidine" : "Retrait atelier"}</div>{s.shipment?.tracking && <div className="font-mono">Tracking {s.shipment.tracking}</div>}<div>{s.delivery?.name} {s.delivery?.phone}</div><div>{[s.delivery?.address, s.delivery?.commune, s.delivery?.wilaya].filter(Boolean).join(", ")}</div></div>}
      </section>
      {d.kind === "bon_livraison" ? (
        <table className="w-full border-collapse text-xs">
          <thead><tr className="border-b bg-slate-50 text-left"><th className="p-1.5">Article</th><th className="p-1.5">Couleur</th><th className="p-1.5">Taille</th><th className="p-1.5 text-right">Qté</th></tr></thead>
          <tbody>{(s.shipment?.items || []).map((i: any, k: number) => <tr key={k} className="border-b"><td className="p-1.5">{i.label}</td><td className="p-1.5">{i.color}</td><td className="p-1.5">{i.size}</td><td className="p-1.5 text-right">{i.qty}</td></tr>)}</tbody>
        </table>
      ) : d.kind === "recu" ? (
        <div className="rounded-lg border p-4 text-base">Reçu <strong>{dzd(s.payment?.amount)}</strong> ({PAY_METHOD[s.payment?.method]}) — {s.payment?.kind} — le {fdate(s.payment?.at, true)}<div className="mt-2 text-sm">Total commande {dzd(s.totals?.ttc)} · payé {dzd(s.totals?.paid)} · reste {dzd(s.totals?.balance)}</div></div>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead><tr className="border-b bg-slate-50 text-left"><th className="p-1.5">Désignation</th><th className="p-1.5">Tailles</th><th className="p-1.5 text-right">Qté</th>{showPrices && <><th className="p-1.5 text-right">PU HT</th><th className="p-1.5 text-right">Remise</th><th className="p-1.5 text-right">Montant HT</th></>}</tr></thead>
          <tbody>{(s.lines || []).map((l: any, k: number) => (
            <tr key={k} className="border-b align-top"><td className="p-1.5">{l.label} {l.color}{l.services?.length ? <div className="text-[11px] text-slate-500">{l.services.map((x: string) => SERVICES[x]).join(" + ")}{l.placement ? ` · ${l.placement}` : ""}</div> : null}{l.is_gift && <div className="text-[11px] text-brand-700">Offert — Carte Privilège</div>}</td>
              <td className="p-1.5">{sizesText(l.sizes)}</td><td className="p-1.5 text-right">{l.qty}</td>
              {showPrices && <><td className="p-1.5 text-right">{dzd(Number(l.unit_price) + Number(l.service_price))}</td><td className="p-1.5 text-right">{Number(l.discount_pct) ? `${l.discount_pct} %` : ""}</td><td className="p-1.5 text-right">{dzd(l.amount)}</td></>}</tr>))}</tbody>
        </table>
      )}
      {showPrices && d.kind !== "recu" && (
        <div className="mt-3 ml-auto w-64 text-xs">
          <div className="flex justify-between py-0.5"><span>Total HT</span><span>{dzd(s.totals?.ht)}</span></div>
          <div className="flex justify-between py-0.5"><span>TVA {s.totals?.tva_rate} %</span><span>{dzd(s.totals?.tva)}</span></div>
          <div className="flex justify-between border-t py-1 text-sm font-semibold"><span>Total TTC</span><span>{dzd(s.totals?.ttc)}</span></div>
          {d.kind === "facture" && <><div className="flex justify-between py-0.5"><span>Déjà réglé</span><span>{dzd(s.totals?.paid)}</span></div><div className="flex justify-between py-0.5 font-semibold"><span>Reste à payer</span><span>{dzd(s.totals?.balance)}</span></div></>}
          {d.kind === "devis" && <div className="py-0.5 text-slate-500">Acompte à la commande : {s.deposit_pct} % · délai {s.promised_days} jours après accord</div>}
        </div>
      )}
      {d.kind === "bon_livraison" && <div className="mt-10 grid grid-cols-2 gap-8 text-xs"><div className="border-t pt-1">Signature Caractère</div><div className="border-t pt-1">Reçu en bon état — signature client</div></div>}
      <footer className="mt-8 border-t pt-2 text-[10px] text-slate-500">{typeof s.legal_mentions === "string" ? s.legal_mentions : ""} {co.rib ? `RIB : ${co.rib}` : ""} — Document figé à l'émission, version {d.version}.</footer>
    </div>
  );
}

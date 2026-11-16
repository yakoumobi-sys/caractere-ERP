import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { q, one } from "@/lib/erp";
import { catalog, toEditorLines, tvaRate } from "@/lib/catalog";
import { Badge, Card, Field, LinkButton, PageHeader, Table, Td, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LineEditor } from "@/components/line-editor";
import { convertQuote, refuseQuote, saveQuote, sendQuote } from "@/app/actions/sales";
import { dzd, fdate, sizesText, SERVICES } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: { id: string } }) {
  const me = await requireMe("sales");
  const x = await one(me, "select * from erp.v_quotes where id = $1", [params.id]);
  if (!x) notFound();
  const [lines, docs, products, tva] = await Promise.all([
    q(me, "select * from erp.v_lines where quote_id = $1 order by position", [x.id]),
    q(me, "select * from erp.v_documents where quote_id = $1 and kind = 'devis' order by version desc", [x.id]),
    catalog(me), tvaRate(me),
  ]);
  const editable = ["brouillon", "envoye"].includes(x.status);
  const doc = docs[0];
  return (
    <div className="space-y-4">
      <PageHeader
        title={`Devis ${x.ref}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={x.status === "accepte" ? "green" : x.status === "refuse" ? "red" : "blue"}>{x.status}</Badge><Link href={`/clients/${x.client_id}`} className="underline">{x.client_name}</Link><span>· {x.owner_name}</span><span>· valable jusqu'au {fdate(x.valid_until)}</span></span>}
        actions={<>
          {doc && <LinkButton href={`/documents/${doc.id}`} variant="secondary">PDF du devis</LinkButton>}
          {doc && x.client_phone && <a className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white" target="_blank" rel="noreferrer" href={waLink(x.client_phone, `Bonjour ${x.client_name.split(" ")[0]}, voici votre devis Caractère ${x.ref} : ${dzd(x.totals.ttc)} TTC. Délai : ${x.promised_days} jours.`)!}>Envoyer par WhatsApp</a>}
          {x.order_id && <LinkButton href={`/commandes/${x.order_id}`}>Voir la commande</LinkButton>}
        </>}
      />
      <Card title="Lignes">
        <Table head={["Article", "Couleur", "Tailles", "Prestations", "PU HT", "Montant HT"]}>
          {lines.map((l: any) => <tr key={l.id}><Td>{l.label}{l.is_characterized && <Badge tone="violet">caractérisé</Badge>}</Td><Td>{l.color}</Td><Td>{sizesText(l.sizes)} ({l.qty})</Td><Td>{l.services.map((s: string) => SERVICES[s]).join(" + ") || "Vierge"}{l.placement ? ` · ${l.placement}` : ""}</Td><Td>{dzd(l.unit_price + l.service_price)}</Td><Td>{dzd(l.amount)}</Td></tr>)}
        </Table>
        <div className="mt-3 text-right text-sm">HT {dzd(x.totals.ht)} · TVA {x.totals.tva_rate} % {dzd(x.totals.tva)} · <strong>TTC {dzd(x.totals.ttc)}</strong> · acompte {x.deposit_pct} %</div>
      </Card>
      {editable && !x.order_id && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card title="Accord du client">
            <p className="mb-2 text-sm text-slate-600">Convertit le devis en commande (même référence). Un nouveau clic renvoie la même commande.</p>
            <ActionForm action={convertQuote}><input type="hidden" name="id" value={x.id} /><SubmitButton>Devis accepté → créer la commande</SubmitButton></ActionForm>
          </Card>
          <Card title="Envoi">
            <ActionForm action={sendQuote}><input type="hidden" name="id" value={x.id} /><SubmitButton variant="secondary">{x.status === "envoye" ? "Réémettre (nouvelle version)" : "Émettre et marquer envoyé"}</SubmitButton></ActionForm>
            {x.sent_at && <p className="mt-2 text-xs text-slate-500">Envoyé le {fdate(x.sent_at, true)}</p>}
          </Card>
          <Card title="Refus">
            <ActionForm action={refuseQuote} className="flex gap-2"><input type="hidden" name="id" value={x.id} /><input name="reason" required placeholder="Motif" className={inputCls} /><SubmitButton variant="danger">Perdu</SubmitButton></ActionForm>
          </Card>
        </div>
      )}
      {editable && !x.order_id && (
        <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Modifier le devis</summary>
          <ActionForm action={saveQuote} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={x.id} /><input type="hidden" name="client_id" value={x.client_id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Délai promis (jours)"><input name="promised_days" defaultValue={x.promised_days} className={inputCls} /></Field>
              <Field label="Acompte (%)"><input name="deposit_pct" defaultValue={x.deposit_pct} className={inputCls} /></Field>
              <Field label="Notes"><input name="notes" defaultValue={x.notes || ""} className={inputCls} /></Field>
            </div>
            <LineEditor products={products} tva={tva} initial={toEditorLines(lines)} />
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
        </details>
      )}
      {docs.length > 0 && (
        <Card title="Versions émises">
          <ul className="text-sm">{docs.map((d: any) => <li key={d.id}><Link href={`/documents/${d.id}`} className="font-mono underline">{d.number}</Link> · {fdate(d.issued_at, true)} · {d.status}{d.correction_reason ? ` · ${d.correction_reason}` : ""}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}

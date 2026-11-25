import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { q, one } from "@/lib/erp";
import { catalog, toEditorLines, tvaRate } from "@/lib/catalog";
import { Badge, Card, Empty, Field, LinkButton, NextAction, PageHeader, Progress, Table, Td, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LineEditor } from "@/components/line-editor";
import * as A from "@/app/actions/orders";
import { issueStock } from "@/app/actions/workshop";
import { dzd, fdate, ORDER_STATUS, ORDER_TONE, PAY_METHOD, PAY_STATUS, SERVICES, SHIP_STATUS, sizesText, STEP_LABEL, TASK_STATUS } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { PhotoGallery, PhotoUploader } from "@/components/order-photos";
import { OrderWorkButtons } from "@/components/cards";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  creation: "Création", confirmation: "Confirmation", statut: "Statut", quantite: "Quantités", delai: "Délai", responsable: "Responsable", annulation: "Annulation",
  paiement: "Paiement", remboursement: "Remboursement", colis: "Colis", tracking: "Tracking", livraison_partielle: "Livraison partielle", incident: "Incident",
  retour: "Retour", photo: "Photo", bat: "BAT", accord: "Accord", blocage: "Blocage", deblocage: "Déblocage", livraison: "Mode de remise", fidelite: "Fidélité", lignes: "Lignes",
};

export default async function OrderPage({ params, searchParams }: { params: { id: string }; searchParams: { vente?: string } }) {
  const me = await requireMe("orders_view");
  const o = await one(me, "select * from erp.v_orders where id = $1", [params.id]);
  if (!o) notFound();
  const money = me.can("money_view");
  const edit = me.can("orders_edit");
  const [lines, tasks, shipments, payments, docs, events, files, staff, benefits, remaining] = await Promise.all([
    q(me, "select * from erp.v_lines where order_id = $1 order by position", [o.id]),
    q(me, "select * from erp.v_tasks where order_id = $1 order by line_id, seq", [o.id]),
    q(me, "select * from erp.v_shipments where order_id = $1 order by number", [o.id]),
    money ? q(me, "select * from erp.v_payments where order_id = $1 order by at", [o.id]) : [],
    q(me, "select * from erp.v_documents where order_id = $1 order by issued_at desc", [o.id]),
    q(me, "select * from erp.v_order_events where order_id = $1 order by at desc", [o.id]),
    q(me, "select * from erp.v_files where order_id = $1 or id in ($2, $3, $4) order by created_at desc", [o.id, o.logo_file_id, o.bat_file_id, o.agreement_file_id]),
    q(me, "select id, full_name, roles from erp.v_staff where active order by full_name"),
    edit && o.status === "brouillon" && o.client_id ? q(me, "select * from erp.v_loyalty where client_id = $1 and benefit_status = 'disponible' and source_order_id <> $2", [o.client_id, o.id]) : [],
    q(me, "select l.id line_id, l.label, l.color, l.produced, l.qty, s.key size, erp.line_remaining(l.id, s.key) rem from erp.v_lines l, jsonb_each_text(l.sizes) s where l.order_id = $1 order by l.position, s.key", [o.id]),
  ]);
  const photos = files.filter((f: any) => f.kind === "photo" && f.order_id === o.id).reverse();
  const personalized = lines.some((l: any) => l.services.length);
  const file = (id: string | null) => (id ? files.find((f: any) => f.id === id) : null);
  const shippable = remaining.filter((r: any) => r.rem > 0 && r.produced >= r.qty);
  const hasActive = lines.some((l: any) => Object.keys(l.reserved || {}).length);
  const commercials = staff.filter((s: any) => s.roles.includes("commercial") || s.roles.includes("gerant"));
  const tpl = `Bonjour ${(o.client_name || "").split(" ")[0]}, votre commande Caractère ${o.ref} est prête ! Vous pouvez passer la récupérer à l'atelier d'Aïn Benian.`;

  return (
    <div className="space-y-4">
      {searchParams.vente === "ok" && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Vente enregistrée : stock sorti, paiement encaissé, reçu émis.</p>}
      <PageHeader
        title={`Commande ${o.ref}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS[o.status]}</Badge>{o.is_late && <Badge tone="red">En retard</Badge>}{o.is_blocked && <Badge tone="red">Bloquée</Badge>}
          {me.can("clients_view") && o.client_id ? <Link href={`/clients/${o.client_id}`} className="underline">{o.client_name}</Link> : <span>{o.client_name}</span>}
          <span>· {o.owner_name || "sans responsable"}</span><span>· promis le {fdate(o.promised_date)}</span><span>· {o.delivery_mode === "yalidine" ? "Yalidine" : "retrait atelier"}</span>
        </span>}
        actions={o.status === "prete" && o.client_phone && o.delivery_mode === "retrait" ? <a href={waLink(o.client_phone, tpl)!} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white">Prévenir sur WhatsApp</a> : null}
      />
      {/* Vue atelier : photos en grand, client, articles et boutons Commencer / Terminer */}
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_1px_3px_rgba(30,20,80,0.06)]">
        <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-2">
          <div>
            {photos.length ? <PhotoGallery orderId={o.id} photos={photos} canEdit={edit} /> : (
              <div className="grid h-56 place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-400">
                <div><div className="text-4xl">👕</div>Aucune photo pour l'instant</div>
              </div>
            )}
            {(edit || me.can("workshop_work")) && <div className="mt-3"><PhotoUploader orderId={o.id} label={photos.length ? "Ajouter d'autres photos" : "Ajouter des photos (maquette, logo…)"} /></div>}
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-slate-500">Client</div>
              <div className="text-2xl font-bold text-slate-900 sm:text-3xl">{o.client_name}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-sm text-slate-500"><span className="font-mono">{o.ref}</span><span>· promis le {fdate(o.promised_date)}</span><span>· {o.qty_total} pièce(s)</span></div>
            </div>
            <div>
              <div className="mb-2 text-sm text-slate-500">Articles</div>
              <ul className="space-y-2">
                {lines.map((l: any) => (
                  <li key={l.id} className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="text-lg font-semibold text-slate-900">{l.qty} × {l.label}</div>
                    <div className="text-base text-slate-700">{l.color || "Couleur à confirmer"}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">{Object.entries(l.sizes || {}).map(([k, v]) => <span key={k} className="rounded-lg bg-white px-2.5 py-1 text-base font-semibold text-brand-700 ring-1 ring-brand-100">{k} : {String(v)}</span>)}</div>
                    {l.services?.length > 0 && <div className="mt-1 text-sm text-slate-500">{l.services.map((x: string) => SERVICES[x] || x).join(" + ")}{l.placement ? ` · ${l.placement}` : ""}</div>}
                  </li>
                ))}
              </ul>
            </div>
            {o.notes && <p className="whitespace-pre-line rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{o.notes}</p>}
            <OrderWorkButtons o={o} canWork={me.can("workshop_work")} big />
            {o.status === "brouillon" && <p className="text-sm text-slate-500">Pour la lancer à l'atelier, confirmez d'abord la commande (plus bas).</p>}
            {o.status === "prete" && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-base font-semibold text-emerald-700">✓ Commande terminée : elle est prête.</p>}
          </div>
        </div>
      </section>

      <Card>
        <div className="mb-3"><NextAction>{o.next_action}</NextAction></div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Progress label="Commercial" value={o.progress.commercial} />
          <Progress label="Fabrication" value={o.progress.fabrication} tone="blue" />
          <Progress label="Livraison" value={o.progress.livraison} tone="amber" />
          {money && <Progress label="Règlement" value={o.progress.reglement} tone="green" />}
        </div>
        {money && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          <span>Total {dzd(o.total_ttc)} TTC</span><span>Acompte requis {dzd(o.deposit_required)} ({o.deposit_pct} %)</span><span>Payé {dzd(o.paid)}</span>
          {o.cod_pending > 0 && <span>Contre-remboursement attendu {dzd(o.cod_pending)}</span>}<span className="font-semibold text-slate-900">Reste {dzd(o.balance)}</span>
          {o.refund_due > 0 && <span className="font-semibold text-red-700">À rembourser {dzd(o.refund_due)}</span>}
        </div>}
        {o.blocked_reason && <p className="mt-2 text-sm text-red-700">Bloquée : {o.blocked_reason}</p>}
        {o.task_block_reasons && <p className="mt-2 text-sm text-red-700">Atelier bloqué : {o.task_block_reasons}</p>}
        {o.cancel_reason && <p className="mt-2 text-sm text-red-700">Annulée : {o.cancel_reason}</p>}
        {o.return_reason && <p className="mt-2 text-sm text-red-700">Retour : {o.return_reason}</p>}
        {o.rework_note && <p className="mt-2 text-sm text-amber-700">À traiter : {o.rework_note}</p>}
        {o.deposit_waived_reason && money && <p className="mt-2 text-xs text-slate-500">Confirmée sans l'acompte prévu : {o.deposit_waived_reason}</p>}
      </Card>

      {o.status === "brouillon" && edit && (
        <div className="grid gap-3 md:grid-cols-3">
          {personalized && (
            <Card title="Logo et BAT">
              <div className="mb-2 text-sm">Logo : {file(o.logo_file_id) ? <a className="text-brand-700 underline" href={`/api/files/${o.logo_file_id}`} target="_blank">{file(o.logo_file_id)!.filename}</a> : <span className="text-slate-400">aucun</span>}</div>
              <ActionForm action={A.setLogo} className="mb-3 flex gap-2"><input type="hidden" name="id" value={o.id} /><input type="file" name="file" accept="image/*,application/pdf" className="w-full text-xs" /><SubmitButton variant="secondary">OK</SubmitButton></ActionForm>
              <div className="mb-2 text-sm">BAT : <Badge tone={o.bat_status === "valide" ? "green" : o.bat_status === "refuse" ? "red" : "amber"}>{o.bat_status}</Badge> {file(o.bat_file_id) && <a className="text-brand-700 underline" href={`/api/files/${o.bat_file_id}`} target="_blank">voir</a>}</div>
              <ActionForm action={A.setBat} className="grid gap-2"><input type="hidden" name="id" value={o.id} />
                <input type="file" name="file" accept="image/*,application/pdf" className="text-xs" />
                <select name="status" defaultValue={o.bat_status === "a_faire" ? "envoye" : "valide"} className={inputCls}><option value="envoye">BAT envoyé au client</option><option value="valide">BAT validé par le client</option><option value="refuse">BAT refusé (à refaire)</option></select>
                <SubmitButton variant="secondary">Enregistrer le BAT</SubmitButton></ActionForm>
            </Card>
          )}
          {personalized && (
            <Card title="Preuve d'accord">
              {(o.agreement_note || o.agreement_file_id) && <p className="mb-2 text-sm text-emerald-700">✓ {o.agreement_note} {file(o.agreement_file_id) && <a className="underline" href={`/api/files/${o.agreement_file_id}`} target="_blank">fichier</a>}</p>}
              <ActionForm action={A.setAgreement} className="grid gap-2"><input type="hidden" name="id" value={o.id} />
                <input name="note" placeholder="Ex. Accord WhatsApp du 16/11" className={inputCls} /><input type="file" name="file" accept="image/*,application/pdf" className="text-xs" />
                <SubmitButton variant="secondary">Enregistrer</SubmitButton></ActionForm>
            </Card>
          )}
          <Card title="Confirmation">
            <p className="mb-2 text-sm text-slate-600">Réserve le stock et crée les tâches atelier. Un double clic n'enregistre qu'une confirmation.</p>
            <ActionForm action={A.confirmOrder} className="grid gap-2"><input type="hidden" name="id" value={o.id} />
              {me.can("waive_deposit") && <input name="waive_reason" placeholder="Gérant : motif si sans acompte" className={inputCls} />}
              <SubmitButton>Confirmer la commande</SubmitButton></ActionForm>
            {benefits.length > 0 && (
              <ActionForm action={A.applyBenefit} className="mt-3 grid gap-2 rounded-lg bg-brand-50 p-2">
                <input type="hidden" name="order_id" value={o.id} /><input type="hidden" name="benefit_id" value={benefits[0].benefit_id} />
                <p className="text-xs text-brand-700">Carte {benefits[0].number} : T-shirt caractérisé offert disponible</p>
                <div className="flex gap-2"><input name="size" defaultValue="M" className={inputCls} /><input name="color" defaultValue="Blanc" className={inputCls} /></div>
                <SubmitButton variant="secondary">Appliquer le cadeau</SubmitButton></ActionForm>
            )}
          </Card>
        </div>
      )}

      <Card title={`Lignes (${o.qty_total} pièces)`}>
        <Table head={["Article", "Tailles", "Prestations", ...(money ? ["PU / Montant HT"] : []), "Réservé · remis", "Produit", "Livré"]}>
          {lines.map((l: any) => (
            <tr key={l.id}>
              <Td><div className="font-medium">{l.label} {l.color}</div><div className="text-xs text-slate-400">{l.product_ref || "hors stock"}{l.is_gift ? " · cadeau" : ""}{l.is_characterized ? " · T-shirt caractérisé" : ""}</div></Td>
              <Td>{sizesText(l.sizes)}{Object.keys(l.missing || {}).length > 0 && <div className="text-xs font-medium text-red-700">Manque {sizesText(l.missing)}</div>}</Td>
              <Td>{l.services.map((s: string) => SERVICES[s]).join(" + ") || "Vierge"}<div className="text-xs text-slate-400">{l.placement}{l.print_width_cm ? ` · ${l.print_width_cm} cm` : ""}</div></Td>
              {money && <Td>{dzd(l.unit_price + l.service_price)}{l.discount_pct > 0 && ` −${l.discount_pct} %`}<div className="text-xs text-slate-500">{dzd(l.amount)}</div></Td>}
              <Td className="text-xs">{sizesText(l.reserved) || "—"}<div>{sizesText(l.issued) && `remis ${sizesText(l.issued)}`}</div></Td>
              <Td>{l.produced}/{l.qty}</Td>
              <Td>{sizesText(l.delivered) || "0"}</Td>
            </tr>
          ))}
        </Table>
        {edit && o.status === "brouillon" && (
          <details className="mt-3"><summary className="cursor-pointer text-sm text-brand-700">Modifier les lignes du brouillon</summary>
            <ActionForm action={A.replaceDraftLines} className="mt-3 space-y-3"><input type="hidden" name="order_id" value={o.id} />
              <LineEditor products={await catalog(me)} tva={await tvaRate(me)} initial={toEditorLines(lines)} /><SubmitButton>Enregistrer les lignes</SubmitButton></ActionForm>
          </details>
        )}
        {edit && ["confirmee", "en_production", "prete"].includes(o.status) && (
          <details className="mt-3"><summary className="cursor-pointer text-sm text-brand-700">Modifier une quantité (après confirmation)</summary>
            {lines.map((l: any) => (
              <ActionForm key={l.id} action={A.updateLineSizes} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2">
                <input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="order_id" value={o.id} />
                <span className="text-sm font-medium">{l.label} {l.color}</span>
                {Object.entries(l.sizes).map(([k, v]) => <label key={k} className="text-xs">{k}<input name={`size_${k}`} defaultValue={String(v)} className="w-14 rounded border border-slate-300 px-1 py-1" /></label>)}
                <input name="reason" required placeholder="Motif" className={inputCls + " max-w-xs"} />
                <SubmitButton variant="secondary">Recalculer</SubmitButton>
              </ActionForm>
            ))}
            <p className="mt-1 text-xs text-slate-500">Réservations et tâches sont recalculées ; si la production a commencé ou si un paiement existe, les reprises ou le remboursement à traiter sont signalés.</p>
          </details>
        )}
      </Card>

      {tasks.length > 0 && (
        <Card title="Atelier" actions={hasActive && (me.can("stock_edit") || me.can("workshop_work")) ? <ActionForm action={issueStock}><input type="hidden" name="order_id" value={o.id} /><SubmitButton variant="secondary">Remettre les articles à l'atelier</SubmitButton></ActionForm> : null}>
          <ul className="divide-y divide-slate-100 text-sm">{tasks.map((t: any) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <Link href={`/atelier/${t.id}`} className="font-medium hover:underline">{STEP_LABEL[t.step]}</Link>
              <span className="text-xs text-slate-400">{t.line_label}</span>
              <Badge tone={t.status === "terminee" ? "green" : t.status === "bloquee" ? "red" : t.status === "en_cours" ? "blue" : "gray"}>{TASK_STATUS[t.status]}</Badge>
              {t.needs_first_piece && t.first_piece_status !== "na" && <Badge tone={t.first_piece_status === "validee" ? "green" : "amber"}>1re pièce {t.first_piece_status.replace("_", " ")}{t.first_piece_by_name ? ` · ${t.first_piece_by_name}` : ""}</Badge>}
              <span className="ml-auto text-xs text-slate-500">{t.assignee_name || "non affectée"}{t.finished_by_name ? ` · fait par ${t.finished_by_name} ${fdate(t.finished_at, true)}` : t.started_by_name ? ` · démarré par ${t.started_by_name} ${fdate(t.started_at, true)}` : ""}</span>
            </li>))}</ul>
        </Card>
      )}

      {money && (
        <Card title="Règlement">
          <Table head={["Date", "Type", "Mode", "Montant", "Statut", "Reçu"]}>
            {payments.map((p: any) => (
              <tr key={p.id}><Td>{fdate(p.at, true)}</Td><Td>{p.kind}</Td><Td>{PAY_METHOD[p.method]}{p.tracking ? ` · ${p.tracking}` : ""}</Td><Td>{p.kind === "remboursement" ? "−" : ""}{dzd(p.amount)}</Td>
                <Td><Badge tone={p.status === "rapproche" || p.status === "confirme" ? "green" : p.status === "annule" ? "red" : "amber"}>{PAY_STATUS[p.status]}</Badge></Td><Td className="text-xs">{p.receipt_number}</Td></tr>))}
          </Table>
          {!payments.length && <Empty>Aucun paiement.</Empty>}
          {me.can("payment_record") && o.status !== "annulee" && o.balance - (o.cod_pending || 0) > 0 && (
            <ActionForm action={A.recordPayment} idempotent className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
              <input type="hidden" name="order_id" value={o.id} />
              <input name="amount" inputMode="decimal" required defaultValue={o.status === "brouillon" ? Math.max(0, o.deposit_required - o.paid) || "" : o.balance - (o.cod_pending || 0)} className={inputCls} aria-label="Montant" />
              <select name="method" className={inputCls}>{Object.entries(PAY_METHOD).filter(([k]) => k !== "yalidine_cod").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input name="note" placeholder="Note (facultatif)" className={inputCls} />
              <SubmitButton>{o.status === "brouillon" ? "Encaisser l'acompte" : "Encaisser"}</SubmitButton>
            </ActionForm>
          )}
          {me.can("payment_record") && o.paid > 0 && (o.refund_due > 0 || o.status === "annulee") && (
            <ActionForm action={A.recordRefund} idempotent className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
              <input type="hidden" name="order_id" value={o.id} />
              <input name="amount" inputMode="decimal" defaultValue={o.refund_due || ""} className={inputCls} />
              <select name="method" className={inputCls}>{["especes", "ccp", "virement", "baridimob"].map((k) => <option key={k} value={k}>{PAY_METHOD[k]}</option>)}</select>
              <input name="reason" required placeholder="Motif du remboursement" className={inputCls} />
              <SubmitButton variant="danger">Rembourser</SubmitButton>
            </ActionForm>
          )}
        </Card>
      )}

      <Card title="Livraison et colis">
        <div className="space-y-2">
          {shipments.map((s: any) => (
            <div key={s.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong>Colis {s.number}</strong><Badge>{s.mode === "yalidine" ? "Yalidine" : "Retrait"}</Badge>
                <Badge tone={["livre", "retire"].includes(s.status) ? "green" : ["echec", "retour"].includes(s.status) ? "red" : "amber"}>{SHIP_STATUS[s.status]}</Badge>
                {s.tracking && <span className="font-mono">{s.tracking}</span>}{s.attempts > 0 && <span className="text-xs text-red-700">{s.attempts} tentative(s) échouée(s)</span>}
                {money && s.cod_amount > 0 && <span className="text-xs text-slate-500">COD {dzd(s.cod_amount)} · {PAY_STATUS[s.cod_status] || ""}</span>}
                <span className="ml-auto text-xs text-slate-400">{s.last_event_label} {s.last_event_at ? fdate(s.last_event_at, true) : ""}</span>
              </div>
              <div className="mt-1 text-xs text-slate-600">{(s.items || []).map((i: any) => `${i.qty}× ${i.label} ${i.color} ${i.size}`).join(" · ")}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {docs.filter((d: any) => d.shipment_id === s.id && d.status === "emis").map((d: any) => <LinkButton key={d.id} href={`/documents/${d.id}`} variant="secondary">BL {d.number}</LinkButton>)}
                {me.can("shipping") && s.mode === "yalidine" && !s.tracking && (
                  <ActionForm action={A.setTracking} className="flex gap-2"><input type="hidden" name="shipment_id" value={s.id} /><input type="hidden" name="order_id" value={o.id} /><input name="tracking" required placeholder="Tracking Yalidine" className={inputCls} /><SubmitButton variant="secondary">OK</SubmitButton></ActionForm>
                )}
                {me.can("shipping") && s.mode === "yalidine" && s.tracking && !["livre", "retour", "annule"].includes(s.status) && (
                  <ActionForm action={A.setShipmentStatus} className="flex gap-2"><input type="hidden" name="shipment_id" value={s.id} /><input type="hidden" name="order_id" value={o.id} />
                    <select name="status" className={inputCls}><option value="en_transit">En transit</option><option value="livre">Livré</option><option value="echec">Tentative échouée</option><option value="retour">Retourné</option></select>
                    <input name="label" placeholder="Détail (facultatif)" className={inputCls} /><SubmitButton variant="secondary">Saisir le statut</SubmitButton></ActionForm>
                )}
                {me.can("shipping") && s.mode === "retrait" && s.status === "preparation" && (
                  <ActionForm action={A.setShipmentStatus}><input type="hidden" name="shipment_id" value={s.id} /><input type="hidden" name="order_id" value={o.id} /><input type="hidden" name="status" value="retire" /><SubmitButton>Remis au client (retrait)</SubmitButton></ActionForm>
                )}
                {me.can("stock_edit") && s.status === "retour" && !s.return_restocked && (
                  <ActionForm action={A.restockReturn} className="flex gap-2"><input type="hidden" name="shipment_id" value={s.id} /><input type="hidden" name="order_id" value={o.id} /><input name="note" required placeholder="Résultat du contrôle" className={inputCls} /><SubmitButton variant="secondary">Réintégrer après contrôle</SubmitButton></ActionForm>
                )}
              </div>
            </div>
          ))}
          {!shipments.length && <Empty>Aucun colis.</Empty>}
        </div>
        {me.can("shipping") && shippable.length > 0 && ["en_production", "prete", "expediee", "a_retirer"].includes(o.status) && (
          <details className="mt-3" open={o.status === "prete"}><summary className="cursor-pointer text-sm font-medium text-brand-700">Préparer un colis / une remise</summary>
            <ActionForm action={A.createShipment} className="mt-2 space-y-2">
              <input type="hidden" name="order_id" value={o.id} />
              <div className="grid gap-1 text-sm">{shippable.map((r: any) => (
                <label key={r.line_id + r.size} className="flex items-center gap-2"><input name={`q__${r.line_id}__${r.size}`} defaultValue={r.rem} inputMode="numeric" className="w-16 rounded border border-slate-300 px-2 py-1" /> / {r.rem} × {r.label} {r.color} {r.size}</label>))}</div>
              <div className="grid gap-2 sm:grid-cols-4">
                <Field label="Mode"><select name="mode" defaultValue={o.delivery_mode} className={inputCls}><option value="yalidine">Yalidine</option><option value="retrait">Retrait atelier</option></select></Field>
                <Field label="Tracking (si connu)"><input name="tracking" className={inputCls} /></Field>
                {money && <Field label="Contre-remboursement (DA)"><input name="cod_amount" inputMode="decimal" defaultValue={Math.max(0, o.balance - (o.cod_pending || 0))} className={inputCls} /></Field>}
                {money && <Field label="Frais Yalidine (DA)"><input name="fee" inputMode="decimal" className={inputCls} /></Field>}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="api" /> Créer le colis via l'API Yalidine (si configurée)</label>
              <SubmitButton>Créer le colis et le bon de livraison</SubmitButton>
            </ActionForm>
          </details>
        )}
        {o.status !== "brouillon" && edit && !["livree", "retiree", "annulee"].includes(o.status) && (
          <details className="mt-3"><summary className="cursor-pointer text-sm text-brand-700">Adresse et mode de remise</summary>
            <ActionForm action={A.updateMeta} className="mt-2 grid gap-2 sm:grid-cols-3"><input type="hidden" name="id" value={o.id} />
              <select name="delivery_mode" defaultValue={o.delivery_mode} className={inputCls}><option value="retrait">Retrait atelier</option><option value="yalidine">Yalidine</option></select>
              <input name="ship_name" defaultValue={o.ship_name || ""} placeholder="Destinataire" className={inputCls} /><input name="ship_phone" defaultValue={o.ship_phone || ""} placeholder="Téléphone" className={inputCls} />
              <input name="ship_wilaya" defaultValue={o.ship_wilaya || ""} placeholder="Wilaya" className={inputCls} /><input name="ship_commune" defaultValue={o.ship_commune || ""} placeholder="Commune" className={inputCls} />
              <input name="ship_address" defaultValue={o.ship_address || ""} placeholder="Adresse" className={inputCls} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ship_stopdesk" defaultChecked={o.ship_stopdesk} /> Stop desk</label>
              <SubmitButton variant="secondary">Enregistrer</SubmitButton></ActionForm>
          </details>
        )}
      </Card>

      {money && (
        <Card title="Documents" actions={o.status !== "brouillon" && o.status !== "annulee" ? <ActionForm action={A.issueDocument}><input type="hidden" name="kind" value="facture" /><input type="hidden" name="order_id" value={o.id} /><SubmitButton variant="secondary">{docs.some((d: any) => d.kind === "facture" && d.status === "emis") ? "Voir la facture" : "Émettre la facture"}</SubmitButton></ActionForm> : null}>
          <ul className="divide-y divide-slate-100 text-sm">{docs.map((d: any) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5"><Link href={`/documents/${d.id}`} className="font-mono font-medium hover:underline">{d.number}</Link><Badge>{d.kind.replace("_", " ")}</Badge>{d.status === "remplace" && <Badge tone="amber">remplacé</Badge>}{d.correction_reason && <span className="text-xs text-slate-500">{d.correction_reason}</span>}<span className="ml-auto text-xs text-slate-400">{fdate(d.issued_at, true)} · {d.issued_by_name}</span></li>))}</ul>
          {docs.some((d: any) => d.kind === "facture" && d.status === "emis") && (
            <details className="mt-2"><summary className="cursor-pointer text-xs text-brand-700">Corriger la facture (nouvelle version, l'ancienne est conservée)</summary>
              <ActionForm action={A.issueDocument} className="mt-2 flex gap-2"><input type="hidden" name="kind" value="facture" /><input type="hidden" name="order_id" value={o.id} /><input name="reason" required placeholder="Motif de la correction" className={inputCls} /><SubmitButton variant="secondary">Émettre la correction</SubmitButton></ActionForm>
            </details>
          )}
        </Card>
      )}

      {edit && !["livree", "retiree", "annulee"].includes(o.status) && (
        <Card title="Pilotage">
          <div className="grid gap-3 md:grid-cols-3">
            <ActionForm action={A.updateMeta} className="grid gap-2"><input type="hidden" name="id" value={o.id} />
              <Field label="Date promise"><input type="date" name="promised_date" defaultValue={o.promised_date || ""} className={inputCls} /></Field>
              <Field label="Responsable"><select name="owner_id" defaultValue={o.owner_id || ""} className={inputCls}>{commercials.map((s: any) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></Field>
              <input name="reason" placeholder="Motif du changement" className={inputCls} />
              <SubmitButton variant="secondary">Enregistrer</SubmitButton></ActionForm>
            <ActionForm action={A.blockOrder} className="grid content-start gap-2"><input type="hidden" name="id" value={o.id} />
              <Field label={o.blocked_reason ? "Commande bloquée" : "Bloquer la commande"}><input name="reason" defaultValue={o.blocked_reason || ""} placeholder="Motif (vide = débloquer)" className={inputCls} /></Field>
              <SubmitButton variant="secondary">{o.blocked_reason ? "Mettre à jour" : "Bloquer"}</SubmitButton></ActionForm>
            <ActionForm action={A.cancelOrder} className="grid content-start gap-2"><input type="hidden" name="id" value={o.id} />
              <Field label="Annuler la commande"><input name="reason" required placeholder="Motif de l'annulation" className={inputCls} /></Field>
              <SubmitButton variant="danger" confirm="Annuler cette commande ? Les réservations seront libérées.">Annuler</SubmitButton></ActionForm>
          </div>
        </Card>
      )}

      <Card title="Historique">
        <ul className="space-y-1 text-sm">{events.map((e: any) => (
          <li key={e.id} className="flex flex-wrap gap-2"><span className="w-28 shrink-0 text-xs text-slate-400">{fdate(e.at, true)}</span><Badge>{EVENT_LABEL[e.kind] || e.kind}</Badge>
            <span className="text-slate-600">{describe(e)}</span><span className="ml-auto text-xs text-slate-400">{e.staff_name || "système"}</span></li>))}</ul>
      </Card>
    </div>
  );
}

function describe(e: any) {
  const a = e.after || {}, b = e.before || {};
  const parts: string[] = [];
  if (a.status) parts.push(`${b.status ? ORDER_STATUS[b.status] + " → " : ""}${ORDER_STATUS[a.status] || a.status}`);
  if (a.sizes) parts.push(`${a.line} : ${sizesText(b.sizes)} → ${sizesText(a.sizes)}`);
  if (a.promised_date) parts.push(`${fdate(b.promised_date)} → ${fdate(a.promised_date)}`);
  if (a.amount) parts.push(`${dzd(a.amount)} ${a.method ? PAY_METHOD[a.method] : ""}`);
  if (a.colis) parts.push(`colis ${a.colis}${a.tracking ? " · " + a.tracking : ""}`);
  if (a.bat) parts.push(`BAT ${a.bat}`);
  if (a.manquant) parts.push(`${a.manquant} pièce(s) manquante(s)`);
  if (a.a_rembourser) parts.push(`${dzd(a.a_rembourser)} à rembourser`);
  if (a.a_traiter) parts.push(a.a_traiter);
  if (e.note) parts.push(e.note);
  return parts.join(" · ");
}

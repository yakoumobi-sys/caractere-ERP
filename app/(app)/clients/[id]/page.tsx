import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { q, one } from "@/lib/erp";
import { Badge, Card, Empty, Field, LinkButton, PageHeader, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ClientForm } from "@/components/client-form";
import { OrderCard } from "@/components/cards";
import { FollowupItem } from "@/components/followup";
import { addSimulation, createFollowup, logInteraction, updateClient } from "@/app/actions/clients";
import { createDeal } from "@/app/actions/sales";
import { dzd, fdate, FOLLOWUP_REASON, DEAL_STAGES, PLACEMENTS } from "@/lib/format";
import { waLink, fillTemplate } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: { id: string } }) {
  const me = await requireMe("clients_view");
  const c = await one(me, "select * from erp.v_clients where id = $1", [params.id]);
  if (!c) notFound();
  const [orders, quotes, deals, followups, interactions, sims, loyalty, staff, tpl, files] = await Promise.all([
    q(me, "select * from erp.v_orders where client_id = $1 order by created_at desc", [c.id]),
    me.can("sales") ? q(me, "select * from erp.v_quotes where client_id = $1 order by created_at desc", [c.id]) : [],
    me.can("sales") ? q(me, "select * from erp.v_deals where client_id = $1 order by created_at desc", [c.id]) : [],
    q(me, "select * from erp.v_followups where client_id = $1 order by status = 'a_faire' desc, due_date desc limit 30", [c.id]),
    q(me, "select * from erp.v_interactions where client_id = $1 order by at desc limit 60", [c.id]),
    me.can("sales") ? q(me, "select * from erp.v_simulations where client_id = $1 order by created_at desc", [c.id]) : [],
    q(me, "select * from erp.v_loyalty where client_id = $1 order by benefit_issued_at", [c.id]),
    q(me, "select id, full_name from erp.v_staff where active order by full_name"),
    one(me, "select value from erp.v_settings where key = 'whatsapp_templates'"),
    q(me, "select * from erp.v_files where client_id = $1 order by created_at desc", [c.id]),
  ]);
  const edit = me.can("clients_edit");
  const wa = waLink(c.phone, fillTemplate(tpl?.value?.autre || "Bonjour {prenom}", { prenom: c.name.split(" ")[0], commercial: me.fullName.split(" ")[0] }));
  const card = loyalty[0];
  const fileName = (id: string) => files.find((f: any) => f.id === id)?.filename;
  return (
    <div className="space-y-4">
      <PageHeader
        title={c.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={c.kind === "client" ? "green" : "blue"}>{c.kind === "client" ? "Client" : "Prospect"}</Badge>
          {c.company && <span>{c.company}</span>}<span>{c.phone || "sans téléphone"}</span><span>· source {c.source}</span><span>· {c.owner_name || "non assigné"}</span>
          {c.marketing_opt_out && <Badge tone="red">Refus marketing{c.opt_out_reason ? ` : ${c.opt_out_reason}` : ""}</Badge>}
        </span>}
        actions={<>
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white">WhatsApp</a>}
          {me.can("sales") && <LinkButton href={`/ventes/devis/nouveau?client=${c.id}`}>Nouveau devis</LinkButton>}
          {me.can("orders_edit") && <LinkButton href={`/commandes/nouvelle?client=${c.id}`} variant="secondary">Commande directe</LinkButton>}
        </>}
      />

      {card && (
        <Card title="Carte Caractère Privilège">
          <div className="flex flex-wrap items-center gap-4">
            <div className="rounded-xl bg-gradient-to-br from-brand-700 to-brand-900 px-4 py-3 text-white">
              <div className="text-xs uppercase tracking-widest opacity-70">Caractère Privilège</div>
              <div className="font-mono text-lg">{card.number}</div>
              <div className="text-xs opacity-80">Depuis le {fdate(card.issued_at)}</div>
            </div>
            <div className="text-sm">
              <ul className="space-y-1">{loyalty.filter((l: any) => l.benefit_id).map((l: any) => (
                <li key={l.benefit_id}><Badge tone={l.benefit_status === "disponible" ? "green" : "gray"}>{l.benefit_status === "disponible" ? "T-shirt caractérisé à offrir" : "Utilisé"}</Badge> <span className="text-slate-500">émis par {l.source_ref}{l.used_ref ? ` · utilisé sur ${l.used_ref}` : ""}</span></li>))}</ul>
              <Link href={`/carte/${card.token}`} target="_blank" className="mt-2 inline-block text-brand-700 underline">Lien individuel de la carte</Link>
              {wa && <a className="ml-3 text-emerald-700 underline" target="_blank" rel="noreferrer" href={waLink(c.phone, `Bonjour ${c.name.split(" ")[0]}, voici votre carte Caractère Privilège : au prochain achat, vous aurez un T-shirt caractérisé gratuit !`)!}>Envoyer par WhatsApp</a>}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Commandes (${orders.length})`}>
          {orders.length ? <div className="grid gap-2">{orders.map((o: any) => <OrderCard key={o.id} o={o} showMoney={me.can("money_view")} />)}</div> : <Empty>Aucune commande.</Empty>}
        </Card>
        <Card title="Relances" actions={null}>
          {followups.filter((f: any) => f.status === "a_faire").map((f: any) => <FollowupItem key={f.id} f={f} templates={tpl?.value || {}} me={me.fullName} />)}
          <ul className="mt-2 space-y-1 text-xs text-slate-500">{followups.filter((f: any) => f.status !== "a_faire").map((f: any) => (
            <li key={f.id}>{fdate(f.done_at || f.due_date)} · {FOLLOWUP_REASON[f.reason]} · {f.done_by_name || f.owner_name} : {f.result || f.status}</li>))}</ul>
          {edit && (
            <details className="mt-3"><summary className="cursor-pointer text-sm text-brand-700">Planifier une relance</summary>
              <ActionForm action={createFollowup} className="mt-2 grid gap-2 sm:grid-cols-2" resetOnSuccess>
                <input type="hidden" name="client_id" value={c.id} />
                <Field label="Motif"><select name="reason" className={inputCls}>{Object.entries(FOLLOWUP_REASON).filter(([k]) => !(k === "reactivation" && c.marketing_opt_out)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Date"><input type="date" name="due_date" className={inputCls} /></Field>
                <Field label="Responsable"><select name="owner_id" className={inputCls} defaultValue={c.owner_id || ""}>{staff.map((s: any) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></Field>
                <Field label="Note"><input name="note" className={inputCls} /></Field>
                <SubmitButton>Planifier</SubmitButton>
              </ActionForm>
            </details>
          )}
        </Card>
      </div>

      {me.can("sales") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Affaires et devis">
            <ul className="divide-y divide-slate-100 text-sm">
              {deals.map((d: any) => <li key={d.id} className="py-1.5"><Badge tone="violet">{DEAL_STAGES.find(([k]) => k === d.stage)?.[1]}</Badge> {d.title} {d.next_action && <span className="text-slate-500">→ {d.next_action}</span>}</li>)}
              {quotes.map((x: any) => <li key={x.id} className="flex justify-between py-1.5"><Link href={`/ventes/devis/${x.id}`} className="font-mono hover:underline">Devis {x.ref}</Link><span>{x.status} · {dzd(x.totals?.ttc)}</span></li>)}
            </ul>
            {!deals.length && !quotes.length && <Empty>Aucune affaire.</Empty>}
            <details className="mt-3"><summary className="cursor-pointer text-sm text-brand-700">Nouvelle affaire</summary>
              <ActionForm action={createDeal} className="mt-2 grid gap-2 sm:grid-cols-2" resetOnSuccess>
                <input type="hidden" name="client_id" value={c.id} />
                <Field label="Titre"><input name="title" required placeholder="Ex. 50 T-shirts association" className={inputCls} /></Field>
                <Field label="Prochaine action"><input name="next_action" placeholder="Qualifier le besoin" className={inputCls} /></Field>
                <Field label="Pour le"><input type="date" name="next_action_date" className={inputCls} /></Field>
                <Field label="Montant estimé (DA)"><input name="estimate" inputMode="numeric" className={inputCls} /></Field>
                <SubmitButton>Créer</SubmitButton>
              </ActionForm>
            </details>
          </Card>
          <Card title={`Simulations du logo (${sims.length})`}>
            <ul className="space-y-1 text-sm">{sims.map((s: any) => (
              <li key={s.id}>{fdate(s.created_at)} · {s.garment || "—"} {s.placement ? `(${s.placement})` : ""}
                {s.logo_file_id && <> · <a className="text-brand-700 underline" href={`/api/files/${s.logo_file_id}`} target="_blank">logo {fileName(s.logo_file_id)}</a></>}
                {s.mockup_file_id && <> · <a className="text-brand-700 underline" href={`/api/files/${s.mockup_file_id}`} target="_blank">simulation</a></>}</li>))}</ul>
            <details className="mt-3" open={!sims.length}><summary className="cursor-pointer text-sm text-brand-700">Ajouter une simulation</summary>
              <ActionForm action={addSimulation} className="mt-2 grid gap-2 sm:grid-cols-2" resetOnSuccess>
                <input type="hidden" name="client_id" value={c.id} />
                <Field label="Affaire"><select name="deal_id" className={inputCls}><option value="">—</option>{deals.filter((d: any) => !["gagne", "perdu"].includes(d.stage)).map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
                <Field label="Vêtement"><input name="garment" placeholder="Polo noir" className={inputCls} /></Field>
                <Field label="Placement"><select name="placement" className={inputCls}>{PLACEMENTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Logo du client"><input type="file" name="logo" accept="image/*,application/pdf" className="text-sm" /></Field>
                <Field label="Visuel de simulation"><input type="file" name="mockup" accept="image/*,application/pdf" className="text-sm" /></Field>
                <Field label="Notes"><input name="notes" className={inputCls} /></Field>
                <SubmitButton>Enregistrer et marquer envoyée</SubmitButton>
              </ActionForm>
            </details>
          </Card>
        </div>
      )}

      <Card title="Historique des échanges">
        {edit && (
          <ActionForm action={logInteraction} className="mb-3 grid gap-2 sm:grid-cols-[auto_1fr_auto]" resetOnSuccess>
            <input type="hidden" name="client_id" value={c.id} />
            <select name="kind" className={inputCls}><option value="whatsapp">WhatsApp</option><option value="appel">Appel</option><option value="visite">Visite</option><option value="note">Note</option><option value="sms">SMS</option><option value="email">E-mail</option></select>
            <input name="summary" required placeholder="Résumé de l'échange" className={inputCls} />
            <SubmitButton>Ajouter</SubmitButton>
          </ActionForm>
        )}
        <ul className="space-y-1.5 text-sm">{interactions.map((i: any) => (
          <li key={i.id} className="flex gap-2"><span className="w-28 shrink-0 text-xs text-slate-400">{fdate(i.at, true)}</span><Badge>{i.kind}</Badge><span>{i.summary}</span><span className="ml-auto shrink-0 text-xs text-slate-400">{i.staff_name}</span></li>))}</ul>
        {!interactions.length && <Empty>Aucun échange.</Empty>}
      </Card>

      {edit && (
        <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Modifier la fiche</summary>
          <div className="mt-3"><ClientForm action={updateClient} staff={staff} client={c} submitLabel="Enregistrer" /></div>
        </details>
      )}
    </div>
  );
}

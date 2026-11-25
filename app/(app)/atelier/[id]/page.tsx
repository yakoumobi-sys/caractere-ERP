import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { q, one } from "@/lib/erp";
import { Badge, Card, Field, PageHeader, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { TaskActions } from "@/components/cards";
import { assignTask, reportDefect, setPriority } from "@/app/actions/workshop";
import { fdate, PLACEMENTS, SERVICES, sizesText, STATION_LABEL, STEP_LABEL, TASK_STATUS } from "@/lib/format";
import { workerMe } from "@/lib/queries";
import { PhotoGallery } from "@/components/order-photos";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: { id: string } }) {
  const me = await requireMe("workshop_view");
  const t = await one(me, "select * from erp.v_tasks where id = $1", [params.id]);
  if (!t) notFound();
  const [siblings, log, defects, staff, machines, bat] = await Promise.all([
    q(me, "select id, step, status, seq from erp.v_tasks where line_id = $1 order by seq", [t.line_id]),
    q(me, "select * from erp.v_task_log where task_id = $1 order by at desc", [t.id]),
    q(me, "select * from erp.v_defects where line_id = $1 order by at desc", [t.line_id]),
    q(me, "select id, full_name from erp.v_staff where active order by full_name"),
    q(me, "select * from erp.v_machines where active order by kind, name"),
    t.bat_file_id ? one(me, "select * from erp.v_files where id = $1", [t.bat_file_id]) : null,
  ]);
  const photos = await q(me, "select id, filename from erp.v_files where order_id = $1 and kind = 'photo' order by created_at", [t.order_id]);
  const placement = PLACEMENTS.find(([k]) => k === t.placement)?.[1] || t.placement;
  return (
    <div className="space-y-4">
      <PageHeader title={`${STEP_LABEL[t.step]} — ${t.order_ref}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={t.status === "bloquee" ? "red" : t.status === "terminee" ? "green" : "blue"}>{TASK_STATUS[t.status]}</Badge><span>{t.client_name}</span><span>· promis le {fdate(t.promised_date)}</span>{t.is_late && <Badge tone="red">En retard</Badge>}<Link href={`/commandes/${t.order_id}`} className="underline">commande</Link></span>} />
      {photos.length > 0 && <Card title="Photos de la commande"><PhotoGallery orderId={t.order_id} photos={photos} canEdit={false} /></Card>}
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <Card title="Fiche atelier">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
              {bat && (bat.mime || "").startsWith("image/") ? <img src={`/api/files/${bat.id}`} alt="BAT validé" className="max-h-64 rounded" /> : bat ? <a className="text-brand-700 underline" href={`/api/files/${bat.id}`} target="_blank">Ouvrir le BAT ({bat.filename})</a> : <span className="text-sm text-slate-400">Pas de BAT {t.services?.length ? "(à fournir)" : "(article vierge)"}</span>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-slate-500">BAT</dt><dd><Badge tone={t.bat_status === "valide" ? "green" : "amber"}>{t.bat_status}</Badge></dd>
              <dt className="text-slate-500">Article</dt><dd>{t.line_label}</dd>
              <dt className="text-slate-500">Couleur</dt><dd>{t.color || "—"}</dd>
              <dt className="text-slate-500">Tailles</dt><dd className="font-medium">{sizesText(t.sizes)} ({t.qty_target} pcs)</dd>
              <dt className="text-slate-500">Prestations</dt><dd>{(t.services || []).map((s: string) => SERVICES[s]).join(" + ") || "Vierge"}</dd>
              <dt className="text-slate-500">Placement</dt><dd>{placement || "—"}</dd>
              <dt className="text-slate-500">Largeur</dt><dd>{t.print_width_cm ? `${t.print_width_cm} cm` : "—"}{t.laize_cm ? ` (laize ${t.machine_name} : ${t.laize_cm} cm)` : ""}</dd>
              <dt className="text-slate-500">Poste</dt><dd>{STATION_LABEL[t.station]}{t.machine_name ? ` · ${t.machine_name}` : ""}</dd>
              <dt className="text-slate-500">Assigné à</dt><dd>{t.assignee_name || "—"}</dd>
              <dt className="text-slate-500">Promis le</dt><dd>{fdate(t.promised_date)}</dd>
            </dl>
          </div>
          {t.is_characterized && <p className="mt-3 rounded-lg bg-brand-50 p-2 text-xs text-brand-800">T-shirt caractérisé : impression DTF de 30 cm maximum, localisée au-dessus de l'ourlet ; col et manches restent unis.</p>}
          {t.missing && Object.keys(t.missing).length > 0 && <p className="mt-3 text-sm font-medium text-red-700">Rupture : manque {sizesText(t.missing)} — mise en production bloquée.</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">{siblings.map((s: any) => <Link key={s.id} href={`/atelier/${s.id}`}><Badge tone={s.id === t.id ? "violet" : s.status === "terminee" ? "green" : "gray"}>{s.seq}. {STEP_LABEL[s.step]}</Badge></Link>)}</div>
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <div className="mb-2 text-sm font-medium text-brand-700">→ {t.next_action}</div>
            {t.status === "bloquee" && <p className="mb-2 text-sm text-red-700">{t.blocked_reason}{t.notify_name ? ` — prévenir ${t.notify_name}` : ""}</p>}
            {t.needs_first_piece && t.first_piece_status !== "na" && <p className="mb-2 text-xs text-slate-500">Première pièce : {t.first_piece_status}{t.first_piece_by_name ? ` par ${t.first_piece_by_name} le ${fdate(t.first_piece_at, true)}` : ""}</p>}
            {t.step === "controle" && <p className="mb-2 text-xs text-slate-500">Contrôle croisé : la personne qui a floqué ne peut pas valider ce contrôle.</p>}
            <TaskActions t={t} me={workerMe(me)} staff={staff} />
          </div>
        </Card>
        <div className="space-y-4">
          {me.can("workshop_work") && ["a_faire", "en_cours", "bloquee"].includes(t.status) && (
            <Card title="Pièce ratée">
              <ActionForm action={reportDefect} className="grid gap-2 sm:grid-cols-2" resetOnSuccess>
                <input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="order_id" value={t.order_id} />
                <Field label="Taille"><select name="size" className={inputCls}>{Object.keys(t.sizes || {}).map((s) => <option key={s}>{s}</option>)}</select></Field>
                <Field label="Quantité"><input name="qty" inputMode="numeric" defaultValue={1} className={inputCls} /></Field>
                <Field label="Défaut" className="sm:col-span-2"><input name="defect" required placeholder="Ex. transfert décollé, logo décalé" className={inputCls} /></Field>
                <Field label="Suite"><select name="outcome" className={inputCls}><option value="reprise">Reprise (pièce récupérable)</option><option value="perte">Perte (remplacer la pièce)</option></select></Field>
                <div className="flex items-end"><SubmitButton variant="danger">Consigner</SubmitButton></div>
              </ActionForm>
            </Card>
          )}
          {(me.can("workshop_work") || me.can("priority")) && t.status !== "terminee" && (
            <Card title="Affectation et priorité">
              <ActionForm action={assignTask} className="grid gap-2">
                <input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="order_id" value={t.order_id} />
                <select name="assignee_id" defaultValue={t.assignee_id || ""} className={inputCls}><option value="">Non affectée</option>{staff.map((s: any) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
                <select name="machine_id" defaultValue={t.machine_id || ""} className={inputCls}><option value="">Sans machine</option>{machines.map((m: any) => <option key={m.id} value={m.id}>{m.name} ({m.kind}{m.laize_cm ? ` · ${m.laize_cm} cm` : ""})</option>)}</select>
                <SubmitButton variant="secondary">Affecter</SubmitButton>
              </ActionForm>
              {me.can("priority") && (
                <ActionForm action={setPriority} className="mt-3 grid gap-2 sm:grid-cols-[5rem_1fr_auto]">
                  <input type="hidden" name="task_id" value={t.id} />
                  <input name="priority" inputMode="numeric" defaultValue={t.priority} className={inputCls} aria-label="Priorité" />
                  <input name="note" required placeholder="Raison de la priorité" defaultValue={t.priority_note || ""} className={inputCls} />
                  <SubmitButton variant="secondary">Prioriser</SubmitButton>
                </ActionForm>
              )}
            </Card>
          )}
          <Card title="Traçabilité">
            <ul className="space-y-1 text-xs">{log.map((l: any) => <li key={l.id}><span className="text-slate-400">{fdate(l.at, true)}</span> · {l.staff_name} · {l.action.replace(/_/g, " ")}{l.note ? ` — ${l.note}` : ""}</li>)}</ul>
            {defects.length > 0 && <><div className="mt-3 text-xs font-semibold">Défauts de la ligne</div><ul className="space-y-1 text-xs">{defects.map((d: any) => <li key={d.id}>{fdate(d.at, true)} · {d.qty}× {d.size} · {d.defect} · <Badge tone={d.outcome === "perte" ? "red" : "amber"}>{d.outcome}</Badge> · {d.staff_name}</li>)}</ul></>}
          </Card>
        </div>
      </div>
    </div>
  );
}

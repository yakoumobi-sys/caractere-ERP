import Link from "next/link";
import { Badge, NextAction, inputCls } from "./ui";
import { ActionForm, SubmitButton } from "./forms";
import { dzd, fdate, ORDER_STATUS, ORDER_TONE, STEP_LABEL, STATION_LABEL, sizesText, TASK_STATUS } from "@/lib/format";
import { taskAction, orderWorkAction } from "@/app/actions/workshop";
import type { OrderExtra } from "@/lib/order-extras";

export function Thumbs({ ids, size = "h-20 w-20" }: { ids?: string[]; size?: string }) {
  if (!ids?.length) return <div className={`${size} grid shrink-0 place-items-center rounded-xl bg-slate-100 text-2xl text-slate-300`} aria-hidden>👕</div>;
  return (
    <div className="flex shrink-0 gap-1.5">
      {ids.slice(0, 2).map((id, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={id} src={`/api/files/${id}`} alt="" loading="lazy" className={`${size} ${i ? "hidden sm:block" : ""} rounded-xl border border-slate-100 bg-slate-50 object-cover`} />
      ))}
    </div>
  );
}

export function ArticlesList({ lines, className = "" }: { lines?: OrderExtra["lines"]; className?: string }) {
  if (!lines?.length) return null;
  return (
    <ul className={`space-y-0.5 text-sm text-slate-700 ${className}`}>
      {lines.slice(0, 4).map((l, i) => (
        <li key={i} className="truncate"><span className="font-medium">{l.label}</span>{l.color ? ` · ${l.color}` : ""}{Object.keys(l.sizes || {}).length ? <span className="text-slate-500"> · {sizesText(l.sizes)}</span> : null}</li>
      ))}
      {lines.length > 4 && <li className="text-xs text-slate-400">+ {lines.length - 4} autre(s) article(s)</li>}
    </ul>
  );
}

/** Gros boutons « Commencer la commande » / « Terminer la commande ». */
export function OrderWorkButtons({ o, canWork, big }: { o: any; canWork: boolean; big?: boolean }) {
  if (!canWork || !["confirmee", "en_production"].includes(o.status)) return null;
  const cls = big ? "w-full py-4 text-base sm:w-auto sm:px-8" : "";
  return (
    <div className="flex flex-wrap gap-2">
      {o.status === "confirmee" && (
        <ActionForm action={orderWorkAction}>
          <input type="hidden" name="order_id" value={o.id} /><input type="hidden" name="do" value="start" />
          <SubmitButton className={cls}>▶ Commencer la commande</SubmitButton>
        </ActionForm>
      )}
      <ActionForm action={orderWorkAction}>
        <input type="hidden" name="order_id" value={o.id} /><input type="hidden" name="do" value="finish" />
        <SubmitButton variant={o.status === "confirmee" ? "secondary" : "primary"} className={cls + (o.status === "en_production" ? " !bg-emerald-600 hover:!bg-emerald-700" : "")} confirm="Toute la commande est terminée ?">✓ Terminer la commande</SubmitButton>
      </ActionForm>
    </div>
  );
}

export function OrderCard({ o, showMoney, extra }: { o: any; showMoney?: boolean; extra?: OrderExtra }) {
  return (
    <Link href={`/commandes/${o.id}`} className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_1px_3px_rgba(30,20,80,0.06)] transition hover:border-brand-200 hover:shadow-md">
      <Thumbs ids={extra?.photos} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-base font-semibold text-slate-900">{o.client_name}</span>
          <Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS[o.status]}</Badge>
          {o.is_late && <Badge tone="red">En retard</Badge>}
          {o.is_blocked && <Badge tone="red">Bloquée</Badge>}
          {o.kind === "comptoir" && <Badge>Comptoir</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
          <span className="font-mono">{o.ref}</span><span>· {o.qty_total} pièce(s)</span><span>· promis le {fdate(o.promised_date)}</span>
          {showMoney && o.total_ttc !== null && <span>· {dzd(o.total_ttc)}{o.balance > 0 ? ` (reste ${dzd(o.balance)})` : ""}</span>}
        </div>
        <ArticlesList lines={extra?.lines} className="mt-1.5" />
        {(o.blocked_reason || o.task_block_reasons || o.cancel_reason) && <div className="mt-1 text-xs text-red-700">Motif : {o.blocked_reason || o.task_block_reasons || o.cancel_reason}</div>}
        <div className="mt-2"><NextAction>{o.next_action}</NextAction></div>
      </div>
    </Link>
  );
}

function TaskButton({ t, act, label, variant = "primary", extra }: { t: any; act: string; label: string; variant?: "primary" | "secondary" | "danger"; extra?: React.ReactNode }) {
  return (
    <ActionForm action={taskAction} className="inline-block">
      <input type="hidden" name="task_id" value={t.id} />
      <input type="hidden" name="order_id" value={t.order_id} />
      <input type="hidden" name="do" value={act} />
      {extra}
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </ActionForm>
  );
}

export function TaskActions({ t, me, staff }: { t: any; me: { staffId: string; canValidateFirstPiece: boolean; isManager: boolean; canWork: boolean }; staff?: any[] }) {
  if (!me.canWork) return null;
  const canFp = me.canValidateFirstPiece || me.isManager;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {t.status === "a_faire" && t.is_ready && <TaskButton t={t} act="start" label={t.needs_first_piece ? "Démarrer (1re pièce)" : "Démarrer"} />}
      {t.status === "en_cours" && t.needs_first_piece && t.first_piece_status === "a_valider" && (canFp ? (
        <>
          <TaskButton t={t} act="fp_ok" label="Valider la 1re pièce" />
          <details className="inline-block">
            <summary className="cursor-pointer list-none rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">Refuser</summary>
            <ActionForm action={taskAction} className="mt-2 flex gap-2">
              <input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="do" value="fp_ko" />
              <input name="note" required placeholder="Défaut constaté" className={inputCls} />
              <SubmitButton variant="danger">OK</SubmitButton>
            </ActionForm>
          </details>
        </>
      ) : <span className="text-sm text-amber-700">En attente de validation par une personne habilitée</span>)}
      {t.status === "en_cours" && t.first_piece_status === "refusee" && <TaskButton t={t} act="fp_again" label="Présenter une nouvelle 1re pièce" variant="secondary" />}
      {t.status === "en_cours" && (!t.needs_first_piece || t.first_piece_status === "validee") && <TaskButton t={t} act="finish" label={t.step === "emballage" ? "Terminer l'emballage" : "Terminer"} />}
      {(t.status === "a_faire" || t.status === "en_cours") && (
        <details className="inline-block">
          <summary className="cursor-pointer list-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Bloquer</summary>
          <ActionForm action={taskAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="order_id" value={t.order_id} /><input type="hidden" name="do" value="block" />
            <input name="reason" required placeholder="Motif du blocage" className={inputCls} />
            <select name="notify" className={inputCls} defaultValue="">
              <option value="">Personne à prévenir…</option>
              {(staff || []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <SubmitButton variant="danger">Bloquer</SubmitButton>
          </ActionForm>
        </details>
      )}
      {t.status === "bloquee" && <TaskButton t={t} act="unblock" label="Débloquer" variant="secondary" />}
    </div>
  );
}

export function TaskCard({ t, me, staff, extra }: { t: any; me: Parameters<typeof TaskActions>[0]["me"]; staff?: any[]; extra?: OrderExtra }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_1px_3px_rgba(30,20,80,0.06)]">
      <Link href={`/commandes/${t.order_id}`}><Thumbs ids={extra?.photos} /></Link>
      <div className="min-w-0 flex-1">
      <Link href={`/commandes/${t.order_id}`} className="block truncate text-base font-semibold text-slate-900 hover:underline">{t.client_name}</Link>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/atelier/${t.id}`} className="font-mono text-sm font-semibold text-slate-900 hover:underline">{t.order_ref}</Link>
        <Badge tone="violet">{STEP_LABEL[t.step]}</Badge>
        <Badge tone={t.status === "bloquee" ? "red" : t.status === "en_cours" ? "blue" : t.status === "terminee" ? "green" : "gray"}>{TASK_STATUS[t.status]}</Badge>
        {t.is_late && <Badge tone="red">En retard</Badge>}
        {t.priority > 0 && <Badge tone="amber">Priorité {t.priority}</Badge>}
        {t.is_characterized && <Badge tone="violet">T-shirt caractérisé</Badge>}
        <span className="ml-auto text-xs text-slate-500">Promis le {fdate(t.promised_date)}</span>
      </div>
      <div className="mt-1 text-sm text-slate-700">
        {t.client_name} — {t.line_label} {t.color} · {sizesText(t.sizes)} <span className="text-slate-400">({t.qty_target} pcs)</span>
      </div>
      <div className="mt-0.5 text-xs text-slate-500">
        {STATION_LABEL[t.station]}{t.machine_name ? ` · ${t.machine_name}` : ""}{t.assignee_name ? ` · ${t.assignee_name}` : " · non affectée"}
        {t.placement ? ` · ${t.placement}` : ""}{t.print_width_cm ? ` · ${t.print_width_cm} cm` : ""}
      </div>
      {t.status === "bloquee" && <div className="mt-1 text-sm text-red-700">Bloquée : {t.blocked_reason}{t.notify_name ? ` — prévenir ${t.notify_name}` : ""}</div>}
      {t.missing && Object.keys(t.missing).length > 0 && ["impression_dtf", "flocage", "broderie", "preparation"].includes(t.step) && <div className="mt-1 text-sm text-red-700">Rupture : manque {sizesText(t.missing)}</div>}
      {t.rework_pending > 0 && <div className="mt-1 text-xs text-amber-700">{t.rework_pending} pièce(s) à reprendre</div>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {t.status === "a_faire" && !t.is_ready ? <span className="text-sm text-slate-500">En attente de l'étape précédente</span> : <NextAction>{t.next_action}</NextAction>}
      </div>
      <div className="mt-2"><TaskActions t={t} me={me} staff={staff} /></div>
      </div>
    </div>
  );
}

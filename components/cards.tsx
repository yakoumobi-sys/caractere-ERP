import Link from "next/link";
import { Badge, NextAction, inputCls } from "./ui";
import { ActionForm, SubmitButton } from "./forms";
import { dzd, fdate, ORDER_STATUS, ORDER_TONE, STEP_LABEL, STATION_LABEL, sizesText, TASK_STATUS } from "@/lib/format";
import { taskAction } from "@/app/actions/workshop";

export function OrderCard({ o, showMoney }: { o: any; showMoney?: boolean }) {
  return (
    <Link href={`/commandes/${o.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-300">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-slate-900">{o.ref}</span>
        <Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS[o.status]}</Badge>
        {o.is_late && <Badge tone="red">En retard</Badge>}
        {o.is_blocked && <Badge tone="red">Bloquée</Badge>}
        {o.kind === "comptoir" && <Badge>Comptoir</Badge>}
        <span className="ml-auto text-xs text-slate-500">Promis le {fdate(o.promised_date)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{o.client_name} · {o.qty_total} pièce(s){o.owner_name ? ` · ${o.owner_name}` : ""}</span>
        {showMoney && o.total_ttc !== null && <span className="text-xs">{dzd(o.total_ttc)}{o.balance > 0 ? ` · reste ${dzd(o.balance)}` : ""}</span>}
      </div>
      {(o.blocked_reason || o.task_block_reasons || o.cancel_reason) && <div className="mt-1 text-xs text-red-700">Motif : {o.blocked_reason || o.task_block_reasons || o.cancel_reason}</div>}
      <div className="mt-2"><NextAction>{o.next_action}</NextAction></div>
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

export function TaskCard({ t, me, staff }: { t: any; me: Parameters<typeof TaskActions>[0]["me"]; staff?: any[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
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
  );
}

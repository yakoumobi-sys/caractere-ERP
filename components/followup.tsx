import Link from "next/link";
import { Badge, inputCls } from "./ui";
import { ActionForm, SubmitButton } from "./forms";
import { completeFollowup } from "@/app/actions/clients";
import { FOLLOWUP_REASON, fdate } from "@/lib/format";
import { fillTemplate, waLink } from "@/lib/whatsapp";

export function FollowupItem({ f, templates, me }: { f: any; templates: Record<string, string>; me: string }) {
  const text = fillTemplate(templates[f.reason] || templates.autre || "Bonjour {prenom}", {
    prenom: (f.client_name || "").split(" ")[0], commercial: me.split(" ")[0], ref: f.order_ref || f.quote_ref || "", solde: "",
  });
  const wa = waLink(f.client_phone, text);
  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/clients/${f.client_id}`} className="font-medium text-slate-900 hover:underline">{f.client_name}</Link>
        <Badge tone={f.reason === "incident_livraison" || f.reason === "retour_colis" ? "red" : f.is_marketing ? "blue" : "violet"}>{FOLLOWUP_REASON[f.reason]}</Badge>
        {(f.order_ref || f.quote_ref) && <span className="font-mono text-xs text-slate-500">{f.order_ref || f.quote_ref}</span>}
        <span className="ml-auto text-xs text-slate-400">{fdate(f.due_date)} · {f.owner_name}</span>
      </div>
      {f.note && <div className="mt-0.5 text-xs text-slate-500">{f.note}</div>}
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {wa && f.contact_pref !== "appel" && <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">WhatsApp prérempli</a>}
        {f.client_phone && <a href={`tel:${f.client_phone}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Appeler</a>}
        <details className="flex-1">
          <summary className="cursor-pointer list-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 sm:inline-block">Noter le résultat</summary>
          <ActionForm action={completeFollowup} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <input type="hidden" name="id" value={f.id} />
            <input name="result" required placeholder="Résultat (ex. intéressé, rappeler, refus…)" className={inputCls} />
            <select name="channel" className={inputCls} defaultValue={f.contact_pref === "appel" ? "appel" : "whatsapp"}><option value="whatsapp">WhatsApp</option><option value="appel">Appel</option><option value="sms">SMS</option><option value="visite">Visite</option></select>
            <input type="date" name="next_date" className={inputCls} title="Reprogrammer (optionnel)" />
            <SubmitButton>Clôturer</SubmitButton>
          </ActionForm>
        </details>
      </div>
    </div>
  );
}

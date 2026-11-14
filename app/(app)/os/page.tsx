import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { businessDate } from "@/lib/finance";
import { formatMoney } from "@/lib/utils";
import { PageHeader, Card } from "@/components/ui";
import {
  createOsPriority, setOsPriorityStatus,
  createOsCampaign, setOsCampaignMetrics,
  createOsCandidate, setOsCandidateStage,
} from "@/app/actions/os-actions";

export const dynamic = "force-dynamic";

const systems = [
  { id: "sales", label: "01 · SALES", title: "Ventes", subtitle: "Des demandes aux acomptes", href: "/crm/opportunities", icon: "◎", color: "bg-blue-500", sop: ["Qualifier tout nouveau prospect", "Envoyer la simulation et le devis", "Relancer les devis non décidés"] },
  { id: "marketing", label: "02 · MARKETING", title: "Acquisition", subtitle: "Du contenu aux clients", href: "/crm/contacts", icon: "◉", color: "bg-violet-500", sop: ["Publier les démonstrations caractérisées", "Mesurer les leads qualifiés par campagne", "Couper les dépenses sans conversion"] },
  { id: "delivery", label: "03 · DELIVERY", title: "Atelier", subtitle: "Qualité et délais", href: "/operations", icon: "▣", color: "bg-amber-500", sop: ["Valider stock, BAT et première pièce", "Traiter les commandes bloquées", "Contrôler qualité et emballage avant départ"] },
  { id: "finance", label: "04 · FINANCE", title: "Finances", subtitle: "Marge et trésorerie", href: "/cash", icon: "◈", color: "bg-emerald-500", sop: ["Vérifier acomptes et encaissements", "Suivre les impayés sans double comptage", "Contrôler la caisse et les coûts"] },
  { id: "hiring", label: "05 · HIRING", title: "Équipe", subtitle: "Recrutement et autonomie", href: "/hr/employees", icon: "♧", color: "bg-rose-500", sop: ["Identifier le besoin précis du poste", "Faire un test pratique avant embauche", "Former avec une checklist mesurable"] },
] as const;

const statusLabels: Record<string, string> = {
  a_faire: "À faire", en_cours: "En cours", bloque: "Bloqué", termine: "Terminé",
};
const candidateLabels: Record<string, string> = {
  nouveau: "Nouveau", entretien: "Entretien", test: "Test", offre: "Offre",
  embauche: "Embauché", refuse: "Non retenu",
};
const channelLabels: Record<string, string> = {
  meta: "Meta Ads", instagram: "Instagram", facebook: "Facebook",
  tiktok: "TikTok", linkedin: "LinkedIn", email: "Email", autre: "Autre",
};
const inputClass = "min-w-0 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";
const buttonClass = "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors";

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

export default async function CaractereOsPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile?.is_active || profile.role !== "admin") {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Caractère OS" description="Espace de pilotage réservé à la direction." />
        <Card className="p-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">Accès réservé au compte administrateur.</p>
          <Link href="/dashboard" className="mt-3 inline-block text-sm font-semibold text-indigo-600">Retour au tableau de bord</Link>
        </Card>
      </div>
    );
  }

  const db = createClient();
  const today = businessDate();
  const monthStart = today.slice(0, 7) + "-01";

  const [
    deals, followups, orders, late, blocked, bat, invoiceMonth, invoiceUnpaid,
    employees, prioritiesResult, campaignsResult, candidatesResult,
  ] = await Promise.all([
    db.from("opportunities").select("id", { count: "exact", head: true }).not("stage", "in", "(gagne,perdu)"),
    db.from("opportunities").select("id", { count: "exact", head: true }).not("stage", "in", "(gagne,perdu)").lte("next_follow_up", today),
    db.from("pipeline_orders").select("id", { count: "exact", head: true }).neq("status", "livree"),
    db.from("pipeline_orders").select("id", { count: "exact", head: true }).neq("status", "livree").lt("due_date", today),
    db.from("pipeline_orders").select("id", { count: "exact", head: true }).neq("status", "livree").not("blocked_reason", "is", null),
    db.from("pipeline_orders").select("id", { count: "exact", head: true }).neq("status", "livree").in("bat_status", ["a_preparer", "envoye"]),
    db.from("invoices").select("id,total,status").gte("issue_date", monthStart).in("status", ["validee", "payee"]).limit(1000),
    db.from("invoices").select("id,total,amount_paid").eq("status", "validee").limit(1000),
    db.from("employees").select("id", { count: "exact", head: true }).eq("status", "actif"),
    db.from("os_priorities").select("id,system,title,owner_name,due_date,status,created_at").order("created_at", { ascending: false }).limit(150),
    db.from("os_campaigns").select("id,name,channel,status,spend_dzd,leads,quotes,orders,revenue_dzd").order("created_at", { ascending: false }).limit(80),
    db.from("os_candidates").select("id,full_name,position,stage,next_action").order("created_at", { ascending: false }).limit(80),
  ]);

  const osReady = !prioritiesResult.error && !campaignsResult.error && !candidatesResult.error;
  const priorities = (prioritiesResult.data ?? []) as Array<{id:string;system:string;title:string;owner_name:string;due_date:string|null;status:string;created_at:string}>;
  const campaigns = (campaignsResult.data ?? []) as Array<{id:string;name:string;channel:string;status:string;spend_dzd:number;leads:number;quotes:number;orders:number;revenue_dzd:number}>;
  const candidates = (candidatesResult.data ?? []) as Array<{id:string;full_name:string;position:string;stage:string;next_action:string|null}>;
  const activeTasks = priorities.filter((t) => t.status !== "termine").sort((a,b) =>
    (a.due_date || "9999").localeCompare(b.due_date || "9999")
  );
  const activeCandidates = candidates.filter((c) => !["embauche", "refuse"].includes(c.stage));
  const spend = campaigns.reduce((s, c) => s + Number(c.spend_dzd || 0), 0);
  const marketingLeads = campaigns.reduce((s, c) => s + Number(c.leads || 0), 0);
  const marketingOrders = campaigns.reduce((s, c) => s + Number(c.orders || 0), 0);
  const campaignRevenue = campaigns.reduce((s, c) => s + Number(c.revenue_dzd || 0), 0);
  const sumInvoiceMonth = invoiceMonth.data?.reduce((sum, i) => sum + Number(i.total ?? 0), 0) ?? 0;
  const sumUnpaid = invoiceUnpaid.data?.reduce((sum, i) =>
    sum + Math.max(0, Number(i.total ?? 0) - Number(i.amount_paid ?? 0)), 0) ?? 0;
  // PostgREST impose une pagination : ne jamais présenter un total partiel comme exhaustif.
  const monthRevenue = invoiceMonth.error || !invoiceMonth.data || invoiceMonth.data.length === 1000 ? "—" : formatMoney(sumInvoiceMonth);
  const unpaidTotal = invoiceUnpaid.error || !invoiceUnpaid.data || invoiceUnpaid.data.length === 1000 ? "—" : formatMoney(sumUnpaid);
  const count = (result: { count: number | null; error?: unknown }) => result.error ? "—" : String(result.count ?? 0);
  const getSystem = (id: string) => systems.find((s) => s.id === id);

  const summary = [
    { main: count(deals), label: "Opportunités ouvertes", next: count(followups) + " relances dues" },
    { main: String(campaigns.filter((c) => c.status === "active").length), label: "Campagnes actives", next: marketingLeads + " leads saisis manuellement" },
    { main: count(orders), label: "Commandes ouvertes", next: count(late) + " en retard · " + count(blocked) + " bloquées" },
    { main: monthRevenue, label: "CA facturé ce mois", next: unpaidTotal + " impayés (factures validées)" },
    { main: count(employees), label: "Employés actifs", next: activeCandidates.length + " candidatures en cours" },
  ];

  return (
    <div className="space-y-7 pb-12">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-5 py-6 text-white sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-indigo-300">LE SYSTÈME D&apos;EXPLOITATION DE CARACTÈRE</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">CARACTÈRE <span className="text-indigo-300">OS 5/5</span></h1>
            <p className="mt-2 text-sm text-slate-300">Diriger par des résultats, pas par des messages. Date métier : {today}</p>
          </div>
          <Link href="/dashboard" className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">ERP classique ↗</Link>
        </div>
        <div className="mt-6 grid grid-cols-5 gap-1.5 sm:gap-2">
          {systems.map((s) => (
            <a key={s.id} href={"#" + s.id} className="rounded-lg border border-white/15 bg-white/10 px-1 py-2 text-center text-[9px] font-semibold text-white hover:bg-white/20 sm:text-xs">
              {s.label.split(" · ")[1]}
            </a>
          ))}
        </div>
      </div>

      {searchParams?.ok && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Modification enregistrée.</p>}
      {searchParams?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">Impossible d&apos;enregistrer. Vérifie les champs et la migration 0043 de l&apos;ERP.</p>}

      {!osReady && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <strong>Module à activer :</strong> les nouveaux tableaux de suivi ne sont pas encore disponibles sur cette base. Faire appliquer et vérifier la migration <code>0043_caractere_os.sql</code> sur l&apos;environnement de recette avant toute mise en production. Les indicateurs historiques ci-dessous restent consultables.
        </div>
      )}

      <section aria-label="Les cinq systèmes" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {systems.map((s, i) => (
          <Card key={s.id} className="overflow-hidden p-0">
            <div className={"h-1.5 " + s.color} />
            <div className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{s.label}</p>
                <span className="text-xl text-slate-400">{s.icon}</span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{s.title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.subtitle}</p>
              <p className="mt-5 text-2xl font-extrabold text-slate-900 dark:text-white">{summary[i].main}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{summary[i].label}</p>
              <div className="my-3 border-t border-slate-100 dark:border-slate-800" />
              <p className="min-h-[32px] text-xs font-medium text-amber-700 dark:text-amber-300">{summary[i].next}</p>
              <Link href={s.href} className="mt-3 inline-flex text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400">Ouvrir le module ↗</Link>
            </div>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Alertes atelier" value={count(late) + " retards"} hint={count(blocked) + " blocages · " + count(bat) + " BAT à traiter"} />
        <Metric label="Tâches de direction" value={String(activeTasks.length)} hint={activeTasks.filter((t) => t.status === "bloque").length + " blocages déclarés"} />
        <Metric label="Coût par commande campagne" value={marketingOrders > 0 ? formatMoney(spend / marketingOrders) : "—"} hint="Budget et ventes saisis manuellement, pas un CAC global" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Les priorités de la direction</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Une action, un responsable, une date et un statut.</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">{activeTasks.length} ouvertes</span>
          </div>
          {osReady && (
            <form action={createOsPriority} className="grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70 sm:grid-cols-2">
              <select name="system" required className={inputClass}>
                {systems.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <input name="owner_name" aria-label="Responsable" placeholder="Responsable (nom)" maxLength={100} className={inputClass} />
              <input name="title" aria-label="Priorité" placeholder="Action concrète à accomplir" minLength={3} maxLength={160} required className={inputClass + " sm:col-span-2"} />
              <input name="due_date" aria-label="Échéance" type="date" className={inputClass} />
              <button type="submit" className={buttonClass}>+ Ajouter la priorité</button>
            </form>
          )}
          <div className="mt-4 space-y-2">
            {activeTasks.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Aucune priorité enregistrée.</p>}
            {activeTasks.slice(0, 30).map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{getSystem(t.system)?.title ?? t.system}</span>
                  {t.status === "bloque" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Bloqué</span>}
                  {t.due_date && t.due_date < today && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Échéance dépassée</span>}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{t.title}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">{t.owner_name || "Responsable à désigner"} {t.due_date ? "· " + t.due_date : ""}</span>
                  <form action={setOsPriorityStatus} className="flex items-center gap-2">
                    <input name="id" type="hidden" value={t.id} />
                    <select name="status" defaultValue={t.status} aria-label="Statut priorité" className={inputClass + " !w-auto !py-1.5"}>
                      {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    <button type="submit" className="text-xs font-bold text-indigo-600 dark:text-indigo-400">OK</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Rituels des cinq systèmes</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Des standards à transformer en tâches et à vérifier chaque jour.</p>
          <div className="space-y-3">
            {systems.map((s) => (
              <details id={s.id} key={s.id} open={s.id === "delivery"} className="group rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <summary className="cursor-pointer text-sm font-bold text-slate-900 dark:text-white">{s.label} · {s.title}</summary>
                <ol className="ml-5 mt-3 list-decimal space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  {s.sop.map((item) => <li key={item}>{item}</li>)}
                </ol>
                <Link href={s.href} className="mt-3 inline-block text-xs font-semibold text-indigo-600 dark:text-indigo-400">Voir les opérations ↗</Link>
              </details>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Ces routines sont des instructions de travail, pas des actions automatiquement exécutées.</p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Marketing · Rentabilité des campagnes</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Saisie manuelle des coûts, leads et commandes. Aucun envoi publicitaire automatique.</p>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Metric label="Dépenses enregistrées" value={formatMoney(spend)} hint={campaigns.length + " campagnes"} />
            <Metric label="CA attribué manuellement" value={formatMoney(campaignRevenue)} hint={marketingOrders + " commandes attribuées"} />
          </div>
          {osReady && (
            <form action={createOsCampaign} className="flex flex-wrap gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
              <input name="name" aria-label="Nom de campagne" placeholder="Nom de la campagne" minLength={3} maxLength={160} required className={inputClass + " flex-[2]"} />
              <select name="channel" aria-label="Canal" className={inputClass + " flex-1"}>
                {Object.entries(channelLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <button type="submit" className={buttonClass}>+ Campagne</button>
            </form>
          )}
          <div className="mt-4 space-y-3">
            {campaigns.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Aucune campagne enregistrée.</p>}
            {campaigns.map((c) => (
              <form action={setOsCampaignMetrics} key={c.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <input name="id" type="hidden" value={c.id} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{c.name} <span className="font-normal text-slate-500">· {channelLabels[c.channel] ?? c.channel}</span></p>
                  <select name="status" defaultValue={c.status} aria-label="Statut campagne" className={inputClass + " !w-auto !py-1.5"}>
                    <option value="active">Active</option><option value="pause">Pause</option><option value="terminee">Terminée</option>
                  </select>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {([
                    ["spend_dzd", "Dépense DA", c.spend_dzd],
                    ["leads", "Leads", c.leads],
                    ["quotes", "Devis", c.quotes],
                    ["orders", "Commandes", c.orders],
                    ["revenue_dzd", "CA attribué DA", c.revenue_dzd],
                  ] as const).map(([name,label,value]) => (
                    <label key={name} className="text-[11px] text-slate-500">
                      {label}
                      <input name={name} type="number" step={name === "spend_dzd" || name === "revenue_dzd" ? "0.01" : "1"} min="0" defaultValue={value} required className={inputClass + " mt-1 !px-2"} />
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">Coût/commande : {c.orders > 0 ? formatMoney(Number(c.spend_dzd)/c.orders) : "—"}</span>
                  <button type="submit" className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Enregistrer les résultats ↗</button>
                </div>
              </form>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Hiring · Pipeline de recrutement</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Candidat → entretien → test → offre → embauche.</p>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Metric label="Candidatures en cours" value={String(activeCandidates.length)} hint="À traiter" />
            <Metric label="Embauches enregistrées" value={String(candidates.filter((c) => c.stage === "embauche").length)} hint="Dans ce module" />
          </div>
          {osReady && (
            <form action={createOsCandidate} className="grid gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70 sm:grid-cols-2">
              <input name="full_name" aria-label="Nom candidat" placeholder="Nom du candidat" minLength={3} maxLength={120} required className={inputClass} />
              <input name="position" aria-label="Poste" placeholder="Poste recherché" minLength={2} maxLength={120} required className={inputClass} />
              <input name="next_action" aria-label="Prochaine action" placeholder="Prochaine action" maxLength={300} className={inputClass + " sm:col-span-2"} />
              <button type="submit" className={buttonClass + " sm:col-span-2"}>+ Candidat</button>
            </form>
          )}
          <div className="mt-4 space-y-3">
            {candidates.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Aucune candidature enregistrée.</p>}
            {candidates.map((c) => (
              <form action={setOsCandidateStage} key={c.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <input name="id" type="hidden" value={c.id} />
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div><p className="text-sm font-bold text-slate-900 dark:text-white">{c.full_name}</p><p className="text-xs text-slate-500">{c.position}</p></div>
                  <select name="stage" aria-label="Étape candidat" defaultValue={c.stage} className={inputClass + " !w-auto !py-1.5"}>
                    {Object.entries(candidateLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input name="next_action" aria-label="Prochaine action du candidat" defaultValue={c.next_action ?? ""} maxLength={300} placeholder="Prochaine action" className={inputClass} />
                  <button type="submit" className="shrink-0 text-xs font-bold text-indigo-600 dark:text-indigo-400">OK</button>
                </div>
              </form>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Confidentialité : les candidats ne sont visibles que par l&apos;administrateur dans ce module. Aucun message envoyé.</p>
        </Card>
      </section>

      <div className="rounded-xl border border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800">
        <strong>Méthodologie :</strong> le chiffre d&apos;affaires affiché est fondé sur les factures validées/payées du mois, pas sur les commandes reçues. Les impayés viennent des factures validées non soldées. Si une requête échoue ou dépasse 1 000 lignes, le montant est masqué (—) pour éviter un faux total. Les performances marketing sont saisies manuellement ; ne pas les additionner au CA comptable.
      </div>
    </div>
  );
}

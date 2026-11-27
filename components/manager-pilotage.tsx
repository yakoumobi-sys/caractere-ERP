import type { Me } from "@/lib/auth";
import { one, q } from "@/lib/erp";
import { calendarDate, daysBetween } from "@/lib/calendar";
import { dzd, fdate } from "@/lib/format";
import { saveDailyCosts, saveOrderCosts } from "@/app/actions/pilotage";
import { ActionForm, SubmitButton } from "./forms";
import { Card, Empty, Field, LinkButton, Table, Td, btn, inputCls } from "./ui";
import { Kpi } from "./dashboard";

export type PilotageDates = { du?: string; au?: string; jour?: string };
type Dashboard = {
  revenue: number; profit: number; garment: number; dtf: number; press: number; commission: number;
  other: number; meta: number; labour: number; lost_cost: number;
  missing_orders: number; missing_days: number; missing_defects: number;
  cash: number | null; cash_open: boolean | null; bank: number | null; meta_today: number | null;
  meta_history: { day: string; amount: number | null }[];
  late: number; prospects: number; converted: number; customers: number; repeat_buyers: number;
  defects: number; defect_units: number;
};
type Person = { staff_id: string; full_name: string; orders_started: number; orders_finished: number; tasks_finished: number; on_time_orders: number; promised_orders: number };
type Daily = { meta_ads?: string; employees?: number; other_costs?: string; bank_available?: string | null };
type Costs = { dtf_metres?: string | null; press_passes?: number | null; garments_override?: string | null; other_costs?: string | null };

const ratio = (n: number, d: number) => d ? new Intl.NumberFormat("fr-DZ", { style: "percent", maximumFractionDigits: 1 }).format(n / d) : "—";

export async function ManagerPilotage({ me, today, dates }: { me: Me; today: string; dates: PilotageDates }) {
  const month = today.slice(0, 7) + "-01";
  const from = calendarDate(dates.du) ?? month;
  const to = calendarDate(dates.au) ?? today;
  const chosen = calendarDate(dates.jour);
  const day = chosen && chosen <= today ? chosen : today;
  const span = daysBetween(from, to);
  const valid = span >= 0 && span <= 365 && to <= today;
  const [pilotage, staff, entry] = await Promise.all([
    valid ? one<{ report: Dashboard }>(me, "select erp.manager_pilotage($1::date, $2::date) report", [from, to]) : null,
    valid ? q<Person>(me, `select k.staff_id,k.full_name,k.orders_started,k.orders_finished,k.on_time_orders,k.promised_orders,
      coalesce(t.n,0) tasks_finished from erp.workshop_kpis($1::date,$2::date) k left join (
        select finished_by, count(*)::int n from erp.v_tasks
        where status='terminee' and (finished_at at time zone 'Africa/Algiers')::date between $1::date and $2::date group by finished_by
      ) t on t.finished_by=k.staff_id`, [from, to]) : [],
    one<Daily>(me, "select * from erp.get_daily_operating_costs($1::date)", [day]),
  ]);
  const d = pilotage?.report;
  const missing = d && (d.missing_orders > 0 || d.missing_days > 0 || d.missing_defects > 0);
  const detailHref = `/equipe?du=${from}&au=${to}`;
  const cash = d ? (d.bank === null && d.cash === null ? null : (d.cash ?? 0) + (d.bank ?? 0)) : null;

  return (
    <section aria-label="Pilotage du gérant" className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5">
        <h2 className="text-xl font-bold text-slate-900">Pilotage du gérant</h2>
        <form key={`${from}:${to}:${day}`} className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Du"><input type="date" name="du" required className={inputCls} defaultValue={from} max={today} /></Field>
          <Field label="Au"><input type="date" name="au" required className={inputCls} defaultValue={to} max={today} /></Field>
          <button className={btn()}>Afficher</button>
          <LinkButton href="/" variant="ghost">Ce mois</LinkButton>
        </form>
        {!valid && <p role="alert" className="mt-2 text-sm text-red-700">Sélectionnez une période de 1 à 366 jours, jusqu’à aujourd’hui.</p>}
      </div>

      {d && <>
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Chiffre d’affaires HT" value={dzd(d.revenue)} icon="trend" hint="Commandes remises, déduction faite des remboursements HT" />
          <Kpi label={missing ? "Bénéfice provisoire" : "Bénéfice d’exploitation"} value={dzd(d.profit)} icon="cash" tone="green" hint={missing ? "Certaines charges sont à renseigner" : "Après les charges saisies"} />
          <Kpi label="Trésorerie disponible" value={dzd(cash)} icon="cash" tone="blue" href="/caisse"
            hint={<>{d.cash !== null && <span>{d.cash_open ? "Caisse ouverte" : "Dernier comptage"} · {dzd(d.cash)}</span>}{d.bank === null ? "Banque/CCP à renseigner" : `Banque/CCP du jour : ${dzd(d.bank)}`}</>} />
          <Kpi label="Commandes en retard" value={d.late} icon="clipboard" tone="amber" hint="Date promise dépassée" href="/commandes?vue=en_retard" />
          <Kpi label="Conversion des prospects" value={ratio(d.converted, d.prospects)} icon="users" hint={`${d.converted} sur ${d.prospects} prospects entrés sur la période`} href="/clients?vue=prospects" />
          <Kpi label="Taux de réachat" value={ratio(d.repeat_buyers, d.customers)} icon="tag" tone="green" hint={`${d.repeat_buyers} sur ${d.customers} clients servis sur la période`} href="/clients?vue=reguliers" />
          <Kpi label="Défauts de production" value={d.defects} icon="tool" tone="amber" hint={`${d.defect_units} pièces signalées`} />
          <Kpi label="Meta Ads aujourd’hui" value={dzd(d.meta_today)} icon="trend" hint={d.meta_today === null ? "À renseigner dans les charges du jour" : "Dépense saisie"} href="#charges-jour" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Charges de la période">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {Object.entries({
                Vêtements: d.garment, "Film DTF": d.dtf, Presse: d.press, "Commissions commerciales": d.commission,
                "Meta Ads": d.meta, "Journées des employés": d.labour, "Pertes atelier": d.lost_cost, "Autres coûts et livraison": d.other,
              }).map(([label,value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="font-semibold">{dzd(value)}</dd></div>)}
            </dl>
            {missing && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              À compléter · {d.missing_orders} commande(s), {d.missing_days} journée(s) et {d.missing_defects} perte(s) sans coût complet.
            </p>}
            <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer font-medium">Barème appliqué</summary>
              <p className="mt-2">Polo 1 000 DA, polo manches longues 1 300 DA, T-shirt 700 DA, gilet 1 300 DA, casquette 400 DA, tote bag 300 DA.</p>
              <p className="mt-1">DTF 500 DA/m, presse 100 DA par passage, commission 250 DA par commande remise hors vente comptoir, 2 000 DA par employé et par jour travaillé.</p>
            </details>
          </Card>
          <Card title="Productivité par employé" actions={<LinkButton href={detailHref} variant="ghost">Voir les KPI</LinkButton>}>
            {staff.length ? <Table head={["Employé", "Tâches finies", "Commandes prises", "Terminées", "À temps"]}>
              {staff.map(row => <tr key={row.staff_id}><Td>{row.full_name}</Td><Td>{row.tasks_finished}</Td><Td>{row.orders_started}</Td><Td>{row.orders_finished}</Td><Td>{ratio(row.on_time_orders, row.promised_orders)}</Td></tr>)}
            </Table> : <Empty>Aucune activité enregistrée.</Empty>}
          </Card>
        </div>
      </>}

      <Card id="charges-jour" title="Charges et trésorerie du jour">
        <form className="mb-4 flex flex-wrap items-end gap-2" action="/#charges-jour">
          <input type="hidden" name="du" value={from} /><input type="hidden" name="au" value={to} />
          <Field label="Journée à renseigner"><input type="date" name="jour" max={today} required defaultValue={day} className={inputCls} /></Field>
          <button className={btn("secondary")}>Ouvrir la journée</button>
        </form>
        <p className="mb-2 text-sm text-slate-600">Saisie du {fdate(day)}. Indiquez 0 en l’absence de dépense ou de journée travaillée.</p>
        <ActionForm key={day} action={saveDailyCosts} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="day" value={day} />
          <Field label="Meta Ads (DA)"><input required type="number" min="0" step=".01" name="meta_ads" className={inputCls} defaultValue={entry?.meta_ads} /></Field>
          <Field label="Employés présents"><input required type="number" min="0" step="1" name="employees" className={inputCls} defaultValue={entry?.employees} /></Field>
          <Field label="Autres charges (DA)"><input required type="number" min="0" step=".01" name="other_costs" className={inputCls} defaultValue={entry?.other_costs ?? "0"} /></Field>
          <Field label="Solde banque/CCP (DA)"><input type="number" step=".01" name="bank_available" className={inputCls} defaultValue={entry?.bank_available ?? ""} /></Field>
          <div className="sm:col-span-2 lg:col-span-4"><SubmitButton>Enregistrer la journée</SubmitButton></div>
        </ActionForm>
        {d && <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-brand-700">Dépenses Meta Ads des 7 jours jusqu’au {fdate(to)}</summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {d.meta_history.map(point => <li key={point.day} className="flex items-center justify-between gap-2 py-1.5">
              <LinkButton href={`/?du=${from}&au=${to}&jour=${point.day}#charges-jour`} variant="ghost">{fdate(point.day)}</LinkButton>
              <span>{point.amount === null ? "À renseigner" : dzd(point.amount)}</span>
            </li>)}
          </ul>
        </details>}
      </Card>
    </section>
  );
}

export async function OrderOperatingCosts({ me, orderId }: { me: Me; orderId: string }) {
  const costs = await one<Costs>(me, "select * from erp.get_order_operating_costs($1::uuid)", [orderId]);
  return (
    <Card title="Coûts de revient">
      <ActionForm action={saveOrderCosts} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="order_id" value={orderId} />
        <Field label="DTF utilisé (m)" hint="500 DA par mètre"><input type="number" min="0" step=".001" name="dtf_metres" className={inputCls} defaultValue={costs?.dtf_metres ?? ""} /></Field>
        <Field label="Passages presse" hint="100 DA par passage"><input type="number" min="0" step="1" name="press_passes" className={inputCls} defaultValue={costs?.press_passes ?? ""} /></Field>
        <Field label="Vêtements (DA)" hint="Vide pour appliquer le barème. 0 si fournis par le client."><input type="number" min="0" step=".01" name="garments_override" className={inputCls} defaultValue={costs?.garments_override ?? ""} /></Field>
        <Field label="Autres coûts (DA)" hint="Broderie, consommables ou frais hors livraison"><input type="number" min="0" step=".01" name="other_costs" className={inputCls} defaultValue={costs?.other_costs ?? ""} /></Field>
        <div className="sm:col-span-2 lg:col-span-4"><SubmitButton>Enregistrer les coûts</SubmitButton></div>
      </ActionForm>
    </Card>
  );
}

import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { calendarDate, daysBetween } from "@/lib/calendar";
import { todayAlgiers } from "@/lib/format";
import { ROLES } from "@/lib/perms";
import { Badge, Card, Empty, Field, LinkButton, PageHeader, Stat, Table, Td, btn, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";

type EmployeeKpi = {
  staff_id: string;
  full_name: string;
  roles: string[];
  active: boolean;
  orders_started: number;
  orders_finished: number;
  promised_orders: number;
  on_time_orders: number;
  avg_hours: number | null;
};

const number = new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 1 });
const rate = (yes: number, total: number) => total ? `${number.format(100 * yes / total)} %` : "—";

export default async function Team({ searchParams }: { searchParams: { du?: string; au?: string } }) {
  const me = await requireMe("settings");
  const today = todayAlgiers();
  const from = calendarDate(searchParams.du) ?? today.slice(0, 7) + "-01";
  const to = calendarDate(searchParams.au) ?? today;
  const span = daysBetween(from, to);
  const valid = span >= 0 && span <= 365;
  const rows = valid ? await q<EmployeeKpi>(me, "select * from erp.workshop_kpis($1::date, $2::date)", [from, to]) : [];
  const totals = rows.reduce((acc, row) => ({
    started: acc.started + row.orders_started,
    finished: acc.finished + row.orders_finished,
    promised: acc.promised + row.promised_orders,
    onTime: acc.onTime + row.on_time_orders,
  }), { started: 0, finished: 0, promised: 0, onTime: 0 });

  return (
    <div className="space-y-4">
      <PageHeader title="KPI employés" subtitle="Production et respect des dates promises" actions={<LinkButton href="/atelier" variant="secondary">Voir l’atelier</LinkButton>} />
      <Card>
        <form key={`${from}:${to}`} className="flex flex-wrap items-end gap-2">
          <Field label="Du"><input type="date" name="du" defaultValue={from} required className={inputCls} /></Field>
          <Field label="Au"><input type="date" name="au" defaultValue={to} required className={inputCls} /></Field>
          <button className={btn()}>Afficher</button>
          <LinkButton href="/equipe" variant="ghost">Ce mois</LinkButton>
        </form>
        {!valid && <p role="alert" className="mt-3 text-sm text-red-700">Choisissez une période de 1 à 366 jours, du plus ancien au plus récent.</p>}
      </Card>
      {valid && <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Commandes prises" value={totals.started} />
          <Stat label="Commandes terminées" value={totals.finished} />
          <Stat label="Prêtes à temps" value={rate(totals.onTime, totals.promised)} />
        </div>
        <Card title="Production par employé">
          {rows.length ? <Table head={["Employé", "Commandes prises", "Commandes terminées", "Prêtes à temps", "Temps moyen"]}>
            {rows.map((row) => <tr key={row.staff_id}>
              <Td><div className="font-semibold">{row.full_name} {!row.active && <Badge>Inactif</Badge>}</div><div className="text-slate-500">{row.roles.map((r) => ROLES[r] || r).join(", ")}</div></Td>
              <Td>{row.orders_started}</Td>
              <Td>{row.orders_finished}</Td>
              <Td>{rate(row.on_time_orders, row.promised_orders)}{row.promised_orders > 0 && <div className="text-slate-500">{row.on_time_orders} / {row.promised_orders}</div>}</Td>
              <Td>{row.avg_hours === null ? "—" : `${number.format(row.avg_hours)} h`}</Td>
            </tr>)}
          </Table> : <Empty>Aucun employé à afficher pour cette période.</Empty>}
          <p className="mt-3 text-sm text-slate-500">La prise est attribuée à la personne qui démarre la production et la fin à celle qui rend la commande prête. Le taux porte sur les commandes avec une date promise. Le temps moyen mesure la durée entre les deux actions, lorsque les horaires sont distincts.</p>
        </Card>
      </>}
    </div>
  );
}

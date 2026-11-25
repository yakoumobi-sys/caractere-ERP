import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Empty, PageHeader, Tabs } from "@/components/ui";
import { TaskCard } from "@/components/cards";
import { STATION_LABEL } from "@/lib/format";
import { myStations, TASK_ORDER, workerMe } from "@/lib/queries";
import { orderExtras } from "@/lib/order-extras";

export const dynamic = "force-dynamic";

export default async function Workshop({ searchParams }: { searchParams: { poste?: string; qui?: string } }) {
  const me = await requireMe("workshop_view");
  const mine = myStations(me);
  const poste = searchParams.poste || (mine.length && !me.can("settings") ? "moi" : "tous");
  const args: unknown[] = [];
  let where = "t.status in ('a_faire','en_cours','bloquee') and t.order_status in ('confirmee','en_production')";
  if (poste === "moi") { args.push(me.staffId, mine); where += " and (t.assignee_id = $1 or (t.assignee_id is null and t.station = any($2)))"; }
  else if (poste === "bloquees") where += " and t.status = 'bloquee'";
  else if (poste === "premiere_piece") where += " and t.status = 'en_cours' and t.first_piece_status = 'a_valider'";
  else if (poste !== "tous") { args.push(poste); where += " and t.station = $1"; }
  const [tasks, staff, counts] = await Promise.all([
    q(me, `select * from erp.v_tasks t where ${where} ${TASK_ORDER} limit 150`, args),
    q(me, "select id, full_name from erp.v_staff where active order by full_name"),
    q(me, "select station, count(*)::int n from erp.v_tasks where status in ('a_faire','en_cours','bloquee') and order_status in ('confirmee','en_production') group by station"),
  ]);
  const x_tasks = await orderExtras(me, tasks.map((t: any) => t.order_id));
  const c = Object.fromEntries(counts.map((r: any) => [r.station, r.n]));
  const tabs = [
    ...(mine.length ? [{ key: "moi", label: "Ma file", href: "/atelier?poste=moi" }] : []),
    { key: "tous", label: "Tout l'atelier", href: "/atelier?poste=tous" },
    ...Object.entries(STATION_LABEL).map(([k, v]) => ({ key: k, label: v, href: `/atelier?poste=${k}`, count: c[k] || 0 })),
    { key: "premiere_piece", label: "1res pièces à valider", href: "/atelier?poste=premiere_piece" },
    { key: "bloquees", label: "Bloquées", href: "/atelier?poste=bloquees" },
  ];
  return (
    <div>
      <PageHeader title="Atelier" subtitle="DTF, broderie et flocage — trié par délai promis puis ancienneté (priorité manuelle tracée)" />
      <Tabs items={tabs} current={poste} />
      <div className="grid gap-2 lg:grid-cols-2">{tasks.map((t: any) => <TaskCard key={t.id} t={t} extra={x_tasks[t.order_id]} me={workerMe(me)} staff={staff} />)}</div>
      {!tasks.length && <Empty>Aucune tâche dans cette file.</Empty>}
    </div>
  );
}

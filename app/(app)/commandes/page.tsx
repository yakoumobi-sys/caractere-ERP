import { requireMe } from "@/lib/auth";
import { q, one } from "@/lib/erp";
import { Empty, LinkButton, PageHeader, Stat, Tabs, btn, inputCls } from "@/components/ui";
import { OrderCard } from "@/components/cards";
import { orderExtras } from "@/lib/order-extras";
import { fdate, todayAlgiers } from "@/lib/format";
import { addDays, calendarDate, relativeDay } from "@/lib/calendar";

export const dynamic = "force-dynamic";

const PENDING = "status in ('brouillon','confirmee','en_production')";
const ACTIVE = "status not in ('livree','retiree','annulee','retournee')";
const VIEWS = {
  toutes: { label: "À terminer", where: PENDING },
  a_confirmer: { label: "À confirmer", where: "status = 'brouillon'" },
  a_produire: { label: "À produire", where: "status in ('confirmee','en_production')" },
  a_expedier: { label: "À expédier ou à retirer", where: "status in ('prete','a_retirer') or (status = 'expediee' and next_action like 'Expédier%')" },
  en_retard: { label: "En retard", where: "is_late" },
  bloquees: { label: "Bloquées", where: "is_blocked or status in ('annulee','retournee') and (refund_due > 0 or rework_note is not null or status = 'retournee')" },
  terminees: { label: "Terminées", where: "status in ('prete','expediee','a_retirer','livree','retiree')" },
  cloturees: { label: "Annulées et retournées", where: "status in ('annulee','retournee')" },
};

type View = keyof typeof VIEWS;
type Order = { id: string; day_key: string };
const PAGE_SIZE = 50;

export default async function Orders({ searchParams }: { searchParams: { vue?: string; q?: string; date?: string; page?: string; creation?: string } }) {
  const me = await requireMe("orders_view");
  const requested = searchParams.vue;
  const vue: View = requested && Object.hasOwn(VIEWS, requested) ? requested as View : "toutes";
  const today = todayAlgiers();
  const day = calendarDate(searchParams.date) ?? today;
  const term = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const rawPage = Number(searchParams.page);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 1_000_000 ? rawPage : 1;

  function href(view: View, date = day, targetPage = 1) {
    const params = new URLSearchParams({ vue: view });
    if (date !== today) params.set("date", date);
    if (term) params.set("q", term);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/commandes?${params}`;
  }

  const scope = `select o.*, (created_at at time zone 'Africa/Algiers')::date work_day,
    $2::date current_day from erp.v_orders o`;
  const search = "($3 = '' or ref ilike $4 or client_name ilike $4 or trackings ilike $4 or client_phone = erp.normalize_phone($3))";
  const carry = `(work_day = $1 or ($1 = current_day and work_day < $1 and ${ACTIVE}))`;
  const dayFilter = (view: View) => {
    if (view === "terminees") return "(coalesce(ready_at, delivered_at) at time zone 'Africa/Algiers')::date = $1 or (ready_at is null and delivered_at is null and work_day = $1)";
    if (view === "cloturees") return "work_day = $1";
    if (view === "bloquees") return `(${carry} or ($1 = current_day and work_day < $1))`;
    return carry;
  };
  const args = [day, today, term, `%${term}%`];
  const [counts, rows] = await Promise.all([
    one(me, `with orders as (${scope})
      select ${Object.entries(VIEWS).map(([key, { where }]) => `count(*) filter (where (${where}) and (${dayFilter(key as View)}))::int as ${key}`).join(", ")},
      count(*) filter (where work_day = $1 and ${PENDING})::int due,
      count(*) filter (where $1 = current_day and work_day < $1 and ${PENDING})::int carried
      from orders where ${search}`, args),
    q<Order>(me, `with orders as (${scope})
      select *, to_char(work_day, 'YYYY-MM-DD') day_key from orders
      where (${VIEWS[vue].where}) and (${dayFilter(vue)}) and ${search}
      order by (work_day = $1) desc, work_day desc, created_at desc, id
      limit $5 offset $6`, [...args, PAGE_SIZE, (page - 1) * PAGE_SIZE]),
  ]);
  const extras = await orderExtras(me, rows.map((o) => o.id));
  const groups = new Map<string, Order[]>();
  for (const order of rows) {
    const group = groups.get(order.day_key);
    if (group) group.push(order);
    else groups.set(order.day_key, [order]);
  }
  const pages = Math.ceil((counts?.[vue] ?? 0) / PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Commandes" actions={<>
        <LinkButton href="/commandes/livraisons" variant="secondary">Livraisons</LinkButton>
        {(me.can("orders_edit") || me.can("payment_record")) && <LinkButton href="/commandes/nouvelle">Nouvelle commande</LinkButton>}
      </>} />
      {searchParams.creation === "ok" && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Commande ajoutée à la liste d’aujourd’hui.</p>}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <form key={`${vue}:${day}:${term}`} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="vue" value={vue} />
          <label className="min-w-40">
            <span className="mb-1 block text-sm font-medium text-slate-700">Jour</span>
            <input name="date" type="date" defaultValue={day} required className={inputCls} />
          </label>
          <label className="min-w-44 flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">Rechercher</span>
            <input name="q" defaultValue={term} placeholder="Client, référence ou téléphone" className={inputCls} />
          </label>
          <button className={btn()}>Afficher</button>
        </form>
        <nav aria-label="Naviguer par jour" className="mt-3 flex flex-wrap gap-2">
          {day > "1000-01-01" && <LinkButton href={href(vue, addDays(day, -1))} variant="secondary">Jour précédent</LinkButton>}
          <LinkButton href={href(vue, today)} variant={day === today ? "primary" : "secondary"}>Aujourd’hui</LinkButton>
          {day < "9999-12-31" && <LinkButton href={href(vue, addDays(day, 1))} variant="secondary">Jour suivant</LinkButton>}
        </nav>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="À terminer pour ce jour" value={counts?.due ?? 0} href={href("toutes")} />
        {day === today && <Stat label="Reportées" value={counts?.carried ?? 0} tone={counts?.carried ? "amber" : undefined} href={href("toutes")} />}
        <Stat label="Terminées ce jour" value={counts?.terminees ?? 0} href={href("terminees")} />
      </div>
      <Tabs current={vue} items={Object.entries(VIEWS).map(([key, v]) => ({ key, label: v.label, href: href(key as View), count: counts?.[key] ?? 0 }))} />
      <div className="space-y-5">
        {Array.from(groups, ([date, orders]) => (
          <section key={date} aria-label={`Commandes du ${fdate(date)}`}>
            <h2 className="mb-2 flex items-baseline gap-2 text-base font-semibold text-slate-900">
              {relativeDay(date, today) ?? fdate(date)}
              {relativeDay(date, today) && <time dateTime={date} className="text-sm font-normal text-slate-500">{fdate(date)}</time>}
            </h2>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {orders.map((o) => <OrderCard key={o.id} o={o} extra={extras[o.id]} showMoney={me.can("money_view")} canWork={me.can("workshop_work")} isManager={me.can("waive_deposit")} />)}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-500">Les commandes sont regroupées par date de création. La date promise figure sur chaque fiche.</p>
      {!rows.length && <Empty>Aucune commande dans cette vue pour le {fdate(day)}.</Empty>}
      {(pages > 1 || page > 1) && <nav aria-label="Pages de commandes" className="mt-4 flex flex-wrap items-center gap-2">
        {page > 1 && <LinkButton href={href(vue, day, page - 1)} variant="secondary">Page précédente</LinkButton>}
        <span className="text-sm text-slate-600">Page {page}{pages ? ` sur ${pages}` : ""}</span>
        {page < pages && <LinkButton href={href(vue, day, page + 1)} variant="secondary">Page suivante</LinkButton>}
      </nav>}
    </div>
  );
}

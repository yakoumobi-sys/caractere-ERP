import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { q, one, rpc } from "@/lib/erp";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat, Tabs } from "@/components/ui";
import { FollowupItem } from "@/components/followup";
import { fdate, todayAlgiers } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Clients({ searchParams }: { searchParams: { vue?: string; q?: string; echeance?: string; cadeau?: string } }) {
  const me = await requireMe("clients_view");
  const vue = searchParams.vue || "tous";
  const term = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const today = todayAlgiers();
  const tabs = [
    { key: "tous", label: "Tous", href: "/clients" },
    { key: "prospects", label: "Prospects", href: "/clients?vue=prospects" },
    { key: "clients", label: "Clients", href: "/clients?vue=clients" },
    { key: "relances", label: "Relances à faire", href: "/clients?vue=relances" },
    { key: "reguliers", label: "Clients réguliers", href: "/clients?vue=reguliers" },
    { key: "fideles", label: "Carte Privilège", href: "/clients?vue=fideles" },
  ];
  if (vue === "relances") {
    await rpc(me, "refresh_followups");
    const periods = [
      { key: "retard", label: "En retard", where: "due_date < $1" },
      { key: "jour", label: "Aujourd’hui", where: "due_date = $1" },
      { key: "avenir", label: "À venir", where: "due_date > $1" },
    ];
    const selected = periods.find((period) => period.key === searchParams.echeance);
    const base = "from erp.v_followups where status = 'a_faire'";
    const [rows, tpl, counts] = await Promise.all([
      q(me, `select *, (due_date < $1) overdue ${base} ${selected ? "and " + selected.where : ""} order by due_date, created_at, id limit 200`, [today]),
      one(me, "select value from erp.v_settings where key = 'whatsapp_templates'"),
      one(me, `select count(*)::int all_open, ${periods.map((period) => `count(*) filter (where ${period.where})::int as ${period.key}`).join(", ")} ${base}`, [today]),
    ]);
    return (
      <div>
        <PageHeader title="CRM clients" actions={me.can("clients_edit") && <LinkButton href="/clients/nouveau">Nouveau prospect</LinkButton>} />
        <Tabs items={tabs} current={vue} />
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {periods.map((period) => <Stat key={period.key} label={period.label} value={counts?.[period.key] ?? 0} tone={period.key === "retard" && counts?.retard ? "red" : undefined} href={`/clients?vue=relances&echeance=${period.key}`} />)}
        </div>
        <Card title={selected ? selected.label : "Relances ouvertes"} actions={selected && <LinkButton href="/clients?vue=relances" variant="ghost">Toutes les relances</LinkButton>}>
          {rows.length ? <div className="divide-y divide-slate-100">{rows.map((f: any) => (
            <div key={f.id} className={f.overdue ? "border-l-2 border-red-300 pl-3" : ""}><FollowupItem f={f} templates={tpl?.value || {}} me={me.fullName} /></div>
          ))}</div> : <Empty>Aucune relance pour cette échéance.</Empty>}
          {(counts?.[selected?.key ?? "all_open"] ?? 0) > rows.length && <p className="mt-3 text-sm text-slate-500">Les 200 relances les plus anciennes sont affichées.</p>}
        </Card>
      </div>
    );
  }
  const where = ["true"];
  const args: unknown[] = [];
  if (vue === "prospects") where.push("kind = 'prospect'");
  if (vue === "clients") where.push("kind = 'client'");
  const giftsOnly = vue === "fideles" && searchParams.cadeau === "1";
  if (vue === "fideles") where.push(giftsOnly ? "gifts_available > 0" : "card_number is not null");
  if (vue === "reguliers") where.push("kind = 'client' and orders_count >= 2");
  if (term) {
    args.push(`%${term}%`, term);
    where.push(`(name ilike $1 or company ilike $1 or phone = erp.normalize_phone($2) or phone like '%' || regexp_replace($2, '\\D', '', 'g') || '%')`);
  }
  const [rows, summary] = await Promise.all([
    q(me, `select * from erp.v_clients where ${where.join(" and ")}
      order by ${vue === "reguliers" ? "orders_count desc, " : ""}updated_at desc limit 200`, args),
    one(me, `select count(*) filter (where kind = 'prospect')::int prospects,
      count(*) filter (where kind = 'client' and orders_count >= 2)::int regulars,
      count(*) filter (where gifts_available > 0)::int with_gifts from erp.v_clients`),
  ]);
  return (
    <div>
      <PageHeader title="CRM clients" actions={me.can("clients_edit") && <><LinkButton href="/clients/import" variant="secondary">Importer CSV</LinkButton><LinkButton href="/clients/nouveau">Nouveau prospect</LinkButton></>} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Prospects" value={summary?.prospects ?? 0} href="/clients?vue=prospects" />
        <Stat label="Clients réguliers" value={summary?.regulars ?? 0} href="/clients?vue=reguliers" />
        <Stat label="Clients avec un cadeau disponible" value={summary?.with_gifts ?? 0} href="/clients?vue=fideles&cadeau=1" />
      </div>
      <Tabs items={tabs} current={vue} />
      {giftsOnly && <LinkButton href="/clients?vue=fideles" variant="ghost" className="mb-2">Voir toutes les cartes</LinkButton>}
      <form className="mb-3"><input type="hidden" name="vue" value={vue} />{giftsOnly && <input type="hidden" name="cadeau" value="1" />}<input name="q" defaultValue={term} placeholder="Nom, société ou téléphone" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></form>
      <div className="grid gap-2">
        {rows.map((c: any) => (
          <Link key={c.id} href={`/clients/${c.id}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm hover:border-brand-300">
            <span className="font-medium text-slate-900">{c.name}</span>
            {c.company && <span className="text-slate-500">· {c.company}</span>}
            <Badge tone={c.kind === "client" ? "green" : "blue"}>{c.kind === "client" ? "Client" : "Prospect"}</Badge>
            {c.card_number && <Badge tone="violet">{c.card_number}{c.gifts_available > 0 ? " · cadeau dispo" : ""}</Badge>}
            {c.marketing_opt_out && <Badge tone="red">Refus marketing</Badge>}
            <span className="ml-auto text-xs text-slate-500">{c.phone || "sans téléphone"} · {c.owner_name || "—"} · {c.orders_count} cde(s){c.last_delivery_at ? ` · livré ${fdate(c.last_delivery_at)}` : ""}</span>
          </Link>
        ))}
        {!rows.length && <Empty>Aucune fiche.</Empty>}
      </div>
    </div>
  );
}

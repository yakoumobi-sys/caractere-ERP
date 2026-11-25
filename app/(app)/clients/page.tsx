import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { q, one } from "@/lib/erp";
import { Badge, Card, Empty, LinkButton, PageHeader, Tabs } from "@/components/ui";
import { FollowupItem } from "@/components/followup";
import { fdate, todayAlgiers } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Clients({ searchParams }: { searchParams: { vue?: string; q?: string } }) {
  const me = await requireMe("clients_view");
  const vue = searchParams.vue || "tous";
  const term = searchParams.q?.trim() || "";
  const tabs = [
    { key: "tous", label: "Tous", href: "/clients" },
    { key: "prospects", label: "Prospects", href: "/clients?vue=prospects" },
    { key: "clients", label: "Clients", href: "/clients?vue=clients" },
    { key: "relances", label: "Relances à faire", href: "/clients?vue=relances" },
    { key: "fideles", label: "Carte Privilège", href: "/clients?vue=fideles" },
  ];
  if (vue === "relances") {
    const [rows, tpl] = await Promise.all([
      q(me, "select * from erp.v_followups where status = 'a_faire' order by due_date, created_at limit 200"),
      one(me, "select value from erp.v_settings where key = 'whatsapp_templates'"),
    ]);
    return (
      <div>
        <PageHeader title="Clients" actions={<LinkButton href="/clients/nouveau">Nouveau prospect</LinkButton>} />
        <Tabs items={tabs} current={vue} />
        <Card title={`${rows.length} relance(s) ouverte(s)`}>
          {rows.length ? <div className="divide-y divide-slate-100">{rows.map((f: any) => (
            <div key={f.id} className={f.due_date > todayAlgiers() ? "opacity-60" : ""}><FollowupItem f={f} templates={tpl?.value || {}} me={me.fullName} /></div>))}</div> : <Empty>Aucune relance.</Empty>}
        </Card>
      </div>
    );
  }
  const where = ["true"];
  const args: unknown[] = [];
  if (vue === "prospects") where.push("kind = 'prospect'");
  if (vue === "clients") where.push("kind = 'client'");
  if (vue === "fideles") where.push("card_number is not null");
  if (term) {
    args.push(`%${term}%`, term);
    where.push(`(name ilike $1 or company ilike $1 or phone = erp.normalize_phone($2) or phone like '%' || regexp_replace($2, '\\D', '', 'g') || '%')`);
  }
  const rows = await q(me, `select * from erp.v_clients where ${where.join(" and ")} order by updated_at desc limit 200`, args);
  return (
    <div>
      <PageHeader title="Clients" subtitle="Acquisition, suivi et fidélité" actions={<><LinkButton href="/clients/import" variant="secondary">Importer CSV</LinkButton><LinkButton href="/clients/nouveau">Nouveau prospect</LinkButton></>} />
      <Tabs items={tabs} current={vue} />
      <form className="mb-3"><input type="hidden" name="vue" value={vue} /><input name="q" defaultValue={term} placeholder="Nom, société ou téléphone" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></form>
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

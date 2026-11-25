import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function Search({ searchParams }: { searchParams: { q?: string } }) {
  const me = await requireMe();
  const term = (searchParams.q || "").trim();
  const rows = term ? await q(me, "select * from erp.search($1)", [term]) : [];
  const href = (r: any) => (r.kind === "client" ? `/clients/${r.id}` : r.kind === "devis" ? `/ventes/devis/${r.id}` : `/commandes/${r.id}`);
  return (
    <div><PageHeader title="Recherche" subtitle={term ? `« ${term} »` : "Téléphone, nom, référence de commande ou tracking"} />
      <Card>{rows.length ? <ul className="divide-y divide-slate-100">{rows.map((r: any) => (
        <li key={r.kind + r.id}><Link href={href(r)} className="flex items-center gap-2 py-2 text-sm hover:text-brand-700"><Badge tone={r.kind === "client" ? "blue" : r.kind === "devis" ? "amber" : "violet"}>{r.kind}</Badge><span className="font-medium">{r.title}</span><span className="text-slate-500">{r.subtitle}</span></Link></li>))}</ul>
        : <Empty>{term ? "Aucun résultat accessible avec votre profil." : "Saisissez un terme dans la barre de recherche."}</Empty>}</Card></div>
  );
}

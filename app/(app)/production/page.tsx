import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, Card } from "@/components/ui";
import { QUEUE_TITLES, statusesForQueue, type QueueName } from "@/lib/pipeline";

const QUEUES: { name: QueueName; href: string }[] = [
  { name: "dtf", href: "/production/dtf" },
  { name: "broderie", href: "/production/broderie" },
  { name: "simple", href: "/production/simple" },
  { name: "flocage", href: "/production/flocage" },
  { name: "ready", href: "/production/ready" },
];

export default async function Page() {
  const supabase = createClient();
  const counts = await Promise.all(
    QUEUES.map((q) =>
      supabase.from("pipeline_orders").select("id", { count: "exact", head: true }).in("status", statusesForQueue(q.name))
    )
  );

  return (
    <div>
      <PageHeader
        title="Suivi de production"
        description="Configurateur commercial → file de l'atelier → commande prête → livraison"
        action={<LinkButton href="/production/new">+ Nouvelle commande</LinkButton>}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {QUEUES.map((q, i) => (
          <Link key={q.name} href={q.href}>
            <Card className="p-5 hover:border-brand-300 transition-colors">
              <p className="text-sm text-slate-500">{QUEUE_TITLES[q.name]}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{counts[i].count ?? 0}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Card } from "@/components/ui";
import { QUEUE_TITLES, statusesForQueue, type QueueName } from "@/lib/pipeline";
import { createClient } from "@/lib/supabase/server";

const QUEUES: { name: QueueName; href: string; color: string; icon: string }[] = [
  { name: "dtf", href: "/production/dtf", color: "#2563eb", icon: "🖨️" },
  { name: "broderie", href: "/production/broderie", color: "#7c3aed", icon: "🧵" },
  { name: "gros", href: "/production/gros", color: "#f59e0b", icon: "📦" },
  { name: "ready", href: "/production/ready", color: "#10b981", icon: "✅" },
];

export async function OrdersSummary() {
  const supabase = createClient();
  const counts = await Promise.all(
    QUEUES.map((q) =>
      supabase.from("pipeline_orders").select("id", { count: "exact", head: true }).in("status", statusesForQueue(q.name))
    )
  );

  const total = counts.reduce((sum, c) => sum + (c.count ?? 0), 0);

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Résumé des commandes en production</h2>
        <Link href="/production" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
          Voir tout
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUEUES.map((q, i) => (
          <Link
            key={q.name}
            href={q.href}
            className="flex flex-col p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg">{q.icon}</span>
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{q.name.toUpperCase()}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{counts[i].count ?? 0}</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{QUEUE_TITLES[q.name]}</p>
          </Link>
        ))}
      </div>
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <span className="text-sm text-slate-600 dark:text-slate-300">Total en production</span>
        <span className="text-xl font-semibold text-slate-900 dark:text-white">{total}</span>
      </div>
    </Card>
  );
}

"use client";

import { useTransition } from "react";
import Link from "next/link";
import { updateOpportunityStage } from "@/lib/actions/entity-actions";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

const STAGES: { value: string; label: string }[] = [
  { value: "nouveau", label: "Nouveau" },
  { value: "qualification", label: "Qualification" },
  { value: "proposition", label: "Proposition" },
  { value: "negociation", label: "Négociation" },
  { value: "gagne", label: "Gagné" },
  { value: "perdu", label: "Perdu" },
];

interface OpportunityRow {
  id: string;
  title: string;
  stage: string;
  amount: number;
  contacts: { name: string } | null;
}

export function OpportunityBoard({ opportunities }: { opportunities: OpportunityRow[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {STAGES.map((stage) => {
        const items = opportunities.filter((o) => o.stage === stage.value);
        const total = items.reduce((s, o) => s + Number(o.amount), 0);
        return (
          <div key={stage.value} className="min-w-[220px]">
            <div className="mb-2 px-1">
              <p className="text-sm font-semibold text-slate-900">{stage.label}</p>
              <p className="text-xs text-slate-400">{formatMoney(total)}</p>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((o) => (
                <Card key={o.id} className="p-3">
                  <Link href={`/crm/opportunities/${o.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-600">
                    {o.title}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5">{o.contacts?.name ?? "—"}</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{formatMoney(o.amount)}</p>
                  <select
                    defaultValue={o.stage}
                    disabled={isPending}
                    onChange={(e) => startTransition(() => updateOpportunityStage(o.id, e.target.value))}
                    className="mt-2 w-full rounded-md border border-slate-200 text-xs px-2 py-1"
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Card>
              ))}
              {items.length === 0 && <p className="text-xs text-slate-300 px-1">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

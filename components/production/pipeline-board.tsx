"use client";

import { useTransition } from "react";
import Link from "next/link";
import { PIPELINE_STAGES, departmentForStage } from "@/lib/pipeline";
import { updatePipelineStage } from "@/lib/actions/pipeline-actions";
import { Card, Badge } from "@/components/ui";
import { formatSince } from "@/lib/utils";

interface EmployeeOption {
  id: string;
  first_name: string;
  last_name: string;
  department: string | null;
}

interface OrderRow {
  id: string;
  number: string | null;
  description: string | null;
  stage: string;
  contact_name: string | null;
  assigned_to: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
  stage_since: string | null;
}

export function PipelineBoard({ orders, employees }: { orders: OrderRow[]; employees: EmployeeOption[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4 min-w-max">
        {PIPELINE_STAGES.map((stage) => {
          const items = orders.filter((o) => o.stage === stage.value);
          const dept = departmentForStage(stage.value);
          const stageEmployees = dept ? employees.filter((e) => e.department === dept) : employees;

          return (
            <div key={stage.value} className="w-72 shrink-0">
              <div className="mb-2 px-1 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{stage.label}</p>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((o) => (
                  <Card key={o.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/production/${o.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-600">
                        {o.number}
                      </Link>
                      <Badge tone={stage.value === "livre" ? "green" : "blue"}>{formatSince(o.stage_since)}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{o.contact_name ?? "—"}</p>
                    {o.description && <p className="text-xs text-slate-600 mt-1 line-clamp-2">{o.description}</p>}

                    <select
                      defaultValue={o.stage}
                      disabled={isPending}
                      onChange={(e) => startTransition(() => updatePipelineStage(o.id, e.target.value))}
                      className="mt-2 w-full rounded-md border border-slate-200 text-xs px-2 py-1"
                    >
                      {PIPELINE_STAGES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>

                    <select
                      defaultValue={o.assigned_to ?? ""}
                      disabled={isPending}
                      onChange={(e) => startTransition(() => updatePipelineStage(o.id, o.stage, e.target.value || null))}
                      className="mt-1.5 w-full rounded-md border border-slate-200 text-xs px-2 py-1"
                    >
                      <option value="">Non assigné</option>
                      {stageEmployees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.first_name} {e.last_name}
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
    </div>
  );
}

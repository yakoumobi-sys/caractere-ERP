"use client";

import { useTransition } from "react";
import { ALL_STATUSES } from "@/lib/pipeline";
import { setPipelineStatus } from "@/lib/actions/pipeline-actions";
import { Card, Field, inputClass } from "@/components/ui";

interface EmployeeOption {
  id: string;
  first_name: string;
  last_name: string;
}

/** Correction manuelle du statut / de l'assignation (admin, commercial) */
export function PipelineControls({
  orderId,
  status,
  assignedTo,
  employees,
}: {
  orderId: string;
  status: string;
  assignedTo: string | null;
  employees: EmployeeOption[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Statut (modification manuelle)" htmlFor="status">
        <select
          id="status"
          defaultValue={status}
          disabled={isPending}
          onChange={(e) => startTransition(() => setPipelineStatus(orderId, e.target.value))}
          className={inputClass}
        >
          {ALL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Assigné à" htmlFor="assigned_to">
        <select
          id="assigned_to"
          defaultValue={assignedTo ?? ""}
          disabled={isPending}
          onChange={(e) => startTransition(() => setPipelineStatus(orderId, status, e.target.value || null))}
          className={inputClass}
        >
          <option value="">Non assigné</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.first_name} {e.last_name}
            </option>
          ))}
        </select>
      </Field>
    </Card>
  );
}

"use client";

import { useTransition } from "react";
import { PIPELINE_STAGES, departmentForStage } from "@/lib/pipeline";
import { updatePipelineStage } from "@/lib/actions/pipeline-actions";
import { Card, Field, inputClass } from "@/components/ui";

interface EmployeeOption {
  id: string;
  first_name: string;
  last_name: string;
  department: string | null;
}

export function PipelineControls({
  orderId,
  stage,
  assignedTo,
  employees,
}: {
  orderId: string;
  stage: string;
  assignedTo: string | null;
  employees: EmployeeOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const dept = departmentForStage(stage);
  const stageEmployees = dept ? employees.filter((e) => e.department === dept) : employees;

  return (
    <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Étape actuelle" htmlFor="stage">
        <select
          id="stage"
          defaultValue={stage}
          disabled={isPending}
          onChange={(e) => startTransition(() => updatePipelineStage(orderId, e.target.value))}
          className={inputClass}
        >
          {PIPELINE_STAGES.map((s) => (
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
          onChange={(e) => startTransition(() => updatePipelineStage(orderId, stage, e.target.value || null))}
          className={inputClass}
        >
          <option value="">Non assigné</option>
          {stageEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.first_name} {e.last_name}
            </option>
          ))}
        </select>
      </Field>
    </Card>
  );
}

"use client";

import { useTransition } from "react";
import { toggleTask } from "@/lib/actions/hr-actions";

export function TaskCheckbox({ taskId, defaultChecked }: { taskId: string; defaultChecked: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={defaultChecked}
      disabled={pending}
      onChange={(e) => {
        const checked = e.target.checked;
        startTransition(() => {
          toggleTask(taskId, checked);
        });
      }}
      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-500 focus:ring-brand-500 shrink-0"
    />
  );
}

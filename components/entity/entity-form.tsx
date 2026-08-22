"use client";

import { useFormStatus } from "react-dom";
import type { EntityConfig } from "@/lib/entities";
import { upsertEntity } from "@/lib/actions/entity-actions";
import { Button, Card, Field, inputClass } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enregistrement..." : "Enregistrer"}
    </Button>
  );
}

export function EntityForm({
  config,
  record,
  relationOptions,
}: {
  config: EntityConfig;
  record: Record<string, unknown> | null;
  relationOptions: Record<string, { value: string; label: string }[]>;
}) {
  const action = upsertEntity.bind(null, config.table, config.basePath, config.fields, (record?.id as string) ?? null);

  return (
    <Card className="p-6">
      <form action={action} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {config.fields.map((field) => {
          const value = record?.[field.name];
          const wide = field.type === "textarea";
          return (
            <div key={field.name} className={wide ? "sm:col-span-2" : undefined}>
              <Field label={field.label} htmlFor={field.name} required={field.required}>
                {field.type === "textarea" && (
                  <textarea
                    id={field.name}
                    name={field.name}
                    defaultValue={(value as string) ?? ""}
                    required={field.required}
                    rows={3}
                    className={inputClass}
                  />
                )}
                {field.type === "checkbox" && (
                  <input
                    id={field.name}
                    name={field.name}
                    type="checkbox"
                    defaultChecked={Boolean(value)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                  />
                )}
                {(field.type === "select" || field.type === "relation") && (
                  <select
                    id={field.name}
                    name={field.name}
                    defaultValue={(value as string) ?? ""}
                    required={field.required}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {(field.type === "select" ? field.options : relationOptions[field.name])?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
                {["text", "email", "tel", "number", "date"].includes(field.type) && (
                  <input
                    id={field.name}
                    name={field.name}
                    type={field.type}
                    step={field.step}
                    defaultValue={(value as string | number) ?? ""}
                    required={field.required}
                    className={inputClass}
                  />
                )}
              </Field>
            </div>
          );
        })}
        <div className="sm:col-span-2 pt-2">
          <SubmitButton />
        </div>
      </form>
    </Card>
  );
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EntityConfig } from "@/lib/entities";
import { PageHeader } from "@/components/ui";
import { EntityForm } from "@/components/entity/entity-form";

export async function EntityFormPage({ config, id }: { config: EntityConfig; id?: string }) {
  const supabase = createClient();
  const isNew = !id || id === "new";

  let record: Record<string, unknown> | null = null;
  if (!isNew) {
    const { data, error } = await supabase.from(config.table).select("*").eq("id", id).single();
    if (error || !data) notFound();
    record = data;
  }

  const relationOptions: Record<string, { value: string; label: string }[]> = {};
  for (const field of config.fields) {
    if (field.type === "relation" && field.relationTable) {
      const { data } = await supabase
        .from(field.relationTable)
        .select(`id, ${field.relationLabelField ?? "name"}`);
      relationOptions[field.name] = (data ?? []).map((r: any) => ({
        value: r.id,
        label: r[field.relationLabelField ?? "name"],
      }));
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title={isNew ? `Nouveau ${config.titleSingular.toLowerCase()}` : `Modifier — ${config.titleSingular}`} />
      <EntityForm config={config} record={record} relationOptions={relationOptions} />
    </div>
  );
}

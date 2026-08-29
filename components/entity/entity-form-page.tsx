import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type { EntityConfig } from "@/lib/entities";
import { PageHeader, Card } from "@/components/ui";
import { EntityForm } from "@/components/entity/entity-form";

// Rôles autorisés à modifier chaque table
const TABLE_PERMISSIONS: Record<string, string[]> = {
  contacts: ["admin", "manager", "sales"],
  products: ["admin", "manager", "purchasing", "sales"],
  product_categories: ["admin", "manager", "purchasing"],
  opportunities: ["admin", "manager", "sales"],
};

function canEditTable(table: string, role: string | undefined): boolean {
  const allowedRoles = TABLE_PERMISSIONS[table] || ["admin", "manager"];
  return allowedRoles.includes(role || "");
}

export async function EntityFormPage({ config, id }: { config: EntityConfig; id?: string }) {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  const isNew = !id || id === "new";

  // Vérifier les permissions
  if (!canEditTable(config.table, profile?.role)) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Accès refusé" />
        <Card className="p-6">
          <p className="text-red-600 dark:text-red-400">
            Vous n&apos;avez pas la permission de modifier {config.titlePlural.toLowerCase()}.
          </p>
        </Card>
      </div>
    );
  }

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

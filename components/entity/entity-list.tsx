import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { EntityConfig } from "@/lib/entities";
import { deleteEntity } from "@/lib/actions/entity-actions";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

function renderCell(value: unknown) {
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value);
  return String(value);
}

export async function EntityListPage({ config }: { config: EntityConfig }) {
  const supabase = createClient();
  let query = supabase.from(config.table).select("*");
  if (config.orderBy) query = query.order(config.orderBy, { ascending: config.ascending ?? true });
  const { data, error } = await query;

  return (
    <div>
      <PageHeader
        title={config.titlePlural}
        action={
          <LinkButton href={`${config.basePath}/new`}>+ Nouveau {config.titleSingular.toLowerCase()}</LinkButton>
        }
      />
      <Card className="overflow-x-auto">
        {error && <div className="p-4 text-sm text-red-600">{error.message}</div>}
        {!error && (!data || data.length === 0) && (
          <EmptyState message={`Aucun ${config.titleSingular.toLowerCase()} pour l'instant.`} />
        )}
        {!error && data && data.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
              <tr>
                {config.columns.map((col) => (
                  <th key={col.key} className="px-4 py-2.5 font-medium">
                    {col.label}
                  </th>
                ))}
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row: any) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  {config.columns.map((col) => (
                    <td key={col.key} className="px-4 py-2.5 text-slate-700">
                      <Link href={`${config.basePath}/${row.id}`} className="block">
                        {renderCell(row[col.key])}
                      </Link>
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    <form
                      action={async () => {
                        "use server";
                        await deleteEntity(config.table, config.basePath, row.id);
                      }}
                    >
                      <button className="text-xs text-red-500 hover:underline">Supprimer</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

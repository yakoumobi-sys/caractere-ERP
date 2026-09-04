import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type { EntityConfig } from "@/lib/entities";
import { deleteEntity } from "@/lib/actions/entity-actions";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { formatDate } from "@/lib/utils";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Rôles autorisés à modifier chaque table (copie depuis entity-actions.ts)
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

function renderCell(value: unknown) {
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && HEX_COLOR.test(value)) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: value }} />
        {value}
      </span>
    );
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value);
  return String(value);
}

export async function EntityListPage({
  config,
  errorMessage,
}: {
  config: EntityConfig;
  /** Message renvoyé par une suppression refusée (paramètre ?error= de l'URL). */
  errorMessage?: string;
}) {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  const canEdit = canEditTable(config.table, profile?.role);

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
      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
        >
          {errorMessage}
        </div>
      )}
      <Card className="overflow-x-auto">
        {error && <div className="p-4 text-sm text-red-600">{error.message}</div>}
        {!error && (!data || data.length === 0) && (
          <EmptyState message={`Aucun ${config.titleSingular.toLowerCase()} pour l'instant.`} />
        )}
        {!error && data && data.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {config.columns.map((col) => (
                  <th key={col.key} className="px-4 py-2.5 font-medium">
                    {col.label}
                  </th>
                ))}
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((row: any) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  {config.columns.map((col) => (
                    <td key={col.key} className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                      <Link href={`${config.basePath}/${row.id}`} className="block">
                        {renderCell(row[col.key])}
                      </Link>
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    {canEdit && (
                      <form
                        action={async () => {
                          "use server";
                          await deleteEntity(config.table, config.basePath, row.id);
                        }}
                      >
                        <ConfirmSubmitButton
                          message={`Supprimer définitivement « ${row.name ?? row.title ?? row.number ?? row.code ?? "cet élément"} » ?`}
                          variant="ghost"
                          className="text-xs text-red-500 dark:text-red-400 hover:underline px-2 py-1"
                        >
                          Supprimer
                        </ConfirmSubmitButton>
                      </form>
                    )}
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

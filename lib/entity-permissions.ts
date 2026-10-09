import type { UserRole } from "@/types/database";

export const ENTITY_WRITE_ROLES: Record<string, readonly UserRole[]> = {
  contacts: ["admin", "manager", "sales"],
  opportunities: ["admin", "manager", "sales"],
  products: ["admin", "manager", "purchasing", "sales", "stock"],
  product_categories: ["admin", "manager", "purchasing"],
  warehouses: ["admin", "manager", "stock", "purchasing"],
  suppliers: ["admin", "manager", "purchasing"],
  employees: ["admin", "manager", "hr"],
  projects: ["admin", "manager", "sales"],
  chart_of_accounts: ["admin", "accounting"],
};
export function canEditEntity(table: string, role?: UserRole | null) {
  return !!role && !!ENTITY_WRITE_ROLES[table]?.includes(role);
}

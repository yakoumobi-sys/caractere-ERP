import type { UserRole } from "@/types/database";

/** Rôles autorisés à écrire sur la comptabilité */
export const ACCOUNTING_ROLES: UserRole[] = ["admin", "accounting"];

export function canWrite(role: UserRole | undefined) {
  return !!role && role !== "readonly";
}

/** Rôles autorisés à encaisser — miroir de la policy RLS order_payments_insert (migration 0030). */
export const PAYMENT_ROLES: UserRole[] = ["admin", "manager", "sales"];

export function canRecordPayments(role: UserRole | undefined | null) {
  return !!role && (PAYMENT_ROLES as string[]).includes(role);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrateur",
  manager: "Manager",
  sales: "Ventes",
  purchasing: "Achats",
  accounting: "Comptabilité",
  stock: "Stock",
  hr: "RH",
  atelier: "Atelier (production)",
  readonly: "Lecture seule",
};

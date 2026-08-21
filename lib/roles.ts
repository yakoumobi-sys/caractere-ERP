import type { UserRole } from "@/types/database";

/** Rôles autorisés à écrire sur la comptabilité */
export const ACCOUNTING_ROLES: UserRole[] = ["admin", "accounting"];

export function canWrite(role: UserRole | undefined) {
  return !!role && role !== "readonly";
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrateur",
  manager: "Manager",
  sales: "Ventes",
  purchasing: "Achats",
  accounting: "Comptabilité",
  stock: "Stock",
  hr: "RH",
  readonly: "Lecture seule",
};

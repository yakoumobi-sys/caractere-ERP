// Miroir de erp.role_can (supabase/migrations/0002_erp_core.sql) — sert uniquement à l'affichage.
// Les droits réels sont vérifiés en base à chaque lecture (vues) et écriture (fonctions).
export type Cap =
  | "clients_view" | "clients_edit" | "sales" | "orders_view" | "orders_edit" | "money_view" | "payment_record"
  | "workshop_view" | "workshop_work" | "priority" | "stock_view" | "stock_edit" | "purchase_request" | "cash"
  | "remittance" | "shipping" | "cost_view" | "cash_correct" | "purchase_approve" | "settings" | "waive_deposit";

export const ROLES: Record<string, string> = {
  gerant: "Gérant", commercial: "Commercial", caissier: "Caissier", infographiste: "Infographiste",
  floqueur: "Floqueur", brodeur: "Brodeur", controleur: "Contrôleur", magasinier: "Magasinier",
};

const M: Partial<Record<Cap, string[]>> = {
  clients_view: ["commercial", "caissier"], clients_edit: ["commercial"], sales: ["commercial"], orders_edit: ["commercial"],
  money_view: ["commercial", "caissier"], payment_record: ["commercial", "caissier"],
  workshop_view: ["infographiste", "floqueur", "brodeur", "controleur", "commercial", "magasinier"],
  workshop_work: ["infographiste", "floqueur", "brodeur", "controleur", "magasinier"], priority: ["commercial"],
  stock_edit: ["magasinier"], purchase_request: ["magasinier", "commercial"], cash: ["caissier"], remittance: ["caissier"],
  shipping: ["commercial", "magasinier"],
};

export function roleCan(roles: string[], cap: Cap): boolean {
  if (roles.includes("gerant")) return true;
  if (cap === "orders_view" || cap === "stock_view") return roles.length > 0;
  return (M[cap] || []).some((r) => roles.includes(r));
}

export const NAV: { href: string; label: string; cap: Cap; icon: string }[] = [
  { href: "/clients", label: "Clients", cap: "clients_view", icon: "users" },
  { href: "/ventes", label: "Ventes", cap: "sales", icon: "tag" },
  { href: "/commandes", label: "Commandes", cap: "orders_view", icon: "box" },
  { href: "/booking", label: "Booking", cap: "orders_view", icon: "clipboard" },
  { href: "/atelier", label: "Atelier", cap: "workshop_view", icon: "tool" },
  { href: "/stock", label: "Stock", cap: "stock_view", icon: "layers" },
  { href: "/caisse", label: "Caisse", cap: "cash", icon: "cash" },
  { href: "/equipe", label: "KPI employés", cap: "settings", icon: "trend" },
];

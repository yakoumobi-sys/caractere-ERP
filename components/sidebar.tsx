"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";

const NAV = [
  {
    section: "Général",
    items: [{ href: "/dashboard", label: "Tableau de bord" }],
  },
  {
    section: "CRM",
    items: [
      { href: "/crm/contacts", label: "Contacts" },
      { href: "/crm/opportunities", label: "Opportunités" },
    ],
  },
  {
    section: "Ventes",
    items: [
      { href: "/sales/quotes", label: "Devis" },
      { href: "/sales/orders", label: "Commandes clients" },
      { href: "/sales/invoices", label: "Factures" },
    ],
  },
  {
    section: "Achats",
    items: [
      { href: "/purchasing/suppliers", label: "Fournisseurs" },
      { href: "/purchasing/orders", label: "Commandes fournisseurs" },
    ],
  },
  {
    section: "Stock",
    items: [
      { href: "/inventory/products", label: "Produits" },
      { href: "/inventory/categories", label: "Catégories" },
      { href: "/inventory/warehouses", label: "Entrepôts" },
      { href: "/inventory/movements", label: "Mouvements de stock" },
    ],
  },
  {
    section: "Comptabilité",
    items: [
      { href: "/accounting/chart-of-accounts", label: "Plan comptable" },
      { href: "/accounting/journal", label: "Journal" },
      { href: "/accounting/reports", label: "Rapports" },
    ],
  },
  {
    section: "Ressources humaines",
    items: [{ href: "/hr/employees", label: "Employés" }],
  },
  {
    section: "Projets",
    items: [{ href: "/projects", label: "Projets" }],
  },
  {
    section: "Paramètres",
    items: [
      { href: "/settings/company", label: "Société" },
      { href: "/settings/users", label: "Utilisateurs" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 border-r border-slate-200 bg-white overflow-y-auto">
      <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-200">
        <div className="h-8 w-8 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold text-sm">
          C
        </div>
        <span className="font-semibold text-slate-900">Caractère ERP</span>
      </div>
      <nav className="px-3 py-4 flex flex-col gap-5">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {group.section}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx(
                      "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-brand-50 text-brand-700 font-medium"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

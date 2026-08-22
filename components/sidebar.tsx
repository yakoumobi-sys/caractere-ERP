"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";
import { NAV_ICONS, IconChevron } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  {
    section: "Général",
    items: [{ href: "/dashboard", label: "Tableau de bord", exact: true }],
  },
  {
    section: "Production",
    items: [
      { href: "/production", label: "Vue d'ensemble", exact: true },
      { href: "/production/new", label: "+ Nouvelle commande" },
      { href: "/production/dtf", label: "File DTF" },
      { href: "/production/broderie", label: "File Broderie" },
      { href: "/production/gros", label: "Commande gros" },
      { href: "/production/ready", label: "Commandes prêtes" },
    ],
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
    section: "Service Client",
    items: [
      { href: "/claims", label: "Réclamations" },
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
    section: "Analytics",
    items: [
      { href: "/reports", label: "Rapports & Prévisions" },
    ],
  },
  {
    section: "Ressources humaines",
    items: [
      { href: "/hr/employees", label: "Employés" },
      { href: "/hr/attendance", label: "Présences" },
    ],
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

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeSection = NAV.find((g) => g.items.some((it) => pathname.startsWith(it.href)))?.section;
  const [openSection, setOpenSection] = useState<string | null>(activeSection ?? "Général");

  return (
    <aside className="h-full w-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold text-base shrink-0">
          C
        </div>
        <div className="leading-tight">
          <p className="font-semibold text-slate-900 dark:text-white text-sm">CARACTÈRE</p>
          <p className="text-[10px] tracking-wide text-slate-400 dark:text-slate-500 uppercase">ERP System</p>
        </div>
      </div>

      <nav className="px-3 py-3 flex flex-col gap-1 flex-1">
        {NAV.map((group) => {
          const Icon = NAV_ICONS[group.section];
          const isOpen = openSection === group.section;
          const hasActive = group.items.some((it) => (it.exact ? pathname === it.href : pathname.startsWith(it.href)));
          return (
            <div key={group.section}>
              <button
                type="button"
                onClick={() => setOpenSection(isOpen ? null : group.section)}
                className={cx(
                  "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  hasActive
                    ? "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
              >
                {Icon && <Icon className="shrink-0" />}
                <span className="flex-1 text-left">{group.section}</span>
                {group.items.length > 1 && <IconChevron open={isOpen} className="text-slate-400" />}
              </button>

              {(isOpen || group.items.length === 1) && (
                <div className="mt-0.5 ml-4 pl-4 border-l border-slate-100 dark:border-slate-800 flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={cx(
                          "rounded-md px-3 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-brand-500 text-white font-medium"
                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <ThemeToggle />
      </div>
    </aside>
  );
}

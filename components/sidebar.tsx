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
    items: [
      { href: "/dashboard", label: "Tableau de bord", exact: true },
      { href: "/alerts", label: "Alertes" },
      { href: "/sms-notifications", label: "📱 SMS Notifications" },
    ],
  },
  {
    section: "Production",
    items: [
      { href: "/production", label: "Vue d'ensemble", exact: true },
      { href: "/production/new", label: "+ Nouvelle commande" },
      { href: "/production/dtf", label: "File DTF" },
      { href: "/production/flocage", label: "File Flocage" },
      { href: "/production/broderie", label: "File Broderie" },
      { href: "/production/gros", label: "Commande gros" },
      { href: "/production/ready", label: "Commandes prêtes" },
    ],
  },
  {
    section: "Confirmation",
    items: [{ href: "/confirmation", label: "Commandes COD / web" }],
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
      { href: "/hr/messaging", label: "💬 Messagerie" },
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

export function Sidebar({
  onNavigate,
  logoUrl,
  companyName = "Caractère",
}: {
  onNavigate?: () => void;
  logoUrl?: string | null;
  companyName?: string;
}) {
  const pathname = usePathname();
  const activeSection = NAV.find((g) => g.items.some((it) => pathname.startsWith(it.href)))?.section;
  const [openSection, setOpenSection] = useState<string | null>(activeSection ?? "Général");

  return (
    <aside className="h-full w-full border-r border-slate-200 dark:border-slate-700 bg-gradient-to-b from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 overflow-y-auto flex flex-col shadow-lg">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-950/50">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center font-bold text-base shrink-0 overflow-hidden shadow-lg shadow-indigo-600/40">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={companyName} className="h-full w-full object-cover" />
          ) : (
            companyName[0]?.toUpperCase() ?? "C"
          )}
        </div>
        <div className="leading-tight">
          <p className="font-semibold text-slate-900 dark:text-white text-sm">{companyName.toUpperCase()}</p>
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
                    ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                {Icon && <Icon className="shrink-0" />}
                <span className="flex-1 text-left">{group.section}</span>
                {group.items.length > 1 && <IconChevron open={isOpen} className="text-slate-400" />}
              </button>

              {(isOpen || group.items.length === 1) && (
                <div className="mt-0.5 ml-4 pl-4 border-l border-slate-200/70 dark:border-slate-800 flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={cx(
                          "rounded-lg px-3 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-semibold shadow-md shadow-indigo-500/30"
                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white"
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

      <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
        <ThemeToggle />
      </div>
    </aside>
  );
}

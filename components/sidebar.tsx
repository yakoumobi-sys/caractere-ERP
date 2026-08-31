"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";
import { NAV_ICONS, IconChevron } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Destinations du quotidien : rendues en boutons pleins plutôt qu'en liens
 * repliés dans un accordéon. `wide` occupe toute la largeur, sinon deux par
 * ligne — les files de production se tapent au pouce sans déplier de menu.
 */
const NAV_BUTTONS = [
  {
    section: "Général",
    items: [
      { href: "/dashboard", label: "Tableau de bord", exact: true, wide: true },
      { href: "/alerts", label: "Alertes" },
      { href: "/sms-notifications", label: "📱 SMS" },
    ],
  },
  {
    section: "Production",
    items: [
      { href: "/production", label: "Vue d'ensemble", exact: true, wide: true },
      { href: "/production/new", label: "+ Nouvelle commande", wide: true },
      { href: "/production/dtf", label: "File DTF" },
      { href: "/production/flocage", label: "File Flocage" },
      { href: "/production/broderie", label: "File Broderie" },
      { href: "/production/gros", label: "Commande gros" },
      { href: "/production/ready", label: "Commandes prêtes", wide: true },
    ],
  },
];

const NAV_ACTIONS = [
  { label: "📊 Ventes", href: "/sales" },
  { label: "🛒 Achats", href: "/purchasing/orders" },
];

const NAV_ACCORDIONS = [
  {
    section: "Confirmation",
    items: [{ href: "/confirmation", label: "Commandes COD / web" }],
  },
  {
    section: "CRM",
    items: [
      { href: "/crm/contacts", label: "Clients" },
      { href: "/inventory/products", label: "Produits" },
      { href: "/inventory/warehouses", label: "Stock" },
      { href: "/accounting/chart-of-accounts", label: "Comptabilité" },
      { href: "/purchasing/suppliers", label: "🏭 Fournisseurs" },
    ],
  },
  {
    section: "Ressources humaines",
    items: [
      { href: "/hr/employees", label: "Employés" },
      { href: "/hr/attendance", label: "Présences" },
      { href: "/hr/messaging", label: "💬 Messagerie" },
      { href: "/hr/objectives", label: "🎯 Objectifs du mois" },
    ],
  },
  {
    section: "Analytique",
    items: [
      { href: "/reports", label: "Tableau de bord" },
      { href: "/reports", label: "Chiffre d'affaires" },
    ],
  },
  {
    section: "Paramètres",
    items: [
      { href: "/settings/company", label: "Société" },
      { href: "/settings/users", label: "Utilisateurs" },
    ],
  },
];

function NavButton({
  href,
  label,
  active,
  size = "sm",
  className,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  size?: "sm" | "lg";
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-[44px] items-center justify-center rounded-lg px-3 text-center font-bold leading-tight text-white transition-all active:scale-[0.97]",
        size === "lg" ? "py-3 text-base" : "py-2.5 text-sm",
        active
          ? "bg-gradient-to-r from-indigo-700 to-blue-700 shadow-lg shadow-indigo-500/40 ring-2 ring-indigo-300 dark:ring-indigo-400/60"
          : "bg-gradient-to-r from-indigo-500 to-blue-500 hover:shadow-lg hover:shadow-indigo-500/40",
        className
      )}
    >
      {label}
    </Link>
  );
}

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
  const activeSection = NAV_ACCORDIONS.find((g) => g.items.some((it) => pathname.startsWith(it.href)))?.section;
  const [openSection, setOpenSection] = useState<string | null>(activeSection ?? null);

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

      <nav className="px-3 py-3 flex flex-col gap-1 flex-1 overflow-y-auto">
        {/* Général et Production : accès direct, sans repli */}
        {NAV_BUTTONS.map((group) => {
          const Icon = NAV_ICONS[group.section];
          return (
            <div key={group.section} className="mb-3">
              <p className="flex items-center gap-2 px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {Icon && <Icon className="shrink-0" />}
                {group.section}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <NavButton
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    active={"exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href)}
                    className={"wide" in item && item.wide ? "col-span-2" : undefined}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Ventes et Achats */}
        <div className="mb-3 flex flex-col gap-2">
          {NAV_ACTIONS.map((action) => (
            <NavButton
              key={action.href}
              href={action.href}
              label={action.label}
              size="lg"
              active={pathname.startsWith(action.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {/* Le reste, replié par section */}
        <div className="my-1 border-t border-slate-200/70 dark:border-slate-800 pt-3" />
        {NAV_ACCORDIONS.map((group) => {
          const Icon = NAV_ICONS[group.section];
          const isOpen = openSection === group.section;
          const hasActive = group.items.some((it) => pathname.startsWith(it.href));
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
                    const active = pathname.startsWith(item.href);
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

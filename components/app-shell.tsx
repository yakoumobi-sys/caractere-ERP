"use client";

import { useState } from "react";
import { cx } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";

export function AppShell({
  topbar,
  children,
  logoUrl,
  companyName,
}: {
  topbar: React.ReactNode;
  children: React.ReactNode;
  logoUrl?: string | null;
  companyName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      {/* Décor géométrique — shapes modernes style corporate */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-indigo-300 to-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-15 dark:opacity-5" />
        <div className="absolute top-1/3 -left-48 w-72 h-72 bg-gradient-to-tr from-blue-300 to-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-10 dark:opacity-5" />
        <div className="absolute -bottom-32 right-1/3 w-96 h-96 bg-gradient-to-tl from-violet-300 to-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-12 dark:opacity-5" />
      </div>

      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <div
        className={cx(
          "fixed inset-y-0 left-0 z-40 w-72 transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar onNavigate={() => setOpen(false)} logoUrl={logoUrl} companyName={companyName} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
              className="lg:hidden -ml-1 p-2 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="font-semibold text-slate-900 dark:text-white lg:hidden">Caractère ERP</span>
          </div>
          {topbar}
        </header>
        <main className="p-4 sm:p-6 flex-1">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { cx } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";

export function AppShell({ topbar, children }: { topbar: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <div
        className={cx(
          "fixed inset-y-0 left-0 z-40 w-72 transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar onNavigate={() => setOpen(false)} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
              className="lg:hidden -ml-1 p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
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

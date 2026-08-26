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
    <div className="relative flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      {/* Halos décoratifs fixes — même langage visuel que les écrans de connexion */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] bg-brand-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 dark:opacity-10" />
        <div className="absolute top-1/2 -left-40 w-[26rem] h-[26rem] bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 dark:opacity-10" />
        <div className="absolute -bottom-40 right-1/4 w-[24rem] h-[24rem] bg-violet-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 dark:opacity-10" />
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
        <header className="h-16 border-b border-white/50 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
              className="lg:hidden -ml-1 p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60"
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

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { Icon } from "./icons";

type NavItem = { href: string; label: string; icon: string };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "C";
}

function Logo({ dark }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-lg font-bold text-white shadow-lg shadow-brand-500/30">C</span>
      <span className={clsx("text-lg font-semibold tracking-tight", dark ? "text-white" : "text-slate-900")}>Caractère</span>
    </span>
  );
}

export function Shell({ nav, user, roles, children, isManager }: { nav: NavItem[]; user: string; roles: string; children: React.ReactNode; isManager: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const all = [{ href: "/", label: "Tableau de bord", icon: "home" }, ...nav];
  const bottom = [{ href: "/", label: "Accueil", icon: "home" }, ...nav.slice(0, 3)];

  const search = (
    <form
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/recherche?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Icon name="search" className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="w-full rounded-xl border border-white bg-white/90 py-2 pl-10 pr-3 text-sm shadow-[0_1px_3px_rgba(30,20,80,0.06)] focus:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-100" aria-label="Rechercher" />
    </form>
  );

  return (
    <div className="min-h-screen pb-24 md:pb-0 md:pl-64">
      {/* Menu latéral (ordinateur) */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col bg-night-900 p-4 md:flex">
        <Link href="/" className="px-2 pb-6 pt-2"><Logo dark /></Link>
        <nav className="flex-1 space-y-1">
          {all.map((i) => (
            <Link key={i.href} href={i.href} className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active(i.href) ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-900/40" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
              <Icon name={i.icon} /> {i.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-white/10 pt-4">
          {isManager && (
            <Link href="/reglages" className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", active("/reglages") ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
              <Icon name="settings" /> Réglages
            </Link>
          )}
          <div className="flex items-center gap-3 rounded-xl bg-night-800 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-fuchsia-400 text-sm font-semibold text-white">{initials(user)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user}</div>
              <div className="truncate text-xs text-slate-400">{roles}</div>
            </div>
            <form action="/api/auth/logout" method="post"><button title="Se déconnecter" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><Icon name="logout" className="h-4 w-4" /></button></form>
          </div>
        </div>
      </aside>

      {/* Bandeau du haut */}
      <header className="no-print sticky top-0 z-20 bg-[#f5f4fb]/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-8">
          <Link href="/" className="md:hidden"><Logo /></Link>
          <div className="hidden flex-1 md:block md:max-w-md md:ml-auto">{search}</div>
          <Link href="/clients?vue=relances" className="relative ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-slate-600 shadow-[0_1px_3px_rgba(30,20,80,0.06)] hover:text-brand-700 md:ml-0" aria-label="Relances">
            <Icon name="bell" />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
          </Link>
        </div>
        <div className="px-4 pb-3 md:hidden">{search}</div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-6 md:px-8">{children}</main>

      {/* Barre du bas (téléphone) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {bottom.map((i) => (
          <Link key={i.href} href={i.href} className={clsx("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active(i.href) ? "text-brand-600" : "text-slate-500")}>
            <Icon name={i.icon} /> {i.label}
          </Link>
        ))}
        <button onClick={() => setMenu(true)} className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-slate-500">
          <Icon name="menu" /> Menu
        </button>
      </nav>

      {menu && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenu(false)}>
          <div className="absolute inset-0 bg-night-950/50" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-fuchsia-400 font-semibold text-white">{initials(user)}</span>
              <div><div className="font-medium text-slate-900">{user}</div><div className="text-xs text-slate-500">{roles}</div></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[...all, ...(isManager ? [{ href: "/reglages", label: "Réglages", icon: "settings" }] : [])].map((i) => (
                <Link key={i.href} href={i.href} className={clsx("flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium", active(i.href) ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-100 text-slate-700")}>
                  <Icon name={i.icon} className="h-6 w-6 text-brand-600" /> {i.label}
                </Link>
              ))}
            </div>
            <form action="/api/auth/logout" method="post" className="mt-4"><button className="w-full rounded-xl border border-slate-200 py-2.5 text-sm text-slate-600">Se déconnecter</button></form>
          </div>
        </div>
      )}
    </div>
  );
}

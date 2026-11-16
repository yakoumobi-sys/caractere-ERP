"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";
import { Icon } from "./icons";

type NavItem = { href: string; label: string; icon: string };

export function Shell({ nav, user, roles, children, isManager }: { nav: NavItem[]; user: string; roles: string; children: React.ReactNode; isManager: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <div className="min-h-screen pb-20 md:pb-0 md:pl-56">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-slate-200 bg-white md:flex">
        <Link href="/" className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 font-bold text-white">C</span>
          <span className="font-semibold text-slate-900">Caractère ERP</span>
        </Link>
        <nav className="flex-1 space-y-0.5 px-2">
          {[{ href: "/", label: "Aujourd'hui", icon: "home" }, ...nav].map((i) => (
            <Link key={i.href} href={i.href} className={clsx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", active(i.href) ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50")}>
              <Icon name={i.icon} /> {i.label}
            </Link>
          ))}
          {isManager && (
            <Link href="/reglages" className={clsx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", active("/reglages") ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50")}>
              <Icon name="settings" /> Réglages
            </Link>
          )}
        </nav>
        <div className="border-t border-slate-100 p-3 text-xs text-slate-500">
          <div className="font-medium text-slate-700">{user}</div>
          <div>{roles}</div>
          <form action="/api/auth/logout" method="post" className="mt-2"><button className="text-brand-700 hover:underline">Se déconnecter</button></form>
        </div>
      </aside>

      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Link href="/" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-600 font-bold text-white md:hidden" aria-label="Aujourd'hui">C</Link>
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) router.push(`/recherche?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Téléphone, nom, référence, tracking…" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none" aria-label="Rechercher" />
          </form>
          <details className="relative md:hidden">
            <summary className="list-none rounded-lg px-2 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200">{user.split(" ")[0]}</summary>
            <div className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-lg">
              <div className="px-2 py-1 text-xs text-slate-500">{roles}</div>
              {isManager && <Link href="/reglages" className="block rounded px-2 py-1.5 hover:bg-slate-50">Réglages</Link>}
              <form action="/api/auth/logout" method="post"><button className="w-full rounded px-2 py-1.5 text-left hover:bg-slate-50">Se déconnecter</button></form>
            </div>
          </details>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid border-t border-slate-200 bg-white md:hidden" style={{ gridTemplateColumns: `repeat(${nav.length || 1}, minmax(0, 1fr))` }}>
        {nav.map((i) => (
          <Link key={i.href} href={i.href} className={clsx("flex flex-col items-center gap-0.5 py-2 text-[11px]", active(i.href) ? "text-brand-700" : "text-slate-500")}>
            <Icon name={i.icon} /> {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

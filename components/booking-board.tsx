"use client";
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { removeBooking } from "@/app/actions/booking";
import { Badge } from "./ui";
import { dzd, ORDER_STATUS, ORDER_TONE } from "@/lib/format";

export type BookingOrder = {
  id: string;
  ref: string;
  status: string;
  promised_date: string;
  client_name: string;
  client_phone: string | null;
  qty_total: number | null;
  total_ttc: number | null;
  balance: number | null;
  is_late: boolean;
  next_action: string | null;
};
export type Booking = {
  id: string;
  booking_date: string;
  client_name: string;
  phone: string | null;
  description: string | null;
  quantity: number | null;
  amount: number | null;
  status: string;
  notes: string | null;
};
type Day = { name: string; date: string; label: string; isToday: boolean };

const CLOSED = ["annulee", "retournee"];

export function BookingBoard({ days, orders, legacy, canEdit, showMoney }: { days: Day[]; orders: BookingOrder[]; legacy: Booking[]; canEdit: boolean; showMoney: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4">
      <div className="grid min-w-[1050px] grid-cols-7 gap-3">
        {days.map((day) => {
          const list = orders.filter((o) => o.promised_date === day.date);
          const old = legacy.filter((b) => b.booking_date === day.date);
          const active = list.filter((o) => !CLOSED.includes(o.status));
          const total = active.reduce((t, o) => t + (Number(o.total_ttc) || 0), 0);
          return (
            <section
              key={day.date}
              className={clsx(
                "flex min-h-[420px] flex-col rounded-2xl border bg-white shadow-[0_1px_3px_rgba(30,20,80,0.06)]",
                day.isToday ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-100"
              )}
            >
              <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{day.name}</div>
                  <div className="text-xs text-slate-500">{day.label} · {active.length} cmd</div>
                </div>
                {canEdit && (
                  <Link
                    href={`/commandes/nouvelle?date=${day.date}`}
                    aria-label={`Nouvelle commande pour ${day.name} ${day.label}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-xl font-bold text-white shadow-lg shadow-brand-500/30 active:scale-95"
                  >
                    +
                  </Link>
                )}
              </header>
              <div className="flex flex-1 flex-col gap-2 bg-slate-50/60 p-2">
                {!list.length && !old.length && <p className="py-6 text-center text-xs text-slate-400">Aucune commande</p>}
                {list.map((o) => (
                  <Link
                    key={o.id}
                    href={`/commandes/${o.id}`}
                    className={clsx("block rounded-xl border border-slate-200 bg-white p-2.5 text-sm hover:border-brand-300", CLOSED.includes(o.status) && "opacity-60")}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-semibold text-slate-900">{o.ref}</span>
                      {o.is_late && <Badge tone="red">Retard</Badge>}
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">{o.client_name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
                      {o.qty_total ? <span>{o.qty_total} pcs</span> : null}
                      {showMoney && o.total_ttc != null && <span>{dzd(Number(o.total_ttc))}</span>}
                      {showMoney && Number(o.balance) > 0 && <span className="text-amber-700">reste {dzd(Number(o.balance))}</span>}
                    </div>
                    <div className="mt-2"><Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS[o.status] || o.status}</Badge></div>
                  </Link>
                ))}
                {old.map((b) => <LegacyCard key={b.id} b={b} canEdit={canEdit} />)}
              </div>
              {showMoney && total > 0 && (
                <footer className="border-t border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">Total : {dzd(total)}</footer>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Ancienne réservation (sans commande) : affichée pour ne rien perdre, à recréer en vraie commande. */
function LegacyCard({ b, canEdit }: { b: Booking; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={clsx("rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-2.5 text-sm", pending && "opacity-50")}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-slate-900">{b.client_name}</div>
        {canEdit && (
          <button
            type="button"
            disabled={pending}
            aria-label="Supprimer"
            className="text-slate-400 hover:text-red-600"
            onClick={() =>
              confirm(`Supprimer l'ancienne réservation de ${b.client_name} ?`) &&
              start(async () => {
                const r = await removeBooking(b.id);
                if (r?.error) alert(r.error);
                router.refresh();
              })
            }
          >
            ✕
          </button>
        )}
      </div>
      {b.description && <div className="mt-1 text-xs text-slate-600">{b.description}</div>}
      <div className="mt-1 text-xs text-amber-800">Ancienne réservation — à recréer en commande avec +</div>
    </div>
  );
}

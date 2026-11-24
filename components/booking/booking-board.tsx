"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBooking, deleteBooking, updateBookingStatus } from "@/lib/actions/booking-actions";
import { Button, Field, inputClass } from "@/components/ui";
import { cx, formatMoney } from "@/lib/utils";

export type Booking = {
  id: string;
  booking_date: string;
  client_name: string;
  phone: string | null;
  description: string | null;
  quantity: number | null;
  amount: number | null;
  status: "reserve" | "confirme" | "fait" | "annule";
  notes: string | null;
};

type Day = { name: string; date: string; label: string; isToday: boolean };

const STATUS: Record<Booking["status"], { label: string; cls: string }> = {
  reserve: { label: "Réservé", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" },
  confirme: { label: "Confirmé", cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300" },
  fait: { label: "Fait", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300" },
  annule: { label: "Annulé", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400" },
};

export function BookingBoard({ days, bookings }: { days: Day[]; bookings: Booking[] }) {
  const [openDay, setOpenDay] = useState<Day | null>(null);

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:mx-0 lg:px-0">
        <div className="grid min-w-[1050px] grid-cols-7 gap-3">
          {days.map((day) => {
            const list = bookings.filter((b) => b.booking_date === day.date);
            const active = list.filter((b) => b.status !== "annule");
            const total = active.reduce((s, b) => s + (Number(b.amount) || 0), 0);
            return (
              <div
                key={day.date}
                className={cx(
                  "flex min-h-[420px] flex-col rounded-xl border bg-slate-50 dark:bg-slate-900/60",
                  day.isToday
                    ? "border-indigo-500 ring-2 ring-indigo-500/30"
                    : "border-slate-200 dark:border-slate-700"
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{day.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {day.label} · {active.length} cmd
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenDay(day)}
                    aria-label={`Ajouter une commande le ${day.name} ${day.label}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 text-xl font-bold text-white shadow-md active:scale-95"
                  >
                    +
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {list.length === 0 && (
                    <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">Aucune commande</p>
                  )}
                  {list.map((b) => (
                    <BookingCard key={b.id} booking={b} />
                  ))}
                </div>
                {total > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Total : {formatMoney(total)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {openDay && <AddBookingModal day={openDay} onClose={() => setOpenDay(null)} />}
    </>
  );
}

function BookingCard({ booking: b }: { booking: Booking }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const st = STATUS[b.status];

  return (
    <div
      className={cx(
        "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm shadow-sm",
        pending && "opacity-50",
        b.status === "annule" && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cx("font-semibold text-slate-900 dark:text-white", b.status === "annule" && "line-through")}>
          {b.client_name}
        </p>
        <button
          type="button"
          aria-label="Supprimer"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Supprimer la commande de ${b.client_name} ?`)) return;
            start(async () => {
              const r = await deleteBooking(b.id);
              if (r?.error) alert(r.error);
              router.refresh();
            });
          }}
          className="text-slate-400 hover:text-red-500"
        >
          ✕
        </button>
      </div>
      {b.description && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{b.description}</p>}
      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500 dark:text-slate-400">
        {b.quantity != null && <span>{b.quantity} pcs</span>}
        {b.amount != null && <span>{formatMoney(Number(b.amount))}</span>}
        {b.phone && (
          <a href={`tel:${b.phone}`} className="text-indigo-600 dark:text-indigo-400">
            {b.phone}
          </a>
        )}
      </div>
      {b.notes && <p className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">{b.notes}</p>}
      <select
        value={b.status}
        disabled={pending}
        onChange={(e) => {
          const status = e.target.value;
          start(async () => {
            const r = await updateBookingStatus(b.id, status);
            if (r?.error) alert(r.error);
            router.refresh();
          });
        }}
        className={cx("mt-2 w-full rounded-md border-0 px-2 py-1 text-xs font-semibold", st.cls)}
      >
        {Object.entries(STATUS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function AddBookingModal({ day, onClose }: { day: Day; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        action={(fd) =>
          start(async () => {
            setError(null);
            const r = await createBooking(fd);
            if (r?.error) return setError(r.error);
            router.refresh();
            onClose();
          })
        }
        className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Nouvelle commande — {day.name} {day.label}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Fermer">
            ✕
          </button>
        </div>
        <input type="hidden" name="booking_date" value={day.date} />
        <Field label="Client" htmlFor="client_name" required>
          <input id="client_name" name="client_name" required autoFocus className={inputClass} />
        </Field>
        <Field label="Téléphone" htmlFor="phone">
          <input id="phone" name="phone" type="tel" inputMode="tel" className={inputClass} />
        </Field>
        <Field label="Commande" htmlFor="description">
          <input id="description" name="description" placeholder="Ex. 50 t-shirts DTF noir" className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantité" htmlFor="quantity">
            <input id="quantity" name="quantity" type="number" min="0" inputMode="numeric" className={inputClass} />
          </Field>
          <Field label="Montant (DA)" htmlFor="amount">
            <input id="amount" name="amount" type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="notes">
          <textarea id="notes" name="notes" rows={2} className={inputClass} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Ajout…" : "Ajouter"}
          </Button>
        </div>
      </form>
    </div>
  );
}

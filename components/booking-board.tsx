"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { addBooking, removeBooking, setBookingStatus } from "@/app/actions/booking";
import { ActionForm, SubmitButton, type ActionResult } from "./forms";
import { btn, Field, inputCls } from "./ui";
import { dzd } from "@/lib/format";

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
  reserve: { label: "Réservé", cls: "bg-amber-50 text-amber-800" },
  confirme: { label: "Confirmé", cls: "bg-brand-50 text-brand-700" },
  fait: { label: "Fait", cls: "bg-emerald-50 text-emerald-700" },
  annule: { label: "Annulé", cls: "bg-slate-100 text-slate-500" },
};

export function BookingBoard({ days, bookings, canEdit, showMoney }: { days: Day[]; bookings: Booking[]; canEdit: boolean; showMoney: boolean }) {
  const [openDay, setOpenDay] = useState<Day | null>(null);
  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-4">
        <div className="grid min-w-[1050px] grid-cols-7 gap-3">
          {days.map((day) => {
            const list = bookings.filter((b) => b.booking_date === day.date);
            const active = list.filter((b) => b.status !== "annule");
            const total = active.reduce((t, b) => t + (Number(b.amount) || 0), 0);
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
                    <button
                      type="button"
                      onClick={() => setOpenDay(day)}
                      aria-label={`Ajouter une commande ${day.name} ${day.label}`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-xl font-bold text-white shadow-lg shadow-brand-500/30 active:scale-95"
                    >
                      +
                    </button>
                  )}
                </header>
                <div className="flex flex-1 flex-col gap-2 bg-slate-50/60 p-2">
                  {!list.length && <p className="py-6 text-center text-xs text-slate-400">Aucune commande</p>}
                  {list.map((b) => <BookingCard key={b.id} b={b} canEdit={canEdit} showMoney={showMoney} />)}
                </div>
                {showMoney && total > 0 && (
                  <footer className="border-t border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">Total : {dzd(total)}</footer>
                )}
              </section>
            );
          })}
        </div>
      </div>
      {openDay && <AddModal day={openDay} onClose={() => setOpenDay(null)} />}
    </>
  );
}

function BookingCard({ b, canEdit, showMoney }: { b: Booking; canEdit: boolean; showMoney: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r?.error) alert(r.error);
      router.refresh();
    });
  return (
    <div className={clsx("rounded-xl border border-slate-200 bg-white p-2.5 text-sm", (pending || b.status === "annule") && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className={clsx("font-semibold text-slate-900", b.status === "annule" && "line-through")}>{b.client_name}</div>
        {canEdit && (
          <button
            type="button"
            disabled={pending}
            aria-label="Supprimer"
            className="text-slate-400 hover:text-red-600"
            onClick={() => confirm(`Supprimer la commande de ${b.client_name} ?`) && run(() => removeBooking(b.id))}
          >
            ✕
          </button>
        )}
      </div>
      {b.description && <div className="mt-1 text-xs text-slate-600">{b.description}</div>}
      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
        {b.quantity != null && <span>{b.quantity} pcs</span>}
        {showMoney && b.amount != null && <span>{dzd(Number(b.amount))}</span>}
        {b.phone && <a href={`tel:${b.phone}`} className="text-brand-700">{b.phone}</a>}
      </div>
      {b.notes && <div className="mt-1 text-xs italic text-slate-500">{b.notes}</div>}
      {canEdit ? (
        <select
          value={b.status}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            run(() => setBookingStatus(b.id, v));
          }}
          className={clsx("mt-2 w-full rounded-lg border-0 px-2 py-1 text-xs font-medium", STATUS[b.status].cls)}
        >
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      ) : (
        <span className={clsx("mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium", STATUS[b.status].cls)}>{STATUS[b.status].label}</span>
      )}
    </div>
  );
}

function AddModal({ day, onClose }: { day: Day; onClose: () => void }) {
  const router = useRouter();
  const action = async (prev: ActionResult, fd: FormData) => {
    const r = await addBooking(prev, fd);
    if (r?.ok) {
      router.refresh();
      onClose();
    }
    return r;
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Nouvelle commande — {day.name} {day.label}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <ActionForm action={action} className="space-y-3">
          <input type="hidden" name="booking_date" value={day.date} />
          <Field label="Client *"><input name="client_name" required autoFocus className={inputCls} /></Field>
          <Field label="Téléphone"><input name="phone" type="tel" inputMode="tel" className={inputCls} /></Field>
          <Field label="Commande"><input name="description" placeholder="Ex. 50 t-shirts DTF noir" className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantité"><input name="quantity" type="number" min="0" inputMode="numeric" className={inputCls} /></Field>
            <Field label="Montant (DA)"><input name="amount" type="number" min="0" step="0.01" inputMode="decimal" className={inputCls} /></Field>
          </div>
          <Field label="Notes"><textarea name="notes" rows={2} className={inputCls} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={btn("secondary")}>Annuler</button>
            <SubmitButton>Ajouter</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}

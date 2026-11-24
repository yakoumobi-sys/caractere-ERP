import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { BookingBoard, type Booking } from "@/components/booking/booking-board";

const DAY_NAMES = ["Samedi", "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

/** Date du jour à Alger, au format YYYY-MM-DD. */
function todayAlgiers() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(new Date());
}

function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
/** Samedi de la semaine contenant `d` (semaine algérienne samedi → vendredi). */
function saturdayOf(d: Date) {
  const offset = (d.getUTCDay() + 1) % 7; // samedi=0 … vendredi=6
  return addDays(d, -offset);
}

export default async function BookingPage({ searchParams }: { searchParams: { week?: string } }) {
  const today = todayAlgiers();
  const ref = searchParams.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week) ? searchParams.week : today;
  const start = saturdayOf(parseISO(ref));
  const days = DAY_NAMES.map((name, i) => {
    const date = toISO(addDays(start, i));
    return {
      name,
      date,
      label: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(
        addDays(start, i)
      ),
      isToday: date === today,
    };
  });
  const end = days[6].date;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_bookings")
    .select("id, booking_date, client_name, phone, description, quantity, amount, status, notes")
    .gte("booking_date", days[0].date)
    .lte("booking_date", end)
    .order("created_at", { ascending: true });

  const prev = toISO(addDays(start, -7));
  const next = toISO(addDays(start, 7));
  const navBtn =
    "inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700";

  return (
    <div>
      <PageHeader
        title="Booking commandes"
        description={`Semaine du ${days[0].label} au ${days[6].label}`}
        action={
          <div className="flex gap-2">
            <Link href={`/booking?week=${prev}`} className={navBtn}>← Préc.</Link>
            <Link href="/booking" className={navBtn}>Cette semaine</Link>
            <Link href={`/booking?week=${next}`} className={navBtn}>Suiv. →</Link>
          </div>
        }
      />
      {error ? (
        <p className="rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300">
          Impossible de charger le planning : {error.message}
        </p>
      ) : (
        <BookingBoard days={days} bookings={(data ?? []) as Booking[]} />
      )}
    </div>
  );
}

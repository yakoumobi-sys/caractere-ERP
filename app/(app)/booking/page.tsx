import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { todayAlgiers } from "@/lib/format";
import { LinkButton, PageHeader } from "@/components/ui";
import { BookingBoard, type Booking, type BookingOrder } from "@/components/booking-board";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Samedi", "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, k: number) => new Date(d.getTime() + k * 86400000);
/** Samedi de la semaine contenant `d` (semaine samedi → vendredi). */
const saturdayOf = (d: Date) => addDays(d, -((d.getUTCDay() + 1) % 7));

export default async function BookingPage({ searchParams }: { searchParams: { semaine?: string } }) {
  const me = await requireMe("orders_view");
  const today = todayAlgiers();
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.semaine || "") ? searchParams.semaine! : today;
  const start = saturdayOf(parseISO(ref));
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  const days = DAY_NAMES.map((name, i) => {
    const d = addDays(start, i);
    return { name, date: toISO(d), label: fmt.format(d), isToday: toISO(d) === today };
  });

  // Le planning affiche les vraies commandes, rangées par date promise.
  const [orders, legacy] = await Promise.all([
    q<BookingOrder>(
      me,
      `select id, ref, status, promised_date, client_name, client_phone, qty_total, total_ttc, balance, is_late, next_action
         from erp.v_orders where promised_date between $1 and $2 order by created_at`,
      [days[0].date, days[6].date]
    ),
    // Réservations saisies avant que Booking crée de vraies commandes.
    q<Booking>(
      me,
      `select id, booking_date, client_name, phone, description, quantity, amount, status, notes
         from erp.v_bookings where booking_date between $1 and $2 order by created_at`,
      [days[0].date, days[6].date]
    ),
  ]);

  return (
    <div>
      <PageHeader
        title="Booking commandes"
        subtitle={`Commandes par date promise — semaine du ${days[0].label} au ${days[6].label}`}
        actions={
          <>
            <LinkButton href={`/booking?semaine=${toISO(addDays(start, -7))}`} variant="secondary">← Préc.</LinkButton>
            <LinkButton href="/booking" variant="secondary">Cette semaine</LinkButton>
            <LinkButton href={`/booking?semaine=${toISO(addDays(start, 7))}`} variant="secondary">Suiv. →</LinkButton>
          </>
        }
      />
      <BookingBoard days={days} orders={orders} legacy={legacy} canEdit={me.can("orders_edit")} showMoney={me.can("money_view")} />
    </div>
  );
}

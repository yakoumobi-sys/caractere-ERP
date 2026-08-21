export function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    value ?? 0
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** "depuis 3 jours", "depuis 2h", "depuis 5 min" — pour l'ancienneté dans une étape */
export function formatSince(value: string | null | undefined) {
  if (!value) return "—";
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `depuis ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `depuis ${hours} h`;
  const days = Math.floor(hours / 24);
  return `depuis ${days} j`;
}

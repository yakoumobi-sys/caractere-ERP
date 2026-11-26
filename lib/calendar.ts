const DAY_MS = 86_400_000;

export function calendarDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return;
  const date = new Date(value + "T00:00:00Z");
  if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS;
}

export function relativeDay(day: string, today: string): string | undefined {
  const age = daysBetween(day, today);
  if (age === 0) return "Aujourd’hui";
  if (age === 1) return "Hier";
  if (age === 2) return "Avant-hier";
  if (age > 2) return `Il y a ${age} jours`;
  if (age === -1) return "Demain";
}

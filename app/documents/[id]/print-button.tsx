"use client";
export function PrintButton() {
  return <button onClick={() => window.print()} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white">Imprimer / PDF</button>;
}

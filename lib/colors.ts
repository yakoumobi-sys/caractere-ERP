// Palette proposée pour identifier chaque employé — volontairement sans violet/indigo
// pour ne pas se confondre avec la couleur de marque (brand-500) de l'interface.
export const EMPLOYEE_COLORS: { value: string; label: string }[] = [
  { value: "#ef4444", label: "Rouge" },
  { value: "#f97316", label: "Orange" },
  { value: "#f59e0b", label: "Ambre" },
  { value: "#84cc16", label: "Citron vert" },
  { value: "#22c55e", label: "Vert" },
  { value: "#10b981", label: "Émeraude" },
  { value: "#14b8a6", label: "Sarcelle" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#0ea5e9", label: "Bleu ciel" },
  { value: "#3b82f6", label: "Bleu" },
  { value: "#ec4899", label: "Rose" },
  { value: "#475569", label: "Ardoise" },
];

export function employeeColorLabel(hex: string | null | undefined) {
  return EMPLOYEE_COLORS.find((c) => c.value === hex)?.label ?? hex ?? "—";
}

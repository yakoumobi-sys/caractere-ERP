export const crmStages = [
  { value: "nouveau", label: "Nouveau contact" },
  { value: "qualification", label: "Besoin qualifié" },
  { value: "proposition", label: "Simulation / devis envoyé" },
  { value: "negociation", label: "À confirmer" },
  { value: "gagne", label: "Gagné" },
  { value: "perdu", label: "Perdu" },
];
export function whatsappUrl(phone?: string | null) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0[5-7]\d{8}$/.test(digits)) digits = `213${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? `https://wa.me/${digits}` : null;
}

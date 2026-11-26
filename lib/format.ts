export const TZ = "Africa/Algiers";
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
export function dzd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return nf.format(Number(v)).replace(/ | /g, " ") + " DA";
}
export function fdate(v: string | Date | null | undefined, withTime = false): string {
  if (!v) return "—";
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T12:00:00Z") : new Date(v);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: withTime ? undefined : "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(d);
}
export function todayAlgiers(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
export function sizesText(s: Record<string, number> | null | undefined): string {
  if (!s) return "";
  return Object.entries(s).map(([k, v]) => `${k}×${v}`).join(" · ");
}

export const ORDER_STATUS: Record<string, string> = {
  brouillon: "Brouillon", enregistree: "Enregistrée", confirmee: "Confirmée", en_production: "En production", prete: "Prête", expediee: "Expédiée",
  a_retirer: "À retirer", livree: "Livrée", retiree: "Retirée", annulee: "Annulée", retournee: "Retournée",
};
export const ORDER_TONE: Record<string, string> = {
  brouillon: "gray", enregistree: "blue", confirmee: "blue", en_production: "violet", prete: "green", expediee: "amber", a_retirer: "amber",
  livree: "green", retiree: "green", annulee: "red", retournee: "red",
};
export function orderDisplayStatus(o: { status: string; quote_id?: string | null; kind?: string }): string {
  if (o.status === "brouillon" && o.quote_id === null && (o.kind === "personnalise" || o.kind === "vierge")) return "enregistree";
  return o.status;
}

export const STEP_LABEL: Record<string, string> = {
  preparation_fichier: "Préparation du fichier", impression_dtf: "Impression DTF", flocage: "Flocage à la presse", broderie: "Broderie",
  preparation: "Préparation articles", controle: "Contrôle", emballage: "Emballage",
};
export const STATION_LABEL: Record<string, string> = {
  infographie: "Infographie", dtf: "Impression DTF", presse: "Presse", broderie: "Broderie", magasin: "Magasin", controle: "Contrôle", emballage: "Emballage",
};
export const TASK_STATUS: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", bloquee: "Bloquée", terminee: "Terminée", annulee: "Annulée" };
export const SHIP_STATUS: Record<string, string> = {
  preparation: "En préparation", expedie: "Expédié", en_transit: "En transit", livre: "Livré", echec: "Tentative échouée", retour: "Retourné", retire: "Retiré", annule: "Annulé",
};
export const PAY_METHOD: Record<string, string> = {
  especes: "Espèces", ccp: "CCP", baridimob: "BaridiMob", virement: "Virement", cheque: "Chèque", tpe: "TPE", yalidine_cod: "Yalidine (contre-remb.)",
};
export const PAY_STATUS: Record<string, string> = {
  attendu: "Attendu", confirme: "Confirmé", encaisse_transporteur: "Encaissé par Yalidine", rapproche: "Rapproché", annule: "Annulé",
};
export const FOLLOWUP_REASON: Record<string, string> = {
  nouveau_prospect: "Nouveau prospect", devis_sans_reponse: "Devis sans réponse", reactivation: "Réactivation", incident_livraison: "Incident livraison",
  retour_colis: "Colis retourné", solde: "Solde à encaisser", remboursement: "Remboursement", reprise: "Reprise", autre: "Autre",
};
export const DEAL_STAGES: [string, string][] = [
  ["nouveau", "Nouveau"], ["a_qualifier", "À qualifier"], ["simulation_envoyee", "Simulation envoyée"], ["devis_envoye", "Devis envoyé"], ["gagne", "Gagné"], ["perdu", "Perdu"],
];
export const SERVICES: Record<string, string> = { dtf: "DTF", broderie: "Broderie", flocage: "Flocage" };
export const PLACEMENTS: [string, string][] = [
  ["coeur", "Cœur (poitrine gauche)"], ["poitrine", "Poitrine centre"], ["dos_haut", "Haut du dos"], ["dos_complet", "Dos complet"],
  ["manche_gauche", "Manche gauche"], ["manche_droite", "Manche droite"], ["col", "Col / nuque"], ["bas", "Bas / ourlet"],
];
export const SOURCES = ["instagram", "facebook", "tiktok", "whatsapp", "bouche_a_oreille", "comptoir", "site", "salon", "autre"];
export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "2A", "4A", "6A", "8A", "10A", "12A", "U"];

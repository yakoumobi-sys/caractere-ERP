import type { Me } from "./auth";

export const STATIONS_BY_ROLE: Record<string, string[]> = {
  infographiste: ["infographie", "dtf"], floqueur: ["presse"], brodeur: ["broderie"], controleur: ["controle", "emballage"], magasinier: ["magasin", "emballage"],
};
export function myStations(me: Me) {
  return Array.from(new Set(me.roles.flatMap((r) => STATIONS_BY_ROLE[r] || [])));
}
// Tri : priorité manuelle tracée, tâches prêtes d'abord, puis délai promis, puis ancienneté
export const TASK_ORDER = "order by t.priority desc, (t.status = 'en_cours') desc, t.is_ready desc, t.promised_date nulls last, t.order_created_at, t.seq";
export function workerMe(me: Me) {
  return { staffId: me.staffId, canValidateFirstPiece: me.canValidateFirstPiece, isManager: me.can("settings"), canWork: me.can("workshop_work") };
}

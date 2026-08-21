// Parcours de la commande chez Caractère :
// WhatsApp -> Commercial -> Atelier (DTF ou Broderie) -> Flocage -> retour Commercial -> Livré

export type PipelineStage =
  | "reception_whatsapp"
  | "commercial"
  | "atelier_dtf"
  | "atelier_broderie"
  | "flocage"
  | "retour_commercial"
  | "livre";

export interface StageDef {
  value: PipelineStage;
  label: string;
  /** Département RH dont sont issus les employés assignables à cette étape */
  department: string | null;
}

export const PIPELINE_STAGES: StageDef[] = [
  { value: "reception_whatsapp", label: "Réception WhatsApp", department: "Réception WhatsApp" },
  { value: "commercial", label: "Commercial", department: "Commercial" },
  { value: "atelier_dtf", label: "Atelier DTF", department: "Atelier DTF" },
  { value: "atelier_broderie", label: "Atelier Broderie", department: "Atelier Broderie" },
  { value: "flocage", label: "Flocage", department: "Atelier Flocage" },
  { value: "retour_commercial", label: "Retour Commercial", department: "Commercial" },
  { value: "livre", label: "Livré au client", department: null },
];

export function stageLabel(stage: string) {
  return PIPELINE_STAGES.find((s) => s.value === stage)?.label ?? stage;
}

export function departmentForStage(stage: string) {
  return PIPELINE_STAGES.find((s) => s.value === stage)?.department ?? null;
}

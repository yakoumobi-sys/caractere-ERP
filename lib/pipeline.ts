// Parcours de la commande chez Caractère :
// Le commercial configure la commande (articles, personnalisation, technique)
// -> elle part dans la file de l'atelier concerné -> chaque prise en charge
// change son statut -> une fois prête, retour au commercial pour livraison.

export type Technique = "dtf" | "broderie" | "simple";

export type OrderStatus =
  | "attente_dtf"
  | "impression_dtf"
  | "attente_flocage"
  | "en_flocage"
  | "attente_broderie"
  | "en_broderie"
  | "attente_simple"
  | "en_simple"
  | "prete"
  | "livree";

export type QueueName = "dtf" | "broderie" | "simple" | "flocage" | "ready";

export const TECHNIQUES: { value: Technique; label: string }[] = [
  { value: "dtf", label: "DTF" },
  { value: "broderie", label: "Broderie" },
  { value: "simple", label: "Simple (flocage direct)" },
];

export const LOGO_PLACEMENTS: { value: string; label: string }[] = [
  { value: "coeur", label: "Coeur" },
  { value: "coeur_dos", label: "Coeur + dos" },
  { value: "dos", label: "Dos" },
  { value: "poitrine", label: "Poitrine" },
  { value: "special", label: "Spécial (préciser)" },
];

export const LOGO_SOURCES: { value: string; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "viber", label: "Viber" },
  { value: "email", label: "Email" },
];

/** Statut de départ dès que le commercial valide la technique choisie */
export function initialStatus(technique: Technique): OrderStatus {
  if (technique === "dtf") return "attente_dtf";
  if (technique === "broderie") return "attente_broderie";
  return "attente_simple";
}

interface StatusDef {
  value: OrderStatus;
  label: string;
  /** File dans laquelle la commande apparaît, ou null si terminée */
  queue: QueueName | null;
  /** Département RH suggéré pour l'assignation à cette étape */
  department: string | null;
  /** Statut suivant quand on clique sur le bouton d'action */
  next: OrderStatus | null;
  /** Libellé du bouton d'action ("Prendre la commande", "Marquer imprimée"...) */
  action: string | null;
}

export const STATUS_DEFS: Record<OrderStatus, StatusDef> = {
  attente_dtf: {
    value: "attente_dtf",
    label: "En attente (DTF)",
    queue: "dtf",
    department: "Atelier DTF",
    next: "impression_dtf",
    action: "Prendre la commande",
  },
  impression_dtf: {
    value: "impression_dtf",
    label: "Impression en cours",
    queue: "dtf",
    department: "Atelier DTF",
    next: "attente_flocage",
    action: "Marquer imprimée",
  },
  attente_flocage: {
    value: "attente_flocage",
    label: "Prêt pour flocage",
    queue: "flocage",
    department: "Atelier Flocage",
    next: "en_flocage",
    action: "Prendre la commande",
  },
  en_flocage: {
    value: "en_flocage",
    label: "En flocage",
    queue: "flocage",
    department: "Atelier Flocage",
    next: "prete",
    action: "Marquer terminée",
  },
  attente_broderie: {
    value: "attente_broderie",
    label: "En attente (Broderie)",
    queue: "broderie",
    department: "Atelier Broderie",
    next: "en_broderie",
    action: "Prendre la commande",
  },
  en_broderie: {
    value: "en_broderie",
    label: "En broderie",
    queue: "broderie",
    department: "Atelier Broderie",
    next: "prete",
    action: "Marquer terminée",
  },
  attente_simple: {
    value: "attente_simple",
    label: "En attente (Simple)",
    queue: "simple",
    department: null,
    next: "en_simple",
    action: "Prendre la commande",
  },
  en_simple: {
    value: "en_simple",
    label: "En cours (Simple)",
    queue: "simple",
    department: null,
    next: "prete",
    action: "Marquer terminée",
  },
  prete: {
    value: "prete",
    label: "Prête à livrer",
    queue: "ready",
    department: "Commercial",
    next: "livree",
    action: "Livrer au client",
  },
  livree: {
    value: "livree",
    label: "Livrée",
    queue: null,
    department: null,
    next: null,
    action: null,
  },
};

export const ALL_STATUSES = Object.values(STATUS_DEFS);

export function statusLabel(status: string) {
  return STATUS_DEFS[status as OrderStatus]?.label ?? status;
}

export function statusesForQueue(queue: QueueName): OrderStatus[] {
  return ALL_STATUSES.filter((s) => s.queue === queue).map((s) => s.value);
}

export const QUEUE_TITLES: Record<QueueName, string> = {
  dtf: "File DTF",
  broderie: "File Broderie",
  simple: "File Simple",
  flocage: "File Flocage",
  ready: "Commandes prêtes",
};

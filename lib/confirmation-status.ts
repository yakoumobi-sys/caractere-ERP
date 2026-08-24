// Statuts de confirmation d'une commande COD/web (file d'appel), avant
// qu'elle n'entre en fulfillment. Inspiré du parcours affiché par l'outil
// CodPilot utilisé par le canal "djebs store".

export const CONFIRMATION_STATUSES: { value: string; label: string; tone: "slate" | "blue" | "amber" | "green" | "red" }[] = [
  { value: "nouveau", label: "Nouveau", tone: "slate" },
  { value: "a_verifier", label: "À vérifier", tone: "amber" },
  { value: "a_confirmer", label: "À confirmer", tone: "amber" },
  { value: "appel_1", label: "Appel 1", tone: "blue" },
  { value: "appel_2", label: "Appel 2", tone: "blue" },
  { value: "appel_3", label: "Appel 3", tone: "blue" },
  { value: "appel_2_1", label: "Appel 2.1", tone: "blue" },
  { value: "appel_2_2", label: "Appel 2.2", tone: "blue" },
  { value: "appel_2_3", label: "Appel 2.3", tone: "blue" },
  { value: "appel_2_4", label: "Appel 2.4", tone: "blue" },
  { value: "appel_4_sms", label: "Appel 4 + SMS", tone: "blue" },
  { value: "reporte", label: "Reporté", tone: "amber" },
  { value: "injoignable", label: "Injoignable", tone: "red" },
  { value: "confirmee", label: "Confirmée", tone: "green" },
  { value: "confirmee_bot", label: "Confirmée (Bot)", tone: "green" },
  { value: "confirmee_rupture_stock", label: "Confirmée — rupture de stock", tone: "green" },
  { value: "double", label: "Double", tone: "red" },
  { value: "fausse_commande", label: "Fausse commande", tone: "red" },
  { value: "annulee", label: "Annulée", tone: "red" },
];

export const CONFIRMATION_STATUS_MAP = Object.fromEntries(CONFIRMATION_STATUSES.map((s) => [s.value, s]));

export const CONFIRMATION_TABS = [
  { key: "nouvelles", label: "Nouvelles", statuses: ["nouveau"] },
  {
    key: "en_cours",
    label: "En cours",
    statuses: ["a_verifier", "a_confirmer", "appel_1", "appel_2", "appel_3", "appel_2_1", "appel_2_2", "appel_2_3", "appel_2_4", "appel_4_sms", "reporte", "injoignable"],
  },
  { key: "confirmees", label: "Confirmées", statuses: ["confirmee", "confirmee_bot", "confirmee_rupture_stock"] },
  { key: "annulees", label: "Annulées", statuses: ["annulee", "double", "fausse_commande"] },
  { key: "tous", label: "Toutes", statuses: null },
] as const;

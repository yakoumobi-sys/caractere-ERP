/** Formes partagées entre la page stock (serveur) et ses composants clients. */

export type StockStatus = "rupture" | "faible" | "ok";

export interface StockRow {
  product_id: string;
  sku: string;
  name: string;
  unit: string | null;
  category_name: string | null;
  reorder_point: number;
  purchase_cost: number;
  quantity: number;
  stock_value: number;
  last_move_at: string | null;
  stock_status: StockStatus;
}

export interface WarehouseLevel {
  product_id: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
}

export interface WarehouseOption {
  id: string;
  name: string;
  is_default: boolean;
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  rupture: "Rupture",
  faible: "Sous le seuil",
  ok: "Disponible",
};

export const STATUS_TONE: Record<StockStatus, "red" | "amber" | "green"> = {
  rupture: "red",
  faible: "amber",
  ok: "green",
};

/**
 * Les quantités sont des numeric(12,2) : on affiche « 12 » et non « 12.00 »,
 * mais « 2.5 » reste « 2,5 » pour les articles vendus au mètre ou au kilo.
 */
export function formatQuantity(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);
}

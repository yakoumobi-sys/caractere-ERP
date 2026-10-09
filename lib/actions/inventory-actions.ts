"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManageStock } from "@/lib/roles";
import type { UserRole } from "@/types/database";

/**
 * État renvoyé aux formulaires de stock.
 *
 * L'ancienne version de `addStockMove` renvoyait `undefined` dès qu'un champ
 * manquait et jetait l'erreur Postgres brute sinon : dans le premier cas
 * l'opérateur voyait le formulaire se réinitialiser sans rien enregistrer, dans
 * le second l'écran d'erreur de Next.js remplaçait la page. Les deux issues se
 * lisaient de la même façon depuis l'atelier — « le stock ne s'enregistre
 * pas ». On rend donc chaque refus explicite, à l'écran, saisie conservée.
 */
export type StockFormState = { error: string | null; success: string | null };

export const emptyStockFormState: StockFormState = { error: null, success: null };

const uuid = z.string().uuid("Sélection invalide");

const moveSchema = z.object({
  product_id: uuid,
  warehouse_id: uuid,
  type: z.enum(["entree", "sortie", "ajustement"], {
    errorMap: () => ({ message: "Type de mouvement inconnu" }),
  }),
  quantity: z.coerce
    .number({ invalid_type_error: "Quantité invalide" })
    .refine((n) => Number.isFinite(n) && n !== 0, "La quantité doit être différente de zéro"),
  note: z.string().max(500, "Note trop longue").optional(),
});

const transferSchema = z.object({
  product_id: uuid,
  from_warehouse_id: uuid,
  to_warehouse_id: uuid,
  quantity: z.coerce.number({ invalid_type_error: "Quantité invalide" }).positive("La quantité doit être positive"),
  note: z.string().max(500, "Note trop longue").optional(),
});

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Saisie invalide";
}

/** Le rôle de l'utilisateur, ou null s'il n'est pas connecté / actif. */
async function activeRole(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: null as UserRole | null };

  const { data } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).single();
  if (!data?.is_active) return { userId: user.id, role: null as UserRole | null };
  return { userId: user.id, role: data.role as UserRole };
}

function revalidateStock() {
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/movements");
  revalidatePath("/dashboard");
}

/**
 * Entrée, sortie ou ajustement sur un article.
 *
 * Le signe est décidé ici et non par l'opérateur : une sortie est toujours
 * négative, une entrée toujours positive. Un ajustement garde le signe saisi —
 * c'est le seul cas où « -3 » veut dire quelque chose (correction d'inventaire
 * à la baisse), et la contrainte stock_moves_sens_coherent (migration 0038) le
 * garantit désormais aussi côté base.
 */
export async function addStockMove(
  _prevState: StockFormState,
  formData: FormData
): Promise<StockFormState> {
  const parsed = moveSchema.safeParse({
    product_id: formData.get("product_id"),
    warehouse_id: formData.get("warehouse_id"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    note: (formData.get("note") as string) || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error), success: null };

  const { product_id, warehouse_id, type, note } = parsed.data;
  const supabase = createClient();

  const { userId, role } = await activeRole(supabase);
  if (!userId) return { error: "Session expirée — reconnectez-vous.", success: null };
  if (!canManageStock(role ?? undefined)) {
    return { error: "Votre rôle ne permet pas de gérer le stock : mouvement non enregistré.", success: null };
  }

  const magnitude = Math.abs(parsed.data.quantity);
  const quantity =
    type === "sortie" ? -magnitude : type === "entree" ? magnitude : parsed.data.quantity;

  const { error } = await supabase.from("stock_moves").insert({
    product_id,
    warehouse_id,
    type,
    quantity,
    note: note ?? null,
    reference: type === "ajustement" ? "Ajustement manuel" : "Saisie manuelle",
    created_by: userId,
  });
  if (error) return { error: error.message, success: null };

  revalidateStock();

  const label = type === "sortie" ? "Sortie" : type === "entree" ? "Entrée" : "Ajustement";
  return { error: null, success: `${label} de ${magnitude} enregistrée.` };
}

/**
 * Transfert d'un entrepôt à un autre.
 *
 * Passe par la fonction `stock_transfer` (migration 0038) : les deux écritures
 * — sortie ici, entrée là-bas — doivent réussir ou échouer ensemble, sans quoi
 * la marchandise disparaît d'un entrepôt sans arriver dans l'autre.
 */
export async function transferStock(
  _prevState: StockFormState,
  formData: FormData
): Promise<StockFormState> {
  const parsed = transferSchema.safeParse({
    product_id: formData.get("product_id"),
    from_warehouse_id: formData.get("from_warehouse_id"),
    to_warehouse_id: formData.get("to_warehouse_id"),
    quantity: formData.get("quantity"),
    note: (formData.get("note") as string) || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error), success: null };

  const { product_id, from_warehouse_id, to_warehouse_id, quantity, note } = parsed.data;
  if (from_warehouse_id === to_warehouse_id) {
    return { error: "Choisissez deux entrepôts différents.", success: null };
  }

  const supabase = createClient();
  const { userId, role } = await activeRole(supabase);
  if (!userId) return { error: "Session expirée — reconnectez-vous.", success: null };
  if (!canManageStock(role ?? undefined)) {
    return { error: "Votre rôle ne permet pas de gérer le stock : transfert non enregistré.", success: null };
  }

  const { error } = await supabase.rpc("stock_transfer", {
    p_product_id: product_id,
    p_from_wh: from_warehouse_id,
    p_to_wh: to_warehouse_id,
    p_quantity: quantity,
    p_note: note ?? null,
  });
  if (error) return { error: error.message, success: null };

  revalidateStock();
  return { error: null, success: `Transfert de ${quantity} enregistré.` };
}

/**
 * Seuil de réapprovisionnement d'un article.
 *
 * Modifiable depuis l'écran de stock : le seuil se règle en regardant les
 * quantités, pas en ouvrant la fiche produit dans un autre onglet.
 */
export async function setReorderPoint(
  _prevState: StockFormState,
  formData: FormData
): Promise<StockFormState> {
  const parsed = z
    .object({
      product_id: uuid,
      reorder_point: z.coerce
        .number({ invalid_type_error: "Seuil invalide" })
        .min(0, "Le seuil ne peut pas être négatif"),
    })
    .safeParse({
      product_id: formData.get("product_id"),
      reorder_point: formData.get("reorder_point"),
    });
  if (!parsed.success) return { error: firstIssue(parsed.error), success: null };

  const supabase = createClient();
  const { userId, role } = await activeRole(supabase);
  if (!userId) return { error: "Session expirée — reconnectez-vous.", success: null };
  if (!canManageStock(role ?? undefined)) {
    return { error: "Votre rôle ne permet pas de gérer le stock : seuil non modifié.", success: null };
  }

  const { error } = await supabase
    .from("products")
    .update({ reorder_point: parsed.data.reorder_point })
    .eq("id", parsed.data.product_id);
  if (error) return { error: error.message, success: null };

  revalidateStock();
  return { error: null, success: "Seuil mis à jour." };
}

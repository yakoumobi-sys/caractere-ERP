"use server";

import { createClient } from "@/lib/supabase/server";

export interface CatalogResult {
  value?: string;
  error?: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
}

export interface ProductResult {
  product?: CatalogProduct;
  error?: string;
}

/** Slug ASCII simple pour construire un SKU lisible à partir du nom saisi. */
function skuFrom(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "ARTICLE"
  );
}

/**
 * Ajoute un article au catalogue depuis le configurateur de commande.
 * Le commercial ne crée un produit que volontairement (bouton « Créer »), à la
 * différence de l'ancien comportement qui en fabriquait un par ligne saisie et
 * remplissait le stock de doublons (« TSHIRT » ×5, « Tshirr »...).
 */
export async function createCatalogProduct(rawName: string): Promise<ProductResult> {
  const name = rawName.trim();
  if (!name) return { error: "Le nom de l'article est requis." };

  const supabase = createClient();

  // Déjà au catalogue (à la casse près) : on réutilise au lieu de dupliquer.
  const { data: existing } = await supabase.from("products").select("id, name").ilike("name", name).limit(1);
  if (existing && existing.length > 0) return { product: existing[0] as CatalogProduct };

  const base = skuFrom(name);
  const { data: taken } = await supabase.from("products").select("sku").like("sku", `${base}%`);
  const used = new Set((taken ?? []).map((p: { sku: string }) => p.sku));
  let sku = base;
  for (let i = 2; used.has(sku); i++) sku = `${base}-${i}`;

  const { data: created, error } = await supabase
    .from("products")
    .insert({
      name,
      sku,
      unit: "unité",
      sale_price: 0,
      purchase_cost: 0,
      tax_rate: 20,
      track_inventory: true,
      is_active: true,
    })
    .select("id, name")
    .single();
  if (error || !created) return { error: `Impossible de créer l'article : ${error?.message ?? "erreur inconnue"}` };

  return { product: created as CatalogProduct };
}

export async function createCatalogColor(rawColor: string): Promise<CatalogResult> {
  const color = rawColor.trim();
  if (!color) return { error: "La couleur est requise." };

  const supabase = createClient();
  const { data: existing } = await supabase.from("product_colors").select("color").ilike("color", color).limit(1);
  if (existing && existing.length > 0) return { value: existing[0].color };

  const { error } = await supabase.from("product_colors").insert({ color });
  if (error) return { error: `Impossible d'ajouter la couleur : ${error.message}` };

  return { value: color };
}

export async function createCatalogSize(rawSize: string): Promise<CatalogResult> {
  const size = rawSize.trim();
  if (!size) return { error: "La taille est requise." };

  const supabase = createClient();
  const { data: existing } = await supabase.from("product_sizes").select("size").ilike("size", size).limit(1);
  if (existing && existing.length > 0) return { value: existing[0].size };

  const { error } = await supabase.from("product_sizes").insert({ size });
  if (error) return { error: `Impossible d'ajouter la taille : ${error.message}` };

  return { value: size };
}

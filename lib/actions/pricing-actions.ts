"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Calcule le coût DTF basé sur la longueur en cm
 * Formule: (longueur_cm / 100) × 700 DA/m
 */
export async function calculateDTFCost(
  productId: string,
  dtfLengthCm: number
): Promise<number> {
  if (dtfLengthCm <= 0) return 0;

  const supabase = createClient();

  // Récupérer le coût DTF par mètre du produit
  const { data, error } = await supabase
    .from("products")
    .select("dtf_cost_per_meter")
    .eq("id", productId)
    .single();

  if (error || !data) {
    throw new Error("Produit introuvable");
  }

  const dtfCostPerMeter = data.dtf_cost_per_meter || 700;
  // Formule: (longueur en cm / 100) × coût par mètre
  const dtfCost = (dtfLengthCm / 100) * dtfCostPerMeter;

  return Math.round(dtfCost * 100) / 100;
}

/**
 * Calcule le prix final d'une commande avec DTF
 * Prix final = Prix de vente + Coût DTF
 */
export async function calculateFinalPrice(
  productId: string,
  dtfLengthCm: number = 0
): Promise<{
  basePrice: number;
  dtfCost: number;
  finalPrice: number;
}> {
  const supabase = createClient();

  // Récupérer le prix de vente
  const { data: product, error } = await supabase
    .from("products")
    .select("sale_price, dtf_cost_per_meter")
    .eq("id", productId)
    .single();

  if (error || !product) {
    throw new Error("Produit introuvable");
  }

  const basePrice = product.sale_price || 0;
  const dtfCost = await calculateDTFCost(productId, dtfLengthCm);
  const finalPrice = basePrice + dtfCost;

  return {
    basePrice,
    dtfCost,
    finalPrice: Math.round(finalPrice * 100) / 100,
  };
}

/**
 * Récupère toutes les variantes d'un produit
 */
export async function getProductVariants(productId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, size, color, sku")
    .eq("product_id", productId)
    .order("size");

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Récupère les infos de tarification pour une variante
 */
export async function getVariantPricing(variantId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("variant_pricing")
    .select("sale_price, margin_amount, margin_percent")
    .eq("product_variant_id", variantId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Récupère tous les produits avec leurs coûts
 */
export async function getProductsWithCosts() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, product_base_name, product_variant, cost_price, sale_price, dtf_cost_per_meter, requires_dtf"
    )
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Crée un nouveau produit avec auto-variantes
 */
export async function createProductWithVariants(
  name: string,
  baseName: string,
  variant: string,
  costPrice: number,
  salePrice: number,
  requiresDTF: boolean = true
) {
  const supabase = createClient();

  // Créer le produit
  const { data: product, error } = await supabase
    .from("products")
    .insert({
      name,
      product_base_name: baseName,
      product_variant: variant,
      cost_price: costPrice,
      sale_price: salePrice,
      unit: "unité",
      requires_dtf: requiresDTF,
      track_inventory: true,
      is_active: true,
      dtf_cost_per_meter: 700, // Valeur par défaut
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // Le trigger create_product_variants_trigger crée automatiquement les 5 variantes (S/M/L/XL/XXL)

  return product;
}

/**
 * Récupère les prix du produit et DTF pour une commande
 */
export async function getOrderPricing(
  productId: string,
  dtfLengthCm: number = 0
) {
  const pricing = await calculateFinalPrice(productId, dtfLengthCm);
  return pricing;
}

/**
 * Récupère tous les produits pour l'affichage (avec variantes)
 */
export async function getProductsForDisplay() {
  const supabase = createClient();

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      product_base_name,
      product_variant,
      cost_price,
      sale_price,
      requires_dtf,
      product_variants (
        id,
        size,
        color,
        sku
      )
    `
    )
    .eq("is_active", true)
    .order("name");

  if (productsError) {
    throw new Error(productsError.message);
  }

  return products || [];
}

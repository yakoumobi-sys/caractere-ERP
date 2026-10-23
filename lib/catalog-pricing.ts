export interface QuantityPrice { min: number; price: number }
export interface CatalogPricing { sale_price?: number | null; quantity_prices?: QuantityPrice[] | null; minimum_quantity?: number; quote_required?: boolean }
export function catalogPrice(product: CatalogPricing, quantity: number): number | null {
  if (product.quote_required || quantity < (product.minimum_quantity ?? 1)) return null;
  const tier = [...(product.quantity_prices ?? [])].filter(t => t.min <= quantity).sort((a,b) => b.min-a.min)[0];
  return tier ? Number(tier.price) : Number(product.sale_price ?? 0);
}

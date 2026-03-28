/**
 * Format a price for display. Shows 2 decimal places for normal prices,
 * but enough decimal places for very small values (< $0.01).
 */
export function formatPrice(value: number): string {
  if (value < 0.01 && value > 0) {
    // Use toFixed with enough decimals to show significant digits, then trim trailing zeros
    const s = value.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  return value.toFixed(2);
}

/**
 * Compute the total cost for a BOM item.
 */
export function bomItemTotal(item: { totalCost: number }): number {
  return item.totalCost;
}

/**
 * Compute the total BOM cost including items, tax, and shipping.
 * Filters to approved/pending items only. Null tax/shipping default to 0.
 */
export function totalBomCost(
  bomItems: Array<{ totalCost: number; status: string }>,
  bomTax?: number | null,
  bomShipping?: number | null,
): number {
  const itemsTotal = bomItems
    .filter((b) => b.status === "approved" || b.status === "pending")
    .reduce((sum, b) => sum + b.totalCost, 0)
  return itemsTotal + (bomTax ?? 0) + (bomShipping ?? 0)
}

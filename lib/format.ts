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

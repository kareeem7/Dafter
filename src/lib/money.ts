/**
 * Money helpers. Money is ALWAYS an integer number of piastres.
 * Floats are never used for money — EGP has 2 decimal places, so
 * piastres = whole units * 100.
 */

/** Parse an EGP string like "12.5" or "١٢,٥" style inputs into integer piastres. */
export function parseEgpToPiastres(input: string): number {
  const cleaned = input.trim().replace(/[,\s]/g, '');
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === '') {
    throw new Error(`Invalid amount: "${input}"`);
  }
  const [whole, fraction = ''] = cleaned.split('.');
  const wholePiastres = (whole === '' ? 0 : Number(whole)) * 100;
  const fractionPiastres = Number((fraction + '00').slice(0, 2));
  return wholePiastres + fractionPiastres;
}

/** Format integer piastres as "1,234.56 ج.م". Never produces float math. */
export function formatPiastres(piastres: number): string {
  if (!Number.isInteger(piastres)) {
    throw new Error(`Expected integer piastres, got ${piastres}`);
  }
  const sign = piastres < 0 ? '-' : '';
  const abs = Math.abs(piastres);
  const egp = Math.floor(abs / 100);
  const fraction = abs % 100;
  return `${sign}${egp.toLocaleString('en-US')}.${String(fraction).padStart(2, '0')} ج.م`;
}

/** Compact form for summaries: "1.2K ج.م" style is avoided — keep exact. */
export function sumPiastres(values: readonly number[]): number {
  return values.reduce((total, value) => {
    if (!Number.isInteger(value)) {
      throw new Error(`Expected integer piastres, got ${value}`);
    }
    return total + value;
  }, 0);
}

import { describe, expect, it } from 'vitest';
import { formatPiastres, parseEgpToPiastres, sumPiastres, tryParseEgpToPiastres } from './money';

describe('money (integer piastres only)', () => {
  it('parses EGP strings to integer piastres', () => {
    expect(parseEgpToPiastres('12.5')).toBe(1250);
    expect(parseEgpToPiastres('0.25')).toBe(25);
    expect(parseEgpToPiastres('1000')).toBe(100000);
    expect(parseEgpToPiastres('0.01')).toBe(1);
  });

  it('rejects invalid amounts loudly', () => {
    expect(() => parseEgpToPiastres('abc')).toThrow();
    expect(() => parseEgpToPiastres('1.234')).toThrow();
    expect(() => parseEgpToPiastres('')).toThrow();
  });

  it('tryParse returns 0 for invalid input instead of throwing (safe for live calc)', () => {
    expect(tryParseEgpToPiastres('abc')).toBe(0);
    expect(tryParseEgpToPiastres('1.234')).toBe(0);
    expect(tryParseEgpToPiastres('')).toBe(0);
    expect(tryParseEgpToPiastres('12.5')).toBe(1250);
  });

  it('formats piastres back to EGP without float drift', () => {
    expect(formatPiastres(1250)).toBe('12.50 ج.م');
    expect(formatPiastres(1)).toBe('0.01 ج.م');
    expect(formatPiastres(1234567)).toBe('12,345.67 ج.م');
    expect(formatPiastres(-2500)).toBe('-25.00 ج.م');
  });

  it('rejects non-integer money', () => {
    expect(() => formatPiastres(1.5)).toThrow();
    expect(() => sumPiastres([1, 2, 0.5])).toThrow();
  });

  it('sums exactly, no float drift', () => {
    expect(sumPiastres([0.01, 0.02, 0.03].map((n) => Math.round(n * 100)))).toBe(6);
    expect(sumPiastres([999999, 1])).toBe(1000000);
  });
});

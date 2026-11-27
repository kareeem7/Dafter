import { describe, expect, it } from 'vitest';
import { formatPiastres, sumPiastres } from './money';
import type { Sale } from '../types';

function sale(total: number, method: 'cash' | 'debt', createdAt: number): Sale {
  return {
    id: `s-${total}-${createdAt}`,
    shopId: 'shop',
    customerId: null,
    items: [{ name: 'x', quantity: 1, unitPiastres: total }],
    totalPiastres: total,
    paidPiastres: method === 'cash' ? total : 0,
    method,
    createdAt,
    serverId: null,
  };
}

describe('daily close math', () => {
  it('sums only today sales', () => {
    const now = new Date('2026-11-27T12:00:00');
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 24 * 3600 * 1000;
    const sales = [sale(1000, 'cash', today), sale(2000, 'cash', today), sale(5000, 'cash', yesterday)];
    const todays = sales.filter((s) => {
      const d = new Date(s.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    });
    expect(sumPiastres(todays.map((s) => s.totalPiastres))).toBe(3000);
  });

  it('cash received excludes debt sales', () => {
    const sales = [sale(1000, 'cash', 1), sale(2000, 'debt', 2), sale(3000, 'cash', 3)];
    const cash = sumPiastres(sales.filter((s) => s.method === 'cash').map((s) => s.totalPiastres));
    expect(cash).toBe(4000);
  });

  it('expected cash = opening + cash received', () => {
    const opening = 50000;
    const cashReceived = 15000;
    const expected = opening + cashReceived;
    expect(expected).toBe(65000);
    expect(formatPiastres(expected)).toBe('650.00 ج.م');
  });

  it('computes the difference between counted and expected', () => {
    const opening = 10000;
    const cashReceived = 9000;
    const expected = opening + cashReceived; // 19000
    const counted = 19500;
    const difference = counted - expected;
    expect(difference).toBe(500);
    expect(formatPiastres(difference)).toBe('5.00 ج.م');
  });
});

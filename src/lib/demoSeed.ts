/**
 * demoSeed.ts — pre-populated demo data so the site shows a realistic,
 * fully-working ledger immediately (a portfolio demo shouldn't start empty).
 *
 * Seeds: a shop, several customers with debts, a day's worth of sales, and
 * outbox entries so the sync state is visible. Uses the same mutation path
 * as real usage, so the demo behaves exactly like the real app.
 */

import type { Customer, DailyClose, Sale, FieldState } from '../types';
import { uuid } from './uuid';
import type { LocalReplica } from '../db/localReplica';
import type { Outbox } from '../sync/outbox';

const NOW = Date.now();
const TODAY = new Date();
const todayStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()).getTime();

const DEMO_SHOP = { id: 'demo-shop', name: 'محل السعادة', createdAt: NOW - 7 * 86400_000 };

const field = (value: string | number, updatedAt: number, device: string): FieldState => ({
  value,
  updatedAt,
  device,
});

const CUSTOMERS: Array<{ name: string; phone: string; balance: number }> = [
  { name: 'أحمد حسن', phone: '01001234567', balance: 12500 },
  { name: 'سالم عيد', phone: '01119876543', balance: 8000 },
  { name: 'فاطمة على', phone: '01223456789', balance: 300 },
];

interface SeedItem {
  name: string;
  quantity: number;
  unitPiastres: number;
}

const SALES: Array<{ customer: string | null; method: 'cash' | 'debt'; items: SeedItem[]; ageMin: number }> = [
  { customer: null, method: 'cash', items: [{ name: 'بن', quantity: 1, unitPiastres: 12000 }], ageMin: 6 },
  { customer: null, method: 'cash', items: [{ name: 'خبز', quantity: 3, unitPiastres: 100 }, { name: 'حليب', quantity: 2, unitPiastres: 1500 }], ageMin: 22 },
  { customer: 'أحمد حسن', method: 'debt', items: [{ name: 'سكر', quantity: 2, unitPiastres: 2500 }], ageMin: 40 },
  { customer: null, method: 'cash', items: [{ name: 'زيت', quantity: 1, unitPiastres: 4500 }], ageMin: 70 },
  { customer: 'فاطمة على', method: 'debt', items: [{ name: 'أرز', quantity: 1, unitPiastres: 3000 }], ageMin: 95 },
  { customer: null, method: 'cash', items: [{ name: 'تمر', quantity: 1, unitPiastres: 1800 }], ageMin: 120 },
];

/**
 * Seed a fully-populated demo state. Returns the seeded shop id.
 */
export async function seedDemoData(replica: LocalReplica, outbox: Outbox): Promise<string> {
  // Shop
  await replica.saveShop(DEMO_SHOP);

  // Customers with debt balances
  const customerIds: Record<string, string> = {};
  for (const c of CUSTOMERS) {
    const id = uuid();
    customerIds[c.name] = id;
    const customer: Customer = {
      id,
      shopId: DEMO_SHOP.id,
      fields: {
        name: field(c.name, NOW - 3600_000, 'demo-device'),
        phone: field(c.phone, NOW - 3600_000, 'demo-device'),
        balancePiastres: field(c.balance, NOW - 3600_000, 'demo-device'),
      },
      createdAt: NOW - 2 * 86400_000,
    };
    await replica.putCustomer(customer);
    await outbox.enqueue('customer.create', { customerId: id, shopId: DEMO_SHOP.id, name: c.name, phone: c.phone });
  }

  // Sales across "today"
  for (const s of SALES) {
    const total = s.items.reduce((sum, item) => sum + item.unitPiastres * item.quantity, 0);
    const createdAt = todayStart + (24 * 60 - s.ageMin) * 60_000;
    const sale: Sale = {
      id: uuid(),
      shopId: DEMO_SHOP.id,
      customerId: s.customer ? customerIds[s.customer] : null,
      items: s.items,
      totalPiastres: total,
      paidPiastres: s.method === 'cash' ? total : 0,
      method: s.method,
      createdAt,
      serverId: null,
    };
    await replica.putSale(sale);
    await outbox.enqueue('sale.create', {
      saleId: sale.id,
      type: 'sale.create',
      device: 'demo-device',
      totalPiastres: total,
      paidPiastres: sale.paidPiastres,
      method: s.method,
      items: s.items,
      deviceCreatedAt: sale.createdAt,
    });
  }

  // A close from a previous day so the closes list isn't empty
  const yesterday = new Date(TODAY.getTime() - 86400_000);
  const close: DailyClose = {
    id: uuid(),
    shopId: DEMO_SHOP.id,
    day: `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`,
    openingPiastres: 20000,
    salesTotalPiastres: 54000,
    returnsTotalPiastres: 0,
    cashPiastres: 74000,
    createdAt: yesterday.getTime() + 86400_000 - 60_000,
  };
  await replica.putClose(close);
  await outbox.enqueue('close.create', {
    closeId: close.id,
    day: close.day,
    openingPiastres: close.openingPiastres,
    salesTotalPiastres: close.salesTotalPiastres,
    returnsTotalPiastres: close.returnsTotalPiastres,
    cashPiastres: close.cashPiastres,
  });

  return DEMO_SHOP.id;
}

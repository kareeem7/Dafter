import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { createLocalReplica, STORE_REPLICA, STORE_META } from './localReplica';
import type { Sale, Shop } from '../types';
import { uuid } from '../lib/uuid';

function makeSale(shopId: string, total = 1000): Sale {
  return {
    id: uuid(),
    shopId,
    customerId: null,
    items: [{ name: 'بن', quantity: 1, unitPiastres: total }],
    totalPiastres: total,
    paidPiastres: total,
    method: 'cash',
    createdAt: Date.now(),
    serverId: null,
  };
}

describe('localReplica (IndexedDB)', () => {
  let replica: ReturnType<typeof createLocalReplica>;
  const shop: Shop = { id: 'shop-1', name: 'محل السعادة', createdAt: 0 };

  beforeEach(async () => {
    replica = createLocalReplica();
    await replica.open();
    // fake-indexeddb is a singleton — clear any data left by previous tests.
    const db = (replica as unknown as { db: IDBDatabase }).db;
    const tx = db.transaction([STORE_REPLICA, STORE_META], 'readwrite');
    tx.objectStore(STORE_REPLICA).clear();
    tx.objectStore(STORE_META).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await replica.saveShop(shop);
  });

  it('persists a shop across reload', async () => {
    const reopened = createLocalReplica();
    await reopened.open();
    const loaded = await reopened.getShop();
    expect(loaded?.name).toBe('محل السعادة');
  });

  it('saves a sale offline and survives a reload', async () => {
    const sale = makeSale(shop.id, 2500);
    await replica.putSale(sale);

    const reopened = createLocalReplica();
    await reopened.open();
    const sales = await reopened.listSales(shop.id);
    expect(sales).toHaveLength(1);
    expect(sales[0].totalPiastres).toBe(2500);
    expect(sales[0].id).toBe(sale.id);
  });

  it('lists sales newest first and scoped to one shop', async () => {
    await replica.putSale(makeSale(shop.id, 100));
    await replica.putSale(makeSale(shop.id, 200));
    await replica.putSale(makeSale('other-shop', 999));

    const sales = await replica.listSales(shop.id);
    expect(sales).toHaveLength(2);
    expect(sales[0].totalPiastres).toBe(200); // newest first
  });

  it('keeps two offline sales distinct (no dedup collision)', async () => {
    const a = makeSale(shop.id, 100);
    const b = makeSale(shop.id, 200);
    await replica.putSale(a);
    await replica.putSale(b);
    const sales = await replica.listSales(shop.id);
    expect(sales.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { createLocalReplica, STORE_REPLICA, STORE_META, STORE_OUTBOX } from '../db/localReplica';
import { Outbox } from '../sync/outbox';
import { createOutboxStore } from '../db/localReplica';
import { seedDemoData } from './demoSeed';

describe('demo seed', () => {
  let replica: ReturnType<typeof createLocalReplica>;

  beforeEach(async () => {
    replica = createLocalReplica();
    await replica.open();
    const db = (replica as unknown as { db: IDBDatabase }).db;
    const tx = db.transaction([STORE_REPLICA, STORE_META, STORE_OUTBOX], 'readwrite');
    tx.objectStore(STORE_REPLICA).clear();
    tx.objectStore(STORE_META).clear();
    tx.objectStore(STORE_OUTBOX).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });

  it('seeds a shop, customers with debts, sales, and outbox mutations', async () => {
    const outbox = new Outbox(createOutboxStore(replica), { now: () => Date.now(), random: () => 0.5 });
    await outbox.load();

    const shopId = await seedDemoData(replica, outbox);
    expect(shopId).toBe('demo-shop');

    // Shop created
    const shop = await replica.getShop();
    expect(shop?.name).toBe('محل السعادة');

    // 3 customers, each with a debt balance
    const customers = await replica.listCustomers(shopId);
    expect(customers).toHaveLength(3);
    const debt = customers.reduce((sum, c) => sum + (Number(c.fields.balancePiastres?.value) || 0), 0);
    expect(debt).toBeGreaterThan(0);

    // Sales seeded for today
    const sales = await replica.listSales(shopId);
    expect(sales.length).toBeGreaterThanOrEqual(5);

    // Outbox has pending mutations (so sync is visible)
    expect(outbox.getPending().length).toBeGreaterThan(0);
  });

  it('seeded data is independent per seed (idempotent-ish: re-seeding overwrites)', async () => {
    const outbox = new Outbox(createOutboxStore(replica), { now: () => Date.now(), random: () => 0.5 });
    await outbox.load();
    await seedDemoData(replica, outbox);
    const first = (await replica.listSales('demo-shop')).length;

    // Clear and re-seed
    const db = (replica as unknown as { db: IDBDatabase }).db;
    const tx = db.transaction([STORE_REPLICA, STORE_META, STORE_OUTBOX], 'readwrite');
    tx.objectStore(STORE_REPLICA).clear();
    tx.objectStore(STORE_META).clear();
    tx.objectStore(STORE_OUTBOX).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const outbox2 = new Outbox(createOutboxStore(replica), { now: () => Date.now(), random: () => 0.5 });
    await outbox2.load();
    await seedDemoData(replica, outbox2);
    const second = (await replica.listSales('demo-shop')).length;

    expect(second).toBe(first);
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { createLocalReplica, createOutboxStore, STORE_OUTBOX, STORE_REPLICA, STORE_META } from './localReplica';
import { Outbox } from '../sync/outbox';

/**
 * Database connection test — proves the local database (IndexedDB) is
 * reachable and that the full wiring (replica + outbox store) works
 * together, exactly as App does on startup. This is the test that would
 * have caught the original "stuck on loading" bug (a missing store).
 */
describe('database connection', () => {
  beforeEach(async () => {
    const replica = createLocalReplica();
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

  it('opens the database and every required store exists', async () => {
    const replica = createLocalReplica();
    await replica.open();
    const db = (replica as unknown as { db: IDBDatabase }).db;
    // If any store were missing, this would throw and the app would hang.
    expect(db.objectStoreNames.contains(STORE_REPLICA)).toBe(true);
    expect(db.objectStoreNames.contains(STORE_META)).toBe(true);
    expect(db.objectStoreNames.contains(STORE_OUTBOX)).toBe(true);
  });

  it('the outbox can be loaded and written through the real database store', async () => {
    const replica = createLocalReplica();
    await replica.open();

    // This is the exact wiring App uses on startup.
    const outbox = new Outbox(createOutboxStore(replica), { now: () => Date.now(), random: () => 0.5 });
    await outbox.load(); // reads from the outbox store

    const entry = await outbox.enqueue('sale.create', { saleId: 's1' });
    expect(outbox.getPending()).toHaveLength(1);

    // Reload from the same database — the entry must persist.
    const reopened = new Outbox(createOutboxStore(replica), { now: () => Date.now(), random: () => 0.5 });
    await reopened.load();
    expect(reopened.getPending()).toHaveLength(1);
    expect(reopened.getPending()[0].id).toBe(entry.id);
  });

  it('the replica can save and read through the real database', async () => {
    const replica = createLocalReplica();
    await replica.open();
    await replica.saveShop({ id: 'shop-1', name: 'محل', createdAt: 0 });

    const reopened = createLocalReplica();
    await reopened.open();
    const shop = await reopened.getShop();
    expect(shop?.name).toBe('محل');
  });
});

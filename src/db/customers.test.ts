import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { createLocalReplica, STORE_REPLICA, STORE_META } from './localReplica';
import type { Customer, FieldState } from '../types';
import { mergeFieldMaps } from '../sync/conflict';

function field(value: string | number, updatedAt: number, device: string): FieldState {
  return { value, updatedAt, device };
}

describe('customer debt book (field-level merge)', () => {
  let replica: ReturnType<typeof createLocalReplica>;
  const shop = { id: 'shop-1', name: 'محل', createdAt: 0 };

  beforeEach(async () => {
    replica = createLocalReplica();
    await replica.open();
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

  it('creates a customer with a zero balance', async () => {
    const customer: Customer = {
      id: 'c1',
      shopId: shop.id,
      fields: {
        name: field('أحمد', 1, 'dev1'),
        phone: field('0100', 1, 'dev1'),
        balancePiastres: field(0, 1, 'dev1'),
      },
      createdAt: 1,
    };
    await replica.putCustomer(customer);
    const list = await replica.listCustomers(shop.id);
    expect(list).toHaveLength(1);
    expect(list[0].fields.balancePiastres.value).toBe(0);
  });

  it('merges a balance patch and a phone patch from two devices into BOTH fields', async () => {
    const customer: Customer = {
      id: 'c1',
      shopId: shop.id,
      fields: {
        name: field('سالم', 1, 'dev1'),
        phone: field('0100', 1, 'dev1'),
        balancePiastres: field(0, 1, 'dev1'),
      },
      createdAt: 1,
    };
    await replica.putCustomer(customer);

    // Device 1 patches the balance; device 2 patches the phone concurrently.
    const phonePatch = { phone: field('0111', 2, 'dev2') };
    const balancePatch = { balancePiastres: field(50000, 2, 'dev1') };

    const current = (await replica.listCustomers(shop.id))[0];
    const mergedPhone = mergeFieldMaps(current.fields, phonePatch);
    const merged = mergeFieldMaps(mergedPhone, balancePatch);

    await replica.putCustomer({ ...current, fields: merged });

    const final = (await replica.listCustomers(shop.id))[0];
    expect(final.fields.phone.value).toBe('0111');
    expect(final.fields.balancePiastres.value).toBe(50000);
    expect(final.fields.name.value).toBe('سالم');
  });

  it('never overwrites a field with a stale timestamp', async () => {
    const customer: Customer = {
      id: 'c1',
      shopId: shop.id,
      fields: { balancePiastres: field(1000, 5, 'dev1') },
      createdAt: 1,
    };
    await replica.putCustomer(customer);
    const stale = mergeFieldMaps(customer.fields, { balancePiastres: field(9999, 1, 'dev2') });
    expect(stale.balancePiastres.value).toBe(1000);
  });
});

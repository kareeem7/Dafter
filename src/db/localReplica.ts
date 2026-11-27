/**
 * localReplica.ts — the IndexedDB-backed local replica.
 *
 * The device is the source of truth. This layer owns three stores:
 *   - replica:   the normalized local copy of every record (sales, customers, ...)
 *   - outbox:    the durable queue of mutations awaiting sync (delegated to Outbox)
 *   - meta:      small key/value state (shop id, device id)
 *
 * Everything here is synchronous-ish (promises) and fully offline.
 */

import type { Customer, Mutation, Sale, Shop, DailyClose, ReturnRecord } from '../types';
import { uuid } from '../lib/uuid';

const DB_NAME = 'dafter';
const DB_VERSION = 1;

export const STORE_REPLICA = 'replica';
export const STORE_META = 'meta';

type ReplicaRecord =
  | (Sale & { kind: 'sale' })
  | (Customer & { kind: 'customer' })
  | (ReturnRecord & { kind: 'return' })
  | (DailyClose & { kind: 'close' });

export interface LocalReplica {
  open(): Promise<void>;
  getShop(): Promise<Shop | undefined>;
  saveShop(shop: Shop): Promise<void>;
  listSales(shopId: string): Promise<Sale[]>;
  getSale(id: string): Promise<Sale | undefined>;
  putSale(sale: Sale): Promise<void>;
  listCustomers(shopId: string): Promise<Customer[]>;
  putCustomer(customer: Customer): Promise<void>;
  listCloses(shopId: string): Promise<DailyClose[]>;
  putClose(close: DailyClose): Promise<void>;
  close(): void;
}

class IndexedDBReplica implements LocalReplica {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    if (this.db) return;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_REPLICA)) {
          db.createObjectStore(STORE_REPLICA, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  tx(store: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('replica not opened');
    return this.db.transaction(store, mode).objectStore(store);
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getShop(): Promise<Shop | undefined> {
    const raw = await this.request(this.tx(STORE_META, 'readonly').get('shop'));
    return raw as Shop | undefined;
  }

  async saveShop(shop: Shop): Promise<void> {
    await this.request(this.tx(STORE_META, 'readwrite').put(shop, 'shop'));
  }

  async listSales(shopId: string): Promise<Sale[]> {
    const all = (await this.request(this.tx(STORE_REPLICA, 'readonly').getAll())) as ReplicaRecord[];
    return all
      .filter((record): record is Sale & { kind: 'sale' } => record.kind === 'sale' && record.shopId === shopId)
      .map(({ kind: _kind, ...sale }) => sale)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getSale(id: string): Promise<Sale | undefined> {
    const raw = await this.request(this.tx(STORE_REPLICA, 'readonly').get(id));
    if (!raw) return undefined;
    const record = raw as ReplicaRecord;
    if (record.kind !== 'sale') return undefined;
    const { kind: _kind, ...sale } = record;
    return sale;
  }

  async putSale(sale: Sale): Promise<void> {
    // keyPath is 'id' — the key is derived from the record itself.
    await this.request(this.tx(STORE_REPLICA, 'readwrite').put({ ...sale, kind: 'sale' } as ReplicaRecord));
  }

  async listCustomers(shopId: string): Promise<Customer[]> {
    const all = (await this.request(this.tx(STORE_REPLICA, 'readonly').getAll())) as ReplicaRecord[];
    return all
      .filter((record): record is Customer & { kind: 'customer' } => record.kind === 'customer' && record.shopId === shopId)
      .map(({ kind: _kind, ...customer }) => customer)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async putCustomer(customer: Customer): Promise<void> {
    await this.request(
      this.tx(STORE_REPLICA, 'readwrite').put({ ...customer, kind: 'customer' } as ReplicaRecord),
    );
  }

  async listCloses(shopId: string): Promise<DailyClose[]> {
    const all = (await this.request(this.tx(STORE_REPLICA, 'readonly').getAll())) as ReplicaRecord[];
    return all
      .filter((record): record is DailyClose & { kind: 'close' } => record.kind === 'close' && record.shopId === shopId)
      .map(({ kind: _kind, ...close }) => close)
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  }

  async putClose(close: DailyClose): Promise<void> {
    await this.request(this.tx(STORE_REPLICA, 'readwrite').put({ ...close, kind: 'close' } as ReplicaRecord));
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

/** Factory that wraps the raw IndexedDB store into a KeyValueStore for the Outbox. */
export function createOutboxStore(replica: IndexedDBReplica): import('../sync/outbox').KeyValueStore {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      await replica.open();
      const store = replica.tx('outbox', 'readonly');
      const raw = await new Promise<T | undefined>((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => reject(request.error);
      });
      return raw;
    },
    async set<T>(key: string, value: T): Promise<void> {
      await replica.open();
      const store = replica.tx('outbox', 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const request = store.put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
  };
}

/** Create the local replica. Call open() before first use. */
export function createLocalReplica(): IndexedDBReplica {
  return new IndexedDBReplica();
}

/** Generate a new device id — stable per install, used for merge tie-breaks. */
export function newDeviceId(): string {
  return uuid();
}

export type { Mutation };

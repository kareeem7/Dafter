/**
 * Domain types for دفتر — Daftar.
 *
 * Non-negotiables encoded here:
 * - Money is always stored as integer piastres, never floats.
 * - Timestamps are server-authoritative where they affect ordering; device
 *   clocks are only used for local UX and are never trusted for merge order.
 */

export interface FieldState<T = unknown> {
  value: T;
  /** Server-authoritative timestamp (ms since epoch). */
  updatedAt: number;
  /** Device that wrote this value — used for deterministic tie-breaking. */
  device: string;
}

export type FieldMap<T = unknown> = Record<string, FieldState<T>>;

/** A shop. One shop per device in v1. */
export interface Shop {
  id: string;
  name: string;
  createdAt: number;
}

/** A customer of the shop. Editable fields live in `fields` for field-level merge. */
export interface Customer {
  id: string;
  shopId: string;
  fields: FieldMap;
  createdAt: number;
}

export interface SaleItem {
  name: string;
  quantity: number;
  unitPiastres: number;
}

export type PaymentMethod = 'cash' | 'debt';

/** A sale. Append-only in v1 — never updated, only returned. */
export interface Sale {
  id: string;
  shopId: string;
  customerId: string | null;
  items: SaleItem[];
  totalPiastres: number;
  paidPiastres: number;
  method: PaymentMethod;
  createdAt: number;
  /** Server id once the mutation has been applied, if applicable. */
  serverId: string | null;
}

/** A return of a previous sale (reverses the cash, not the history). */
export interface ReturnRecord {
  id: string;
  shopId: string;
  saleId: string;
  piastres: number;
  createdAt: number;
  serverId: string | null;
}

/** End-of-day close: the numbers the shopkeeper trusts before sleep. */
export interface DailyClose {
  id: string;
  shopId: string;
  day: string; // YYYY-MM-DD
  openingPiastres: number;
  salesTotalPiastres: number;
  returnsTotalPiastres: number;
  cashPiastres: number;
  createdAt: number;
}

export type MutationType =
  | 'sale.create'
  | 'sale.return'
  | 'customer.create'
  | 'customer.patch'
  | 'close.create';

/**
 * Every mutation is minted with a UUID on the device before it ever touches
 * the network. That UUID is the idempotency key: a retry after a timeout
 * carries the same key and the server applies it exactly once.
 */
export interface Mutation<T = unknown> {
  id: string;
  shopId: string;
  type: MutationType;
  payload: T;
  /** Device clock — UX only, never trusted for ordering. */
  createdAt: number;
  device: string;
}

export type CustomerPatchPayload = {
  customerId: string;
  fields: Record<string, FieldState>;
};

export type SaleCreatePayload = Omit<Sale, 'id' | 'shopId' | 'createdAt' | 'serverId'>;
export type ReturnPayload = { shopId: string; saleId: string; piastres: number };
export type ClosePayload = Omit<DailyClose, 'id' | 'shopId' | 'createdAt'>;
export type CustomerCreatePayload = { shopId: string; name: string; phone?: string };

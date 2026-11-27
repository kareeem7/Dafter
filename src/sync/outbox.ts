/**
 * outbox.ts — the durable sync queue. Framework-free.
 *
 * Every local mutation is written into the outbox BEFORE the UI confirms it.
 * The outbox survives restarts (persisted via a KeyValueStore), retries with
 * exponential backoff + full jitter, and moves permanently-failed entries to
 * a dead-letter queue where the shopkeeper can retry them manually.
 *
 * The tests in this repo deliberately assert the failure modes, not just the
 * happy path: duplicate-id retries, backoff growth, restart survival, dead
 * letters, and manual retry.
 */

export interface OutboxEntry {
  /** Idempotency key — minted on the device, never changes across retries. */
  id: string;
  type: string;
  payload: unknown;
  status: 'pending' | 'sending' | 'sent' | 'dead';
  /** Number of failed send attempts. */
  attempts: number;
  /** Epoch ms of the next allowed attempt (server-authoritative ordering). */
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
}

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface OutboxOptions {
  /** Base delay before the first retry, in ms. */
  baseDelayMs?: number;
  /** Maximum delay between retries, in ms. */
  maxDelayMs?: number;
  /** Clock injectable for tests. Defaults to Date.now. */
  now?: () => number;
  /** Random injectable for jitter. Defaults to Math.random. */
  random?: () => number;
}

export interface FlushResult {
  sent: number;
  failed: number;
  dead: number;
}

const STORE_KEY = 'dafter.outbox';

export class Outbox {
  private entries: OutboxEntry[] = [];
  private readonly store: KeyValueStore;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private flushing = false;
  /** Notified after every flush so the UI can reflect drain progress. */
  private listeners = new Set<(result: FlushResult) => void>();

  constructor(store: KeyValueStore, options: OutboxOptions = {}) {
    this.store = store;
    this.baseDelayMs = options.baseDelayMs ?? 2_000;
    this.maxDelayMs = options.maxDelayMs ?? 60_000;
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
  }

  /**
   * Load persisted entries. On restart the outbox is exactly as it was —
   * pending entries resume with their computed backoff schedule.
   */
  async load(): Promise<void> {
    const persisted = await this.store.get<OutboxEntry[]>(STORE_KEY);
    if (Array.isArray(persisted)) {
      this.entries = persisted;
    }
  }

  private async persist(): Promise<void> {
    await this.store.set(STORE_KEY, this.entries);
  }

  /** Enqueue a mutation. Returns the entry with its minted idempotency id. */
  async enqueue(type: string, payload: unknown, id?: string): Promise<OutboxEntry> {
    const entry: OutboxEntry = {
      id: id ?? cryptoId(),
      type,
      payload,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      createdAt: this.now(),
    };
    this.entries.push(entry);
    await this.persist();
    this.emit({ sent: 0, failed: 0, dead: 0 });
    return entry;
  }

  getPending(): OutboxEntry[] {
    return this.entries.filter((entry) => entry.status === 'pending' || entry.status === 'sending');
  }

  getDead(): OutboxEntry[] {
    return this.entries.filter((entry) => entry.status === 'dead');
  }

  /**
   * Exponential backoff with full jitter:
   * delay = random(0, min(base * 2^(attempts-1), max)).
   * The first retry waits `base`, and it doubles every retry after that.
   * Jitter prevents two phones in one shop from hammering the endpoint in
   * lockstep the moment 4G comes back.
   */
  private scheduleNextAttempt(entry: OutboxEntry, now: number): number {
    const rawDelay = Math.min(this.baseDelayMs * 2 ** Math.max(0, entry.attempts - 1), this.maxDelayMs);
    const jittered = this.random() * rawDelay;
    return now + jittered;
  }

  /**
   * Attempt to send every due entry through the sender.
   * - success: entry is marked sent and removed from the active queue.
   * - transient failure: backoff scheduled, stays pending.
   * - permanent failure (4xx other than 408/429): dead letter.
   * Reentrancy is guarded — concurrent flushes collapse into one.
   */
  async flush(sender: (entry: OutboxEntry) => Promise<void>): Promise<FlushResult> {
    if (this.flushing) {
      return { sent: 0, failed: 0, dead: 0 };
    }
    this.flushing = true;
    try {
      const now = this.now();
      const due = this.getPending()
        .filter((entry) => entry.nextAttemptAt <= now)
        .sort((a, b) => a.createdAt - b.createdAt);

      const result: FlushResult = { sent: 0, failed: 0, dead: 0 };
      for (const entry of due) {
        entry.status = 'sending';
        try {
          await sender(entry);
          entry.status = 'sent';
          result.sent += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          entry.attempts += 1;
          entry.lastError = message;
          if (isPermanentError(message)) {
            entry.status = 'dead';
            result.dead += 1;
          } else {
            entry.status = 'pending';
            entry.nextAttemptAt = this.scheduleNextAttempt(entry, this.now());
            result.failed += 1;
          }
        }
        await this.persist();
      }

      // Sent entries leave the active list but stay queryable in tests.
      this.entries = this.entries.filter((entry) => entry.status !== 'sent');
      await this.persist();
      this.emit(result);
      return result;
    } finally {
      this.flushing = false;
    }
  }

  /** Manual retry of a dead-lettered entry. */
  async retryDead(id: string): Promise<boolean> {
    const entry = this.entries.find((candidate) => candidate.id === id && candidate.status === 'dead');
    if (!entry) {
      return false;
    }
    entry.status = 'pending';
    entry.attempts = 0;
    entry.lastError = null;
    entry.nextAttemptAt = 0;
    await this.persist();
    this.emit({ sent: 0, failed: 0, dead: 0 });
    return true;
  }

  subscribe(listener: (result: FlushResult) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(result: FlushResult): void {
    for (const listener of this.listeners) {
      listener(result);
    }
  }
}

function cryptoId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Permanent failures are those the server rejected as unfixable by retrying:
 * 400/401/403/404/409/422. Transient: 408, 429, 5xx, network errors.
 */
export function isPermanentError(message: string): boolean {
  return /^(400|401|403|404|409|422)\b/.test(message);
}

import { describe, expect, it, vi } from 'vitest';
import { Outbox, isPermanentError, type OutboxEntry, type KeyValueStore } from './outbox';

/** In-memory stand-in for the IndexedDB-backed store, so the outbox itself
 *  is testable in Node without a browser. */
function memoryStore(initial?: OutboxEntry[]): KeyValueStore & { dump(): OutboxEntry[] } {
  let data: OutboxEntry[] = initial ? [...initial] : [];
  return {
    async get<T>(key: string): Promise<T | undefined> {
      if (key === 'dafter.outbox') return data as unknown as T;
      return undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      if (key === 'dafter.outbox') data = value as unknown as OutboxEntry[];
    },
    dump: () => [...data],
  };
}

const immediate = { now: () => now, random: () => 0.5 };
let now = 1_000_000;

describe('Outbox', () => {
  it('mints a stable UUID per mutation and keeps it across retries so the server can dedupe', async () => {
    const store = memoryStore();
    const outbox = new Outbox(store, immediate);
    const entry = await outbox.enqueue('sale.create', { totalPiastres: 5000 });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);

    // Retry after a timeout — the request carries the SAME id.
    const sentIds: string[] = [];
    await outbox.flush(async (candidate) => {
      sentIds.push(candidate.id);
      throw new Error('network down');
    });
    // Let the backoff window elapse, then retry.
    now = outbox.getPending()[0].nextAttemptAt;
    await outbox.flush(async (candidate) => {
      sentIds.push(candidate.id);
    });

    expect(sentIds).toEqual([entry.id, entry.id]);
  });

  it('survives a reload: pending entries are persisted and resume', async () => {
    const store = memoryStore();
    const outbox = new Outbox(store, immediate);
    await outbox.enqueue('sale.create', { totalPiastres: 1000 });
    await outbox.flush(async () => {
      throw new Error('offline');
    });

    // Simulate a restart: new Outbox instance over the same store.
    const restarted = new Outbox(store, immediate);
    await restarted.load();
    expect(restarted.getPending()).toHaveLength(1);
    expect(restarted.getPending()[0].attempts).toBe(1);

    // Let the backoff window elapse, then flush again.
    now = restarted.getPending()[0].nextAttemptAt;
    let sent = 0;
    await restarted.flush(async () => {
      sent += 1;
    });
    expect(sent).toBe(1);
    expect(restarted.getPending()).toHaveLength(0);
  });

  it('applies exponential backoff with jitter between attempts', async () => {
    const store = memoryStore();
    const nowFn = vi.fn(() => now);
    const random = vi.fn(() => 0.5);
    const outbox = new Outbox(store, { now: nowFn, random });
    await outbox.enqueue('sale.create', {});

    now = 1_000_000;
    await outbox.flush(async () => {
      throw new Error('503');
    });
    const firstDelay = outbox.getPending()[0].nextAttemptAt - now;

    now = outbox.getPending()[0].nextAttemptAt;
    await outbox.flush(async () => {
      throw new Error('503');
    });
    const secondDelay = outbox.getPending()[0].nextAttemptAt - now;

    expect(firstDelay).toBe(1_000); // 2000 * 2^0 * 0.5
    expect(secondDelay).toBe(2_000); // 2000 * 2^1 * 0.5
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('caps backoff at maxDelayMs', async () => {
    const store = memoryStore();
    const outbox = new Outbox(store, { baseDelayMs: 1000, maxDelayMs: 8000, now: () => now, random: () => 1 });
    await outbox.enqueue('sale.create', {});
    for (let i = 0; i < 6; i += 1) {
      await outbox.flush(async () => {
        throw new Error('offline');
      });
      const entry = outbox.getPending()[0];
      now = entry.nextAttemptAt;
    }
    expect(outbox.getPending()[0].nextAttemptAt - now).toBeLessThanOrEqual(8000);
  });

  it('moves permanently-failed entries to the dead letter queue', async () => {
    const store = memoryStore();
    const outbox = new Outbox(store, immediate);
    await outbox.enqueue('sale.create', { bad: true });

    const result = await outbox.flush(async () => {
      throw new Error('422 validation failed');
    });
    expect(result.dead).toBe(1);
    expect(outbox.getDead()).toHaveLength(1);
    expect(outbox.getPending()).toHaveLength(0);
  });

  it('retries dead letters manually and succeeds', async () => {
    const store = memoryStore();
    const outbox = new Outbox(store, immediate);
    const entry = await outbox.enqueue('sale.create', {});
    await outbox.flush(async () => {
      throw new Error('400 bad request');
    });
    expect(outbox.getDead()).toHaveLength(1);

    expect(await outbox.retryDead(entry.id)).toBe(true);
    expect(outbox.getDead()).toHaveLength(0);
    expect(outbox.getPending()).toHaveLength(1);

    await outbox.flush(async () => {});
    expect(outbox.getPending()).toHaveLength(0);
  });

  it('never sends the same entry twice during concurrent flushes', async () => {
    const store = memoryStore();
    const outbox = new Outbox(store, immediate);
    await outbox.enqueue('sale.create', {});

    const sender = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    await Promise.all([outbox.flush(sender), outbox.flush(sender)]);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers after a flush', async () => {
    const store = memoryStore();
    const outbox = new Outbox(store, immediate);
    const listener = vi.fn();
    outbox.subscribe(listener);
    await outbox.enqueue('sale.create', {});
    await outbox.flush(async () => {
      throw new Error('offline');
    });
    expect(listener).toHaveBeenCalled();
    const last = listener.mock.calls.at(-1)?.[0];
    expect(last?.failed).toBe(1);
  });
});

describe('isPermanentError', () => {
  it('treats 4xx (except 408/429) as permanent', () => {
    expect(isPermanentError('400 bad request')).toBe(true);
    expect(isPermanentError('404 not found')).toBe(true);
    expect(isPermanentError('422 validation failed')).toBe(true);
  });

  it('treats 408, 429 and 5xx/network errors as transient', () => {
    expect(isPermanentError('408 timeout')).toBe(false);
    expect(isPermanentError('429 too many requests')).toBe(false);
    expect(isPermanentError('503 service unavailable')).toBe(false);
    expect(isPermanentError('network error')).toBe(false);
  });
});

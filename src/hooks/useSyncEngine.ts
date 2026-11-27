/**
 * useSyncEngine — wires the Outbox to a sender and keeps React in sync.
 *
 * The sender is a function the app provides; in production it posts to the
 * Supabase apply_mutation RPC. The engine:
 *  - flushes when the network is up,
 *  - exposes pending / dead counts and drain progress to the UI,
 *  - never blocks the UI — the device is the source of truth regardless.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Outbox, type FlushResult, type OutboxEntry } from '../sync/outbox';

export interface SyncEngineState {
  pending: number;
  dead: number;
  lastFlush: FlushResult | null;
  online: boolean;
}

export function useSyncEngine(outbox: Outbox | null) {
  const [state, setState] = useState<SyncEngineState>({ pending: 0, dead: 0, lastFlush: null, online: navigator.onLine });
  const senderRef = useRef<((entry: OutboxEntry) => Promise<void>) | null>(null);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!outbox) return;
    setState((prev) => ({ ...prev, pending: outbox.getPending().length, dead: outbox.getDead().length }));
  }, [outbox]);

  useEffect(() => {
    if (!outbox) return;
    const unsubscribe = outbox.subscribe((result) => {
      setState((prev) => ({ ...prev, lastFlush: result }));
      void refresh();
    });
    return unsubscribe;
  }, [outbox, refresh]);

  useEffect(() => {
    const onOnline = () => {
      setState((prev) => ({ ...prev, online: true }));
    };
    const onOffline = () => {
      setState((prev) => ({ ...prev, online: false }));
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const setSender = useCallback((sender: (entry: OutboxEntry) => Promise<void>) => {
    senderRef.current = sender;
  }, []);

  /** Run a flush now (used when network returns or on demand). */
  const flushNow = useCallback(async (): Promise<FlushResult> => {
    if (!outbox || !senderRef.current) return { sent: 0, failed: 0, dead: 0 };
    const result = await outbox.flush(senderRef.current);
    await refresh();
    return result;
  }, [outbox, refresh]);

  // Background polling loop: checks every 4s whether anything is due.
  useEffect(() => {
    if (!outbox) return;
    const tick = async () => {
      if (navigator.onLine && outbox.getPending().length > 0 && senderRef.current) {
        await flushNow();
      }
    };
    timerRef.current = window.setInterval(tick, 4_000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [outbox, flushNow]);

  return { state, flushNow, setSender };
}

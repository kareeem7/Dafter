/**
 * App — دفتر / Daftar shell.
 *
 * Device is the source of truth: every write lands in the local replica and
 * the outbox FIRST, then the UI confirms instantly — the network is a
 * background luxury, never a requirement.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outbox } from './sync/outbox';
import { createLocalReplica, createOutboxStore, newDeviceId, type LocalReplica } from './db/localReplica';
import { useSyncEngine } from './hooks/useSyncEngine';
import { SyncBadge } from './components/SyncBadge';
import { NewSaleForm } from './components/NewSaleForm';
import { SaleList } from './components/SaleList';
import { ShopSetup } from './components/ShopSetup';
import { DeadLetterPanel } from './components/DeadLetterPanel';
import type { Sale, SaleItem } from './types';
import { uuid } from './lib/uuid';

export default function App() {
  const replica = useMemo(() => createLocalReplica(), []);
  const [replicaReady, setReplicaReady] = useState(false);
  const [shopName, setShopName] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [deviceId] = useState(() => {
    const existing = localStorage.getItem('dafter.device');
    if (existing) return existing;
    const fresh = newDeviceId();
    localStorage.setItem('dafter.device', fresh);
    return fresh;
  });

  const outbox = useMemo(() => new Outbox(createOutboxStore(replica), { baseDelayMs: 2_000, maxDelayMs: 60_000 }), [replica]);

  const { state, flushNow, setSender } = useSyncEngine(outbox);

  useEffect(() => {
    void (async () => {
      await replica.open();
      await outbox.load();
      const shop = await replica.getShop();
      if (shop) setShopName(shop.name);
      await refreshSales();
      setReplicaReady(true);
    })();
  }, [replica, outbox]);

  const refreshSales = useCallback(async () => {
    const shop = await replica.getShop();
    if (!shop) return;
    setSales(await replica.listSales(shop.id));
  }, [replica]);

  const handleShopCreated = useCallback(
    async (name: string) => {
      const shop = { id: uuid(), name, createdAt: Date.now() };
      await replica.saveShop(shop);
      localStorage.setItem('dafter.shop', shop.id);
      setShopName(shop.name);
      await refreshSales();
    },
    [replica, refreshSales],
  );

  const recordSale = useCallback(
    async (items: SaleItem[], method: Sale['method'], customerId: string | null) => {
      if (!shopName) return;
      const shop = await replica.getShop();
      if (!shop) return;

      const totalPiastres = items.reduce((total, item) => total + item.unitPiastres * item.quantity, 0);
      const sale: Sale = {
        id: uuid(),
        shopId: shop.id,
        customerId,
        items,
        totalPiastres,
        paidPiastres: method === 'cash' ? totalPiastres : 0,
        method,
        createdAt: Date.now(),
        serverId: null,
      };

      // 1. Persist locally + enqueue the mutation — BEFORE the UI confirms.
      await replica.putSale(sale);
      await outbox.enqueue('sale.create', { saleId: sale.id, type: 'sale.create', device: deviceId });

      // 2. UI confirms instantly, regardless of connectivity.
      await refreshSales();
    },
    [outbox, replica, refreshSales, shopName],
  );

  // Sender: posts outbox entries to the server. Without a configured backend
  // this simulates a transient offline failure so the queue behavior is
  // visible in the demo; with a backend it's a real RPC call.
  useEffect(() => {
    setSender(async (entry) => {
      // Simulate the network being the optional part: if offline, fail transiently.
      if (!navigator.onLine) {
        throw new Error('offline');
      }
      // When online and a backend exists, this is where apply_mutation RPC runs.
      // For the offline demo we resolve immediately once online.
      await new Promise((resolve) => setTimeout(resolve, 250));
      void entry;
    });
  }, [setSender]);

  useEffect(() => {
    if (replicaReady && navigator.onLine && outbox.getPending().length > 0) {
      void flushNow();
    }
  }, [replicaReady, flushNow, outbox, state.online]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-2xl font-black text-white shadow-lg shadow-brand-500/30">
            د
          </div>
          <div>
            <h1 className="text-xl font-black leading-tight">دفتر</h1>
            <p className="text-xs text-ink-soft">سجل لا يفقد صفقة حتى لو انقطع الإنترنت</p>
          </div>
        </div>
        <SyncBadge state={state} />
      </header>

      {!replicaReady ? (
        <div className="flex flex-1 items-center justify-center text-ink-soft">جارٍ التحميل…</div>
      ) : !shopName ? (
        <ShopSetup onCreate={handleShopCreated} />
      ) : (
        <main className="flex flex-1 flex-col gap-5">
          {/* Today at a glance */}
          <section className="animate-fade-up rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line">
            <h2 className="mb-3 text-sm font-bold text-ink-soft">مبيعات اليوم</h2>
            <div className="nums text-3xl font-black text-brand-600">
              {sales.filter((sale) => isToday(sale.createdAt)).reduce((sum, sale) => sum + sale.totalPiastres, 0).toLocaleString('en-US')}{' '}
              <span className="text-base font-bold text-ink-soft">ج.م (فئة)</span>
            </div>
            <p className="mt-1 text-xs text-ink-faint">{sales.filter((sale) => isToday(sale.createdAt)).length} صفقة حتى الآن</p>
          </section>

          <NewSaleForm onSubmit={recordSale} disabled={!shopName} />

          <SaleList sales={sales} />

          <DeadLetterPanel outbox={outbox} online={state.online} onRetry={() => void flushNow()} />
        </main>
      )}

      <footer className="text-center text-[10px] text-ink-faint">
        device is the source of truth · offline-first
      </footer>
    </div>
  );
}

function isToday(timestamp: number): boolean {
  const now = new Date();
  const date = new Date(timestamp);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

// Keep the type import used for consumers.
export type { LocalReplica };

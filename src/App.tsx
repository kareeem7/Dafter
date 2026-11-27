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
import { CustomersPanel, newCustomerId } from './components/CustomersPanel';
import { DailyClosePanel } from './components/DailyClosePanel';
import type { Sale, SaleItem, Customer, FieldState, DailyClose } from './types';
import { uuid } from './lib/uuid';
import { applyMutation, isSupabaseConfigured } from './lib/supabase';
import { seedDemoData } from './lib/demoSeed';
import { formatPiastres } from './lib/money';

export default function App() {
  const replica = useMemo(() => createLocalReplica(), []);
  const [replicaReady, setReplicaReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [deviceId] = useState(() => {
    const existing = localStorage.getItem('dafter.device');
    if (existing) return existing;
    const fresh = newDeviceId();
    localStorage.setItem('dafter.device', fresh);
    return fresh;
  });

  const outbox = useMemo(() => new Outbox(createOutboxStore(replica), { baseDelayMs: 2_000, maxDelayMs: 60_000 }), [replica]);

  const { state, flushNow, setSender } = useSyncEngine(outbox);

  const refreshSales = useCallback(async () => {
    const shop = await replica.getShop();
    if (!shop) return;
    setSales(await replica.listSales(shop.id));
    setCustomers(await replica.listCustomers(shop.id));
  }, [replica]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await replica.open();
        await outbox.load();
        const shop = await replica.getShop();
        if (shop && !cancelled) setShopName(shop.name);

        // Direct demo access via ?demo in the URL — seed and go straight in.
        if (!shop && new URLSearchParams(window.location.search).has('demo') && !cancelled) {
          await seedDemoData(replica, outbox);
          const seeded = await replica.getShop();
          if (seeded && !cancelled) {
            setShopName(seeded.name);
            setDemoMode(true);
          }
        }

        await refreshSales();
        if (!cancelled) setReplicaReady(true);
      } catch (error) {
        // Surface the failure instead of hanging on "جارٍ التحميل" forever.
        setInitError(error instanceof Error ? error.message : String(error));
        setReplicaReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [replica, outbox, refreshSales]);

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

  const handleStartDemo = useCallback(async () => {
    await seedDemoData(replica, outbox);
    const shop = await replica.getShop();
    if (shop) {
      localStorage.setItem('dafter.shop', shop.id);
      setShopName(shop.name);
      setDemoMode(true);
      await refreshSales();
    }
  }, [outbox, replica, refreshSales]);

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

  const createCustomer = useCallback(
    async (name: string, phone: string) => {
      if (!shopName) return;
      const shop = await replica.getShop();
      if (!shop) return;
      const now = Date.now();
      const fields: Record<string, FieldState> = {
        name: { value: name, updatedAt: now, device: deviceId },
        phone: { value: phone, updatedAt: now, device: deviceId },
        balancePiastres: { value: 0, updatedAt: now, device: deviceId },
      };
      const customer: Customer = { id: newCustomerId(), shopId: shop.id, fields, createdAt: now };
      await replica.putCustomer(customer);
      await outbox.enqueue('customer.create', { customerId: customer.id, shopId: shop.id, name, phone, fields });
      await refreshSales();
    },
    [deviceId, outbox, replica, refreshSales, shopName],
  );

  const patchCustomer = useCallback(
    async (customerId: string, patch: Record<string, FieldState>) => {
      if (!shopName) return;
      const shop = await replica.getShop();
      if (!shop) return;
      const existing = await replica.listCustomers(shop.id);
      const customer = existing.find((c) => c.id === customerId);
      if (!customer) return;
      const updated = { ...customer, fields: { ...customer.fields, ...patch } };
      await replica.putCustomer(updated);
      await outbox.enqueue('customer.patch', { customerId, fields: patch });
      await refreshSales();
    },
    [outbox, replica, refreshSales, shopName],
  );

  const closeDay = useCallback(
    async (openingPiastres: number) => {
      if (!shopName) return;
      const shop = await replica.getShop();
      if (!shop) return;
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const todays = sales.filter((sale) => {
        const d = new Date(sale.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      });
      const salesTotal = todays.reduce((sum, s) => sum + s.totalPiastres, 0);
      const cashIn = todays.filter((s) => s.method === 'cash').reduce((sum, s) => sum + s.totalPiastres, 0);
      const close: DailyClose = {
        id: uuid(),
        shopId: shop.id,
        day,
        openingPiastres,
        salesTotalPiastres: salesTotal,
        returnsTotalPiastres: 0,
        cashPiastres: openingPiastres + cashIn,
        createdAt: Date.now(),
      };
      await replica.putClose(close);
      await outbox.enqueue('close.create', {
        closeId: close.id,
        day,
        openingPiastres,
        salesTotalPiastres: salesTotal,
        returnsTotalPiastres: 0,
        cashPiastres: close.cashPiastres,
      });
      await refreshSales();
    },
    [outbox, replica, refreshSales, sales, shopName],
  );

  // Sender: posts outbox entries to the server via apply_mutation RPC.
  // When Supabase is configured, this is the real, idempotent write path.
  // When it isn't, we simulate a transient failure so the offline queue
  // behavior stays visible in the demo.
  useEffect(() => {
    setSender(async (entry) => {
      if (!isSupabaseConfigured) {
        if (!navigator.onLine) throw new Error('offline');
        await new Promise((resolve) => setTimeout(resolve, 250));
        return;
      }
      const shop = await replica.getShop();
      if (!shop) throw new Error('no shop');
      await applyMutation({
        shopId: shop.id,
        mutationId: entry.id,
        type: entry.type,
        payload: entry.payload,
      });
    });
  }, [setSender, replica]);

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
            <h1 className="text-xl font-black leading-tight">
              دفتر
              {demoMode && (
                <span className="ml-2 rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-black text-amber-600">
                  ديمو
                </span>
              )}
            </h1>
            <p className="text-xs text-ink-soft">سجل لا يفقد صفقة حتى لو انقطع الإنترنت</p>
          </div>
        </div>
        <SyncBadge state={state} />
      </header>

      {initError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-danger-soft p-6 text-center ring-1 ring-danger-500/30">
          <p className="text-4xl">⚠️</p>
          <h2 className="text-lg font-black text-danger-500">تعذّر الاتصال بقاعدة البيانات</h2>
          <p className="max-w-xs text-sm text-ink-soft">{initError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/30"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : !replicaReady ? (
        <div className="flex flex-1 items-center justify-center text-ink-soft">جارٍ التحميل…</div>
      ) : !shopName ? (
        <ShopSetup onCreate={handleShopCreated} onStartDemo={handleStartDemo} />
      ) : (
        <main className="flex flex-1 flex-col gap-5">
          {/* Today at a glance */}
          <section className="animate-fade-up rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line">
            <h2 className="mb-3 text-sm font-bold text-ink-soft">مبيعات اليوم</h2>
            <div className="nums text-3xl font-black text-brand-600">
              {formatPiastres(
                sales.filter((sale) => isToday(sale.createdAt)).reduce((sum, sale) => sum + sale.totalPiastres, 0),
              )}{' '}
            </div>
            <p className="mt-1 text-xs text-ink-faint">{sales.filter((sale) => isToday(sale.createdAt)).length} صفقة حتى الآن</p>
          </section>

          <NewSaleForm onSubmit={recordSale} disabled={!shopName} />

          <CustomersPanel customers={customers} onCreate={createCustomer} onPatch={patchCustomer} />

          <SaleList sales={sales} />

          <DailyClosePanel sales={sales} onClose={closeDay} />

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

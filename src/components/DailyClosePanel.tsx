import { useMemo, useState } from 'react';
import type { Sale } from '../types';
import { formatPiastres, sumPiastres } from '../lib/money';

interface DailyClosePanelProps {
  sales: Sale[];
  onClose: (openingPiastres: number) => Promise<void>;
}

/**
 * DailyClosePanel — the numbers the shopkeeper trusts before sleep.
 * Computes the day's totals from the local replica (source of truth),
 * lets the shopkeeper enter the physical cash count, and records the close.
 */
export function DailyClosePanel({ sales, onClose }: DailyClosePanelProps) {
  const today = useMemo(() => {
    const now = new Date();
    return sales.filter((sale) => {
      const d = new Date(sale.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    });
  }, [sales]);

  const salesTotal = sumPiastres(today.map((s) => s.totalPiastres));
  const cashReceived = sumPiastres(today.filter((s) => s.method === 'cash').map((s) => s.totalPiastres));

  const [opening, setOpening] = useState('');
  const [cashCount, setCashCount] = useState('');
  const [done, setDone] = useState(false);

  const openingPiastres = opening ? Math.round(Number(opening) * 100) : 0;
  const countedPiastres = cashCount ? Math.round(Number(cashCount) * 100) : 0;
  const expectedCash = openingPiastres + cashReceived;
  const difference = countedPiastres - expectedCash;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!cashCount) return;
    void onClose(openingPiastres).then(() => setDone(true));
  };

  return (
    <section className="animate-fade-up rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line">
      <h2 className="mb-3 text-sm font-bold text-ink-soft">إغلاق اليوم</h2>

      <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
        <Stat label="مبيعات اليوم" value={formatPiastres(salesTotal)} />
        <Stat label="النقد الوارد" value={formatPiastres(cashReceived)} />
        <Stat label="إجمالي متوقع" value={formatPiastres(expectedCash)} />
        <Stat
          label="الفرق"
          value={formatPiastres(difference)}
          tone={Math.abs(difference) < 1 ? 'ok' : 'warn'}
        />
      </dl>

      {done ? (
        <p className="rounded-xl bg-brand-50 py-4 text-center text-sm font-bold text-brand-700">تم إغلاق اليوم بنجاح ✅</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            type="text"
            inputMode="decimal"
            placeholder="رصيد الافتتاحية"
            aria-label="رصيد الافتتاحية"
            className="rounded-lg bg-paper-deep px-3 py-2.5 text-right text-sm nums ring-1 ring-line focus:ring-2 focus:ring-brand-500"
          />
          <input
            value={cashCount}
            onChange={(e) => setCashCount(e.target.value)}
            type="text"
            inputMode="decimal"
            placeholder="المبلغ الفعلي الموجود"
            aria-label="المبلغ الفعلي"
            className="rounded-lg bg-paper-deep px-3 py-2.5 text-right text-sm nums ring-1 ring-line focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={!cashCount}
            className="rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-ink-faint"
          >
            تأكيد الإغلاق
          </button>
        </form>
      )}
    </section>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'ok' | 'warn' }) {
  const color =
    tone === 'ok' ? 'text-brand-700' : tone === 'warn' ? 'text-amber-600' : 'text-ink';
  return (
    <div className="rounded-lg bg-paper-deep px-3 py-2">
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd className={`nums text-sm font-black ${color}`}>{value}</dd>
    </div>
  );
}

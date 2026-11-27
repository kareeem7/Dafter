import type { Sale } from '../types';
import { formatPiastres } from '../lib/money';

/** SaleList — today's sales, newest first. Append-only, never edited. */
export function SaleList({ sales }: { sales: Sale[] }) {
  return (
    <section className="animate-fade-up rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line">
      <h2 className="mb-3 text-sm font-bold text-ink-soft">سجل المبيعات</h2>
      {sales.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">لا توجد مبيعات بعد. سجل أول مبيعة بالأسفل.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sales.map((sale) => (
            <li
              key={sale.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-paper-deep px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{sale.items.map((item) => item.name).join('، ')}</p>
                <p className="text-[11px] text-ink-faint">
                  {sale.items.length} صنف · {sale.method === 'debt' ? 'آجل' : 'نقد'} · {new Date(sale.createdAt).toLocaleTimeString('ar-EG')}
                </p>
              </div>
              <span className="nums shrink-0 text-sm font-black text-brand-700">{formatPiastres(sale.totalPiastres)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

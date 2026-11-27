import { useState } from 'react';
import type { SaleItem } from '../types';
import { formatPiastres, parseEgpToPiastres, tryParseEgpToPiastres } from '../lib/money';

interface NewSaleFormProps {
  onSubmit: (items: SaleItem[], method: 'cash' | 'debt', customerId: string | null) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * NewSaleForm — ring up a sale. Works fully offline; the sale is confirmed
 * locally the moment it's saved, and the outbox takes care of sync later.
 */
export function NewSaleForm({ onSubmit, disabled }: NewSaleFormProps) {
  const [lines, setLines] = useState<{ id: string; name: string; qty: string; price: string }[]>([
    { id: '1', name: '', qty: '1', price: '' },
  ]);
  const [method, setMethod] = useState<'cash' | 'debt'>('cash');

  const updateLine = (id: string, field: 'name' | 'qty' | 'price', value: string) => {
    if (field === 'price') {
      // Only digits and a single dot — reject letters/anything else.
      const cleaned = value.replace(/[^\d.]/g, '');
      setLines((prev) => prev.map((line) => (line.id === id ? { ...line, [field]: cleaned } : line)));
      return;
    }
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { id: `${prev.length + 1}-${Date.now()}`, name: '', qty: '1', price: '' }]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.id !== id) : prev));
  };

  const totalPiastres = lines.reduce((sum, line) => {
    if (!line.price) return sum;
    // Safe parse for live calculation — invalid input returns 0, never throws.
    return sum + tryParseEgpToPiastres(line.price) * (Number(line.qty) || 0);
  }, 0);

  const valid = lines.every((line) => line.name.trim() && line.price);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || disabled) return;
    const items: SaleItem[] = lines.map((line) => ({
      name: line.name.trim(),
      quantity: Number(line.qty) || 1,
      unitPiastres: parseEgpToPiastres(line.price),
    }));
    void onSubmit(items, method, null);
    setLines([{ id: '1', name: '', qty: '1', price: '' }]);
    setMethod('cash');
  };

  return (
    <section className="animate-fade-up rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="text-sm font-bold text-ink-soft">تسجيل مبيعة</h2>

        <div className="flex flex-col gap-2">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center gap-2">
              <input
                value={line.name}
                onChange={(event) => updateLine(line.id, 'name', event.target.value)}
                placeholder="اسم السلعة"
                aria-label="اسم السلعة"
                className="min-w-0 flex-1 rounded-lg bg-paper-deep px-3 py-2.5 text-sm ring-1 ring-line focus:ring-2 focus:ring-brand-500"
              />
              <input
                value={line.qty}
                onChange={(event) => updateLine(line.id, 'qty', event.target.value)}
                type="number"
                inputMode="numeric"
                aria-label="الكمية"
                className="w-14 rounded-lg bg-paper-deep px-2 py-2.5 text-center text-sm nums ring-1 ring-line focus:ring-2 focus:ring-brand-500"
              />
              <input
                value={line.price}
                onChange={(event) => updateLine(line.id, 'price', event.target.value)}
                type="text"
                inputMode="decimal"
                placeholder="السعر"
                aria-label="السعر"
                className="w-24 rounded-lg bg-paper-deep px-2 py-2.5 text-right text-sm nums ring-1 ring-line focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                className="rounded-lg px-2 py-2 text-ink-faint transition hover:bg-danger-soft hover:text-danger-500"
                aria-label="حذف الصنف"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addLine} className="w-fit rounded-lg px-3 py-1.5 text-sm font-bold text-brand-600 transition hover:bg-brand-50">
          + إضافة صنف
        </button>

        <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
          <span className="text-sm font-bold text-ink-soft">الإجمالي</span>
          <span className="nums text-lg font-black text-brand-700">{formatPiastres(totalPiastres)}</span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMethod('cash')}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition ${
              method === 'cash' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'bg-paper-deep text-ink-soft'
            }`}
          >
            نقد
          </button>
          <button
            type="button"
            onClick={() => setMethod('debt')}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition ${
              method === 'debt' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'bg-paper-deep text-ink-soft'
            }`}
          >
            آجل (دين)
          </button>
        </div>

        <button
          type="submit"
          disabled={!valid || disabled}
          className="rounded-xl bg-brand-500 px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-500/30 transition active:scale-[0.98] hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-ink-faint disabled:shadow-none"
        >
          حفظ المبيعة
        </button>
        <p className="text-center text-[11px] text-ink-faint">تُحفظ فوراً على الجهاز، ثم تتم المزامنة تلقائياً عند الاتصال.</p>
      </form>
    </section>
  );
}

import { useState } from 'react';
import type { Customer, FieldState } from '../types';
import { formatPiastres } from '../lib/money';
import { uuid } from '../lib/uuid';

interface CustomersPanelProps {
  customers: Customer[];
  onCreate: (name: string, phone: string) => Promise<void>;
  onPatch: (customerId: string, patch: Record<string, FieldState>) => Promise<void>;
}

/**
 * CustomersPanel — the debt book (الدفتر). A customer's balance is just
 * another editable field, so concurrent edits merge field-by-field.
 */
export function CustomersPanel({ customers, onCreate, onPatch }: CustomersPanelProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void onCreate(name.trim(), phone.trim());
    setName('');
    setPhone('');
  };

  const debtTotal = customers.reduce((sum, c) => sum + (Number(c.fields.balancePiastres?.value) || 0), 0);

  return (
    <section className="animate-fade-up rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line">
      <h2 className="mb-3 flex items-center justify-between text-sm font-bold text-ink-soft">
        <span>دفتر الديون</span>
        <span className="nums text-xs text-amber-600">{formatPiastres(debtTotal)}</span>
      </h2>

      <form onSubmit={add} className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم العميل"
          aria-label="اسم العميل"
          className="min-w-0 flex-1 rounded-lg bg-paper-deep px-3 py-2.5 text-sm ring-1 ring-line focus:ring-2 focus:ring-brand-500"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          placeholder="رقم التليفون"
          aria-label="رقم التليفون"
          className="min-w-0 flex-1 rounded-lg bg-paper-deep px-3 py-2.5 text-sm ring-1 ring-line focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
        >
          إضافة
        </button>
      </form>

      {customers.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-faint">لا يوجد عملاء بعد.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {customers.map((customer) => (
            <CustomerRow key={customer.id} customer={customer} onPatch={onPatch} />
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-ink-faint">
        ملاحظة: التعديل على حقل (مثل الرقم أو الرصيد) من جهاز مختلف يندمج مع التعديل الآخر — مش بيحذف واحد منهم.
      </p>
    </section>
  );
}

function CustomerRow({
  customer,
  onPatch,
}: {
  customer: Customer;
  onPatch: (customerId: string, patch: Record<string, FieldState>) => Promise<void>;
}) {
  const balance = Number(customer.fields.balancePiastres?.value) || 0;
  const name = String(customer.fields.name?.value ?? '—');
  const phone = String(customer.fields.phone?.value ?? '—');
  const [editing, setEditing] = useState(false);
  const [editBalance, setEditBalance] = useState('');

  const saveBalance = () => {
    const parsed = Number(editBalance);
    if (!Number.isFinite(parsed)) return;
    setEditing(false);
    void onPatch(customer.id, {
      balancePiastres: { value: Math.round(parsed * 100), updatedAt: Date.now(), device: 'local' },
    });
  };

  return (
    <li className="rounded-xl bg-paper-deep px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{name}</span>
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              value={editBalance}
              onChange={(e) => setEditBalance(e.target.value)}
              type="text"
              inputMode="decimal"
              className="w-24 rounded bg-white px-2 py-1 text-right text-sm nums ring-1 ring-line focus:ring-2 focus:ring-brand-500"
            />
            <button onClick={saveBalance} className="rounded bg-brand-500 px-2 py-1 text-[11px] font-bold text-white">✓</button>
          </div>
        ) : (
          <button onClick={() => { setEditing(true); setEditBalance(String(balance / 100)); }} className="nums text-sm font-black text-amber-600">
            {formatPiastres(balance)}
          </button>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-ink-faint">{phone}</span>
        <RemindButton name={name} balance={balance} />
      </div>
    </li>
  );
}

/** WhatsApp reminder — copies text to clipboard. No ?text= URL leak. */
function RemindButton({ name, balance }: { name: string; balance: number }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    // Plain text copy — deliberately no whatsapp://?text= link to avoid leaking
    // the debt amount into URLs/referrer logs.
    const text = `أهلاً ${name}، تذكر أن لديك دين لدينا بمبلغ ${formatPiastres(balance)}. شكراً.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 transition hover:bg-brand-100"
    >
      {copied ? 'تم النسخ' : 'تذكير واتساب'}
    </button>
  );
}

/** Helper used by App to mint a new customer id. */
export function newCustomerId(): string {
  return uuid();
}

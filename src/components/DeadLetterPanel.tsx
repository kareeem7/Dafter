import { useState } from 'react';
import type { Outbox } from '../sync/outbox';

/**
 * DeadLetterPanel — surface permanently-failed mutations so the shopkeeper
 * can retry them manually. Invisible systems problems, made visible.
 */
export function DeadLetterPanel({
  outbox,
  online,
  onRetry,
}: {
  outbox: Outbox;
  online: boolean;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dead = outbox.getDead();

  if (dead.length === 0) {
    return (
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-ink-soft shadow-sm ring-1 ring-line transition hover:bg-paper-deep"
      >
        {open ? 'إغلاق' : 'حالة المزامنة'}
      </button>
    );
  }

  return (
    <section className="animate-fade-up rounded-2xl bg-danger-soft p-4 ring-1 ring-danger-500/30">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-danger-500">{dead.length} عملية فشلت نهائياً</h2>
        <button type="button" onClick={onRetry} className="rounded-lg bg-danger-500 px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90">
          إعادة المحاولة
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {dead.map((entry) => (
          <li key={entry.id} className="rounded-lg bg-white px-3 py-2 text-xs">
            <span className="font-bold text-ink">{entry.type}</span>
            <span className="mr-2 text-ink-faint">·</span>
            <span className="text-ink-soft">{entry.lastError}</span>
          </li>
        ))}
      </ul>
      {!online && <p className="mt-2 text-[11px] text-ink-faint">الاتصال مقطوع — المحاولة تتطلب اتصالاً.</p>}
    </section>
  );
}

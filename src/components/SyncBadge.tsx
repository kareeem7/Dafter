import type { SyncEngineState } from '../hooks/useSyncEngine';

/**
 * SyncBadge — makes the invisible sync state visible, as the project demands.
 * Offline → device is source of truth. Online + pending → outbox is draining.
 */
export function SyncBadge({ state }: { state: SyncEngineState }) {
  const { online, pending, dead } = state;

  let label = 'متصل';
  let tone = 'emerald';
  if (!online) {
    label = 'غير متصل — الحفظ محلي';
    tone = 'amber';
  } else if (dead > 0) {
    label = `${dead} فشل نهائي — تحتاج مراجعة`;
    tone = 'danger';
  } else if (pending > 0) {
    label = `جارٍ المزامنة… ${pending} في الانتظار`;
    tone = 'amber';
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold nums ${
        tone === 'emerald'
          ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
          : tone === 'amber'
            ? 'bg-amber-soft text-amber-600 ring-1 ring-amber-500/30'
            : 'bg-danger-soft text-danger-500 ring-1 ring-danger-500/30'
      }`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {tone === 'emerald' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            tone === 'emerald' ? 'bg-brand-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-danger-500'
          }`}
        />
      </span>
      {label}
    </div>
  );
}

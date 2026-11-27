import { useState } from 'react';

/** First-run shop creation. One shop per device in v1. */
export function ShopSetup({
  onCreate,
  onStartDemo,
}: {
  onCreate: (name: string) => void | Promise<void>;
  onStartDemo?: () => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('من فضلك اكتب اسم المحل');
      return;
    }
    setError('');
    void onCreate(trimmed);
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center animate-fade-up">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-500 text-4xl font-black text-white shadow-xl shadow-brand-500/30">
        د
      </div>
      <div>
        <h2 className="text-2xl font-black">أهلاً بك في دفتر</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">
          أدخل اسم محلك لتبدأ. كل عملية تُحفظ على الجهاز أولاً، فلا تفقد مبيعة أبداً حتى لو انقطع الإنترنت.
        </p>
      </div>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="اسم المحل (مثال: محل السعادة)"
          aria-label="اسم المحل"
          className="w-full rounded-xl border-0 bg-white px-4 py-3.5 text-right text-base ring-1 ring-line transition placeholder:text-ink-faint focus:ring-2 focus:ring-brand-500"
          autoFocus
        />
        {error && <p className="text-xs font-bold text-danger-500">{error}</p>}
        <button
          type="submit"
          className="mt-1 rounded-xl bg-brand-500 px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-500/30 transition active:scale-[0.98] hover:bg-brand-600"
        >
          بدء العمل
        </button>

        {onStartDemo && (
          <>
            <div className="my-1 flex items-center gap-3 text-xs text-ink-faint">
              <span className="h-px flex-1 bg-line" /> أو
              <span className="h-px flex-1 bg-line" />
            </div>
            <button
              type="button"
              onClick={() => void onStartDemo()}
              className="w-full rounded-xl bg-white px-4 py-3.5 text-base font-bold text-brand-700 ring-1 ring-brand-200 transition active:scale-[0.98] hover:bg-brand-50"
            >
              ✨ ابدأ تجربة الديمو
            </button>
            <p className="text-center text-[11px] text-ink-faint">
              يعمل الموقع معبّأ بمحل ومبيعات وعملاء وديون جاهزة للتجربة فورًا.
            </p>
          </>
        )}
      </form>
    </main>
  );
}

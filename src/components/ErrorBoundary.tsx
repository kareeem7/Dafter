import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * ErrorBoundary — catches render-time errors and shows them visibly instead
 * of leaving a blank white page. Essential for a portfolio piece: an
 * invisible crash is the worst possible failure mode.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the stack in the console for debugging.
    console.error('Unhandled render error:', error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-5xl">⚠️</p>
          <h1 className="text-xl font-black text-danger-500">تعذّر عرض الصفحة</h1>
          <p className="text-sm text-ink-soft">
            حصل خطأ وقت التشغيل. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.
          </p>
          <details className="w-full rounded-xl bg-paper-deep p-4 text-left">
            <summary className="cursor-pointer text-xs font-bold text-ink-soft">تفاصيل الخطأ (للمطور)</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] text-ink-faint">
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
            </pre>
          </details>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Component } from 'react';
import { useUI } from '@/i18n';

/**
 * ETP-5792 — a render error used to unmount the whole tree and leave a blank page. The boundary
 * catches it and shows `fallback` instead (a node, or `(error, reset) => node`).
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { fallback } = this.props;
    return typeof fallback === 'function' ? fallback(error, this.reset) : fallback;
  }
}

export function ErrorPage() {
  const ui = useUI();
  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-2 p-8 text-center"
      data-testid="ErrorPage__5792"
    >
      <h1 className="text-base font-medium text-foreground">{ui('appErrorTitle')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{ui('appErrorBody')}</p>
      <button
        type="button"
        className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm"
        onClick={() => window.location.reload()}
      >
        {ui('appErrorReload')}
      </button>
    </div>
  );
}

const STATIC_COPY = {
  es: ['Algo ha salido mal', 'Recargar página'],
  en: ['Something went wrong', 'Reload page'],
};

/** Outside every provider (so no dictionary): picks es/en from the document language. */
export function StaticErrorPage() {
  const [title, reload] = STATIC_COPY[document.documentElement.lang?.slice(0, 2)] || STATIC_COPY.en;
  return (
    <div role="alert" style={{ padding: 32, textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 16 }}>{title}</h1>
      <button type="button" onClick={() => window.location.reload()}>{reload}</button>
    </div>
  );
}

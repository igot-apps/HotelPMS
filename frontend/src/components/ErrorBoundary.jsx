import { Component } from 'react';

// If a screen crashes while drawing, show a clear message with a way out instead of a blank page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('[screen error]', error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const home = window.location.pathname.startsWith('/public') ? window.location.pathname.split('/').slice(0, 3).join('/') : '/dashboard';
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <section role="alert" className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-lg">
          <h1 className="text-xl font-bold text-text">This page couldn't load</h1>
          <p className="mt-2 text-sm text-text-muted">Something went wrong while showing this page. Your saved data is safe. Reload to try again, or go back to the start.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">Reload page</button>
            <a href={home} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text">Go to start</a>
          </div>
        </section>
      </main>
    );
  }
}

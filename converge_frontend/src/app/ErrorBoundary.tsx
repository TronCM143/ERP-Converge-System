import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/* Catches render-time crashes anywhere below it.

   Without this, a single thrown error inside any page unmounts the entire React
   tree and the user is left staring at a blank white screen with nothing in the
   UI to explain it — the error only exists in the browser console. That is
   indistinguishable from "the page has no content", which is exactly how it
   gets reported.

   Deliberately a class component: `componentDidCatch` / `getDerivedStateFromError`
   have no hook equivalent, so this is one of the few places a class is still
   required. */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the console trace — the on-screen message is intentionally short.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen app-surface flex items-center justify-center p-6">
        <div className="w-full max-w-lg border border-zinc-700 bg-zinc-900 p-6">
          <h1 className="text-[15px] font-bold uppercase tracking-wide text-zinc-50">
            Something broke on this page
          </h1>
          <p className="mt-2 text-[13px] text-zinc-400">
            The page failed to render. The details below are also in the browser
            console.
          </p>

          <pre className="mt-4 max-h-48 overflow-auto border border-zinc-700 bg-zinc-950 p-3 text-[11px] text-rose-600 whitespace-pre-wrap">
            {error.message}
          </pre>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="flex-1 border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/sales/crm';
              }}
              className="flex-[2] bg-zinc-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-950 hover:bg-zinc-200 transition-colors"
            >
              Back to CRM
            </button>
          </div>
        </div>
      </div>
    );
  }
}

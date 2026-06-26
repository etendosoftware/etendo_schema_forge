import React from 'react';
import { Loader2 } from 'lucide-react';

export function AuthSsoOptions({ providers, buttonRef, error, loading, label, loadingLabel }) {
  if (!providers?.length) {
    return null;
  }
  return (
    <div className="mb-5 space-y-3">
      <div className={loading ? 'pointer-events-none opacity-60' : ''}>
        <div ref={buttonRef} className="flex min-h-11 justify-center" />
      </div>
      <div className="mx-auto flex w-full max-w-[400px] items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="shrink-0 text-sm font-medium normal-case text-slate-400">
          {label}
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      {loading && (
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__79cf84" />
          {loadingLabel}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
          {error}
        </div>
      )}
    </div>
  );
}

export default AuthSsoOptions;

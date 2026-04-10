import { useState, useCallback, useEffect } from 'react';
import { useUI } from '@/i18n';
import PaymentActivityPanel from './PaymentActivityPanel';

/**
 * PaymentActivityToggle -- topbarRight component for Payment In detail view.
 *
 * Renders a small "Activity" toggle button in the topbar. When clicked, opens a
 * right-side drawer overlay containing the PaymentActivityPanel. The main form
 * remains full-width underneath.
 *
 * Props received from DetailView: { data, recordId, token, apiBaseUrl, api, onProcess }
 */
export default function PaymentActivityToggle({ data, recordId, token, apiBaseUrl, api }) {
  const [open, setOpen] = useState(false);
  const ui = useUI();

  const toggle = useCallback(() => setOpen(prev => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  return (
    <>
      {/* Toggle button in topbar */}
      <button
        type="button"
        onClick={toggle}
        title={ui('activity')}
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        {/* Clock icon (SVG) */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {/* Backdrop overlay */}
      {open && (
        <div
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.15)',
            zIndex: 998,
            transition: 'opacity 200ms ease',
          }}
        />
      )}

      {/* Slide-in drawer from right */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 400,
          maxWidth: '90vw',
          backgroundColor: '#f9fafb',
          borderLeft: '1px solid #e5e7eb',
          boxShadow: open ? '-4px 0 24px rgba(0,0,0,0.08)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 250ms ease',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Drawer header with close button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '12px 16px 0',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={close}
            title={ui('closeActivityPanel')}
            className="transition-colors"
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'transparent',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            &#x2715;
          </button>
        </div>

        {/* Panel content -- fills remaining height */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <PaymentActivityPanel
            data={data}
            recordId={recordId || data?.id}
            token={token}
            apiBaseUrl={apiBaseUrl}
          />
        </div>
      </div>
    </>
  );
}

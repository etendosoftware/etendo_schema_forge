import { useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';

/**
 * moreMenuContent (kebab) for Internal Consumption.
 * Renders a "Void" action that calls M_Internal_Consumption_Post with { action: 'VO' }.
 * Only shown when the document is Completed ('CO') — voiding an open/draft document is not allowed.
 */
export default function InternalConsumptionActions({ data, recordId, token, apiBaseUrl, onClose, onRefresh }) {
  const ui = useUI();
  const [processing, setProcessing] = useState(false);

  // Void is only available on completed documents.
  if (data?.status !== 'CO') return null;

  const handleVoid = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const res = await fetch(`${apiBaseUrl}/internalConsumption/${recordId}/action/processNow`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'VO' }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `${res.status} ${res.statusText}`);
      }
      toast.success(ui('internalConsumptionVoided'));
      onRefresh?.();
      onClose();
    } catch (err) {
      toast.error(ui('internalConsumptionVoidError').replace('{error}', err.message));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleVoid}
      disabled={processing}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 12px', background: 'none', border: 'none',
        textAlign: 'left', cursor: processing ? 'not-allowed' : 'pointer',
        fontSize: 13, color: processing ? '#9CA3AF' : '#111827',
        opacity: processing ? 0.6 : 1,
      }}
      onMouseEnter={e => { if (!processing) e.currentTarget.style.background = '#F3F4F6'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
    >
      {processing ? ui('internalConsumptionVoiding') : ui('internalConsumptionVoid')}
    </button>
  );
}

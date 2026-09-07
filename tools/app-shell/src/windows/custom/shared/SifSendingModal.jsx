import { useState, useEffect, useRef } from 'react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getSifTbaiSuccessKey, getSifTbaiErrorKey } from './sifSending.js';

async function callProcess(apiFetch, specName, recordId, columnName) {
  const res = await apiFetch(
    `/${specName}/header/${recordId}/action/${columnName}`,
    { method: 'POST', body: '{}' },
  );
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.response?.message || json?.message || `HTTP ${res.status}`);
  }
}

export default function SifSendingModal({
  pendingTargets,
  bodyKey,
  base,
  specName,
  recordId,
  onClose,
  onAfterSend,
  zIndex = 50,
  titleId = 'send-to-sif-title',
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(base);
  // ETP-5087: the TBAI result copy follows the same purchase/sales split as the
  // confirmation copy (see sifSending.js) — a purchase invoice is sent to Batuz,
  // never to the generic TicketBAI scheme.
  const tbaiSuccessKey = getSifTbaiSuccessKey(specName);
  const tbaiErrorKey = getSifTbaiErrorKey(specName);
  const [phase, setPhase] = useState('confirm');
  const [results, setResults] = useState({});
  const [progress, setProgress] = useState(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (phase !== 'sending') return;
    setProgress(0);
    const id = setInterval(() => {
      setProgress(prev => prev >= 80 ? prev : prev + (80 - prev) * 0.04);
    }, 200);
    return () => clearInterval(id);
  }, [phase]);

  function handleClose() {
    onClose();
    setPhase('confirm');
    setResults({});
    setProgress(0);
  }

  async function handleSend() {
    setPhase('sending');
    const next = {};

    if (pendingTargets.sendSii) {
      try {
        await callProcess(apiFetch, specName, recordId, 'Em_aeatsii_send');
        next.sii = { ok: true };
      } catch (err) {
        next.sii = { ok: false, error: err.message };
      }
    }

    if (pendingTargets.sendTbai) {
      try {
        await callProcess(apiFetch, specName, recordId, 'Em_Tbai_Xmlgenerator');
        next.tbai = { ok: true };
      } catch (err) {
        next.tbai = { ok: false, error: err.message };
      }
    }

    setResults(next);
    await onAfterSend?.(next);

    setProgress(100);
    await new Promise(r => setTimeout(r, 400));
    if (mountedRef.current) setPhase('results');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: 'hsl(var(--foreground) / 0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ background: 'hsl(var(--card))', borderRadius: '12px', padding: '24px', minWidth: '320px', maxWidth: '480px', width: '100%' }}>
        <h3 id={titleId} style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
          {ui('sendToSifTitle')}
        </h3>

        {phase === 'confirm' && (
          <>
            <p style={{ fontSize: '14px', color: 'hsl(var(--foreground))', marginBottom: '20px' }}>
              {ui(bodyKey)}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={handleClose}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid hsl(var(--border-subtle))', cursor: 'pointer', background: 'hsl(var(--card))' }}
              >
                {ui('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSend}
                style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--status-info-fg)', color: 'hsl(var(--card))', border: 'none', cursor: 'pointer' }}
              >
                {ui('sendToSifConfirm')}
              </button>
            </div>
          </>
        )}

        {phase === 'sending' && (
          <div style={{ padding: '8px 0 4px' }}>
            <p style={{ fontSize: '14px', color: 'hsl(var(--foreground))', marginBottom: '16px' }}>
              {ui('sendToSifSending')}
            </p>
            <div style={{ background: 'hsl(var(--muted))', borderRadius: 999, height: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, var(--status-info-fg), var(--status-info-fg))',
                borderRadius: 999,
                transition: 'width 150ms ease-out',
              }} />
            </div>
            <p style={{ fontSize: '12px', color: 'hsl(var(--text-disabled))', marginTop: '6px', textAlign: 'right' }}>
              {Math.round(progress)}%
            </p>
          </div>
        )}

        {phase === 'results' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {results.sii && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <span style={{ color: results.sii.ok ? 'var(--status-success-fg)' : 'hsl(var(--destructive))', fontWeight: 600 }}>
                    {results.sii.ok ? '✓' : '✗'}
                  </span>
                  <span>
                    {results.sii.ok ? ui('sendToSifSuccessSii') : (results.sii.error || ui('sendToSifErrorSii'))}
                  </span>
                </div>
              )}
              {results.tbai && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <span style={{ color: results.tbai.ok ? 'var(--status-success-fg)' : 'hsl(var(--destructive))', fontWeight: 600 }}>
                    {results.tbai.ok ? '✓' : '✗'}
                  </span>
                  <span>
                    {results.tbai.ok ? ui(tbaiSuccessKey) : (results.tbai.error || ui(tbaiErrorKey))}
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleClose}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid hsl(var(--border-subtle))', cursor: 'pointer', background: 'hsl(var(--card))' }}
              >
                {ui('close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

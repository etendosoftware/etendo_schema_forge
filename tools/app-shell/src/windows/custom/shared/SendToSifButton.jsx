import { useState, useMemo } from 'react';
import { useUI } from '@/i18n';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { useAuth } from '@/auth/AuthContext';
import { getPendingSifTargets, getSifBodyKey } from './sifSending.js';

export default function SendToSifButton({ data, recordId, token, apiBaseUrl, status }) {
  const ui = useUI();
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState('confirm');
  const [results, setResults] = useState({});
  const [refreshOnClose, setRefreshOnClose] = useState(false);
  const specName = apiBaseUrl?.split('/').filter(Boolean).pop() || 'sales-invoice';
  const updateEventName = `${specName}:invoice-updated`;

  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const { profile } = useFiscalConfig(orgId, token, apiBaseUrl);
  const pendingTargets = getPendingSifTargets(specName, profile, data);
  const hasPendingTargets = pendingTargets.sendSii || pendingTargets.sendTbai;

  if (status !== 'CO' || !hasPendingTargets) return null;

  const bodyKey = getSifBodyKey(pendingTargets);

  async function callProcess(columnName) {
    const res = await fetch(
      `${base}/${specName}/header/${recordId}/action/${columnName}`,
      { method: 'POST', headers, body: '{}' },
    );
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.response?.message || json?.message || `HTTP ${res.status}`);
    }
  }

  async function handleSend() {
    setPhase('sending');
    const next = {};

    if (pendingTargets.sendSii) {
      try {
        await callProcess('Em_aeatsii_send');
        next.sii = { ok: true };
      } catch (err) {
        next.sii = { ok: false, error: err.message };
      }
    }

    if (pendingTargets.sendTbai) {
      try {
        await callProcess('Em_Tbai_Xmlgenerator');
        next.tbai = { ok: true };
      } catch (err) {
        next.tbai = { ok: false, error: err.message };
      }
    }

    setResults(next);

    if (Object.values(next).some(result => result?.ok)) {
      setRefreshOnClose(true);
    }

    setPhase('results');
  }

  function handleClose() {
    if (refreshOnClose) {
      window.dispatchEvent(new CustomEvent(updateEventName, {
        detail: { invoiceId: recordId },
      }));
    }
    setModalOpen(false);
    setPhase('confirm');
    setResults({});
    setRefreshOnClose(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:opacity-80 cursor-pointer h-9"
        style={{ padding: '0 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#374151', background: '#fff' }}
      >
        {ui('sendToSif')}
      </button>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-to-sif-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', minWidth: '320px', maxWidth: '480px', width: '100%' }}>
            <h3 id="send-to-sif-title" style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
              {ui('sendToSifTitle')}
            </h3>

            {phase === 'confirm' && (
              <>
                <p style={{ fontSize: '14px', color: '#374151', marginBottom: '20px' }}>
                  {ui(bodyKey)}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleClose}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff' }}
                  >
                    {ui('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    style={{ padding: '8px 16px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    {ui('sendToSifConfirm')}
                  </button>
                </div>
              </>
            )}

            {phase === 'sending' && (
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {ui('sendToSifSending')}
              </p>
            )}

            {phase === 'results' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {results.sii && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                      <span style={{ color: results.sii.ok ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {results.sii.ok ? '✓' : '✗'}
                      </span>
                      <span>
                        {results.sii.ok ? ui('sendToSifSuccessSii') : (results.sii.error || ui('sendToSifErrorSii'))}
                      </span>
                    </div>
                  )}
                  {results.tbai && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                      <span style={{ color: results.tbai.ok ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {results.tbai.ok ? '✓' : '✗'}
                      </span>
                      <span>
                        {results.tbai.ok ? ui('sendToSifSuccessTbai') : (results.tbai.error || ui('sendToSifErrorTbai'))}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleClose}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff' }}
                  >
                    {ui('close')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

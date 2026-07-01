import { useState } from 'react';
import { useUI } from '@/i18n';

/* eslint-disable react/prop-types */

export default function ReactivarModal({ dir, onConfirm, onClose }) {
  const ui = useUI();
  const [loading, setLoading] = useState(false);
  const isIn = dir === 'in';

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const items = [
    [ui('reactivarItem1Title'), ui('reactivarItem1Desc')],
    [ui('reactivarItem2Title'), ui('reactivarItem2Desc')],
    [ui('reactivarItem3Title'), ui('reactivarItem3Desc')],
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,20,28,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 }}>
      <div style={{ width: 520, maxWidth: '100%', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(16,20,28,.28)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '22px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, paddingRight: 12 }}>
            <h3 style={{ margin: 0, font: '700 18px/24px Inter', color: '#D50B3E' }}>
              {ui(isIn ? 'reactivarInTitle' : 'reactivarOutTitle')}
            </h3>
            <div style={{ font: '400 13px/19px Inter', color: '#555B6D', marginTop: 6 }}>
              {ui(isIn ? 'reactivarInSub' : 'reactivarOutSub')}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #E3E7EC', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6C6C89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '4px 24px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {items.map(([t, d], i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C5234A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <div>
                  <span style={{ font: '600 13px/18px Inter', color: '#19191D' }}>{t}.</span>
                  <span style={{ font: '400 13px/18px Inter', color: '#555B6D' }}> {d}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Yellow warning box */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{ font: '400 13px/18px Inter', color: '#92400E' }}>{ui(isIn ? 'reactivarWarningIn' : 'reactivarWarningOut')}</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid #E3E7EC', background: '#FAFAFB' }}>
          <button
            onClick={onClose}
            style={{ height: 40, padding: '0 20px', borderRadius: 9999, border: '1px solid #E3E7EC', background: '#fff', font: '500 14px/1 Inter', color: '#19191D', cursor: 'pointer' }}
          >
            {ui('cancel')}
          </button>
          <button
            disabled={loading}
            onClick={handleConfirm}
            style={{ height: 40, padding: '0 20px', borderRadius: 9999, border: 0, background: loading ? '#F1F2F4' : '#D50B3E', font: '500 14px/1 Inter', color: loading ? '#A9A9BC' : '#fff', cursor: loading ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
            </svg>
            {loading ? '...' : ui('reactivarTodosModoss')}
          </button>
        </div>
      </div>
    </div>
  );
}

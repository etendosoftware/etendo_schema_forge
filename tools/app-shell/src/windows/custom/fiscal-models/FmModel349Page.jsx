import React, { useState } from 'react';
import { useUI } from '@/i18n';
import { StatusPillMenu, SectionCard, EmptyState } from './FmCommon.jsx';
import { PresentModal, FileGenModal } from './FmOverlays.jsx';
import { fmtDecl, formatAmount } from './fiscalModelsUtils.js';

const MOCK_OPERATORS = [
  { nif: 'DE123456789',   nombre: 'Kundenwerk GmbH',   pais: 'DE', base: 48920.00, op: 'A' },
  { nif: 'FR98765432100', nombre: 'Maison Beaumont',   pais: 'FR', base: 12540.00, op: 'A' },
  { nif: 'IT12345678901', nombre: 'Rossi Srl',         pais: 'IT', base:  8300.00, op: 'E' },
];

export default function FmModel349Page({ decl, onBack, onStatusChange }) {
  const ui = useUI();
  const t = ui;
  const [status, setStatus] = useState(decl.status);
  const [showPresent, setShowPresent] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const operators = decl.operators ?? MOCK_OPERATORS;

  function handleStatusChange(newStatus) {
    setStatus(newStatus);
    onStatusChange?.(decl.id, newStatus);
  }

  return (
    <div className="fm-page">
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}
          onClick={onBack}
          aria-label={t('fm.action.back')}
        >
          ←
        </button>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{fmtDecl(decl)}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid #e5e7eb', cursor: 'pointer', background: '#f9fafb' }}
            onClick={() => setShowFilegen(true)}
          >
            {t('fm.action.generate_file')}
          </button>
          <button
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid #3b82f6', cursor: 'pointer', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }}
            onClick={() => setShowPresent(true)}
          >
            {t('fm.action.present')}
          </button>
          <StatusPillMenu status={status} onStatusChange={handleStatusChange} />
        </div>
      </div>

      <div className="fm-page__body">
        <SectionCard title={t('fm.section.operators')}>
          {operators.length === 0
            ? <EmptyState message={t('fm.operators.empty')} />
            : (
              <table className="fm-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>{t('fm.col.nif')}</th>
                    <th>{t('fm.col.nombre')}</th>
                    <th>{t('fm.col.pais')}</th>
                    <th style={{ textAlign: 'right' }}>{t('fm.col.base')}</th>
                    <th>{t('fm.col.operacion')}</th>
                  </tr>
                </thead>
                <tbody>
                  {operators.map((op, i) => (
                    <tr key={op.nif ?? i}>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{op.nif}</td>
                      <td>{op.nombre}</td>
                      <td>{op.pais}</td>
                      <td style={{ textAlign: 'right' }}>{formatAmount(op.base)}</td>
                      <td>{op.op}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </SectionCard>
      </div>

      {showPresent && (
        <PresentModal
          decl={decl}
          onConfirm={({ status: s }) => handleStatusChange(s)}
          onClose={() => setShowPresent(false)}
        />
      )}
      {showFilegen && (
        <FileGenModal decl={decl} onConfirm={() => {}} onClose={() => setShowFilegen(false)} />
      )}
    </div>
  );
}

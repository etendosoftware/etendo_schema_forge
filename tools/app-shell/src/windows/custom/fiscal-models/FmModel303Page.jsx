import React, { useState } from 'react';
import { useUI } from '@/i18n';
import { StatusPillMenu, Tabs, Banner, SectionCard } from './FmCommon.jsx';
import FmBoxes303 from './FmBoxes303.jsx';
import { PresentModal, FileGenModal, IncidentTray } from './FmOverlays.jsx';
import { fmtDecl, formatAmount } from './fiscalModelsUtils.js';

const TABS = [
  { id: 'boxes',     label: 'Casillas' },
  { id: 'summary',   label: 'Resumen' },
  { id: 'incidents', label: 'Incidencias' },
];

export default function FmModel303Page({ decl, onBack, onStatusChange }) {
  const ui = useUI();
  const t = ui;
  const [status, setStatus] = useState(decl.status);
  const [activeTab, setActiveTab] = useState('boxes');
  const [showPresent, setShowPresent] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const [showIncidents, setShowIncidents] = useState(false);

  function handleStatusChange(newStatus) {
    setStatus(newStatus);
    onStatusChange?.(decl.id, newStatus);
  }

  function handlePresent({ status: newStatus }) {
    handleStatusChange(newStatus);
  }

  const blocking = decl.incidents?.blocking ?? 0;
  const warning = decl.incidents?.warning ?? 0;

  return (
    <div className="fm-page">
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', lineHeight: 1 }}
          onClick={onBack}
          aria-label={t('fm.action.back')}
        >
          ←
        </button>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{fmtDecl(decl)}</span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {decl.type === 'ord' ? t('fm.type.ordinary') : t('fm.type.complementary')}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {blocking > 0 && (
            <button
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer' }}
              onClick={() => setShowIncidents(true)}
            >
              🚫 {blocking} {t('fm.incidents.blocking')}
            </button>
          )}
          {warning > 0 && (
            <button
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#fffbeb', color: '#d97706', border: '1px solid #fed7aa', cursor: 'pointer' }}
              onClick={() => setShowIncidents(true)}
            >
              ⚠ {warning} {t('fm.incidents.warning')}
            </button>
          )}
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

      {decl.result?.kind === 'ingresar' && (
        <Banner type="info" message={`${t('fm.result.ingresar')}: ${formatAmount(decl.result.amount)}`} />
      )}
      {decl.result?.kind === 'compensar' && (
        <Banner type="success" message={`${t('fm.result.compensar')}: ${formatAmount(decl.result.amount)}`} />
      )}

      <Tabs tabs={TABS} active={activeTab} onSelect={setActiveTab} />

      <div className="fm-page__body">
        {activeTab === 'boxes' && (
          <SectionCard title={t('fm.section.boxes')}>
            <FmBoxes303 boxes={decl.boxes ?? null} />
          </SectionCard>
        )}
        {activeTab === 'summary' && (
          <SectionCard title={t('fm.section.summary')}>
            <p style={{ fontSize: 12, color: '#6b7280' }}>{t('fm.summary.placeholder')}</p>
          </SectionCard>
        )}
        {activeTab === 'incidents' && (
          <SectionCard title={t('fm.incidents.title')}>
            {blocking === 0 && warning === 0
              ? <p style={{ fontSize: 12, color: '#9ca3af' }}>{t('fm.incidents.none')}</p>
              : <p style={{ fontSize: 12 }}>{blocking} {t('fm.incidents.blocking')}, {warning} {t('fm.incidents.warning')}</p>}
          </SectionCard>
        )}
      </div>

      {showPresent && (
        <PresentModal decl={decl} onConfirm={handlePresent} onClose={() => setShowPresent(false)} />
      )}
      {showFilegen && (
        <FileGenModal decl={decl} onConfirm={() => {}} onClose={() => setShowFilegen(false)} />
      )}
      {showIncidents && (
        <IncidentTray
          incidents={[
            ...Array(blocking).fill({ message: t('fm.incidents.blocking_placeholder'), blocking: true }),
            ...Array(warning).fill({ message: t('fm.incidents.warning_placeholder'), blocking: false }),
          ]}
          onClose={() => setShowIncidents(false)}
        />
      )}
    </div>
  );
}

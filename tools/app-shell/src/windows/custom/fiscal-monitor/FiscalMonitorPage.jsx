import { useState } from 'react';
import { useCertExpiry } from '../fiscal-config/useCertExpiry.js';
import CertExpiryBanner from '../fiscal-config/CertExpiryBanner.jsx';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useFiscalMonitor } from './useFiscalMonitor.js';
import InvoicePreviewModal from '../shared/InvoicePreviewModal.jsx';
import ContactDetailModal from './ContactDetailModal.jsx';
import { useDebugMode } from './useDebugMode.js';
import { computeKpis } from './fiscalMonitor.utils.js';
import { MOCK_MONITOR_DATA, MOCK_SII_ROWS, MOCK_TBAI_ROWS, MOCK_VF_ROWS } from './fiscalMonitorMockData.js';
import SiiMonitorSection from './SiiMonitorSection.jsx';
import TbaiMonitorSection from './TbaiMonitorSection.jsx';
import VerifactuMonitorSection from './VerifactuMonitorSection.jsx';
import VfSolveErrorModal from './VfSolveErrorModal.jsx';
import FiscalMonitorDebugPanel from './FiscalMonitorDebugPanel.jsx';
import './fiscal-monitor.css';

const PROFILE_LABELS = {
  sii:          'SII',
  tbai:         'TBAI',
  'sii+tbai':   'SII + TBAI',
  'sii-navarra':'SII Navarra',
  verifactu:    'VERI*FACTU',
};


const FmEmpty = ({ ui }) => {
  const navigate = useNavigate();
  return (
    <div className="fm-empty">
      <div className="ill">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </div>
      <h3>{ui('fiscalMonitor.unconfigured')}</h3>
      <p>{ui('fiscalMonitor.setupDescription')}</p>
      <div className="actions">
        <button className="fm-action-btn primary" onClick={() => navigate('/fiscal-config')}>
          {ui('fiscalMonitor.setupCta')}
        </button>
      </div>
    </div>
  );
};

// ── System tabs icons ─────────────────────────────────────────────────────────
const SiiTabIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const TbaiTabIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);

function getTotalCountForProfile(profile, siiTotal, tbaiTotal, vfTotal) {
  if (profile === 'sii' || profile === 'sii-navarra') return siiTotal;
  if (profile === 'tbai') return tbaiTotal;
  if (profile === 'verifactu') return vfTotal;
  if (profile === 'sii+tbai') return siiTotal + tbaiTotal;
  return 0;
}

async function resolveAndPreviewInvoice(apiFetch, invoiceId, specHint, setPreviewSpec, setPreviewInvoice) {
  if (!invoiceId) return;
  const specs = specHint === 'sales-invoice'
    ? ['sales-invoice', 'purchase-invoice']
    : ['purchase-invoice', 'sales-invoice'];
  for (const spec of specs) {
    try {
      const res = await apiFetch(`/${spec}/header/${invoiceId}`);
      if (!res.ok) continue;
      const json = await res.json();
      const inv = json?.response?.data?.[0] ?? null;
      if (inv?.id) {
        setPreviewSpec(spec);
        setPreviewInvoice(inv);
        return;
      }
    } catch { /* try next */ }
  }
}

function useDebugState(orgId, apiBaseUrl) {
  const debugMode = useDebugMode();
  const [debugProfile, setDebugProfile] = useState(null);
  const [mockData,     setMockData]     = useState(false);

  const { loading, error, profile: realProfile, kpis: realKpis, siiParentId, refetch } = useFiscalMonitor(orgId, apiBaseUrl);

  const profile = (debugMode && debugProfile) ? debugProfile : realProfile;

  let kpis;
  if (debugMode && mockData) {
    kpis = computeKpis(profile, MOCK_MONITOR_DATA);
  } else if (debugMode && debugProfile) {
    kpis = computeKpis(debugProfile, {});
  } else {
    kpis = realKpis;
  }

  const siiMockRows  = (debugMode && mockData) ? MOCK_SII_ROWS  : null;
  const tbaiMockRows = (debugMode && mockData) ? MOCK_TBAI_ROWS : null;
  const vfMockRows   = (debugMode && mockData) ? MOCK_VF_ROWS   : null;
  const debugOverrideActive = debugMode && !!debugProfile;

  return {
    loading, error, profile, kpis, siiParentId,
    refetch,
    siiMockRows, tbaiMockRows, vfMockRows,
    debugMode, debugProfile, setDebugProfile,
    mockData, setMockData, debugOverrideActive,
  };
}

export default function FiscalMonitorPage({ token, apiBaseUrl }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;

  const [siiInitialTab,     setSiiInitialTab]     = useState('issued');
  const [tbaiInitialFilter, setTbaiInitialFilter] = useState('all');
  const [veriInitialTab,    setVeriInitialTab]    = useState('correct');
  const [refreshKey,        setRefreshKey]        = useState(0);
  const [mockCertDays,      setMockCertDays]      = useState(null);
  const [previewInvoice,    setPreviewInvoice]    = useState(null);
  const [previewSpec,       setPreviewSpec]       = useState('sales-invoice');
  const [bpPopup,           setBpPopup]           = useState(null);
  const [vfErrorRows,       setVfErrorRows]       = useState([]);
  const [vfErrorModalOpen,  setVfErrorModalOpen]  = useState(false);
  const [systemTab,         setSystemTab]         = useState('sii');
  const contactsApiBase = `${neoBase(apiBaseUrl)}/contacts`;
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));

  const {
    loading, error, profile, kpis, siiParentId,
    refetch,
    siiMockRows, tbaiMockRows, vfMockRows,
    debugMode, debugProfile, setDebugProfile,
    mockData, setMockData, debugOverrideActive,
  } = useDebugState(orgId, apiBaseUrl);

  const { daysLeft: certDaysLeft } = useCertExpiry(apiBaseUrl, { mockDaysLeft: mockCertDays, orgId });

  // ── Count helpers for useSetPageMeta (must be computed before hook call) ──
  const _siiTotalMeta  = (kpis?.sii?.issued ?? 0) + (kpis?.sii?.issuedPrevious ?? 0)
                       + (kpis?.sii?.received ?? 0) + (kpis?.sii?.receivedPrevious ?? 0);
  const _tbaiTotalMeta = kpis?.tbai?.total ?? 0;
  const _vfTotalMeta   = (kpis?.verifactu?.accepted ?? 0) + (kpis?.verifactu?.partiallyAccepted ?? 0)
                       + (kpis?.verifactu?.rejected ?? 0) + (kpis?.verifactu?.invalid ?? 0);
  const _totalCountMeta = getTotalCountForProfile(profile, _siiTotalMeta, _tbaiTotalMeta, _vfTotalMeta);

  useSetPageMeta({
    title: PROFILE_LABELS[profile] ?? '',
    breadcrumb: `${ui('settings')} / ${ui('fiscal.monitor.nav')} / ${ui('fiscalMonitor.systemFiscal')} / ${PROFILE_LABELS[profile] ?? ''}`,
    recordCount: _totalCountMeta,
  });

  function handleRefresh() {
    refetch();
    setRefreshKey(k => k + 1);
  }

  async function handleInvoiceOpen(invoiceId, specHint = 'sales-invoice') {
    await resolveAndPreviewInvoice(apiFetch, invoiceId, specHint, setPreviewSpec, setPreviewInvoice);
  }

  function handleVfErrorClick(row) {
    setVfErrorRows([row]);
    setVfErrorModalOpen(true);
  }

  function handleVfResolveClick(rows) {
    setVfErrorRows(rows);
    setVfErrorModalOpen(true);
  }

  const DebugPanel = debugMode ? (
    <FiscalMonitorDebugPanel
      activeProfile={debugProfile}
      onProfileChange={setDebugProfile}
      mockData={mockData}
      onMockDataChange={setMockData}
      mockCertDays={mockCertDays}
      onSetCertDays={setMockCertDays}
      data-testid="FiscalMonitorDebugPanel__884f90" />
  ) : null;

  if (!debugOverrideActive && loading) {
    return (
      <>
        {DebugPanel}
        <div className="fm-wrap fm-page" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="fm-skeleton" style={{ height: 64, borderRadius: 12 }} />
          <div className="fm-skeleton" style={{ height: 400, borderRadius: 12 }} />
        </div>
      </>
    );
  }

  if (!debugOverrideActive && error) {
    return (
      <>
        {DebugPanel}
        <div className="fm-wrap fm-page">
          <div className="fm-empty">
            <div className="ill" style={{ background: '#FEF0F4', color: '#D50B3E' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h3>{ui('fiscalMonitor.errorTitle')}</h3>
            <p>{error}</p>
          </div>
        </div>
      </>
    );
  }

  if (!debugOverrideActive && (!profile || profile === 'unconfigured')) {
    return (
      <>
        {DebugPanel}
        <div className="fm-wrap fm-page"><FmEmpty ui={ui} data-testid="FmEmpty__884f90" /></div>
      </>
    );
  }

  if (!debugOverrideActive && profile === 'conflict') {
    return (
      <>
        {DebugPanel}
        <div className="fm-wrap fm-page">
          <div className="fm-empty">
            <div className="ill" style={{ background: '#FEF0F4', color: '#D50B3E' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3>{ui('fiscalMonitor.conflictTitle')}</h3>
            <p>{ui('fiscalMonitor.conflict')}</p>
          </div>
        </div>
      </>
    );
  }

  // ── Count helpers for system tabs ─────────────────────────────────────────
  const siiTotal  = _siiTotalMeta;
  const tbaiTotal = _tbaiTotalMeta;

  return (
    <>
      {DebugPanel}
      <div className="fm-wrap fm-page">
        <CertExpiryBanner
          daysLeft={certDaysLeft}
          variant="subtle"
          data-testid="CertExpiryBanner__884f90" />

        {/* ── SII + TBAI combined: system tabs ── */}
        {profile === 'sii+tbai' && (
          <section className="fm-section">
            <div className="fm-tablecard">
              <div className="fm-system-tabs" role="tablist">
                <button
                  role="tab"
                  aria-selected={systemTab === 'sii'}
                  className={`fm-system-tab${systemTab === 'sii' ? ' active' : ''}`}
                  onClick={() => setSystemTab('sii')}
                >
                  <SiiTabIcon data-testid="SiiTabIcon__884f90" />
                  {ui('fiscalMonitor.systemTab.sii')}
                  <span className="tab-count">{siiTotal}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={systemTab === 'tbai'}
                  className={`fm-system-tab${systemTab === 'tbai' ? ' active' : ''}`}
                  onClick={() => setSystemTab('tbai')}
                >
                  <TbaiTabIcon data-testid="TbaiTabIcon__884f90" />
                  {ui('fiscalMonitor.systemTab.tbai')}
                  <span className="tab-count">{tbaiTotal}</span>
                </button>
              </div>

              {systemTab === 'sii' && (
                <SiiMonitorSection
                  noWrap
                  compact
                  orgId={orgId}
                  apiBaseUrl={apiBaseUrl}
                  parentId={siiParentId}
                  initialTab={siiInitialTab}
                  mockRows={siiMockRows}
                  onTabChange={setSiiInitialTab}
                  refreshKey={refreshKey}
                  onInvoiceOpen={handleInvoiceOpen}
                  onBpClick={(bpId, invoiceId, invoiceSpec) => setBpPopup({ bpId, invoiceId, invoiceSpec })}
                  kpis={kpis}
                  data-testid="SiiMonitorSection__884f90" />
              )}
              {systemTab === 'tbai' && (
                <TbaiMonitorSection
                  noWrap
                  orgId={orgId}
                  apiBaseUrl={apiBaseUrl}
                  initialFilter={tbaiInitialFilter}
                  mockRows={tbaiMockRows}
                  onFilterChange={setTbaiInitialFilter}
                  refreshKey={refreshKey}
                  onInvoiceOpen={handleInvoiceOpen}
                  onBpClick={(bpId) => setBpPopup({ bpId })}
                  kpis={kpis}
                  data-testid="TbaiMonitorSection__884f90" />
              )}
            </div>
          </section>
        )}

        {/* ── SII standalone ── */}
        {(profile === 'sii' || profile === 'sii-navarra') && (
          <SiiMonitorSection
            orgId={orgId}
            apiBaseUrl={apiBaseUrl}
            parentId={siiParentId}
            initialTab={siiInitialTab}
            mockRows={siiMockRows}
            onTabChange={setSiiInitialTab}
            refreshKey={refreshKey}
            onInvoiceOpen={handleInvoiceOpen}
            onBpClick={(bpId, invoiceId, invoiceSpec) => setBpPopup({ bpId, invoiceId, invoiceSpec })}
            kpis={kpis}
            data-testid="SiiMonitorSection__884f90" />
        )}

        {/* ── TBAI standalone ── */}
        {profile === 'tbai' && (
          <TbaiMonitorSection
            orgId={orgId}
            apiBaseUrl={apiBaseUrl}
            initialFilter={tbaiInitialFilter}
            mockRows={tbaiMockRows}
            onFilterChange={setTbaiInitialFilter}
            refreshKey={refreshKey}
            onInvoiceOpen={handleInvoiceOpen}
            onBpClick={(bpId) => setBpPopup({ bpId })}
            kpis={kpis}
            data-testid="TbaiMonitorSection__884f90" />
        )}

        {/* ── Verifactu ── */}
        {profile === 'verifactu' && (
          <VerifactuMonitorSection
            orgId={orgId}
            apiBaseUrl={apiBaseUrl}
            initialTab={veriInitialTab}
            mockRows={vfMockRows}
            onTabChange={setVeriInitialTab}
            refreshKey={refreshKey}
            onInvoiceOpen={handleInvoiceOpen}
            onBpClick={(bpId) => setBpPopup({ bpId })}
            onVfErrorClick={handleVfErrorClick}
            onVfResolveClick={handleVfResolveClick}
            kpis={kpis}
            data-testid="VerifactuMonitorSection__884f90" />
        )}
      </div>
      {previewInvoice && (
        <InvoicePreviewModal
          invoice={previewInvoice}
          token={token}
          apiBaseUrl={`${neoBase(apiBaseUrl)}/${previewSpec}`}
          specName={previewSpec}
          onClose={() => setPreviewInvoice(null)}
          data-testid="InvoicePreviewModal__884f90" />
      )}
      {bpPopup?.bpId && (
        <ContactDetailModal
          open={!!bpPopup.bpId}
          onClose={() => setBpPopup(null)}
          bpId={bpPopup.bpId}
          contactsApiBase={contactsApiBase}
          invoiceId={bpPopup.invoiceId ?? null}
          invoiceSpec={bpPopup.invoiceSpec ?? null}
          neoApiBase={neoBase(apiBaseUrl)}
          data-testid="ContactDetailModal__884f90" />
      )}
      <VfSolveErrorModal
        open={vfErrorModalOpen}
        onClose={() => setVfErrorModalOpen(false)}
        rows={vfErrorRows}
        neoApiBase={neoBase(apiBaseUrl)}
        onResolved={() => setRefreshKey(k => k + 1)}
        data-testid="VfSolveErrorModal__884f90" />
    </>
  );
}

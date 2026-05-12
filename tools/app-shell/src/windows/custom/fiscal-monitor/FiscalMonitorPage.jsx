import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI } from '@/i18n';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useFiscalMonitor } from './useFiscalMonitor.js';
import InvoicePreviewModal from '../shared/InvoicePreviewModal.jsx';
import ContactDetailModal from './ContactDetailModal.jsx';
import { useDebugMode } from './useDebugMode.js';
import { computeKpis } from './fiscalMonitor.utils.js';
import { MOCK_MONITOR_DATA, MOCK_SII_ROWS, MOCK_TBAI_ROWS, MOCK_VF_ROWS } from './fiscalMonitorMockData.js';
import FiscalKpiCards from './FiscalKpiCards.jsx';
import SiiMonitorSection from './SiiMonitorSection.jsx';
import TbaiMonitorSection from './TbaiMonitorSection.jsx';
import VerifactuMonitorSection from './VerifactuMonitorSection.jsx';
import FiscalMonitorDebugPanel from './FiscalMonitorDebugPanel.jsx';
import './fiscal-monitor.css';

const ProfileBadge = ({ profile, labels = {} }) => {
  const styles = {
    sii:          { bg: '#121217', color: '#fff' },
    tbai:         { bg: '#5423E7', color: '#fff' },
    'sii+tbai':   { bg: '#121217', color: '#fff' },
    'sii-navarra':{ bg: '#121217', color: '#fff' },
    verifactu:    { bg: '#0075AD', color: '#fff' },
    unconfigured: { bg: '#F7F7F8', color: '#6C6C89' },
    conflict:     { bg: '#FEF0F4', color: '#D50B3E' },
  };
  const s = styles[profile] || styles.unconfigured;
  return (
    <span className="fm-profile-badge" style={{ background: s.bg, color: s.color }}>
      {labels[profile] || profile}
    </span>
  );
};

const RefreshButton = ({ loading, onRefresh, ui }) => (
  <button
    className="fm-orglead-refresh"
    onClick={loading ? undefined : onRefresh}
    disabled={loading}
    aria-label={ui('fiscalMonitor.refresh')}
    title={ui('fiscalMonitor.refresh')}
    style={{ background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
  >
    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--fm-fg-3)' }} />
  </button>
);

const OrgLead = ({ org, profile, ui, onRefresh, loading }) => {
  const profileLabels = {
    sii: 'SII', tbai: 'TBAI', 'sii+tbai': 'SII + TBAI',
    'sii-navarra': 'SII Navarra', verifactu: 'Verifactu',
    unconfigured: ui('fiscalMonitor.profile.unconfigured'),
    conflict: ui('fiscalMonitor.profile.conflict'),
  };
  return (
  <div className="fm-orglead">
    <div className="l">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="name">{org.name}</span>
          <ProfileBadge profile={profile} labels={profileLabels} />
        </div>
        <div className="meta">{ui('fiscalMonitor.orgMeta')}</div>
      </div>
    </div>
    <div className="r">
      <RefreshButton loading={loading} onRefresh={onRefresh} ui={ui} />
    </div>
  </div>
  );
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

function useDebugState(orgId, token, apiBaseUrl) {
  const debugMode = useDebugMode();
  const [debugProfile, setDebugProfile] = useState(null);
  const [mockData,     setMockData]     = useState(false);

  const { loading, error, profile: realProfile, kpis: realKpis, siiParentId, refetch } = useFiscalMonitor(orgId, token, apiBaseUrl);

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

const WipBadge = ({ ui }) => (
  <div className="absolute top-3 right-4 z-10">
    <TooltipProvider delayDuration={600}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 cursor-default select-none">
            ⚠ {ui('fiscal.wip.badge')}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-center">
          {ui('fiscal.wip.tooltip')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);

export default function FiscalMonitorPage({ token, apiBaseUrl }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;

  const [siiInitialTab,     setSiiInitialTab]     = useState('issued');
  const [tbaiInitialFilter, setTbaiInitialFilter] = useState('all');
  const [veriInitialTab,    setVeriInitialTab]    = useState('accepted');
  const [refreshKey,        setRefreshKey]        = useState(0);
  const [previewInvoice,    setPreviewInvoice]    = useState(null);
  const [previewSpec,       setPreviewSpec]       = useState('sales-invoice');
  const [bpPopup,           setBpPopup]           = useState(null);
  const contactsApiBase = `${neoBase(apiBaseUrl)}/contacts`;

  const {
    loading, error, profile, kpis, siiParentId,
    refetch,
    siiMockRows, tbaiMockRows, vfMockRows,
    debugMode, debugProfile, setDebugProfile,
    mockData, setMockData, debugOverrideActive,
  } = useDebugState(orgId, token, apiBaseUrl);

  function handleRefresh() {
    refetch();
    setRefreshKey(k => k + 1);
  }

  async function handleInvoiceOpen(invoiceId, specHint = 'sales-invoice') {
    if (!invoiceId) return;
    const base = neoBase(apiBaseUrl);
    const headers = { Authorization: `Bearer ${token}` };
    const specs = specHint === 'sales-invoice'
      ? ['sales-invoice', 'purchase-invoice']
      : ['purchase-invoice', 'sales-invoice'];
    for (const spec of specs) {
      try {
        const res = await fetch(`${base}/${spec}/header/${invoiceId}`, { headers });
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

  const DebugPanel = debugMode ? (
    <FiscalMonitorDebugPanel
      activeProfile={debugProfile}
      onProfileChange={setDebugProfile}
      mockData={mockData}
      onMockDataChange={setMockData}
    />
  ) : null;

  if (!debugOverrideActive && loading) {
    return (
      <>
        {DebugPanel}
        <div className="relative fm-wrap fm-page" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <WipBadge ui={ui} />
          <div className="fm-skeleton" style={{ height: 64, borderRadius: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[1,2,3,4].map(i => <div key={i} className="fm-skeleton" style={{ height: 100, borderRadius: 12 }} />)}
          </div>
          <div className="fm-skeleton" style={{ height: 400, borderRadius: 12 }} />
        </div>
      </>
    );
  }

  if (!debugOverrideActive && error) {
    return (
      <>
        {DebugPanel}
        <div className="relative fm-wrap fm-page">
          <WipBadge ui={ui} />
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
        <div className="relative fm-wrap fm-page"><WipBadge ui={ui} /><FmEmpty ui={ui} /></div>
      </>
    );
  }

  if (!debugOverrideActive && profile === 'conflict') {
    return (
      <>
        {DebugPanel}
        <div className="relative fm-wrap fm-page">
          <WipBadge ui={ui} />
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

  const org = { name: selectedOrg?.name ?? ui('fiscalMonitor.orgFallback') };

  return (
    <>
      {DebugPanel}
    <div className="relative fm-wrap fm-page">
      <WipBadge ui={ui} />
      <OrgLead org={org} profile={profile} ui={ui} onRefresh={handleRefresh} loading={loading} />

      {(profile === 'sii' || profile === 'sii-navarra' || profile === 'sii+tbai') && (
        <>
          <FiscalKpiCards
            variant="sii"
            kpis={kpis}
            activeKey={siiInitialTab}
            onPick={(tab) => setSiiInitialTab(tab)}
          />
          <SiiMonitorSection
            orgId={orgId} token={token} apiBaseUrl={apiBaseUrl}
            parentId={siiParentId}
            initialTab={siiInitialTab}
            mockRows={siiMockRows}
            onTabChange={setSiiInitialTab}
            refreshKey={refreshKey}
            onInvoiceOpen={handleInvoiceOpen}
            onBpClick={(bpId) => setBpPopup(bpId)}
          />
        </>
      )}

      {profile === 'sii+tbai' && (
        <div className="fm-divider">
          <div className="ln" /><span>{ui('fiscalMonitor.siiPlusTbaiDivider')}</span><div className="ln" />
        </div>
      )}

      {(profile === 'tbai' || profile === 'sii+tbai') && (
        <>
          <FiscalKpiCards
            variant="tbai"
            kpis={kpis}
            activeKey={tbaiInitialFilter}
            onPick={(k) => setTbaiInitialFilter(k)}
          />
          <TbaiMonitorSection
            orgId={orgId} token={token} apiBaseUrl={apiBaseUrl}
            initialFilter={tbaiInitialFilter}
            mockRows={tbaiMockRows}
            onFilterChange={setTbaiInitialFilter}
            refreshKey={refreshKey}
            onInvoiceOpen={handleInvoiceOpen}
            onBpClick={(bpId) => setBpPopup(bpId)}
          />
        </>
      )}

      {profile === 'verifactu' && (
        <>
          <FiscalKpiCards
            variant="verifactu"
            kpis={kpis}
            activeKey={veriInitialTab}
            onPick={(k) => setVeriInitialTab(k)}
          />
          <VerifactuMonitorSection
            orgId={orgId} token={token} apiBaseUrl={apiBaseUrl}
            initialTab={veriInitialTab}
            mockRows={vfMockRows}
            onTabChange={setVeriInitialTab}
            refreshKey={refreshKey}
            onInvoiceOpen={handleInvoiceOpen}
            onBpClick={(bpId) => setBpPopup(bpId)}
          />
        </>
      )}
    </div>
    {previewInvoice && (
      <InvoicePreviewModal
        invoice={previewInvoice}
        token={token}
        apiBaseUrl={`${neoBase(apiBaseUrl)}/${previewSpec}`}
        specName={previewSpec}
        onClose={() => setPreviewInvoice(null)}
      />
    )}
    {bpPopup && (
      <ContactDetailModal
        open={!!bpPopup}
        onClose={() => setBpPopup(null)}
        bpId={bpPopup}
        token={token}
        contactsApiBase={contactsApiBase}
      />
    )}
    </>
  );
}

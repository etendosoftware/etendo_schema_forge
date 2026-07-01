import { useState, useRef } from 'react';
import { Save } from 'lucide-react';
import OrgDropdown from './FiscalOrgDropdown.jsx';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext.jsx';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFiscalConfig } from './useFiscalConfig.js';
import { detectProfile } from './fiscalConfig.utils.js';
import { useCertExpiry } from './useCertExpiry.js';
import { useDebugMode } from '../fiscal-monitor/useDebugMode.js';
import CertExpiryBanner from './CertExpiryBanner.jsx';
import OnboardingWizard from './OnboardingWizard.jsx';
import SiiSection from './SiiSection.jsx';
import TbaiSection from './TbaiSection.jsx';
import VerifactuSection from './VerifactuSection.jsx';
import FiscalConfigDebugPanel from './FiscalConfigDebugPanel.jsx';
import TabBar from './TabBar.jsx';

// ── FiscalConfigPage ───────────────────────────────────────────────────────────

export default function FiscalConfigPage({ token, apiBaseUrl }) {
  const ui = useUI();
  const navigate = useNavigate();
  const { selectedOrg, selectedRole, selectOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const orgList = selectedRole?.orgList ?? [];
  const debugMode = useDebugMode();

  // mockOverride = null | { key, sii, tbai, verifactu }  (set by debug panel)
  const [mockOverride, setMockOverride] = useState(null);
  const [mockCertDays, setMockCertDays] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedOk, setSavedOk] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const {
    loading, error, profile,
    siiRecord, tbaiRecord, verifactuRecord,
    refetch,
  } = useFiscalConfig(orgId, apiBaseUrl);

  // When mock is active, bypass API result entirely
  const effectiveProfile  = mockOverride
    ? detectProfile(mockOverride.sii, mockOverride.tbai, mockOverride.verifactu)
    : profile;

  const PROFILE_LABEL = { sii: 'SII', 'sii-navarra': 'SII', 'sii+tbai': 'SII + TBAI', tbai: 'TBAI', verifactu: 'VERI*FACTU' };
  const profileLabel = PROFILE_LABEL[effectiveProfile] ?? null;
  const pageTitle = profileLabel ? `${ui('fiscal.title')} ${profileLabel}` : ui('fiscal.title');
  useSetPageMeta({ title: pageTitle, breadcrumb: `${ui('settings')} / ${ui('fiscal.monitor.nav')} / ${pageTitle}` });
  const effectiveSii       = mockOverride ? mockOverride.sii       : siiRecord;
  const effectiveTbai      = mockOverride ? mockOverride.tbai      : tbaiRecord;
  const effectiveVerifactu = mockOverride ? mockOverride.verifactu : verifactuRecord;

  const { daysLeft: certDaysLeft } = useCertExpiry(apiBaseUrl, { mockDaysLeft: mockCertDays, orgId });

  const siiRef       = useRef(null);
  const tbaiRef      = useRef(null);
  const verifactuRef = useRef(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      if (['sii', 'sii-navarra'].includes(effectiveProfile)) {
        await siiRef.current?.save();
      } else if (effectiveProfile === 'tbai') {
        await tbaiRef.current?.save();
      } else if (effectiveProfile === 'verifactu') {
        await verifactuRef.current?.save();
      } else if (effectiveProfile === 'sii+tbai') {
        const [r0, r1] = await Promise.allSettled([
          siiRef.current?.save(),
          tbaiRef.current?.save(),
        ]);
        if (r0.status === 'rejected' || r1.status === 'rejected') {
          throw new Error(r0.reason?.message ?? r1.reason?.message ?? 'Error saving');
        }
      }
      refetch();
      setResetKey(k => k + 1);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    navigate(-1);
  }

  const DebugPanel = debugMode ? (
    <FiscalConfigDebugPanel
      orgId={orgId}
      token={token}
      apiBaseUrl={apiBaseUrl}
      onDeleted={refetch}
      onSetMock={setMockOverride}
      activeMockKey={mockOverride?.key ?? null}
      mockCertDays={mockCertDays}
      onSetCertDays={setMockCertDays}
      data-testid="FiscalConfigDebugPanel__310303" />
  ) : null;

  // When mock is active, skip loading/error entirely and go straight to the effective profile
  const showLoading  = !mockOverride && loading;
  const showError    = !mockOverride && !loading && error;
  const showContent  = mockOverride || (!loading && !error);

  // Wizard needs the full height of the card — render it without any outer wrapper.
  if ((orgId || mockOverride) && !showLoading && !showError && effectiveProfile === 'unconfigured') {
    return (
      <>
        {DebugPanel}
        <div className="relative h-full overflow-hidden">
          <OnboardingWizard
            apiBaseUrl={apiBaseUrl}
            onComplete={refetch}
            onGoHome={() => navigate('/dashboard')}
            data-testid="OnboardingWizard__310303" />
        </div>
      </>
    );
  }

  // ── Org bar ──────────────────────────────────────────────────────────────────
  let saveLabel;
  if (saving) saveLabel = ui('fiscal.saving');
  else if (savedOk) saveLabel = `✓ ${ui('fiscal.save')}`;
  else saveLabel = ui('fiscal.save');

  const orgBar = (
    <div className="flex-shrink-0 border-b border-[#E8EAEF]">
      <div className="flex items-center justify-between px-6 h-[56px]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#121217]">{ui('fiscal.onboarding.org.label')}</span>
          <OrgDropdown
            selectedOrg={selectedOrg}
            orgList={orgList}
            onSelect={org => selectOrg(org)}
            data-testid="OrgDropdown__310303" />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
            data-testid="Button__310303">
            {ui('fiscal.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !orgId}
            className={savedOk ? 'bg-green-600 hover:bg-green-700 border-green-600' : ''}
            data-testid="Button__310303">
            <Save size={14} className="mr-1.5" data-testid="Save__310303" />
            {saveLabel}
          </Button>
        </div>
      </div>
      {saveError && (
        <div className="flex items-center justify-between px-6 py-2 bg-destructive/10 border-t border-destructive/20 text-sm text-destructive">
          <span>{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="ml-4 hover:opacity-70">✕</button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {DebugPanel}
      <div className="relative h-full flex flex-col overflow-hidden">
        {orgBar}

        {!orgId && !mockOverride && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center py-12">
              {ui('fiscal.noOrg')}
            </p>
          </div>
        )}

        {showLoading && (
          <div className="flex-1 px-6 py-8 space-y-4">
            <Skeleton className="h-8 w-full" data-testid="Skeleton__310303" />
            <Skeleton className="h-32 w-full" data-testid="Skeleton__310303" />
            <Skeleton className="h-8 w-1/2" data-testid="Skeleton__310303" />
          </div>
        )}

        {showError && (
          <div className="flex-1 px-6 py-8">
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{ui('fiscal.loadError', { error })}</p>
              <Button
                variant="link"
                onClick={refetch}
                className="mt-2 h-auto p-0"
                data-testid="Button__310303">
                {ui('fiscal.retry')}
              </Button>
            </div>
          </div>
        )}

        {showContent && effectiveProfile === 'conflict' && (
          <div className="flex-1 px-6 py-8">
            <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
              <h2 className="font-semibold text-destructive">{ui('fiscal.conflict.title')}</h2>
              <p className="text-sm text-muted-foreground mt-2">{ui('fiscal.conflict.body')}</p>
            </div>
          </div>
        )}

        {/* SII / SII-Navarra — no tabs */}
        {showContent && ['sii', 'sii-navarra'].includes(effectiveProfile) && (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-6">
              <SiiSection
                key={resetKey}
                ref={siiRef}
                record={effectiveSii}
                apiBaseUrl={apiBaseUrl}
                orgId={orgId}
                onSave={() => {}}
                variant={effectiveProfile}
                hideSave
                data-testid="SiiSection__310303" />
              <CertExpiryBanner
                daysLeft={certDaysLeft}
                variant="prominent"
                data-testid="CertExpiryBanner__310303" />
            </div>
          </div>
        )}

        {/* SII + TBAI — with tabs */}
        {showContent && effectiveProfile === 'sii+tbai' && (
          <>
            <TabBar
              tabs={[ui('fiscal.tab.sii'), ui('fiscal.tab.tbai')]}
              active={activeTab}
              onChange={setActiveTab}
              data-testid="TabBar__310303" />
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-6">
                {activeTab === 0 && (
                  <SiiSection
                    key={`sii-${resetKey}`}
                    ref={siiRef}
                    record={effectiveSii}
                    apiBaseUrl={apiBaseUrl}
                    orgId={orgId}
                    onSave={() => {}}
                    variant="sii"
                    hideSave
                    data-testid="SiiSection__310303" />
                )}
                {activeTab === 1 && (
                  <TbaiSection
                    key={`tbai-${resetKey}`}
                    ref={tbaiRef}
                    record={effectiveTbai}
                    apiBaseUrl={apiBaseUrl}
                    orgId={orgId}
                    onSave={() => {}}
                    hideSave
                    hideCert
                    data-testid="TbaiSection__310303" />
                )}
                <CertExpiryBanner
                  daysLeft={certDaysLeft}
                  variant="prominent"
                  data-testid="CertExpiryBanner__310303" />
                {/* errors are shown in the org bar */}
              </div>
            </div>
          </>
        )}

        {/* TBAI — no tabs */}
        {showContent && effectiveProfile === 'tbai' && (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-6">
              <TbaiSection
                key={resetKey}
                ref={tbaiRef}
                record={effectiveTbai}
                apiBaseUrl={apiBaseUrl}
                orgId={orgId}
                onSave={() => {}}
                hideSave
                data-testid="TbaiSection__310303" />
              <CertExpiryBanner
                daysLeft={certDaysLeft}
                variant="prominent"
                data-testid="CertExpiryBanner__310303" />
              {/* errors are shown in the org bar */}
            </div>
          </div>
        )}

        {/* Verifactu — no tabs */}
        {showContent && effectiveProfile === 'verifactu' && (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-6">
              <VerifactuSection
                key={resetKey}
                ref={verifactuRef}
                record={effectiveVerifactu}
                apiBaseUrl={apiBaseUrl}
                orgId={orgId}
                onSave={() => {}}
                hideSave
                data-testid="VerifactuSection__310303" />
              <CertExpiryBanner
                daysLeft={certDaysLeft}
                variant="prominent"
                data-testid="CertExpiryBanner__310303" />
              {/* errors are shown in the org bar */}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

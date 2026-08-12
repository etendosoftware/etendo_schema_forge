import { useState, useRef } from 'react';
import { Save, RefreshCw, PlusCircle, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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
import ChangeSifDialog from './ChangeSifDialog.jsx';
import TabBar from './TabBar.jsx';

// Profiles that represent a real, active fiscal config (i.e. "Change SIF" applies).
const CONFIGURED_PROFILES = ['sii', 'sii-navarra', 'sii+tbai', 'tbai', 'verifactu'];

const PROFILE_LABEL = { sii: 'SII', 'sii-navarra': 'SII', 'sii+tbai': 'SII + TBAI', tbai: 'TBAI', verifactu: 'VERI*FACTU' };

// Label and class for the save button, reflecting the current save state.
function resolveSaveLabel(ui, saving, savedOk) {
  if (saving) return ui('fiscal.saving');
  if (savedOk) return `✓ ${ui('fiscal.save')}`;
  return ui('fiscal.save');
}

function resolveSaveClass(savedOk) {
  return savedOk ? 'bg-status-success hover:bg-status-success border-status-success-border' : '';
}

function resolveEffectiveProfile(mockOverride, profile) {
  return mockOverride
    ? detectProfile(mockOverride.sii, mockOverride.tbai, mockOverride.verifactu)
    : profile;
}

function resolvePageTitle(ui, profileLabel) {
  return profileLabel ? `${ui('fiscal.title')} ${profileLabel}` : ui('fiscal.title');
}

async function saveTwoRefs(ref1, ref2) {
  const [r0, r1] = await Promise.allSettled([ref1?.save(), ref2?.save()]);
  if (r0.status === 'rejected' || r1.status === 'rejected') {
    throw new Error(r0.reason?.message ?? r1.reason?.message ?? 'Error saving');
  }
}

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
  const [changeSifOpen, setChangeSifOpen] = useState(false);

  // "Add complementary SIF" — null while idle, 'sii' or 'tbai' while adding
  const [addingComplementary, setAddingComplementary] = useState(null);
  const [complementaryRecord, setComplementaryRecord] = useState(null);
  const [addingComplementaryError, setAddingComplementaryError] = useState(null);
  const [creatingComplementary, setCreatingComplementary] = useState(false);
  const complementaryRef = useRef(null);

  const {
    loading, error, profile,
    siiRecord, tbaiRecord, verifactuRecord,
    refetch, createComplementary,
  } = useFiscalConfig(orgId, apiBaseUrl);

  // When mock is active, bypass API result entirely
  const effectiveProfile = resolveEffectiveProfile(mockOverride, profile);

  // When adding a complementary SIF, switch the rendered layout to the combined profile
  // so the page immediately looks like the sii+tbai view (two tabs).
  // effectiveProfile is still used for canAddComplementary, canChangeSif, handleSave logic.
  const renderProfile = addingComplementary ? 'sii+tbai' : effectiveProfile;

  const profileLabel = PROFILE_LABEL[effectiveProfile];
  const pageTitle = resolvePageTitle(ui, profileLabel);
  useSetPageMeta({ title: pageTitle, breadcrumb: `${ui('settings')} / ${ui('fiscal.monitor.nav')} / ${pageTitle}` });
  const [effectiveSii, effectiveTbai, effectiveVerifactu] = mockOverride
    ? [mockOverride.sii, mockOverride.tbai, mockOverride.verifactu]
    : [siiRecord, tbaiRecord, verifactuRecord];

  const { daysLeft: certDaysLeft } = useCertExpiry(apiBaseUrl, { mockDaysLeft: mockCertDays, orgId });

  const siiRef       = useRef(null);
  const tbaiRef      = useRef(null);
  const verifactuRef = useRef(null);

  // "Add complementary SIF" — only when real API data (not mock), org selected,
  // and profile is singly sii or tbai (not already combined or verifactu).
  const canAddComplementary = !mockOverride && !!orgId &&
    effectiveProfile === 'tbai';

  async function handleAddComplementary() {
    if (!orgId) return;
    setCreatingComplementary(true);
    setAddingComplementaryError(null);
    try {
      const system = effectiveProfile === 'sii' ? 'tbai' : 'sii';
      const created = await createComplementary(system, orgId);
      setComplementaryRecord(created);
      setAddingComplementary(system);
    } catch (err) {
      setAddingComplementaryError(
        ui('fiscal.addComplementary.err.createFailed', { error: err instanceof Error ? err.message : String(err) })
      );
    } finally {
      setCreatingComplementary(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      if (effectiveProfile === 'sii' && addingComplementary === 'tbai') {
        await saveTwoRefs(siiRef.current, complementaryRef.current);
      } else if (effectiveProfile === 'tbai' && addingComplementary === 'sii') {
        await saveTwoRefs(tbaiRef.current, complementaryRef.current);
      } else if (['sii', 'sii-navarra'].includes(effectiveProfile)) {
        await siiRef.current?.save();
      } else if (effectiveProfile === 'tbai') {
        await tbaiRef.current?.save();
      } else if (effectiveProfile === 'verifactu') {
        await verifactuRef.current?.save();
      } else if (effectiveProfile === 'sii+tbai') {
        await saveTwoRefs(siiRef.current, tbaiRef.current);
      }
      setAddingComplementary(null);
      setComplementaryRecord(null);
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
  const showContent  = !showLoading && !showError;

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

  // "Change SIF" only applies to a real, active config resolved from the API —
  // not in mock/debug mode (mock records cannot be deactivated on the server).
  const canChangeSif = !mockOverride && orgId && CONFIGURED_PROFILES.includes(effectiveProfile);

  // ── Org bar ──────────────────────────────────────────────────────────────────
  const saveLabel = resolveSaveLabel(ui, saving, savedOk);

  const orgBar = (
    <div className="flex-shrink-0 border-b border-[hsl(var(--border-subtle))]">
      <div className="flex items-center justify-between px-6 h-[56px]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">{ui('fiscal.onboarding.org.label')}</span>
          <OrgDropdown
            selectedOrg={selectedOrg}
            orgList={orgList}
            onSelect={org => selectOrg(org)}
            data-testid="OrgDropdown__310303" />
        </div>
        <div className="flex items-center gap-2">
          {(canAddComplementary || canChangeSif) && !addingComplementary && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={saving}
                  aria-label={ui('fiscal.actions.menu')}
                  data-testid="FiscalConfigPage__actionsMenu"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-topbar-icon hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {canAddComplementary && (
                  <DropdownMenuItem
                    disabled={creatingComplementary}
                    onSelect={handleAddComplementary}
                    data-testid="FiscalConfigPage__addComplementary">
                    <PlusCircle className="h-4 w-4 mr-2 text-muted-foreground" />
                    {creatingComplementary
                      ? ui('fiscal.addComplementary.creating')
                      : ui('fiscal.addComplementary.addSii')}
                  </DropdownMenuItem>
                )}
                {canChangeSif && (
                  <DropdownMenuItem
                    onSelect={() => setChangeSifOpen(true)}
                    data-testid="FiscalConfigPage__changeSif">
                    <RefreshCw className="h-4 w-4 mr-2 text-muted-foreground" />
                    {ui('fiscal.changeSif.action')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
            className={resolveSaveClass(savedOk)}
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
      {addingComplementaryError && (
        <div className="flex items-center justify-between px-6 py-2 bg-destructive/10 border-t border-destructive/20 text-sm text-destructive">
          <span>{addingComplementaryError}</span>
          <button type="button" onClick={() => setAddingComplementaryError(null)} className="ml-4 hover:opacity-70">✕</button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {DebugPanel}
      {canChangeSif && (
        <ChangeSifDialog
          open={changeSifOpen}
          onOpenChange={setChangeSifOpen}
          profile={effectiveProfile}
          records={{ sii: siiRecord, tbai: tbaiRecord, verifactu: verifactuRecord }}
          apiBaseUrl={apiBaseUrl}
          onChanged={refetch}
          data-testid="ChangeSifDialog__310303" />
      )}
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

        {showContent && renderProfile === 'conflict' && (
          <div className="flex-1 px-6 py-8">
            <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
              <h2 className="font-semibold text-destructive">{ui('fiscal.conflict.title')}</h2>
              <p className="text-sm text-muted-foreground mt-2">{ui('fiscal.conflict.body')}</p>
            </div>
          </div>
        )}

        {/* SII / SII-Navarra — no tabs */}
        {showContent && ['sii', 'sii-navarra'].includes(renderProfile) && (
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

        {/* SII + TBAI — with tabs (also used when adding a complementary SIF) */}
        {showContent && renderProfile === 'sii+tbai' && (
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
                    ref={addingComplementary === 'sii' ? complementaryRef : siiRef}
                    record={addingComplementary === 'sii' ? complementaryRecord : effectiveSii}
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
                    ref={addingComplementary === 'tbai' ? complementaryRef : tbaiRef}
                    record={addingComplementary === 'tbai' ? complementaryRecord : effectiveTbai}
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
        {showContent && renderProfile === 'tbai' && (
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
        {showContent && renderProfile === 'verifactu' && (
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

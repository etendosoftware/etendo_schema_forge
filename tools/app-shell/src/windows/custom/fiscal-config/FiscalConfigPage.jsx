import { useState, useRef, useMemo } from 'react';
import { Save, RefreshCw, PlusCircle, MoreVertical, AlertTriangle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import OrgDropdown from './FiscalOrgDropdown.jsx';
import { useNavigate } from 'react-router-dom';
import { useAuth, useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard.js';
import { useFiscalConfig } from './useFiscalConfig.js';
import { detectProfile } from './fiscalConfig.utils.js';
import { useCertExpiry } from './useCertExpiry.js';
import { useFiscalTestMode } from './useFiscalTestMode.js';
import { useDebugMode } from '../fiscal-monitor/useDebugMode.js';
import CertExpiryBanner from './CertExpiryBanner.jsx';
import OnboardingWizard from './OnboardingWizard.jsx';
import SiiSection from './SiiSection.jsx';
import TbaiSection from './TbaiSection.jsx';
import VerifactuSection from './VerifactuSection.jsx';
import FiscalConfigDebugPanel from './FiscalConfigDebugPanel.jsx';
import ChangeSifDialog from './ChangeSifDialog.jsx';
import TabBar from './TabBar.jsx';
import FiscalStatusSummary, {
  EnvironmentBadge, buildConfiguredStatusRows, deriveConfiguredStatus,
} from './FiscalStatusSummary.jsx';
import { buildSystems, buildTerritories } from './fiscalCatalog.js';

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

function resolveRenderProfile(addingComplementary, effectiveProfile) {
  return addingComplementary ? 'sii+tbai' : effectiveProfile;
}

/**
 * Saves the given sections one after the other — never at once (ETP-5112).
 *
 * Each section's `save()` issues a PUT carrying the record's `updated` token, and core parses that
 * token through a `private final static SimpleDateFormat` (`JsonToDataConverter` line 129) which is
 * not thread-safe. Two writes landing together corrupt each other's parse, and the concurrency
 * check then refuses one with "the record has already been changed by another user" against a
 * record nobody touched. Reproduced on the Organization screen with exactly this two-write shape.
 *
 * Every section is still attempted even when an earlier one fails, which is what `allSettled` gave
 * us and what the combined error below depends on — hence the explicit try/catch per save rather
 * than a bare sequential await, which would skip the rest on the first failure.
 *
 * @param {Array<{ ref: object|null, tab: number }>} sections
 * @returns {Promise<{ error: Error, tab: number } | null>} the first failure, or null
 */
async function saveSections(sections) {
  let firstFailure = null;
  for (const { ref, tab } of sections) {
    try {
      await ref?.save();
    } catch (err) {
      firstFailure ??= { error: err, tab };
    }
  }
  return firstFailure;
}

/**
 * The ref and record a tab section of the SII + TicketBAI layout is bound to: the complementary
 * record while `system` is the one being added, otherwise the section's own stored record.
 */
function tabSectionBinding(system, { addingComplementary, complementaryRef, complementaryRecord, ownRef, ownRecord }) {
  return addingComplementary === system
    ? { ref: complementaryRef, record: complementaryRecord }
    : { ref: ownRef, record: ownRecord };
}

// ── FiscalConfigPage ───────────────────────────────────────────────────────────

const FISCAL_CONFIG_WINDOW_ID = 'C1D3A2A017AC4B82B9FEE6F4D2A0C55A';

// ETP-5395 Fix 3 — this custom window never delegated to a generated Page.jsx (registry.js
// loads FiscalConfigPage.jsx directly for "fiscal-config"), so it never picked up the ETP-4520
// access-tier guard despite menu.json carrying a real windowId — same gap ETP-4658 already found
// and fixed for financial-account/sales-invoice/etc. Without it, a role with no grant on this
// window got a correct backend 403 ("Access denied to spec for current role") on the
// sii/tbai/verifactu-config fetches, rendered raw with a Retry button that can never succeed.
// Gating in a wrapper means the page's hooks (and those fetches) never run without access.
export default function FiscalConfigPage(props) {
  const windowAccessTier = useWindowAccess(FISCAL_CONFIG_WINDOW_ID);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId={FISCAL_CONFIG_WINDOW_ID} data-testid="WindowAccessGuard__fiscal-config" />;
  }
  return <FiscalConfigPageContent {...props} data-testid="FiscalConfigPageContent__310303" />;
}

function FiscalConfigPageContent({ token, apiBaseUrl }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
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
  // ETP-5831 — the organization has ONE certificate (etsg_certificate, keyed by ad_org_id), shared
  // by SII, TicketBAI and VERI*FACTU. Bumped whenever it is replaced from any section, so every
  // reader (the other tab's CertSection, the expiry banner, the status panel) re-reads it.
  const [certVersion, setCertVersion] = useState(0);
  const handleCertUploaded = () => setCertVersion(v => v + 1);
  // ETP-5831 — unsaved changes per section (useFormDirty). "Guardar" is enabled only while some
  // section is dirty (or a complementary SIF is being added); after a successful save the sections
  // remount (resetKey) and report themselves clean, which disables it again.
  const [dirtySections, setDirtySections] = useState({});
  const reportDirty = useMemo(() => {
    const reporter = (key) => (dirty) => setDirtySections(prev => (prev[key] === dirty ? prev : { ...prev, [key]: dirty }));
    return { sii: reporter('sii'), tbai: reporter('tbai'), verifactu: reporter('verifactu') };
  }, []);
  const isDirty = Object.values(dirtySections).some(Boolean);

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
  const renderProfile = resolveRenderProfile(addingComplementary, effectiveProfile);

  const profileLabel = PROFILE_LABEL[effectiveProfile];
  const pageTitle = resolvePageTitle(ui, profileLabel);
  useSetPageMeta({ title: pageTitle, breadcrumb: `${ui('settings')} / ${ui('fiscal.monitor.nav')} / ${pageTitle}` });
  const [effectiveSii, effectiveTbai, effectiveVerifactu] = mockOverride
    ? [mockOverride.sii, mockOverride.tbai, mockOverride.verifactu]
    : [siiRecord, tbaiRecord, verifactuRecord];

  const { daysLeft: certDaysLeft, validTo: certValidTo } =
    useCertExpiry(apiBaseUrl, { mockDaysLeft: mockCertDays, orgId, refreshKey: certVersion });

  // ETP-5272 — AD_Preference "Fuerza SII/TicketBAI/VeriFactu a modo prueba":
  // when active, the whole window becomes read-only (no new SIF activation is
  // allowed outside a production environment). Fails open on fetch error.
  const { forceTestMode } = useFiscalTestMode(apiBaseUrl);

  const siiRef       = useRef(null);
  const tbaiRef      = useRef(null);
  const verifactuRef = useRef(null);

  // "Add complementary SIF" — only when real API data (not mock), org selected,
  // and profile is singly sii or tbai (not already combined or verifactu).
  const canAddComplementary = !mockOverride && !!orgId && !forceTestMode &&
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
      if (renderProfile === 'sii+tbai') {
        // Both tabs stay mounted (ETP-5831): save every section with unsaved changes, plus the
        // complementary record being added (its save is what finishes "adding"). A clean section is
        // not re-saved — its validation could fail behind a hidden tab where nobody sees it.
        const sections = [
          { key: 'sii', tab: 0, ref: addingComplementary === 'sii' ? complementaryRef : siiRef },
          { key: 'tbai', tab: 1, ref: addingComplementary === 'tbai' ? complementaryRef : tbaiRef },
        ].filter(s => dirtySections[s.key] || addingComplementary === s.key)
          .map(s => ({ ref: s.ref.current, tab: s.tab }));
        const failure = await saveSections(sections);
        if (failure) {
          // The failing section shows its own error; bring its tab to the front so it is seen.
          setActiveTab(failure.tab);
          throw new Error(failure.error?.message ?? 'Error saving');
        }
      } else {
        const refMap = { sii: siiRef, 'sii-navarra': siiRef, tbai: tbaiRef, verifactu: verifactuRef };
        await refMap[effectiveProfile]?.current?.save();
      }
      setAddingComplementary(null);
      setComplementaryRecord(null);
      refetch();
      setResetKey(k => k + 1);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
      return true;
    } catch (err) {
      if (!err?._sectionHandled) setSaveError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // ETP-5831 — warn before leaving with unsaved changes (in-app navigation, locale switch, F5/tab
  // close) through the shared registry, offering "Save and continue" via handleSave (resolves
  // false on failure, so the prompt stays). Off while a save is in flight; after a successful save
  // the sections remount and report clean. During the onboarding wizard no section is mounted,
  // so the flag is false and nothing prompts — the wizard is not guarded.
  useUnsavedChangesGuard(isDirty && !saving, handleSave);

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
            forceTestMode={forceTestMode}
            data-testid="OnboardingWizard__310303" />
        </div>
      </>
    );
  }

  // "Change SIF" only applies to a real, active config resolved from the API —
  // not in mock/debug mode (mock records cannot be deactivated on the server).
  const canChangeSif = !mockOverride && orgId && CONFIGURED_PROFILES.includes(effectiveProfile);

  // ── Status panel (ETP-5831) ──────────────────────────────────────────────────
  // The "Estado" card, shown beside the form whenever the organization already has a fiscal
  // configuration — on opening the window, after a reload, on later visits and right after the
  // wizard's first save (the wizard hands over through `onComplete` = refetch; it has no summary
  // screen of its own). Never during the wizard: that branch returns before this point. Rows are
  // derived from the stored records (deriveConfiguredStatus); no link to the submission history.
  const configuredStatus = deriveConfiguredStatus({
    profile: effectiveProfile, siiRecord: effectiveSii, tbaiRecord: effectiveTbai, verifactuRecord: effectiveVerifactu,
  });
  // What each tab of the SII + TicketBAI layout edits: the stored record, or the complementary one
  // while it is being added.
  const complementary = { addingComplementary, complementaryRef, complementaryRecord };
  const siiTab = tabSectionBinding('sii', { ...complementary, ownRef: siiRef, ownRecord: effectiveSii });
  const tbaiTab = tabSectionBinding('tbai', { ...complementary, ownRef: tbaiRef, ownRecord: effectiveTbai });

  // Below `xl` the panel stacks under the form at full width (no horizontal scroll); from `xl` it
  // is a 360px column beside it, its top level with the form's first row (or the tab switch).
  const statusPanel = configuredStatus ? (
    <aside className="w-full xl:w-[360px] xl:flex-shrink-0" aria-label={ui('fiscal.status.title')} data-testid="FiscalConfigPage__statusColumn">
      <FiscalStatusSummary
        eyebrow={{
          label: ui('fiscal.status.title'),
          badge: <EnvironmentBadge isProduction={configuredStatus.isProduction} ui={ui} data-testid="FiscalStatusSummary__envBadge" />,
        }}
        title={ui('fiscal.status.active', { system: buildSystems(ui)[configuredStatus.system]?.name })}
        body={ui('fiscal.status.body')}
        rows={buildConfiguredStatusRows({
          status: configuredStatus,
          territories: buildTerritories(ui),
          systems: buildSystems(ui),
          cert: certValidTo ? { validTo: certValidTo } : null,
          locale,
          ui,
        })}
        data-testid="FiscalStatusSummary__panel" />
    </aside>
  ) : null;

  // Form column + status panel, side by side.
  const withStatus = (content) => (
    <div className="flex flex-col xl:flex-row xl:items-start gap-6">
      <div className="w-full xl:flex-1 min-w-0" data-testid="FiscalConfigPage__formColumn">{content}</div>
      {statusPanel}
    </div>
  );
  const certProps = { certRefreshKey: certVersion, onCertUploaded: handleCertUploaded };

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
            /* Non-modal on purpose (ETP-5831): "Cambiar SIF" opens a Radix Dialog from this menu.
                A modal menu also locks <body> with `pointer-events: none`; in the Vite dev server the
                menu and the dialog load separate copies of Radix's DismissableLayer, so the dialog
                saved the menu's lock as the "original" value and restored it on close, freezing the
                page until a reload. A non-modal menu never takes that lock. */
            <DropdownMenu modal={false} data-testid="DropdownMenu__310303">
              <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__310303">
                <button
                  type="button"
                  disabled={saving}
                  aria-label={ui('fiscal.actions.menu')}
                  data-testid="FiscalConfigPage__actionsMenu"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-topbar-icon hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none">
                  <MoreVertical className="h-4 w-4" data-testid="MoreVertical__310303" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52" data-testid="DropdownMenuContent__310303">
                {canAddComplementary && (
                  <DropdownMenuItem
                    disabled={creatingComplementary}
                    onSelect={handleAddComplementary}
                    data-testid="FiscalConfigPage__addComplementary">
                    <PlusCircle
                      className="h-4 w-4 mr-2 text-muted-foreground"
                      data-testid="PlusCircle__310303" />
                    {creatingComplementary
                      ? ui('fiscal.addComplementary.creating')
                      : ui('fiscal.addComplementary.addSii')}
                  </DropdownMenuItem>
                )}
                {canChangeSif && (
                  <DropdownMenuItem
                    onSelect={() => setChangeSifOpen(true)}
                    data-testid="FiscalConfigPage__changeSif">
                    <RefreshCw
                      className="h-4 w-4 mr-2 text-muted-foreground"
                      data-testid="RefreshCw__310303" />
                    {ui('fiscal.changeSif.action')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || !orgId || forceTestMode || !(isDirty || addingComplementary)}
            data-dirty={String(isDirty)}
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

        {showContent && forceTestMode && renderProfile !== 'conflict' && (
          <div className="px-6 pt-4">
            <InfoBanner
              tone="warning"
              icon={AlertTriangle}
              data-testid="FiscalConfigPage__testModeBanner">
              {ui('fiscal.testModeLock.warning')}
            </InfoBanner>
          </div>
        )}

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
              {withStatus(<>
              <SiiSection
                key={resetKey}
                ref={siiRef}
                record={effectiveSii}
                apiBaseUrl={apiBaseUrl}
                orgId={orgId}
                onSave={() => {}}
                variant={effectiveProfile}
                hideSave
                locked={forceTestMode}
                {...certProps}
                onDirtyChange={reportDirty.sii}
                data-testid="SiiSection__310303" />
              <CertExpiryBanner
                daysLeft={certDaysLeft}
                variant="prominent"
                data-testid="CertExpiryBanner__310303" />
              </>)}
            </div>
          </div>
        )}

        {/* SII + TBAI — with tabs (also used when adding a complementary SIF) */}
        {showContent && renderProfile === 'sii+tbai' && (
          <>
            {/* The SII | TicketBAI switch sits in the form column, so the status panel's top is
                level with the switch's top (ETP-5831). */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-6">
                {withStatus(<>
                <TabBar
                  tabs={[ui('fiscal.tab.sii'), ui('fiscal.tab.tbai')]}
                  active={activeTab}
                  onChange={setActiveTab}
                  className="pb-4"
                  data-testid="TabBar__310303" />
                {/* Both tabs stay mounted (ETP-5831): switching only hides the other section, so its
                    unsaved edits survive and keep counting for "Guardar" and the unsaved-changes
                    guard. The certificate block renders in the visible tab only (one shared
                    certificate: no duplicate block, test ids or /certificate read). */}
                <div hidden={activeTab !== 0} data-testid="FiscalConfigPage__siiPane">
                  <SiiSection
                    key={`sii-${resetKey}`}
                    ref={siiTab.ref}
                    record={siiTab.record}
                    apiBaseUrl={apiBaseUrl}
                    orgId={orgId}
                    onSave={() => {}}
                    variant="sii"
                    hideSave
                    locked={forceTestMode}
                    {...certProps}
                    hideCert={activeTab !== 0}
                    onDirtyChange={reportDirty.sii}
                    data-testid="SiiSection__310303" />
                </div>
                <div hidden={activeTab !== 1} data-testid="FiscalConfigPage__tbaiPane">
                  <TbaiSection
                    key={`tbai-${resetKey}`}
                    ref={tbaiTab.ref}
                    record={tbaiTab.record}
                    apiBaseUrl={apiBaseUrl}
                    orgId={orgId}
                    onSave={() => {}}
                    hideSave
                    locked={forceTestMode}
                    {...certProps}
                    hideCert={activeTab !== 1}
                    onDirtyChange={reportDirty.tbai}
                    data-testid="TbaiSection__310303" />
                </div>
                <CertExpiryBanner
                  daysLeft={certDaysLeft}
                  variant="prominent"
                  data-testid="CertExpiryBanner__310303" />
                {/* errors are shown in the org bar */}
                </>)}
              </div>
            </div>
          </>
        )}

        {/* TBAI — no tabs */}
        {showContent && renderProfile === 'tbai' && (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-6">
              {withStatus(<>
              <TbaiSection
                key={resetKey}
                ref={tbaiRef}
                record={effectiveTbai}
                apiBaseUrl={apiBaseUrl}
                orgId={orgId}
                onSave={() => {}}
                hideSave
                locked={forceTestMode}
                {...certProps}
                onDirtyChange={reportDirty.tbai}
                data-testid="TbaiSection__310303" />
              <CertExpiryBanner
                daysLeft={certDaysLeft}
                variant="prominent"
                data-testid="CertExpiryBanner__310303" />
              {/* errors are shown in the org bar */}
              </>)}
            </div>
          </div>
        )}

        {/* Verifactu — no tabs */}
        {showContent && renderProfile === 'verifactu' && (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-6">
              {withStatus(<>
              <VerifactuSection
                key={resetKey}
                ref={verifactuRef}
                record={effectiveVerifactu}
                apiBaseUrl={apiBaseUrl}
                orgId={orgId}
                onSave={() => {}}
                hideSave
                locked={forceTestMode}
                {...certProps}
                onDirtyChange={reportDirty.verifactu}
                data-testid="VerifactuSection__310303" />
              <CertExpiryBanner
                daysLeft={certDaysLeft}
                variant="prominent"
                data-testid="CertExpiryBanner__310303" />
              {/* errors are shown in the org bar */}
              </>)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { ArrowRight, ArrowLeft, FileText, Check, ChevronRight, Pencil } from 'lucide-react';
import FiscalStepItem from './FiscalStepItem.jsx';
import OrgDropdown from './FiscalOrgDropdown.jsx';
import { Button } from '@/components/ui/button';
import { useUI, useLocaleSwitch } from '@/i18n';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import {
  buildOnboardingPayloads,
  getFiscalRecordId,
  getAllowedSystemsForTerritory,
  getCertificateContext,
  resolveSystem,
} from './fiscalConfig.utils.js';
import SiiSection from './SiiSection.jsx';
import TbaiSection from './TbaiSection.jsx';
import VerifactuSection from './VerifactuSection.jsx';
import CertModal from './CertModal.jsx';
import CertSection from './CertSection.jsx';
import TabBar from './TabBar.jsx';

// Keep in sync with useFiscalConfig.js
const SII_ENTITY      = 'siiConfiguration';
const TBAI_ENTITY     = 'header';
const VERIFACTU_ENTITY = 'cabeceraDeConfiguraciónVerifactu';

// ── Data (IDs and logic flags — display strings resolved via ui() inside component) ───

const TERRITORY_META = {
  navarra:  { id: 'navarra',  regime: 'sii_foral', askNational: false, askVolume: false, taxtype: 'IVA',  tbaiTerritory: null,       guipuzcoa: null },
  alava:    { id: 'alava',    regime: 'tbai',       askNational: true,  askVolume: false, taxtype: null,   tbaiTerritory: 'ARABA',    guipuzcoa: null },
  bizkaia:  { id: 'bizkaia',  regime: 'tbai',       askNational: true,  askVolume: false, taxtype: null,   tbaiTerritory: 'BIZKAIA',  guipuzcoa: null },
  gipuzkoa: { id: 'gipuzkoa', regime: 'tbai',       askNational: true,  askVolume: false, taxtype: null,   tbaiTerritory: 'GIPUZKOA', guipuzcoa: 'Y'  },
  baleares: { id: 'baleares', regime: 'siiver',     askNational: false, askVolume: true,  taxtype: 'IVA',  tbaiTerritory: null,       guipuzcoa: null },
  canarias: { id: 'canarias', regime: 'siiver',     askNational: false, askVolume: true,  taxtype: 'IGIC', tbaiTerritory: null,       guipuzcoa: null },
  ceuta:    { id: 'ceuta',    regime: 'siiver',     askNational: false, askVolume: true,  taxtype: 'IPSI', tbaiTerritory: null,       guipuzcoa: null },
};

const TERRITORY_GROUP_META = [
  { regime: 'sii_foral', items: ['navarra'] },
  { regime: 'tbai',      items: ['alava', 'bizkaia', 'gipuzkoa'] },
  { regime: 'siiver',    items: ['baleares', 'canarias', 'ceuta'] },
];


// ── Network ───────────────────────────────────────────────────────────────────

async function postRecord(path, body, apiFetch) {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  const json = await res.json().catch(() => null);
  return json?.response?.data?.[0] ?? null;
}

async function createAndFetchRecord({ specName, entityName, body, apiFetch, system }) {
  const created = await postRecord(`/${specName}/${entityName}`, body, apiFetch);
  const recordId = getFiscalRecordId(created, system);
  if (!recordId) return created;
  const fetched = await apiFetch(`/${specName}/${entityName}/${recordId}`)
    .then(r => r.ok ? r.json() : null)
    .then(j => j?.response?.data?.[0] || null)
    .catch(() => null);
  return fetched ?? created;
}

// ── Badge color by regime ─────────────────────────────────────────────────────

const REGIME_BADGE = {
  sii_foral: { bg: '#F0FAFF', text: '#0075AD' },
  tbai:      { bg: '#FFF2EE', text: '#B82E00' },
  siiver:    { bg: '#FEECFB', text: '#A5088C' },
};

const SYSTEM_BADGE = {
  SII:        { bg: '#F0FAFF', text: '#0075AD' },
  TBAI:       { bg: '#FFF2EE', text: '#B82E00' },
  'SII+TBAI': { bg: '#FFF2EE', text: '#B82E00' },
  VERIFACTU:  { bg: '#FEECFB', text: '#A5088C' },
};
const SYSTEM_BADGE_LABEL = { SII: 'SII', TBAI: 'TicketBAI', 'SII+TBAI': 'SII + TicketBAI', VERIFACTU: 'VERI*FACTU' };

// ── Primitive components ──────────────────────────────────────────────────────

function Stepper({ step, ui }) {
  const steps = [
    { n: 1, label: ui('fiscal.onboarding.step.territory') },
    { n: 2, label: ui('fiscal.onboarding.step.details') },
    { n: 3, label: ui('fiscal.onboarding.step.confirm') },
  ];
  return (
    <div className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
      {steps.map(({ n, label }, i) => (
        <FiscalStepItem
          key={n}
          n={n}
          label={label}
          done={step > n}
          active={step === n}
          isFirst={i === 0}
          data-testid="FiscalStepItem__e9ef3f" />
      ))}
    </div>
  );
}

function PageHead({ selectedOrg, orgList, onSelectOrg, onGoToManual, actions, ui }) {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-between"
      style={{ height: 56, padding: '0 20px', borderBottom: '1px solid #E8EAEF' }}
    >
      <div className="flex items-center" style={{ gap: 8 }}>
        <span className="text-sm font-medium" style={{ color: '#121217' }}>
          {ui('fiscal.onboarding.org.label')}
        </span>
        <OrgDropdown
          selectedOrg={selectedOrg}
          orgList={orgList}
          onSelect={onSelectOrg}
          data-testid="OrgDropdown__e9ef3f" />
      </div>
      {actions ?? (onGoToManual && (
        <button
          type="button"
          onClick={onGoToManual}
          className="text-sm"
          style={{ color: '#121217' }}
        >
          {ui('fiscal.onboarding.territory.prefer.manual.q')}{' '}
          <span className="font-medium underline">
            {ui('fiscal.onboarding.territory.prefer.manual.link')}
          </span>
        </button>
      ))}
    </div>
  );
}

function Breadcrumb({ items }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3.5">
      {items.map(({ label, onClick }, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="opacity-40">›</span>}
          {onClick
            ? <button type="button" onClick={onClick} className="text-foreground/70 hover:text-foreground border-b border-transparent hover:border-border">{label}</button>
            : <span className="font-medium text-foreground">{label}</span>
          }
        </span>
      ))}
    </div>
  );
}

function TerrCard({ territory, selected, onPick }) {
  const badgeColors = REGIME_BADGE[territory.regime];
  const badgeStyle = badgeColors
    ? { backgroundColor: badgeColors.bg, color: badgeColors.text }
    : { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' };

  return (
    <button
      type="button"
      onClick={() => onPick(territory.id)}
      className={`relative flex flex-col text-left transition-all cursor-pointer rounded-xl
        ${selected ? 'border-2 border-[#121217]' : 'border border-[#E8EAEF] hover:bg-muted/40'}`}
      style={{
        minHeight: 80, padding: 16, gap: 12,
        boxShadow: selected
          ? '0 4px 16px rgba(18,18,23,0.14), 0 1px 3px rgba(18,18,23,0.08)'
          : '0 1px 2px rgba(18,18,23,0.05)',
      }}
    >
      {/* Radio circle — ring + inner dot style (◉) when selected */}
      <span
        className="absolute flex-shrink-0"
        style={{
          width: 15, height: 15, right: 8, top: 9,
          borderRadius: '50%',
          border: selected ? '1.5px solid #121217' : '1.5px solid #D1D4DB',
          background: selected
            ? 'radial-gradient(circle at center, #121217 40%, #FFFFFF 40%)'
            : '#FFFFFF',
          boxShadow: '0 1px 2px rgba(18,18,23,0.05)',
        }}
      />
      {/* Title + badge */}
      <div className="flex items-center min-w-0" style={{ gap: 4, paddingRight: 20 }}>
        <span className="text-sm font-medium truncate" style={{ color: '#121217' }}>{territory.name}</span>
        {territory.system && (
          <span style={badgeStyle} className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 leading-none">
            {territory.system}
          </span>
        )}
      </div>
      {/* Description */}
      {territory.example && (
        <div className="text-sm leading-6" style={{ color: '#555B6D' }}>
          {territory.example}
        </div>
      )}
    </button>
  );
}

function RadioRow({ checked, onClick, label, description }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-2.5 px-3.5 py-3 rounded-[10px] border text-left w-full transition-all cursor-pointer
        ${checked ? 'border-foreground bg-background' : 'border-border hover:bg-muted/40'}`}
    >
      <span className={`w-4 h-4 rounded-full border flex-shrink-0 mt-0.5 relative
        ${checked ? 'border-foreground' : 'border-border bg-background'}`}>
        {checked && <span className="absolute inset-[3px] rounded-full bg-foreground" />}
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {description && <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>}
      </span>
    </button>
  );
}

function ScreenLayout({ toolbar, subBar, children, actions, padContent = true }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar — never scrolls (org row) */}
      {toolbar}
      {/* Sub-bar (e.g. TabBar) — fixed between toolbar and scroll */}
      {subBar}
      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {padContent ? <div className="px-5 py-5">{children}</div> : children}
      </div>
      {/* Footer — only rendered when actions are provided */}
      {actions && (
        <div
          className="flex-shrink-0 flex items-center"
          style={{ height: 56, padding: '0 20px', borderTop: '1px solid #E8EAEF', gap: 8 }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function renderPageHead({ selectedOrg, orgList, onSelectOrg, ui, onGoToManual }) {
  return (
    <PageHead
      selectedOrg={selectedOrg}
      orgList={orgList}
      onSelectOrg={onSelectOrg}
      {...(onGoToManual ? { onGoToManual } : {})}
      ui={ui}
      data-testid="PageHead__e9ef3f" />
  );
}

// ── Step screens ──────────────────────────────────────────────────────────────

function SkippedScreen({ orgName, selectedOrg, orgList, onSelectOrg, ui, onGoHome, onComplete, goTo }) {
  const pageHeadEl = renderPageHead({ selectedOrg, orgList, onSelectOrg, ui });
  return (
    <ScreenLayout
      toolbar={pageHeadEl}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => goTo('territory')}
            data-testid="Button__e9ef3f">{ui('fiscal.onboarding.back.wizard')}</Button>
          <span className="flex-1" />
          <Button onClick={onGoHome ?? onComplete} data-testid="Button__e9ef3f">{ui('fiscal.onboarding.goHome')}</Button>
        </>
      }
      data-testid="ScreenLayout__e9ef3f">
      <div className="flex flex-col items-center text-center py-8">
        <span className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-2xl mb-4">⏭</span>
        <h2 className="font-semibold mb-1" style={{ fontSize: 18, color: '#121217' }}>{ui('fiscal.onboarding.skipped.title')}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">{ui('fiscal.skip.hint')}</p>
      </div>
      <div className="rounded-[10px] border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        {ui('fiscal.onboarding.skipped.hint')}
      </div>
    </ScreenLayout>
  );
}

function AppliedScreen({ orgId, orgName, selectedOrg, orgList, onSelectOrg, system, selectedTerritory, alsoNational, volume, lowChoice, apiBaseUrl, apiFetch, locale, ui, SYSTEMS, TERRITORIES, onComplete, onGoHome }) {
  const [cert, setCert] = useState(null);
  const [certModalOpen, setCertModalOpen] = useState(false);

  useEffect(() => {
    if (!orgId || !system) return;
    const certCtx = getCertificateContext(system);
    if (!certCtx) return;
    apiFetch(`/certificate?${new URLSearchParams({ orgId })}`)
      .then(r => r.json())
      .then(data => {
        if (data?.exists) setCert({ name: ui('fiscal.cert.loaded'), validTo: data.validTo ?? '' });
      })
      .catch(() => {});
  }, [orgId, apiFetch, system, ui]);

  const sys = SYSTEMS[system];
  const terr = TERRITORIES[selectedTerritory ?? ''];
  const certContext = getCertificateContext(system);
  const pageHeadEl = renderPageHead({ selectedOrg, orgList, onSelectOrg, ui });

  return (
    <>
      <ScreenLayout
        toolbar={pageHeadEl}
        actions={
          <>
            <Button variant="outline" onClick={onComplete} data-testid="Button__e9ef3f">{ui('fiscal.onboarding.viewConfig')}</Button>
            <span className="flex-1" />
            <Button onClick={onGoHome ?? onComplete} data-testid="Button__e9ef3f">{ui('fiscal.onboarding.goHome')}</Button>
          </>
        }
        data-testid="ScreenLayout__e9ef3f">
        <h2 className="font-semibold mb-1" style={{ fontSize: 18, color: '#121217' }}>{ui('fiscal.onboarding.applied.title')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {ui('fiscal.onboarding.applied.subtitle', { system: sys?.name })}
        </p>

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-green-50 border-b border-green-200 px-5 py-4 flex items-center gap-3.5">
            <span className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0 text-xl">✓</span>
            <div>
              <div className="font-bold text-green-800">{ui('fiscal.onboarding.applied.configured', { system: sys?.name })}</div>
              <div className="text-sm text-green-700/80 mt-0.5">{ui('fiscal.onboarding.applied.body')}</div>
            </div>
          </div>
          <div className="divide-y divide-border px-5 py-2">
            {terr && <Row
              k={ui('fiscal.onboarding.applied.row.territory')}
              v={terr.name}
              data-testid="Row__e9ef3f" />}
            <Row
              k={ui('fiscal.onboarding.applied.row.system')}
              v={sys?.name}
              data-testid="Row__e9ef3f" />
            <Row
              k={ui('fiscal.onboarding.applied.row.tax')}
              v={terr ? terr.systemLong : sys?.long}
              data-testid="Row__e9ef3f" />
            {terr?.askNational && (
              <Row
                k={ui('fiscal.onboarding.applied.row.national')}
                v={alsoNational ? ui('fiscal.onboarding.applied.national.active') : ui('fiscal.onboarding.applied.national.na')}
                data-testid="Row__e9ef3f" />
            )}
            {terr?.askVolume && volume && (
              <Row
                k={ui('fiscal.onboarding.applied.row.volume')}
                v={volume === 'high' ? ui('fiscal.onboarding.applied.volume.high') : ui('fiscal.onboarding.applied.volume.low')}
                data-testid="Row__e9ef3f" />
            )}
            {volume === 'low' && lowChoice && (
              <Row
                k={ui('fiscal.onboarding.applied.row.chosen')}
                v={lowChoice === 'sii' ? ui('fiscal.onboarding.applied.chosen.sii') : ui('fiscal.onboarding.applied.chosen.verifactu')}
                data-testid="Row__e9ef3f" />
            )}
            <Row
              k={ui('fiscal.onboarding.applied.row.env')}
              v={<span className="text-amber-700">{ui('fiscal.onboarding.applied.env.sandbox')}</span>}
              data-testid="Row__e9ef3f" />
            <Row
              k={ui('fiscal.onboarding.applied.row.activated')}
              v={new Date().toLocaleString(locale.replace('_', '-'), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              data-testid="Row__e9ef3f" />
          </div>
        </div>

        <div className="mt-7">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">{ui('fiscal.onboarding.nextsteps.title')}</h3>
          <div className="flex flex-col gap-2">
            {certContext && (
              <NextItem
                icon={<FileText size={15} strokeWidth={1.75} data-testid="FileText__e9ef3f" />}
                title={cert ? ui('fiscal.onboarding.cert.loaded.title') : ui('fiscal.onboarding.cert.upload.title')}
                desc={cert
                  ? ui('fiscal.onboarding.cert.loaded.desc', { name: cert.name, validTo: cert.validTo })
                  : ui('fiscal.onboarding.cert.upload.desc')}
                badge={cert ? null : ui('fiscal.onboarding.cert.pending')}
                done={!!cert}
                onClick={() => setCertModalOpen(true)}
                data-testid="NextItem__e9ef3f" />
            )}
          </div>
        </div>
      </ScreenLayout>
      {certModalOpen && certContext && (
        <CertModal
          context={certContext}
          orgId={orgId}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setCertModalOpen(false)}
          onUpload={(c) => { setCert(c); setCertModalOpen(false); }}
          data-testid="CertModal__e9ef3f" />
      )}
    </>
  );
}

function DetailScreen({ system, selectedTerritory, createdRecords, orgId, orgName, selectedOrg, orgList, onSelectOrg, apiBaseUrl, error, ui, SYSTEMS, siiRef, tbaiRef, verifactuRef, onBack, onApplied, onComplete }) {
  const sys = SYSTEMS[system];
  const [activeTab, setActiveTab] = useState(0);

  const SYS_LABEL = { SII: 'SII', TBAI: 'TicketBAI', 'SII+TBAI': 'SII + TicketBAI', VERIFACTU: 'VERI*FACTU' };
  const sysLabel = SYS_LABEL[system] ?? sys?.name ?? '';
  const pageTitle = `${ui('fiscal.title')} ${sysLabel}`.trim();
  useSetPageMeta({ title: pageTitle, breadcrumb: `${ui('settings')} / ${ui('fiscal.monitor.nav')} / ${pageTitle}` });

  async function handleSaveDetail() {
    if (system === 'SII+TBAI') {
      const results = await Promise.allSettled([siiRef.current?.save(), tbaiRef.current?.save()]);
      if (results.every(r => r.status === 'fulfilled')) onApplied();
      return;
    }
    if (system === 'SII') { await siiRef.current?.save(); onApplied(); return; }
    if (system === 'TBAI') { await tbaiRef.current?.save(); onApplied(); return; }
    if (system === 'VERIFACTU') { await verifactuRef.current?.save(); onApplied(); }
  }

  const isSiiTbai = system === 'SII+TBAI';

  const tabBar = isSiiTbai ? (
    <TabBar
      tabs={[ui('fiscal.tab.sii'), ui('fiscal.tab.tbai')]}
      active={activeTab}
      onChange={setActiveTab}
      data-testid="TabBar__e9ef3f" />
  ) : null;

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={onBack} data-testid="Button__e9ef3f">{ui('fiscal.cancel')}</Button>
      <Button onClick={handleSaveDetail} data-testid="Button__e9ef3f">{ui('fiscal.save')}</Button>
    </div>
  );

  return (
    <ScreenLayout
      toolbar={<PageHead
        selectedOrg={selectedOrg}
        orgList={orgList}
        onSelectOrg={onSelectOrg}
        actions={headerActions}
        ui={ui}
        data-testid="PageHead__e9ef3f" />}
      subBar={tabBar}
      padContent={false}
      data-testid="ScreenLayout__e9ef3f">
      <div className="px-5">
        {/* SII section — always mounted when SII or SII+TBAI so ref stays valid */}
        {(system === 'SII' || isSiiTbai) && createdRecords.sii && (
          <div className={isSiiTbai && activeTab !== 0 ? 'hidden' : undefined}>
            <SiiSection
              ref={siiRef}
              record={createdRecords.sii}
              apiBaseUrl={apiBaseUrl}
              orgId={orgId}
              onSave={() => {}}
              variant={selectedTerritory === 'navarra' ? 'sii-navarra' : 'sii'}
              hideSave
              data-testid="SiiSection__e9ef3f" />
          </div>
        )}

        {/* TBAI section — always mounted when TBAI or SII+TBAI so ref stays valid */}
        {(system === 'TBAI' || isSiiTbai) && createdRecords.tbai && (
          <div className={isSiiTbai && activeTab !== 1 ? 'hidden' : undefined}>
            <TbaiSection
              ref={tbaiRef}
              record={createdRecords.tbai}
              apiBaseUrl={apiBaseUrl}
              orgId={orgId}
              onSave={() => {}}
              hideSave
              hideCert={isSiiTbai}
              data-testid="TbaiSection__e9ef3f" />
          </div>
        )}

        {system === 'VERIFACTU' && createdRecords.verifactu && (
          <VerifactuSection
            ref={verifactuRef}
            record={createdRecords.verifactu}
            apiBaseUrl={apiBaseUrl}
            orgId={orgId}
            onSave={() => {}}
            hideSave
            data-testid="VerifactuSection__e9ef3f" />
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </ScreenLayout>
  );
}

function ConfirmScreen({ resolvedSystem, selectedTerritory, alsoNational, volume, lowChoice, manualSystem, saving, error, orgName, selectedOrg, orgList, onSelectOrg, onGoToManual, ui, SYSTEMS, TERRITORIES, goTo, onCreateRecords }) {
  const sys = SYSTEMS[resolvedSystem];
  const terr = TERRITORIES[selectedTerritory ?? ''];
  const prevStep = manualSystem ? 'manual' : (terr && (terr.askNational || terr.askVolume) ? 'subquestion' : 'territory');

  const systemValue = sys?.long ?? sys?.name;

  const cards = [
    terr && { label: ui('fiscal.onboarding.confirm.row.territory'), value: terr.name, onEdit: () => goTo('territory') },
    terr && { label: ui('fiscal.onboarding.confirm.row.hacienda'), value: terr.systemLong, onEdit: () => goTo('territory') },
    { label: ui('fiscal.onboarding.confirm.row.system'), value: systemValue, onEdit: () => goTo(prevStep) },
  ].filter(Boolean);

  const pageHeadEl = renderPageHead({ selectedOrg, orgList, onSelectOrg, ui, onGoToManual });

  return (
    <ScreenLayout
      toolbar={pageHeadEl}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => goTo(prevStep)}
            disabled={saving}
            className="flex items-center gap-1.5"
            data-testid="Button__e9ef3f">
            <ArrowLeft size={15} data-testid="ArrowLeft__e9ef3f" /> {ui('fiscal.onboarding.back').replace('←', '').trim()}
          </Button>
          <p className="text-xs flex-1" style={{ color: '#555B6D' }}>{ui('fiscal.skip.hint')}</p>
          <button type="button" onClick={() => goTo('skipped')} className="text-sm" style={{ color: '#121217' }}>
            {ui('fiscal.onboarding.skip')}
          </button>
          <Button
            onClick={onCreateRecords}
            disabled={saving}
            className="flex items-center gap-1.5"
            data-testid="Button__e9ef3f">
            <Check size={15} data-testid="Check__e9ef3f" />
            {saving ? ui('fiscal.onboarding.confirm.creating') : ui('fiscal.onboarding.confirm.btn')}
          </Button>
        </>
      }
      data-testid="ScreenLayout__e9ef3f">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-semibold mb-1" style={{ fontSize: 18, color: '#121217' }}>{ui('fiscal.onboarding.confirm.title')}</h2>
          <p style={{ fontSize: 12, color: '#282833' }}>
            {ui('fiscal.onboarding.confirm.subtitle.pre')}<strong>{ui('fiscal.onboarding.confirm.subtitle.bold')}</strong>
          </p>
        </div>
        <Stepper step={3} ui={ui} data-testid="Stepper__e9ef3f" />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        {cards.map(({ label, value, onEdit }) => (
          <InfoCard
            key={label}
            label={label}
            value={value}
            onEdit={onEdit}
            data-testid="InfoCard__e9ef3f" />
        ))}
      </div>
      <div className="rounded-xl p-4 flex gap-3 text-sm" style={{ background: '#F0FAFF', color: '#0075AD' }}>
        <span
          className="flex-shrink-0 flex items-center justify-center text-white font-bold"
          style={{ width: 20, height: 20, borderRadius: '50%', background: '#00ACFF', fontSize: 12, marginTop: 1 }}
        >i</span>
        <p>
          {ui('fiscal.onboarding.confirm.next.title')}{' '}
          {ui('fiscal.onboarding.confirm.next.body')}
        </p>
      </div>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </ScreenLayout>
  );
}

function NationalOptionCard({ label, desc, extra, selected, onPick }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`relative flex flex-col text-left cursor-pointer rounded-xl transition-all w-full
        ${selected ? 'border-2 border-[#121217]' : 'border border-[#E8EAEF] hover:bg-muted/40'}`}
      style={{
        minHeight: 80, padding: 16, gap: 12,
        boxShadow: selected
          ? '0 4px 16px rgba(18,18,23,0.14), 0 1px 3px rgba(18,18,23,0.08)'
          : '0 1px 2px rgba(18,18,23,0.05)',
      }}
    >
      <span
        className="absolute"
        style={{
          width: 15, height: 15, right: 8, top: 9, borderRadius: '50%',
          border: selected ? '1.5px solid #121217' : '1.5px solid #D1D4DB',
          background: selected
            ? 'radial-gradient(circle at center, #121217 40%, #FFFFFF 40%)'
            : '#FFFFFF',
        }}
      />
      <span style={{ fontSize: 14, fontWeight: 600, color: '#121217', paddingRight: 20, lineHeight: '20px' }}>{label}</span>
      <span style={{ fontSize: 14, color: '#555B6D', lineHeight: '20px' }}>{desc}</span>
      <div style={{ height: 1, background: '#E8EAEF', borderRadius: 1 }} />
      <span style={{ fontSize: 12, color: '#9CA3AF', lineHeight: '18px' }}>{extra}</span>
    </button>
  );
}

function SelectableCard({ selected, onPick, children }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`relative flex flex-col text-left cursor-pointer rounded-xl transition-all w-full
        ${selected ? 'border-2 border-[#121217]' : 'border border-[#E8EAEF] hover:bg-muted/40'}`}
      style={{
        minHeight: 80, padding: 16, gap: 12,
        boxShadow: selected
          ? '0 4px 16px rgba(18,18,23,0.14), 0 1px 3px rgba(18,18,23,0.08)'
          : '0 1px 2px rgba(18,18,23,0.05)',
      }}
    >
      <span
        className="absolute flex-shrink-0"
        style={{
          width: 15, height: 15, right: 8, top: 9, borderRadius: '50%',
          border: selected ? '1.5px solid #121217' : '1.5px solid #D1D4DB',
          background: selected
            ? 'radial-gradient(circle at center, #121217 40%, #FFFFFF 40%)'
            : '#FFFFFF',
        }}
      />
      {children}
    </button>
  );
}

function ObligationCard({ label, paragraphs, note, info, selected, onPick }) {
  return (
    <SelectableCard selected={selected} onPick={onPick} data-testid="SelectableCard__e9ef3f">
      <span className="text-sm font-semibold pr-5" style={{ color: '#121217' }}>{label}</span>
      <div className="flex flex-col gap-2">
        {paragraphs.map((p) => (
          <span key={p} className="text-sm leading-5" style={{ color: '#555B6D' }}>{p}</span>
        ))}
      </div>
      {note && <span className="text-sm font-medium" style={{ color: '#121217' }}>{note}</span>}
      {info && (
        <div className="rounded-lg px-3 py-2.5 flex gap-2 text-xs" style={{ background: '#F0FAFF', color: '#0075AD' }}>
          <span
            className="flex-shrink-0 flex items-center justify-center text-white font-bold"
            style={{ width: 16, height: 16, borderRadius: '50%', background: '#00ACFF', fontSize: 10, marginTop: 1 }}
          >i</span>
          <span>{info}</span>
        </div>
      )}
    </SelectableCard>
  );
}

function BulletOptionCard({ label, bullets, selected, onPick }) {
  return (
    <SelectableCard selected={selected} onPick={onPick} data-testid="SelectableCard__e9ef3f">
      <span className="text-sm font-semibold pr-5" style={{ color: '#121217' }}>{label}</span>
      <ul className="flex flex-col gap-1.5">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2 text-sm leading-5" style={{ color: '#555B6D' }}>
            <Check
              size={14}
              strokeWidth={2.5}
              className="flex-shrink-0 mt-0.5 text-green-500"
              data-testid="Check__e9ef3f" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </SelectableCard>
  );
}

function OptionCard({ label, desc, selected, onPick }) {
  return (
    <SelectableCard selected={selected} onPick={onPick} data-testid="SelectableCard__e9ef3f">
      <span className="text-sm font-semibold pr-5" style={{ color: '#121217' }}>{label}</span>
      {desc && <span className="text-sm leading-5" style={{ color: '#555B6D' }}>{desc}</span>}
    </SelectableCard>
  );
}

function InfoCard({ label, value, onEdit }) {
  return (
    <div className="relative rounded-xl border border-[#E8EAEF] p-4" style={{ background: '#F5F7F9', boxShadow: '0 1px 2px rgba(18,18,23,0.05)' }}>
      <p style={{ fontSize: 12, color: '#555B6D', marginBottom: 2 }}>{label}</p>
      <p className="font-semibold" style={{ fontSize: 14, color: '#121217' }}>{value}</p>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil size={13} strokeWidth={1.75} data-testid="Pencil__e9ef3f" />
        </button>
      )}
    </div>
  );
}

function ManualTerrCard({ territory, selected, onPick }) {
  const badgeColors = REGIME_BADGE[territory.regime];
  const badgeStyle = badgeColors
    ? { backgroundColor: badgeColors.bg, color: badgeColors.text }
    : { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' };

  return (
    <button
      type="button"
      onClick={() => onPick(territory.id)}
      className={`relative flex flex-col text-left transition-all cursor-pointer rounded-xl
        ${selected ? 'border-2 border-[#121217]' : 'border border-[#E8EAEF] hover:bg-muted/40'}`}
      style={{
        minHeight: 80, padding: 16, gap: 12,
        boxShadow: selected
          ? '0 4px 16px rgba(18,18,23,0.14), 0 1px 3px rgba(18,18,23,0.08)'
          : '0 1px 2px rgba(18,18,23,0.05)',
      }}
    >
      <span
        className="absolute flex-shrink-0"
        style={{
          width: 15, height: 15, right: 8, top: 9, borderRadius: '50%',
          border: selected ? '1.5px solid #121217' : '1.5px solid #D1D4DB',
          background: selected
            ? 'radial-gradient(circle at center, #121217 40%, #FFFFFF 40%)'
            : '#FFFFFF',
          boxShadow: '0 1px 2px rgba(18,18,23,0.05)',
        }}
      />
      <div className="flex items-center min-w-0" style={{ gap: 4, paddingRight: 20 }}>
        <span className="text-sm font-medium truncate" style={{ color: '#121217' }}>{territory.name}</span>
        {territory.system && (
          <span style={badgeStyle} className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 leading-none">
            {territory.system}
          </span>
        )}
      </div>
      {territory.example && (
        <div className="text-sm leading-6" style={{ color: '#555B6D' }}>{territory.example}</div>
      )}
    </button>
  );
}

function ManualScreen({ selectedTerritory, manualSystem, orgName, selectedOrg, orgList, onSelectOrg, ui, TERRITORIES, SYSTEMS, goTo, onSelectTerritory, onSetManualSystem }) {
  const manualAllowedSystems = getAllowedSystemsForTerritory(selectedTerritory);
  const pageHeadEl = renderPageHead({ selectedOrg, orgList, onSelectOrg, ui });

  return (
    <ScreenLayout
      toolbar={pageHeadEl}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => goTo('territory')}
            className="flex items-center gap-1.5"
            data-testid="Button__e9ef3f">
            <ArrowLeft size={15} data-testid="ArrowLeft__e9ef3f" />{ui('fiscal.onboarding.back').replace('←', '').trim()}
          </Button>
          <span className="flex-1" />
          <Button
            onClick={() => goTo('confirm')}
            disabled={!selectedTerritory || !manualSystem}
            className="flex items-center gap-1.5"
            data-testid="Button__e9ef3f">
            {ui('fiscal.onboarding.continue').replace('›', '').trim()} <ArrowRight size={15} data-testid="ArrowRight__e9ef3f" />
          </Button>
        </>
      }
      data-testid="ScreenLayout__e9ef3f">
      <h2 className="font-semibold leading-8 mb-1" style={{ color: '#121217', fontSize: 18 }}>{ui('fiscal.onboarding.manual.title')}</h2>
      <p className="leading-4 mb-6" style={{ color: '#282833', fontSize: 12 }}>
        {ui('fiscal.onboarding.manual.subtitle')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Territorio */}
        <div className="grid" style={{ gridTemplateColumns: '148px 1fr', gap: 20 }}>
          <div className="text-sm font-semibold pt-1" style={{ color: '#121217' }}>
            {ui('fiscal.onboarding.manual.territory.header')}
          </div>
          <div className="grid grid-cols-3" style={{ gap: 20 }}>
            {Object.values(TERRITORIES).map(territory => (
              <ManualTerrCard
                key={territory.id}
                territory={territory}
                selected={selectedTerritory === territory.id}
                onPick={(territoryId) => onSelectTerritory(territoryId, { clearManualSystem: true })}
                data-testid="ManualTerrCard__e9ef3f" />
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: '#E8EAEF' }} />

        {/* Sistema fiscal */}
        <div className="grid" style={{ gridTemplateColumns: '148px 1fr', gap: 20 }}>
          <div className="text-sm font-semibold pt-1" style={{ color: '#121217' }}>
            {ui('fiscal.onboarding.manual.system.header')}
          </div>
          <div>
            {!selectedTerritory ? (
              <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm" style={{ color: '#555B6D' }}>
                {ui('fiscal.onboarding.manual.system.placeholder')}
              </div>
            ) : (
              <div className="grid grid-cols-3" style={{ gap: 20 }}>
                {manualAllowedSystems.map(systemId => {
                  const sys = SYSTEMS[systemId];
                  const isSelected = manualSystem === sys.id;
                  return (
                    <button
                      key={sys.id}
                      type="button"
                      onClick={() => onSetManualSystem(sys.id)}
                      className={`relative flex flex-col text-left transition-all cursor-pointer rounded-xl
                        ${isSelected ? 'border-2 border-[#121217]' : 'border border-[#E8EAEF] hover:bg-muted/40'}`}
                      style={{
                        minHeight: 80, padding: 16, gap: 12,
                        boxShadow: isSelected
                          ? '0 4px 16px rgba(18,18,23,0.14), 0 1px 3px rgba(18,18,23,0.08)'
                          : '0 1px 2px rgba(18,18,23,0.05)',
                      }}
                    >
                      <span
                        className="absolute flex-shrink-0"
                        style={{
                          width: 15, height: 15, right: 8, top: 9, borderRadius: '50%',
                          border: isSelected ? '1.5px solid #121217' : '1.5px solid #D1D4DB',
                          background: isSelected
                            ? 'radial-gradient(circle at center, #121217 40%, #FFFFFF 40%)'
                            : '#FFFFFF',
                          boxShadow: '0 1px 2px rgba(18,18,23,0.05)',
                        }}
                      />
                      <span className="text-sm font-medium truncate pr-5" style={{ color: '#121217' }}>{sys.name}</span>
                      <span className="text-sm leading-6" style={{ color: '#555B6D' }}>{sys.long}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ScreenLayout>
  );
}

function SubquestionScreen({ t, orgName, selectedOrg, orgList, onSelectOrg, onGoToManual, alsoNational, volume, lowChoice, ui, goTo, onSetAlsoNational, onSetVolume, onSetLowChoice }) {
  const canContinueSubQ = t && (
    (t.askNational && alsoNational !== null) ||
    (t.askVolume && volume === 'high') ||
    (t.askVolume && volume === 'low' && lowChoice !== null)
  );
  const pageHeadEl = renderPageHead({ selectedOrg, orgList, onSelectOrg, ui, onGoToManual });

  if (!t) return null;

  return (
    <ScreenLayout
      toolbar={pageHeadEl}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => goTo('territory')}
            className="flex items-center gap-1.5"
            data-testid="Button__e9ef3f">
            <ArrowLeft size={15} data-testid="ArrowLeft__e9ef3f" /> {ui('fiscal.onboarding.back').replace('←', '').trim()}
          </Button>
          <p className="text-xs flex-1" style={{ color: '#555B6D' }}>{ui('fiscal.skip.hint')}</p>
          <button type="button" onClick={() => goTo('skipped')} className="text-sm" style={{ color: '#121217' }}>
            {ui('fiscal.onboarding.skip')}
          </button>
          <Button
            onClick={() => goTo('confirm')}
            disabled={!canContinueSubQ}
            className="flex items-center gap-1.5"
            data-testid="Button__e9ef3f">
            {ui('fiscal.onboarding.continue').replace('›', '').trim()} <ArrowRight size={15} data-testid="ArrowRight__e9ef3f" />
          </Button>
        </>
      }
      data-testid="ScreenLayout__e9ef3f">
      {t.askNational && (
        <>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold mb-1" style={{ fontSize: 18, color: '#121217' }}>{ui('fiscal.onboarding.subq.also.title')}</h2>
              <p style={{ fontSize: 12, color: '#282833' }}>{ui('fiscal.onboarding.subq.also.subtitle')}</p>
            </div>
            <Stepper step={2} ui={ui} data-testid="Stepper__e9ef3f" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NationalOptionCard
              label={ui('fiscal.onboarding.subq.tbai.label')}
              desc={ui('fiscal.onboarding.subq.tbai.desc')}
              extra={ui('fiscal.onboarding.subq.tbai.extra')}
              selected={alsoNational === false}
              onPick={() => onSetAlsoNational(false)}
              data-testid="NationalOptionCard__e9ef3f" />
            <NationalOptionCard
              label={ui('fiscal.onboarding.subq.sii.label')}
              desc={ui('fiscal.onboarding.subq.sii.desc')}
              extra={ui('fiscal.onboarding.subq.sii.extra')}
              selected={alsoNational === true}
              onPick={() => onSetAlsoNational(true)}
              data-testid="NationalOptionCard__e9ef3f" />
          </div>

          {/* Info box — when does SII apply */}
          <div className="mt-4 rounded-xl px-5 py-4" style={{ background: '#F0FAFF', color: '#0075AD' }}>
            <div className="flex items-center gap-3 mb-3">
              <span
                className="flex-shrink-0 flex items-center justify-center text-white font-bold"
                style={{ width: 28, height: 28, borderRadius: '50%', background: '#00ACFF', fontSize: 14 }}
              >i</span>
              <span className="font-semibold" style={{ fontSize: 14 }}>
                {ui('fiscal.onboarding.subq.sii.info.title')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              {[
                ui('fiscal.onboarding.subq.sii.info.bullet1'),
                ui('fiscal.onboarding.subq.sii.info.bullet2'),
                ui('fiscal.onboarding.subq.sii.info.bullet3'),
                ui('fiscal.onboarding.subq.sii.info.bullet4'),
              ].map((b) => (
                <div key={b} className="flex items-start gap-2">
                  <span className="flex-shrink-0" style={{ fontSize: 16, lineHeight: '20px' }}>•</span>
                  <span style={{ fontSize: 14, lineHeight: '20px' }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {t.askVolume && (
        <>
          {/* Section 1: Obligation — title+stepper top row, cards full-width 2 cols below */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold mb-1" style={{ fontSize: 18, color: '#121217' }}>
                {ui('fiscal.onboarding.subq.obligation.title')}
              </h2>
              <p style={{ fontSize: 12, color: '#282833' }}>
                {ui('fiscal.onboarding.subq.obligation.subtitle')}
              </p>
            </div>
            <Stepper step={2} ui={ui} data-testid="Stepper__e9ef3f" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ObligationCard
              label={ui('fiscal.onboarding.subq.obligation.no.label')}
              paragraphs={[
                ui('fiscal.onboarding.subq.obligation.no.desc1'),
                ui('fiscal.onboarding.subq.obligation.no.desc2'),
              ]}
              selected={volume === 'low'}
              onPick={() => onSetVolume('low')}
              data-testid="ObligationCard__e9ef3f" />
            <ObligationCard
              label={ui('fiscal.onboarding.subq.obligation.yes.label')}
              paragraphs={[ui('fiscal.onboarding.subq.obligation.yes.desc')]}
              info={ui('fiscal.onboarding.subq.obligation.yes.info')}
              selected={volume === 'high'}
              onPick={() => { onSetVolume('high'); onSetLowChoice(null); }}
              data-testid="ObligationCard__e9ef3f" />
          </div>

          {volume === 'low' && (
            <>
              <div className="h-px bg-border my-6" />

              {/* Section 2: Choice — same structure, no stepper (already shown above) */}
              <div className="mb-5">
                <h2 className="font-semibold mb-1" style={{ fontSize: 18, color: '#121217' }}>
                  {ui('fiscal.onboarding.subq.choice.title')}
                </h2>
                <p style={{ fontSize: 12, color: '#282833' }}>
                  {ui('fiscal.onboarding.subq.choice.subtitle')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <BulletOptionCard
                  label={ui('fiscal.onboarding.subq.verifactu.label')}
                  bullets={[
                    ui('fiscal.onboarding.subq.verifactu.bullet1'),
                    ui('fiscal.onboarding.subq.verifactu.bullet2'),
                    ui('fiscal.onboarding.subq.verifactu.bullet3'),
                  ]}
                  selected={lowChoice === 'verifactu'}
                  onPick={() => onSetLowChoice('verifactu')}
                  data-testid="BulletOptionCard__e9ef3f" />
                <BulletOptionCard
                  label={ui('fiscal.onboarding.subq.sii.vol.label')}
                  bullets={[
                    ui('fiscal.onboarding.subq.sii.vol.bullet1'),
                    ui('fiscal.onboarding.subq.sii.vol.bullet2'),
                    ui('fiscal.onboarding.subq.sii.vol.bullet3'),
                  ]}
                  selected={lowChoice === 'sii'}
                  onPick={() => onSetLowChoice('sii')}
                  data-testid="BulletOptionCard__e9ef3f" />
              </div>

              <div className="mt-4 rounded-xl px-4 py-3 flex gap-2.5 text-sm" style={{ background: '#F0FAFF', color: '#0075AD' }}>
                <span
                  className="flex-shrink-0 flex items-center justify-center text-white font-bold"
                  style={{ width: 20, height: 20, borderRadius: '50%', background: '#00ACFF', fontSize: 12, marginTop: 1 }}
                >i</span>
                <p>Importante: {ui('fiscal.onboarding.subq.important.note')}</p>
              </div>
            </>
          )}
        </>
      )}
    </ScreenLayout>
  );
}

function TerritoryScreen({ selectedTerritory, selectedOrg, orgList, onSelectOrg, ui, TERRITORIES, TERRITORY_GROUPS, onPick, goTo, onGoToManual }) {
  const t = TERRITORIES[selectedTerritory];
  return (
    <ScreenLayout
      padContent={false}
      toolbar={
        <PageHead
          selectedOrg={selectedOrg}
          orgList={orgList}
          onSelectOrg={onSelectOrg}
          onGoToManual={onGoToManual}
          ui={ui}
          data-testid="PageHead__e9ef3f" />
      }
      actions={
        <>
          <p className="text-xs flex-1" style={{ color: '#555B6D' }}>{ui('fiscal.skip.hint')}</p>
          <button
            type="button"
            onClick={() => goTo('skipped')}
            className="text-sm transition-colors"
            style={{ color: '#121217' }}
          >
            {ui('fiscal.onboarding.skip')}
          </button>
          <Button
            onClick={() => {
              if (t && (t.askNational || t.askVolume)) goTo('subquestion');
              else goTo('confirm');
            }}
            disabled={!selectedTerritory}
            data-testid="Button__e9ef3f">
            {ui('fiscal.onboarding.continue')}
          </Button>
        </>
      }
      data-testid="ScreenLayout__e9ef3f">
      {/* Wizard header — 80px, padding 8px 20px, align-items: center per Figma */}
      <div
        className="flex items-center justify-between"
        style={{ minHeight: 80, padding: '8px 20px', gap: 10 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 className="font-semibold leading-8" style={{ color: '#121217', fontSize: 18 }}>
            {ui('fiscal.onboarding.territory.title')}
          </h2>
          <p className="text-xs leading-4" style={{ color: '#282833' }}>
            {ui('fiscal.onboarding.territory.subtitle')}
          </p>
        </div>
        <Stepper step={1} ui={ui} data-testid="Stepper__e9ef3f" />
      </div>
      {/* Territory groups — flex-col gap:20px per Figma spec; separators are sibling flex children */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 0px', gap: 20 }}>
        {TERRITORY_GROUPS.flatMap(({ regime, label, desc, items }, idx) => [
          ...(idx > 0 ? [
            <div key={`sep-${regime}`} style={{ height: 1, background: '#E8EAEF', margin: '0 20px' }} />,
          ] : []),
          <div key={regime} className="grid" style={{ gridTemplateColumns: '148px 1fr', gap: 20, padding: '8px 20px 12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="text-sm font-semibold" style={{ color: '#121217' }}>{label}</div>
              <div className="text-xs" style={{ color: '#282833', lineHeight: '16px' }}>{desc}</div>
            </div>
            <div className="grid grid-cols-3" style={{ gap: 20 }}>
              {items.map(id => (
                <TerrCard
                  key={id}
                  territory={TERRITORIES[id]}
                  selected={selectedTerritory === id}
                  onPick={onPick}
                  data-testid="TerrCard__e9ef3f" />
              ))}
            </div>
          </div>,
        ])}
      </div>
    </ScreenLayout>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingWizard({ apiBaseUrl, onComplete, onGoHome }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const { selectedOrg, selectedRole, selectOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const orgName = selectedOrg?.name ?? null;
  const orgList = selectedRole?.orgList ?? [];
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));

  function handleSelectOrg(org) {
    selectOrg(org);
    onComplete();
  }

  const TERRITORIES = {
    navarra:  { ...TERRITORY_META.navarra,  name: ui('fiscal.territory.navarra'),  system: ui('fiscal.territory.system.sii'),    systemLong: ui('fiscal.territory.navarra.systemLong'),  example: ui('fiscal.territory.navarra.example')  },
    alava:    { ...TERRITORY_META.alava,    name: ui('fiscal.territory.alava'),    system: ui('fiscal.territory.system.tbai'),   systemLong: ui('fiscal.territory.alava.systemLong'),    example: ui('fiscal.territory.alava.example')    },
    bizkaia:  { ...TERRITORY_META.bizkaia,  name: ui('fiscal.territory.bizkaia'),  system: ui('fiscal.territory.system.tbai'),   systemLong: ui('fiscal.territory.bizkaia.systemLong'),  example: ui('fiscal.territory.bizkaia.example')  },
    gipuzkoa: { ...TERRITORY_META.gipuzkoa, name: ui('fiscal.territory.gipuzkoa'), system: ui('fiscal.territory.system.tbai'),   systemLong: ui('fiscal.territory.gipuzkoa.systemLong'), example: ui('fiscal.territory.gipuzkoa.example') },
    baleares: { ...TERRITORY_META.baleares, name: ui('fiscal.territory.espania'),  system: ui('fiscal.territory.system.siiver'), systemLong: ui('fiscal.territory.baleares.systemLong'), example: ui('fiscal.territory.baleares.example') },
    canarias: { ...TERRITORY_META.canarias, name: ui('fiscal.territory.canarias'), system: ui('fiscal.territory.system.siiver'), systemLong: ui('fiscal.territory.canarias.systemLong'), example: ui('fiscal.territory.canarias.example') },
    ceuta:    { ...TERRITORY_META.ceuta,    name: ui('fiscal.territory.ceuta'),    system: ui('fiscal.territory.system.siiver'), systemLong: ui('fiscal.territory.ceuta.systemLong'),    example: ui('fiscal.territory.ceuta.example')    },
  };

  const TERRITORY_GROUPS = TERRITORY_GROUP_META.map(g => ({
    ...g,
    label: ui(`fiscal.territory.group.${g.regime === 'sii_foral' ? 'sii' : g.regime}.label`),
    desc:  ui(`fiscal.territory.group.${g.regime === 'sii_foral' ? 'sii' : g.regime}.desc`),
  }));

  const SYSTEMS = {
    SII:       { id: 'SII',       name: 'SII',        long: ui('fiscal.system.sii.long'),      desc: ui('fiscal.system.sii.desc')      },
    TBAI:      { id: 'TBAI',      name: 'TicketBAI',         long: ui('fiscal.system.tbai.long'),     desc: ui('fiscal.system.tbai.desc')     },
    'SII+TBAI':{ id: 'SII+TBAI',  name: 'SII + TicketBAI',  long: ui('fiscal.system.siitbai.long'),  desc: ui('fiscal.system.siitbai.desc')  },
    VERIFACTU: { id: 'VERIFACTU', name: 'VERI*FACTU',  long: ui('fiscal.system.verifactu.long'), desc: ui('fiscal.system.verifactu.desc') },
  };

  const [step, setStep]                   = useState('territory');
  const [selectedTerritory, setSelectedTerritory] = useState(null);
  const [manualSystem, setManualSystem]   = useState(null);
  const [alsoNational, setAlsoNational]   = useState(null);
  const [volume, setVolume]               = useState(null);
  const [lowChoice, setLowChoice]         = useState(null);
  const [system, setSystem]               = useState(null);
  const [createdRecords, setCreatedRecords] = useState({});
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState(null);

  const siiRef      = useRef(null);
  const tbaiRef     = useRef(null);
  const verifactuRef = useRef(null);

  function goTo(s) { setStep(s); setError(null); }

  function handleTerritorySelection(territoryId, { clearManualSystem = false } = {}) {
    const changed = selectedTerritory !== territoryId;
    setSelectedTerritory(territoryId);
    if (changed) {
      setAlsoNational(null);
      setVolume(null);
      setLowChoice(null);
      if (clearManualSystem) setManualSystem(null);
    }
  }

  const t = TERRITORIES[selectedTerritory];
  const resolvedSystem = manualSystem ?? resolveSystem({ regime: t?.regime ?? null, alsoNational, volume, lowChoice });

  async function createRecords() {
    const sys = resolvedSystem;
    const terrId = selectedTerritory;
    setSaving(true);
    setError(null);
    try {
      const org = { adOrgId: orgId };
      const records = {};
      const payloads = buildOnboardingPayloads(sys, terrId);

      if (payloads.sii) {
        records.sii = await createAndFetchRecord({ specName: 'sii-config', entityName: SII_ENTITY, body: { ...org, ...payloads.sii }, apiFetch, system: 'SII' });
      }
      if (payloads.tbai) {
        records.tbai = await createAndFetchRecord({ specName: 'tbai-config', entityName: TBAI_ENTITY, body: { ...org, ...payloads.tbai }, apiFetch, system: 'TBAI' });
      }
      if (payloads.verifactu) {
        records.verifactu = await createAndFetchRecord({ specName: 'verifactu-config', entityName: VERIFACTU_ENTITY, body: { ...org, ...payloads.verifactu }, apiFetch, system: 'VERIFACTU' });
      }
      setCreatedRecords(records);
      setSystem(sys);
      goTo('detail');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const onGoToManual = () => { setManualSystem(null); goTo('manual'); };
  const shared = { orgName, selectedOrg, orgList, onSelectOrg: handleSelectOrg, ui, TERRITORIES, SYSTEMS, goTo, onGoToManual };

  if (step === 'skipped') return (
    <SkippedScreen
      {...shared}
      onGoHome={onGoHome}
      onComplete={onComplete}
      data-testid="SkippedScreen__e9ef3f" />
  );

  if (step === 'applied') return (
    <AppliedScreen
      {...shared}
      orgId={orgId}
      system={system}
      selectedTerritory={selectedTerritory}
      alsoNational={alsoNational}
      volume={volume}
      lowChoice={lowChoice}
      apiBaseUrl={apiBaseUrl}
      apiFetch={apiFetch}
      locale={locale}
      onComplete={onComplete}
      onGoHome={onGoHome}
      data-testid="AppliedScreen__e9ef3f" />
  );

  if (step === 'detail') return (
    <DetailScreen
      {...shared}
      orgId={orgId}
      system={system}
      selectedTerritory={selectedTerritory}
      createdRecords={createdRecords}
      apiBaseUrl={apiBaseUrl}
      error={error}
      siiRef={siiRef}
      tbaiRef={tbaiRef}
      verifactuRef={verifactuRef}
      onBack={() => goTo('confirm')}
      onApplied={() => goTo('applied')}
      onComplete={onComplete}
      data-testid="DetailScreen__e9ef3f" />
  );

  if (step === 'confirm') return (
    <ConfirmScreen
      {...shared}
      resolvedSystem={resolvedSystem}
      selectedTerritory={selectedTerritory}
      alsoNational={alsoNational}
      volume={volume}
      lowChoice={lowChoice}
      manualSystem={manualSystem}
      saving={saving}
      error={error}
      TERRITORY_GROUPS={TERRITORY_GROUPS}
      onCreateRecords={createRecords}
      data-testid="ConfirmScreen__e9ef3f" />
  );

  if (step === 'manual') return (
    <ManualScreen
      {...shared}
      selectedTerritory={selectedTerritory}
      manualSystem={manualSystem}
      TERRITORY_GROUPS={TERRITORY_GROUPS}
      onSelectTerritory={handleTerritorySelection}
      onSetManualSystem={setManualSystem}
      data-testid="ManualScreen__e9ef3f" />
  );

  if (step === 'subquestion') return (
    <SubquestionScreen
      {...shared}
      t={t}
      alsoNational={alsoNational}
      volume={volume}
      lowChoice={lowChoice}
      onSetAlsoNational={setAlsoNational}
      onSetVolume={setVolume}
      onSetLowChoice={setLowChoice}
      data-testid="SubquestionScreen__e9ef3f" />
  );

  return (
    <TerritoryScreen
      {...shared}
      selectedTerritory={selectedTerritory}
      TERRITORY_GROUPS={TERRITORY_GROUPS}
      onPick={handleTerritorySelection}
      onGoToManual={() => { setManualSystem(null); goTo('manual'); }}
      data-testid="TerritoryScreen__e9ef3f" />
  );
}

// ── Shared layout atoms ───────────────────────────────────────────────────────

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}

function NextItem({ icon, title, desc, badge, done, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-3 p-3.5 border rounded-[10px] hover:bg-muted/40 transition-colors text-left w-full
        ${done ? 'bg-green-50 border-green-200' : 'bg-background border-border'}`}>
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm
        ${done ? 'bg-green-100 text-green-700' : 'bg-muted text-foreground/60'}`}>
        {done ? <Check size={15} strokeWidth={2.5} data-testid="Check__e9ef3f" /> : icon}
      </span>
      <span className="flex-1">
        <span className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${done ? 'text-green-800' : ''}`}>{title}</span>
          {badge && !done && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 leading-none">{badge}</span>
          )}
        </span>
        <span className="block text-xs text-muted-foreground mt-0.5">{desc}</span>
      </span>
      <ChevronRight
        size={14}
        strokeWidth={1.75}
        className="text-muted-foreground"
        data-testid="ChevronRight__e9ef3f" />
    </button>
  );
}

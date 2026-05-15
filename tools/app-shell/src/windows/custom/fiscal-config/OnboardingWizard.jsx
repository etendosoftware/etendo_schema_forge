import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useUI, useLocaleSwitch } from '@/i18n';
import { FileText, Check, ChevronRight } from 'lucide-react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
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

// ── Primitive components ──────────────────────────────────────────────────────

function Stepper({ step, ui }) {
  const steps = [
    { n: 1, label: ui('fiscal.onboarding.step.territory') },
    { n: 2, label: ui('fiscal.onboarding.step.details') },
    { n: 3, label: ui('fiscal.onboarding.step.confirm') },
  ];
  return (
    <div className="flex items-center gap-2 mt-4">
      {steps.map(({ n, label }, i) => {
        const done = step > n;
        const active = step === n;
        return (
          <span key={n} className="flex items-center gap-2">
            {i > 0 && <span className="w-6 h-px bg-border flex-shrink-0" />}
            <span className={`flex items-center gap-2 text-xs ${active ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold border flex-shrink-0
                ${done   ? 'bg-foreground text-background border-foreground' :
                  active ? 'bg-yellow-400 text-foreground border-black/10' :
                           'bg-muted text-muted-foreground border-border'}`}>
                {done ? '✓' : n}
              </span>
              {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function PageHead({ step, orgName, ui }) {
  return (
    <div className="mb-6">
      {orgName && (
        <p className="text-xs text-muted-foreground mb-3">
          {ui('fiscal.onboarding.org.label')} <span className="font-medium text-foreground">{orgName}</span>
        </p>
      )}
      {step != null && <Stepper step={step} ui={ui} />}
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
  return (
    <button
      type="button"
      onClick={() => onPick(territory.id)}
      className={`relative flex flex-col gap-1.5 p-3.5 rounded-xl border text-left transition-all cursor-pointer
        ${selected
          ? 'border-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground))]'
          : 'border-border hover:bg-muted/40 hover:border-border/80'}`}
    >
      {selected && (
        <span className="absolute top-3 right-3 w-[18px] h-[18px] rounded-full bg-foreground text-background flex items-center justify-center text-[10px]">✓</span>
      )}
      <div className="flex items-center gap-2 pr-6">
        <span className="text-sm font-semibold">{territory.name}</span>
        {territory.system && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground leading-none">
            {territory.system}
          </span>
        )}
      </div>
      {territory.example && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
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

function ScreenLayout({ children, actions, hint }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-6 pt-6 pb-4">{children}</div>
      </div>
      <div className="flex-shrink-0 bg-background border-t border-border">
        <div className="px-6 py-3 flex items-center gap-2.5">{actions}</div>
        {hint && <p className="text-xs text-muted-foreground text-center pb-2">{hint}</p>}
      </div>
    </div>
  );
}

// ── Step screens ──────────────────────────────────────────────────────────────

function SkippedScreen({ orgName, ui, onGoHome, onComplete, goTo }) {
  return (
    <ScreenLayout actions={
      <>
        <Button variant="outline" onClick={() => goTo('territory')}>{ui('fiscal.onboarding.back.wizard')}</Button>
        <span className="flex-1" />
        <Button onClick={onGoHome ?? onComplete}>{ui('fiscal.onboarding.goHome')}</Button>
      </>
    }>
      <PageHead orgName={orgName} ui={ui} />
      <div className="flex flex-col items-center text-center py-8">
        <span className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-2xl mb-4">⏭</span>
        <h2 className="text-lg font-bold mb-1">{ui('fiscal.onboarding.skipped.title')}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">{ui('fiscal.skip.hint')}</p>
      </div>
      <div className="rounded-[10px] border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        {ui('fiscal.onboarding.skipped.hint')}
      </div>
    </ScreenLayout>
  );
}

function AppliedScreen({ orgId, orgName, system, selectedTerritory, alsoNational, volume, lowChoice, apiBaseUrl, apiFetch, locale, ui, SYSTEMS, TERRITORIES, onComplete, onGoHome }) {
  const [cert, setCert] = useState(null);
  const [certModalOpen, setCertModalOpen] = useState(false);

  useEffect(() => {
    if (!orgId || !system) return;
    const certCtx = getCertificateContext(system);
    if (!certCtx) return;
    apiFetch('/certificate')
      .then(r => r.json())
      .then(data => {
        if (data?.exists) setCert({ name: ui('fiscal.cert.loaded'), validTo: data.validTo ?? '' });
      })
      .catch(() => {});
  }, [orgId, apiFetch, system, ui]);

  const sys = SYSTEMS[system];
  const terr = TERRITORIES[selectedTerritory ?? ''];
  const certContext = getCertificateContext(system);

  return (
    <>
      <ScreenLayout actions={
        <>
          <Button variant="outline" onClick={onComplete}>{ui('fiscal.onboarding.viewConfig')}</Button>
          <span className="flex-1" />
          <Button onClick={onGoHome ?? onComplete}>{ui('fiscal.onboarding.goHome')}</Button>
        </>
      }>
        <PageHead orgName={orgName} ui={ui} />
        <h2 className="text-xl font-bold tracking-tight mb-1">{ui('fiscal.onboarding.applied.title')}</h2>
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
            {terr && <Row k={ui('fiscal.onboarding.applied.row.territory')} v={terr.name} />}
            <Row k={ui('fiscal.onboarding.applied.row.system')} v={sys?.name} />
            <Row k={ui('fiscal.onboarding.applied.row.tax')} v={terr ? terr.systemLong : sys?.long} />
            {terr?.askNational && (
              <Row k={ui('fiscal.onboarding.applied.row.national')} v={alsoNational ? ui('fiscal.onboarding.applied.national.active') : ui('fiscal.onboarding.applied.national.na')} />
            )}
            {terr?.askVolume && volume && (
              <Row k={ui('fiscal.onboarding.applied.row.volume')} v={volume === 'high' ? ui('fiscal.onboarding.applied.volume.high') : ui('fiscal.onboarding.applied.volume.low')} />
            )}
            {volume === 'low' && lowChoice && (
              <Row k={ui('fiscal.onboarding.applied.row.chosen')} v={lowChoice === 'sii' ? ui('fiscal.onboarding.applied.chosen.sii') : ui('fiscal.onboarding.applied.chosen.verifactu')} />
            )}
            <Row k={ui('fiscal.onboarding.applied.row.env')} v={<span className="text-amber-700">{ui('fiscal.onboarding.applied.env.sandbox')}</span>} />
            <Row k={ui('fiscal.onboarding.applied.row.activated')} v={new Date().toLocaleString(locale.replace('_', '-'), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
          </div>
        </div>

        <div className="mt-7">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">{ui('fiscal.onboarding.nextsteps.title')}</h3>
          <div className="flex flex-col gap-2">
            {certContext && (
              <NextItem
                icon={<FileText size={15} strokeWidth={1.75} />}
                title={cert ? ui('fiscal.onboarding.cert.loaded.title') : ui('fiscal.onboarding.cert.upload.title')}
                desc={cert
                  ? ui('fiscal.onboarding.cert.loaded.desc', { name: cert.name, validTo: cert.validTo })
                  : ui('fiscal.onboarding.cert.upload.desc')}
                badge={cert ? null : ui('fiscal.onboarding.cert.pending')}
                done={!!cert}
                onClick={() => setCertModalOpen(true)}
              />
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
        />
      )}
    </>
  );
}

function DetailScreen({ system, selectedTerritory, createdRecords, orgId, orgName, apiBaseUrl, error, ui, SYSTEMS, siiRef, tbaiRef, verifactuRef, onBack, onApplied, onComplete }) {
  const sys = SYSTEMS[system];

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

  return (
    <ScreenLayout actions={
      <>
        <Button variant="outline" onClick={onBack}>{ui('fiscal.onboarding.back')}</Button>
        <span className="flex-1" />
        <Button onClick={handleSaveDetail}>{ui('fiscal.onboarding.detail.saveapply')}</Button>
      </>
    }>
      <PageHead orgName={orgName} ui={ui} />
      <Breadcrumb items={[
        { label: ui('fiscal.onboarding.breadcrumb.fiscal'), onClick: onComplete },
        { label: sys?.name },
      ]} />
      <h2 className="text-xl font-bold tracking-tight mb-1">
        {sys?.name} <span className="text-lg font-normal text-muted-foreground">· {sys?.long}</span>
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {system === 'SII'       && ui('fiscal.onboarding.detail.sii.desc')}
        {system === 'TBAI'      && ui('fiscal.onboarding.detail.tbai.desc')}
        {system === 'SII+TBAI'  && ui('fiscal.onboarding.detail.siitbai.desc')}
        {system === 'VERIFACTU' && ui('fiscal.onboarding.detail.verifactu.desc')}
      </p>

      {(system === 'SII' || system === 'SII+TBAI') && createdRecords.sii && (
        <>
          {system === 'SII+TBAI' && <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">{ui('fiscal.onboarding.detail.sii.header')}</div>}
          <SiiSection
            ref={siiRef}
            record={createdRecords.sii}
            apiBaseUrl={apiBaseUrl}
            orgId={orgId}
            onSave={() => {}}
            variant={selectedTerritory === 'navarra' ? 'sii-navarra' : 'sii'}
            hideSave
            hideCert={system === 'SII+TBAI'}
          />
        </>
      )}

      {system === 'SII+TBAI' && <div className="border-t my-8" />}

      {(system === 'TBAI' || system === 'SII+TBAI') && createdRecords.tbai && (
        <>
          {system === 'SII+TBAI' && <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">{ui('fiscal.onboarding.detail.tbai.header')}</div>}
          <TbaiSection
            ref={tbaiRef}
            record={createdRecords.tbai}
            apiBaseUrl={apiBaseUrl}
            orgId={orgId}
            onSave={() => {}}
            hideSave
            hideCert={system === 'SII+TBAI'}
          />
        </>
      )}

      {system === 'SII+TBAI' && (
        <CertSection context="sii" orgId={orgId} apiBaseUrl={apiBaseUrl} />
      )}

      {system === 'VERIFACTU' && createdRecords.verifactu && (
        <VerifactuSection
          ref={verifactuRef}
          record={createdRecords.verifactu}
          apiBaseUrl={apiBaseUrl}
          orgId={orgId}
          onSave={() => {}}
          hideSave
        />
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </ScreenLayout>
  );
}

function ConfirmScreen({ resolvedSystem, selectedTerritory, alsoNational, volume, lowChoice, manualSystem, saving, error, orgName, ui, SYSTEMS, TERRITORIES, goTo, onCreateRecords }) {
  const sys = SYSTEMS[resolvedSystem];
  const terr = TERRITORIES[selectedTerritory ?? ''];
  const prevStep = manualSystem ? 'manual' : (terr && (terr.askNational || terr.askVolume) ? 'subquestion' : 'territory');

  return (
    <ScreenLayout actions={
      <>
        <Button variant="outline" onClick={() => goTo(prevStep)} disabled={saving}>{ui('fiscal.onboarding.back')}</Button>
        <span className="flex-1" />
        <Button onClick={onCreateRecords} disabled={saving}>
          {saving ? ui('fiscal.onboarding.confirm.creating') : ui('fiscal.onboarding.confirm.btn')}
        </Button>
      </>
    }>
      <PageHead step={3} orgName={orgName} ui={ui} />
      <Breadcrumb items={[
        { label: ui('fiscal.onboarding.breadcrumb.territory'), onClick: () => goTo('territory') },
        { label: ui('fiscal.onboarding.breadcrumb.confirm') },
      ]} />

      <h2 className="text-xl font-bold tracking-tight mb-1">{ui('fiscal.onboarding.confirm.title')}</h2>
      <p className="text-sm text-muted-foreground mb-5">
        {ui('fiscal.onboarding.confirm.subtitle')}
      </p>

      <div className="bg-muted/40 border border-border rounded-xl px-5 py-2 divide-y divide-dashed divide-border text-sm mb-5">
        {terr && <Row k={ui('fiscal.onboarding.confirm.row.territory')} v={terr.name} />}
        {terr && <Row k={ui('fiscal.onboarding.confirm.row.hacienda')} v={terr.systemLong} />}
        {terr?.askNational && alsoNational !== null && (
          <Row k={ui('fiscal.onboarding.confirm.row.national')} v={alsoNational ? ui('fiscal.onboarding.confirm.row.national.yes') : ui('fiscal.onboarding.confirm.row.national.no')} />
        )}
        {terr?.askVolume && volume && (
          <Row k={ui('fiscal.onboarding.confirm.row.volume')} v={volume === 'high' ? ui('fiscal.onboarding.confirm.row.volume.high') : ui('fiscal.onboarding.confirm.row.volume.low')} />
        )}
        {volume === 'low' && lowChoice && (
          <Row k={ui('fiscal.onboarding.confirm.row.choice')} v={lowChoice === 'sii' ? ui('fiscal.onboarding.confirm.row.choice.sii') : ui('fiscal.onboarding.confirm.row.choice.verifactu')} />
        )}
        <Row k={ui('fiscal.onboarding.confirm.row.system')} v={`${sys?.name} — ${sys?.long}`} />
      </div>

      <div className="rounded-[10px] border border-blue-200 bg-blue-50 p-3 flex gap-2.5 text-sm text-blue-800 mb-6">
        <span className="flex-shrink-0 mt-0.5">ℹ</span>
        <div>
          <strong>{ui('fiscal.onboarding.confirm.next.title')}</strong>
          <p className="text-xs text-blue-700/80 mt-0.5">{ui('fiscal.onboarding.confirm.next.body')}</p>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
    </ScreenLayout>
  );
}

function ManualScreen({ selectedTerritory, manualSystem, orgName, ui, TERRITORIES, SYSTEMS, goTo, onSelectTerritory, onSetManualSystem }) {
  const manualAllowedSystems = getAllowedSystemsForTerritory(selectedTerritory);

  return (
    <ScreenLayout actions={
      <>
        <Button variant="outline" onClick={() => goTo('territory')}>{ui('fiscal.onboarding.back')}</Button>
        <span className="flex-1" />
        <Button onClick={() => goTo('confirm')} disabled={!selectedTerritory || !manualSystem}>
          {ui('fiscal.onboarding.continue')}
        </Button>
      </>
    }>
      <PageHead orgName={orgName} ui={ui} />
      <Breadcrumb items={[
        { label: ui('fiscal.onboarding.breadcrumb.territory'), onClick: () => goTo('territory') },
        { label: ui('fiscal.onboarding.breadcrumb.manual') },
      ]} />

      <h2 className="text-xl font-bold tracking-tight mb-1">{ui('fiscal.onboarding.manual.title')}</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {ui('fiscal.onboarding.manual.subtitle')}
      </p>

      <div className="space-y-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">{ui('fiscal.onboarding.manual.territory.header')}</div>
          <div className="grid gap-2.5 grid-cols-3">
            {Object.values(TERRITORIES).map(territory => (
              <TerrCard
                key={territory.id}
                territory={territory}
                selected={selectedTerritory === territory.id}
                onPick={(territoryId) => onSelectTerritory(territoryId, { clearManualSystem: true })}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">{ui('fiscal.onboarding.manual.system.header')}</div>
          {!selectedTerritory ? (
            <div className="rounded-[10px] border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              {ui('fiscal.onboarding.manual.system.placeholder')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {manualAllowedSystems.map(systemId => {
                const sys = SYSTEMS[systemId];
                return (
                  <button
                    key={sys.id}
                    type="button"
                    onClick={() => onSetManualSystem(sys.id)}
                    className={`p-5 rounded-xl border text-left cursor-pointer transition-all
                      ${manualSystem === sys.id
                        ? 'border-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground))]'
                        : 'border-border hover:bg-muted/40 hover:border-border/80'}`}
                  >
                    <div className="font-bold text-sm mb-1">{sys.name}</div>
                    <div className="text-xs text-muted-foreground">{sys.long}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ScreenLayout>
  );
}

function SubquestionScreen({ t, orgName, alsoNational, volume, lowChoice, ui, goTo, onSetAlsoNational, onSetVolume, onSetLowChoice }) {
  const canContinueSubQ = t && (
    (t.askNational && alsoNational !== null) ||
    (t.askVolume && volume === 'high') ||
    (t.askVolume && volume === 'low' && lowChoice !== null)
  );

  if (!t) return null;

  return (
    <ScreenLayout actions={
      <>
        <Button variant="outline" onClick={() => goTo('territory')}>{ui('fiscal.onboarding.back')}</Button>
        <span className="flex-1" />
        <Button onClick={() => goTo('confirm')} disabled={!canContinueSubQ}>{ui('fiscal.onboarding.continue')}</Button>
      </>
    }>
      <PageHead step={2} orgName={orgName} ui={ui} />
      <Breadcrumb items={[
        { label: ui('fiscal.onboarding.breadcrumb.territory'), onClick: () => goTo('territory') },
        { label: ui('fiscal.onboarding.breadcrumb.details') },
      ]} />

      {t.askNational && (
        <>
          <h2 className="text-xl font-bold tracking-tight mb-1">{ui('fiscal.onboarding.subq.also.title')}</h2>
          <p className="text-sm text-muted-foreground mb-5">
            {ui('fiscal.onboarding.subq.also.subtitle', { territory: t.name })}
          </p>
          <div className="flex flex-col gap-2">
            <RadioRow checked={alsoNational === false} onClick={() => onSetAlsoNational(false)}
              label={ui('fiscal.onboarding.subq.tbai.label')}
              description={ui('fiscal.onboarding.subq.tbai.desc', { territory: t.name })} />
            <RadioRow checked={alsoNational === true} onClick={() => onSetAlsoNational(true)}
              label={ui('fiscal.onboarding.subq.sii.label')}
              description={ui('fiscal.onboarding.subq.sii.desc')} />
          </div>
        </>
      )}

      {t.askVolume && (
        <>
          <h2 className="text-xl font-bold tracking-tight mb-1">{ui('fiscal.onboarding.subq.volume.title')}</h2>
          <p className="text-sm text-muted-foreground mb-5">
            {ui('fiscal.onboarding.subq.volume.subtitle')}
          </p>
          <div className="flex flex-col gap-2">
            <RadioRow checked={volume === 'low'} onClick={() => onSetVolume('low')}
              label={ui('fiscal.onboarding.subq.volume.low.label')}
              description={ui('fiscal.onboarding.subq.volume.low.desc')} />
            <RadioRow checked={volume === 'high'} onClick={() => { onSetVolume('high'); onSetLowChoice(null); }}
              label={ui('fiscal.onboarding.subq.volume.high.label')}
              description={ui('fiscal.onboarding.subq.volume.high.desc')} />
          </div>

          {volume === 'low' && (
            <>
              <div className="h-px bg-border my-5" />
              <h3 className="text-base font-bold mb-1">{ui('fiscal.onboarding.subq.system.title')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {ui('fiscal.onboarding.subq.system.subtitle')}
              </p>
              <div className="flex flex-col gap-2">
                <RadioRow checked={lowChoice === 'verifactu'} onClick={() => onSetLowChoice('verifactu')}
                  label={ui('fiscal.onboarding.subq.verifactu.label')}
                  description={ui('fiscal.onboarding.subq.verifactu.desc')} />
                <RadioRow checked={lowChoice === 'sii'} onClick={() => onSetLowChoice('sii')}
                  label={ui('fiscal.onboarding.subq.sii.vol.label')}
                  description={ui('fiscal.onboarding.subq.sii.vol.desc')} />
              </div>
            </>
          )}
        </>
      )}
    </ScreenLayout>
  );
}

function TerritoryScreen({ selectedTerritory, orgName, ui, TERRITORIES, TERRITORY_GROUPS, onPick, goTo, onGoToManual }) {
  const t = TERRITORIES[selectedTerritory];
  return (
    <ScreenLayout
      hint={ui('fiscal.skip.hint')}
      actions={
        <>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => goTo('skipped')}
            className="text-sm text-foreground border-b border-border hover:border-foreground pb-0.5"
          >
            {ui('fiscal.skip')}
          </button>
          <Button
            onClick={() => {
              if (t && (t.askNational || t.askVolume)) goTo('subquestion');
              else goTo('confirm');
            }}
            disabled={!selectedTerritory}
          >
            {ui('fiscal.onboarding.continue')}
          </Button>
        </>
      }
    >
      <PageHead step={1} orgName={orgName} ui={ui} />

      <h2 className="text-xl font-bold tracking-tight mb-1">{ui('fiscal.onboarding.territory.title')}</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {ui('fiscal.onboarding.territory.subtitle')}
      </p>

      <div className="space-y-6">
        {TERRITORY_GROUPS.map(({ regime, label, desc, items }) => (
          <div key={regime}>
            <div className="flex items-baseline gap-2 mb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/60">{label}</span>
              <span className="text-xs text-muted-foreground/70">
                <span className="mr-1.5 text-muted-foreground/40">—</span>{desc}
              </span>
            </div>
            <div className={`grid gap-2.5 ${items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {items.map(id => (
                <TerrCard
                  key={id}
                  territory={TERRITORIES[id]}
                  selected={selectedTerritory === id}
                  onPick={onPick}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="border-t pt-5">
          <div className="flex items-baseline gap-2 mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/60">{ui('fiscal.onboarding.territory.manualConfig.header')}</span>
            <span className="text-xs text-muted-foreground/70"><span className="mr-1.5 text-muted-foreground/40">—</span>{ui('fiscal.onboarding.territory.manualConfig.desc')}</span>
          </div>
          <button
            type="button"
            onClick={onGoToManual}
            className="flex items-center w-full gap-3 px-4 py-3 border border-border rounded-xl bg-background text-sm font-medium hover:bg-muted/40 transition-colors text-left"
          >
            {ui('fiscal.onboarding.manual.btn')}
            <span className="ml-auto text-muted-foreground">›</span>
          </button>
        </div>
      </div>
    </ScreenLayout>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingWizard({ orgId, orgName, apiBaseUrl, onComplete, onGoHome }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));

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
    TBAI:      { id: 'TBAI',      name: 'TBAI',       long: ui('fiscal.system.tbai.long'),     desc: ui('fiscal.system.tbai.desc')     },
    'SII+TBAI':{ id: 'SII+TBAI',  name: 'SII + TBAI', long: ui('fiscal.system.siitbai.long'),  desc: ui('fiscal.system.siitbai.desc')  },
    VERIFACTU: { id: 'VERIFACTU', name: 'Verifactu',  long: ui('fiscal.system.verifactu.long'), desc: ui('fiscal.system.verifactu.desc') },
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

  const shared = { orgName, ui, TERRITORIES, SYSTEMS, goTo };

  if (step === 'skipped') return <SkippedScreen {...shared} onGoHome={onGoHome} onComplete={onComplete} />;

  if (step === 'applied') return (
    <AppliedScreen {...shared} orgId={orgId} system={system} selectedTerritory={selectedTerritory}
      alsoNational={alsoNational} volume={volume} lowChoice={lowChoice}
      apiBaseUrl={apiBaseUrl} apiFetch={apiFetch} locale={locale}
      onComplete={onComplete} onGoHome={onGoHome} />
  );

  if (step === 'detail') return (
    <DetailScreen {...shared} orgId={orgId} system={system} selectedTerritory={selectedTerritory}
      createdRecords={createdRecords} apiBaseUrl={apiBaseUrl} error={error}
      siiRef={siiRef} tbaiRef={tbaiRef} verifactuRef={verifactuRef}
      onBack={() => goTo('confirm')} onApplied={() => goTo('applied')} onComplete={onComplete} />
  );

  if (step === 'confirm') return (
    <ConfirmScreen {...shared} resolvedSystem={resolvedSystem} selectedTerritory={selectedTerritory}
      alsoNational={alsoNational} volume={volume} lowChoice={lowChoice} manualSystem={manualSystem}
      saving={saving} error={error} TERRITORY_GROUPS={TERRITORY_GROUPS}
      onCreateRecords={createRecords} />
  );

  if (step === 'manual') return (
    <ManualScreen {...shared} selectedTerritory={selectedTerritory} manualSystem={manualSystem}
      TERRITORY_GROUPS={TERRITORY_GROUPS}
      onSelectTerritory={handleTerritorySelection} onSetManualSystem={setManualSystem} />
  );

  if (step === 'subquestion') return (
    <SubquestionScreen {...shared} t={t} alsoNational={alsoNational} volume={volume} lowChoice={lowChoice}
      onSetAlsoNational={setAlsoNational} onSetVolume={setVolume} onSetLowChoice={setLowChoice} />
  );

  return (
    <TerritoryScreen {...shared} selectedTerritory={selectedTerritory} TERRITORY_GROUPS={TERRITORY_GROUPS}
      onPick={handleTerritorySelection}
      onGoToManual={() => { setManualSystem(null); goTo('manual'); }} />
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
        {done ? <Check size={15} strokeWidth={2.5} /> : icon}
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
      <ChevronRight size={14} strokeWidth={1.75} className="text-muted-foreground" />
    </button>
  );
}

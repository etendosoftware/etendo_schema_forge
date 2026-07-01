import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSifFieldPatcher } from '@/windows/custom/shared/useSifFieldPatcher.js';

function Field({ label, htmlFor, children }) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-sm text-foreground font-medium"
        data-testid="Label__b99c8b">{label}</Label>
      {children}
    </div>
  );
}

function ReadOnlyValue({ id, value }) {
  return (
    <Input
      id={id}
      type="text"
      value={value ?? '—'}
      disabled
      readOnly
      className="bg-muted/40"
      data-testid="Input__b99c8b" />
  );
}

function CheckboxField({ id, checked, disabled, onToggle }) {
  return (
    <div className="h-10 flex items-center">
      <button
        type="button"
        role="checkbox"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onToggle(!checked)}
        className={[
          'h-5 w-5 shrink-0 rounded-sm border border-[#D1D4DB] shadow-[0px_1px_2px_rgba(18,18,23,0.05)]',
          'flex items-center justify-center transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent',
        ].join(' ')}
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
    </div>
  );
}

const PILL_CLS = {
  pending: 'bg-yellow-50 text-yellow-800',
  success: 'bg-green-50 text-green-700',
  neutral: 'bg-[#F5F7F9] text-gray-700',
  danger: 'bg-red-50 text-red-700',
};

const SII_STATUS = {
  CO: { key: 'sifDataTabs.status.sii.correct', cls: PILL_CLS.success },
  AE: { key: 'sifDataTabs.status.sii.acceptedWithErrors', cls: PILL_CLS.pending },
  IN: { key: 'sifDataTabs.status.sii.incorrect', cls: PILL_CLS.danger },
  EE: { key: 'sifDataTabs.status.sii.sendError', cls: PILL_CLS.danger },
  PE: { key: 'sifDataTabs.status.sii.pending', cls: PILL_CLS.pending },
  AN: { key: 'sifDataTabs.status.sii.cancelled', cls: PILL_CLS.neutral },
  BA: { key: 'sifDataTabs.status.sii.dropped', cls: PILL_CLS.neutral },
  NR: { key: 'sifDataTabs.status.sii.notRegistrable', cls: PILL_CLS.neutral },
};

const SII_DEFAULT = { key: 'sifDataTabs.status.sii.pending', cls: PILL_CLS.pending };

const VERIFACTU_STATUS = {
  AC: { key: 'sifDataTabs.status.verifactu.accepted', cls: PILL_CLS.success },
  AE: { key: 'sifDataTabs.status.verifactu.acceptedWithErrors', cls: PILL_CLS.pending },
  IN: { key: 'sifDataTabs.status.verifactu.invalid', cls: PILL_CLS.danger },
  ER: { key: 'sifDataTabs.status.verifactu.rejected', cls: PILL_CLS.danger },
  PE: { key: 'sifDataTabs.status.verifactu.pending', cls: PILL_CLS.pending },
};

const VERIFACTU_DEFAULT = { key: 'sifDataTabs.status.verifactu.notSent', cls: PILL_CLS.neutral };

const pillCls = (size = 'md') => {
  const base = 'inline-flex items-center font-normal rounded-full';
  return size === 'sm'
    ? `${base} text-[11px] px-2 py-0.5`
    : `${base} text-xs px-2 py-1`;
};

function SiiStatusBadge({ estado, ui, size = 'md' }) {
  const current = SII_STATUS[estado] ?? SII_DEFAULT;
  return (
    <span className={`${pillCls(size)} ${current.cls}`}>{ui(current.key)}</span>
  );
}

function TbaiBadge({ issent, ui, size = 'md' }) {
  const sent = issent === true || issent === 'Y';
  return (
    <span className={`${pillCls(size)} ${sent ? PILL_CLS.success : PILL_CLS.neutral}`}>
      {ui(sent ? 'sifDataTabs.status.tbai.sent' : 'sifDataTabs.status.tbai.notSent')}
    </span>
  );
}

function VerifactuBadge({ status, sent, ui, size = 'md' }) {
  const normalized = status || (sent === true || sent === 'Y' ? 'AC' : null);
  const current = VERIFACTU_STATUS[normalized] ?? VERIFACTU_DEFAULT;
  return (
    <span className={`${pillCls(size)} ${current.cls}`}>{ui(current.key)}</span>
  );
}

const RAIL_META = {
  sii: { labelKey: 'sifDataTabs.tab.sii', subtitleKey: 'sifDataTabs.rail.sii.subtitle' },
  tbai: { labelKey: 'sifDataTabs.tab.tbai', subtitleKey: 'sifDataTabs.rail.tbai.subtitle' },
  verifactu: { labelKey: 'sifDataTabs.tab.verifactu', subtitleKey: 'sifDataTabs.rail.verifactu.subtitle' },
};

const PANEL_META = {
  sii: { titleKey: 'sifDataTabs.panel.sii.title', subtitleKey: 'sifDataTabs.panel.sii.subtitle' },
  tbai: { titleKey: 'sifDataTabs.panel.tbai.title', subtitleKey: 'sifDataTabs.panel.tbai.subtitle' },
  verifactu: { titleKey: 'sifDataTabs.panel.verifactu.title', subtitleKey: 'sifDataTabs.panel.verifactu.subtitle' },
};

function resolveDefaultTab(showSii, showTbai) {
  if (showSii) return 'sii';
  if (showTbai) return 'tbai';
  return 'verifactu';
}

function resolveEffectiveTab(activeTab, showSii, showTbai, showVerifactu, defaultTab) {
  if (activeTab === 'sii' && showSii) return 'sii';
  if (activeTab === 'tbai' && showTbai) return 'tbai';
  if (activeTab === 'verifactu' && showVerifactu) return 'verifactu';
  return defaultTab;
}

function PanelHeader({ titleKey, subtitleKey, badge, ui }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border/40">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{ui(titleKey)}</span>
        <span className="text-xs text-muted-foreground">{ui(subtitleKey)}</span>
      </div>
      {badge}
    </div>
  );
}

function Panel({ titleKey, subtitleKey, badge, ui, children }) {
  return (
    <>
      <PanelHeader
        titleKey={titleKey}
        subtitleKey={subtitleKey}
        badge={badge}
        ui={ui}
        data-testid="PanelHeader__b99c8b" />
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 p-4 overflow-y-auto">{children}</div>
    </>
  );
}

function ReadOnlyField({ id, labelKey, value, ui }) {
  return (
    <Field label={ui(labelKey)} htmlFor={id} data-testid="Field__b99c8b">
      <ReadOnlyValue id={id} value={value} data-testid="ReadOnlyValue__b99c8b" />
    </Field>
  );
}

export default function SifTab({ recordId, data, token, apiBaseUrl }) {
  const {
    ui,
    siiTypeField,
    siiDescriptionMasterIdentifier,
    siiTypeOptions,
    showSii,
    showTbai,
    showVerifactu,
    dateReadOnly,
    siiFieldReadOnly,
    savingField,
    getVal,
    getDateVal,
    setVal,
    patchField,
    handleBlur,
    handleCheckboxChange,
  } = useSifFieldPatcher({ data, recordId, token, apiBaseUrl });

  const defaultTab = resolveDefaultTab(showSii, showTbai);
  const [activeTab, setActiveTab] = useState(defaultTab);

  if (!showSii && !showTbai && !showVerifactu) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-8">
        {ui('sifDataTabs.sectionTitle')}
      </div>
    );
  }

  const effectiveTab = resolveEffectiveTab(activeTab, showSii, showTbai, showVerifactu, defaultTab);

  const railItems = [
    showSii && { key: 'sii', ...RAIL_META.sii },
    showTbai && { key: 'tbai', ...RAIL_META.tbai },
    showVerifactu && { key: 'verifactu', ...RAIL_META.verifactu },
  ].filter(Boolean);

  return (
    <div className="flex gap-2 p-2 h-full min-h-0">
      <div className="w-56 shrink-0 flex flex-col gap-1 border border-border/40 rounded-lg bg-white p-2">
        {railItems.map(item => {
          const active = effectiveTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-md cursor-pointer text-left transition-colors ${
                active ? 'bg-gray-50 border-l-2 border-primary' : 'hover:bg-gray-50/60'
              }`}
            >
              <span className={`text-xs font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                {ui(item.labelKey)}
              </span>
              <span className="text-[11px] text-muted-foreground leading-tight">
                {ui(item.subtitleKey)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex-1 border border-border/40 rounded-lg bg-white overflow-hidden flex flex-col min-h-0">
        {effectiveTab === 'sii' && showSii && (
          <Panel
            titleKey={PANEL_META.sii.titleKey}
            subtitleKey={PANEL_META.sii.subtitleKey}
            badge={<SiiStatusBadge estado={data?.aeatsiiEstado} ui={ui} data-testid="SiiStatusBadge__b99c8b" />}
            ui={ui}
            data-testid="Panel__b99c8b">
            <Field
              label={ui('sifDataTabs.field.operationDate')}
              htmlFor="sif-etsgDateOperation"
              data-testid="Field__b99c8b">
              <DateField
                id="sif-etsgDateOperation"
                value={getDateVal('etsgDateOperation')}
                onChange={iso => setVal('etsgDateOperation', iso)}
                onBlur={() => handleBlur('etsgDateOperation', getDateVal('etsgDateOperation'))}
                disabled={dateReadOnly || savingField === 'etsgDateOperation'}
                data-testid="DateField__b99c8b" />
            </Field>
            <Field
              label={ui('sifDataTabs.field.invoiceType')}
              htmlFor="sif-siiType"
              data-testid="Field__b99c8b">
              <Select
                value={getVal(siiTypeField) || undefined}
                onValueChange={val => {
                  setVal(siiTypeField, val);
                  patchField(siiTypeField, val);
                }}
                disabled={siiFieldReadOnly || savingField === siiTypeField}
                data-testid="Select__b99c8b">
                <SelectTrigger id="sif-siiType" data-testid="SelectTrigger__b99c8b">
                  <SelectValue placeholder="—" data-testid="SelectValue__b99c8b" />
                </SelectTrigger>
                <SelectContent data-testid="SelectContent__b99c8b">
                  {siiTypeOptions.map(o => (
                    <SelectItem key={o.value} value={o.value} data-testid="SelectItem__b99c8b">{o.value} — {ui(o.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <ReadOnlyField
              id="sif-masterDesc"
              labelKey="sifDataTabs.field.masterDescription"
              value={siiDescriptionMasterIdentifier}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <Field
              label={ui('sifDataTabs.field.siiDescription')}
              htmlFor="sif-siiDesc"
              data-testid="Field__b99c8b">
              <Input
                id="sif-siiDesc"
                type="text"
                value={getVal('aeatsiiDescripcionSii')}
                onChange={e => setVal('aeatsiiDescripcionSii', e.target.value)}
                onBlur={e => handleBlur('aeatsiiDescripcionSii', e.target.value)}
                disabled={siiFieldReadOnly || savingField === 'aeatsiiDescripcionSii'}
                data-testid="Input__b99c8b" />
            </Field>
            <ReadOnlyField
              id="sif-exemption"
              labelKey="sifDataTabs.field.exemptionCause"
              value={data?.['aeatsiiCauseExemption$_identifier']}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <Field
              label={ui('sifDataTabs.field.authorization')}
              htmlFor="sif-auth"
              data-testid="Field__b99c8b">
              <CheckboxField
                id="sif-auth"
                checked={Boolean(getVal('aeatsiiIsauthorization'))}
                disabled={siiFieldReadOnly || savingField === 'aeatsiiIsauthorization'}
                onToggle={val => handleCheckboxChange('aeatsiiIsauthorization', val)}
                data-testid="CheckboxField__b99c8b" />
            </Field>
            <ReadOnlyField
              id="sif-siiYear"
              labelKey="sifDataTabs.field.siiYear"
              value={data?.aeatsiiEjercicio}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <ReadOnlyField
              id="sif-siiPeriod"
              labelKey="sifDataTabs.field.siiPeriod"
              value={data?.aeatsiiPeriodo}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
          </Panel>
        )}

        {effectiveTab === 'tbai' && showTbai && (
          <Panel
            titleKey={PANEL_META.tbai.titleKey}
            subtitleKey={PANEL_META.tbai.subtitleKey}
            badge={<TbaiBadge issent={data?.tbaiIssent} ui={ui} data-testid="TbaiBadge__b99c8b" />}
            ui={ui}
            data-testid="Panel__b99c8b">
            <ReadOnlyField
              id="sif-tbaiSeq"
              labelKey="sifDataTabs.field.chainSequence"
              value={data?.tbaiSequence}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <ReadOnlyField
              id="sif-tbaiSerie"
              labelKey="sifDataTabs.field.invoiceSeries"
              value={data?.tbaiInvoicenum}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <ReadOnlyField
              id="sif-tbaiInvSeq"
              labelKey="sifDataTabs.field.invoiceSequence"
              value={data?.tbaiInvoiceseq}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
          </Panel>
        )}

        {effectiveTab === 'verifactu' && showVerifactu && (
          <Panel
            titleKey={PANEL_META.verifactu.titleKey}
            subtitleKey={PANEL_META.verifactu.subtitleKey}
            badge={<VerifactuBadge
              status={data?.etvfacInvoiceStatus}
              sent={data?.etvfacSentToVerifac}
              ui={ui}
              data-testid="VerifactuBadge__b99c8b" />}
            ui={ui}
            data-testid="Panel__b99c8b">
            <ReadOnlyField
              id="sif-vfDate"
              labelKey="sifDataTabs.field.rfGenerationDate"
              value={data?.etvfacDateIssue}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <ReadOnlyField
              id="sif-vfCsv"
              labelKey="sifDataTabs.field.csv"
              value={data?.cdigoCSV}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <ReadOnlyField
              id="sif-vfHash"
              labelKey="sifDataTabs.field.hash"
              value={data?.etvfacHash}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <ReadOnlyField
              id="sif-vfQr"
              labelKey="sifDataTabs.field.qrUrl"
              value={data?.etvfacQRURL}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <ReadOnlyField
              id="sif-vfIssue"
              labelKey="sifDataTabs.field.issueDetail"
              value={data?.etvfacIssueDescription}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
          </Panel>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useSifFieldPatcher } from '@/windows/custom/shared/useSifFieldPatcher.js';

const inputCls = 'w-full text-xs bg-white border rounded px-2 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50 border-border/40';

const SII_STATUS = {
  CO: { key: 'sifDataTabs.status.sii.correct', cls: 'bg-green-50 text-green-700 border-green-200' },
  AE: { key: 'sifDataTabs.status.sii.acceptedWithErrors', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  IN: { key: 'sifDataTabs.status.sii.incorrect', cls: 'bg-red-50 text-red-700 border-red-200' },
  EE: { key: 'sifDataTabs.status.sii.sendError', cls: 'bg-red-50 text-red-700 border-red-200' },
  PE: { key: 'sifDataTabs.status.sii.pending', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  AN: { key: 'sifDataTabs.status.sii.cancelled', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  BA: { key: 'sifDataTabs.status.sii.dropped', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  NR: { key: 'sifDataTabs.status.sii.notRegistrable', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
};

const VERIFACTU_STATUS = {
  AC: { key: 'sifDataTabs.status.verifactu.accepted', cls: 'bg-green-50 text-green-700 border-green-200' },
  AE: { key: 'sifDataTabs.status.verifactu.acceptedWithErrors', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  IN: { key: 'sifDataTabs.status.verifactu.invalid', cls: 'bg-red-50 text-red-700 border-red-200' },
  ER: { key: 'sifDataTabs.status.verifactu.rejected', cls: 'bg-red-50 text-red-700 border-red-200' },
  PE: { key: 'sifDataTabs.status.verifactu.pending', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
};

function FieldRow({ label, children }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-[11px] text-muted-foreground shrink-0 w-28 pt-0.5 leading-tight">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function ReadValue({ value }) {
  return (
    <span className="text-xs text-foreground">
      {value ?? <span className="text-muted-foreground/40">-</span>}
    </span>
  );
}

function SiiStatusBadge({ estado, ui }) {
  const current = SII_STATUS[estado] ?? {
    key: 'sifDataTabs.status.sii.notSent',
    cls: 'bg-gray-50 text-gray-400 border-gray-200',
  };

  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded border ${current.cls}`}>
      {ui(current.key)}
    </span>
  );
}

function TbaiBadge({ issent, ui }) {
  const sent = issent === true || issent === 'Y';
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded border ${
      sent ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200'
    }`}>
      {ui(sent ? 'sifDataTabs.status.tbai.sent' : 'sifDataTabs.status.tbai.notSent')}
    </span>
  );
}

function VerifactuBadge({ status, sent, ui }) {
  const normalized = status || (sent === true || sent === 'Y' ? 'AC' : null);
  const current = VERIFACTU_STATUS[normalized] ?? {
    key: 'sifDataTabs.status.verifactu.notSent',
    cls: 'bg-gray-50 text-gray-400 border-gray-200',
  };

  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded border ${current.cls}`}>
      {ui(current.key)}
    </span>
  );
}

export default function SifDataTabs({ data, recordId, apiBaseUrl }) {
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
    handleBlur,
    handleCheckboxChange,
  } = useSifFieldPatcher({ data, recordId, apiBaseUrl });

  const [activeTab, setActiveTab] = useState('sii');

  if (!showSii && !showTbai && !showVerifactu) return null;

  let effectiveTab = activeTab;
  if (!showSii) {
    effectiveTab = showTbai ? 'tbai' : 'verifactu';
  }

  return (
    <div className="flex items-start gap-3 px-3 pt-3 pb-3 border-t border-border/40" style={{ borderTopWidth: '0.5px' }}>
      <div className="shrink-0 w-24">
        <span className="text-[11px] font-medium text-foreground uppercase block mb-1.5" style={{ letterSpacing: '0.04em' }}>
          {ui('sifDataTabs.sectionTitle')}
        </span>
        <div className="flex flex-col gap-0.5">
          {showSii && (
            <button
              type="button"
              onClick={() => setActiveTab('sii')}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded text-left transition-colors ${
                effectiveTab === 'sii'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {ui('sifDataTabs.tab.sii')}
            </button>
          )}
          {showTbai && (
            <button
              type="button"
              onClick={() => setActiveTab('tbai')}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded text-left transition-colors ${
                effectiveTab === 'tbai'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {ui('sifDataTabs.tab.tbai')}
            </button>
          )}
          {showVerifactu && (
            <button
              type="button"
              onClick={() => setActiveTab('verifactu')}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded text-left transition-colors ${
                effectiveTab === 'verifactu'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {ui('sifDataTabs.tab.verifactu')}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {effectiveTab === 'sii' && showSii && (
          <div className="flex flex-col gap-1.5">
            <div className="mb-0.5">
              <SiiStatusBadge estado={data?.aeatsiiEstado} ui={ui} data-testid="SiiStatusBadge__6cf222" />
            </div>
            <FieldRow
              label={ui('sifDataTabs.field.operationDate')}
              data-testid="FieldRow__6cf222">
              <input
                type="date"
                className={inputCls}
                style={{ borderWidth: '0.5px' }}
                value={getDateVal('etsgDateOperation')}
                onChange={e => setVal('etsgDateOperation', e.target.value)}
                onBlur={e => handleBlur('etsgDateOperation', e.target.value)}
                disabled={dateReadOnly || savingField === 'etsgDateOperation'}
              />
            </FieldRow>
            <FieldRow
              label={ui('sifDataTabs.field.invoiceType')}
              data-testid="FieldRow__6cf222">
              <select
                className={inputCls}
                style={{ borderWidth: '0.5px' }}
                value={getVal(siiTypeField)}
                onChange={e => setVal(siiTypeField, e.target.value)}
                onBlur={e => handleBlur(siiTypeField, e.target.value)}
                disabled={siiFieldReadOnly || savingField === siiTypeField}
              >
                <option value="">-</option>
                {siiTypeOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.value} - {ui(o.labelKey)}</option>
                ))}
              </select>
            </FieldRow>
            <FieldRow
              label={ui('sifDataTabs.field.masterDescription')}
              data-testid="FieldRow__6cf222">
              <ReadValue value={siiDescriptionMasterIdentifier} data-testid="ReadValue__6cf222" />
            </FieldRow>
            <FieldRow
              label={ui('sifDataTabs.field.siiDescription')}
              data-testid="FieldRow__6cf222">
              <input
                type="text"
                className={inputCls}
                style={{ borderWidth: '0.5px' }}
                value={getVal('aeatsiiDescripcionSii')}
                onChange={e => setVal('aeatsiiDescripcionSii', e.target.value)}
                onBlur={e => handleBlur('aeatsiiDescripcionSii', e.target.value)}
                disabled={siiFieldReadOnly || savingField === 'aeatsiiDescripcionSii'}
              />
            </FieldRow>
            <FieldRow
              label={ui('sifDataTabs.field.exemptionCause')}
              data-testid="FieldRow__6cf222">
              <ReadValue
                value={data?.['aeatsiiCauseExemption$_identifier']}
                data-testid="ReadValue__6cf222" />
            </FieldRow>
            <FieldRow
              label={ui('sifDataTabs.field.authorization')}
              data-testid="FieldRow__6cf222">
              <input
                type="checkbox"
                checked={Boolean(getVal('aeatsiiIsauthorization'))}
                onChange={e => !siiFieldReadOnly && handleCheckboxChange('aeatsiiIsauthorization', e.target.checked)}
                disabled={siiFieldReadOnly || savingField === 'aeatsiiIsauthorization'}
                className={`mt-0.5 ${siiFieldReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
              />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.siiYear')} data-testid="FieldRow__6cf222">
              <ReadValue value={data?.aeatsiiEjercicio} data-testid="ReadValue__6cf222" />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.siiPeriod')} data-testid="FieldRow__6cf222">
              <ReadValue value={data?.aeatsiiPeriodo} data-testid="ReadValue__6cf222" />
            </FieldRow>
          </div>
        )}

        {effectiveTab === 'tbai' && showTbai && (
          <div className="flex flex-col gap-1.5">
            <div className="mb-0.5">
              <TbaiBadge issent={data?.tbaiIssent} ui={ui} data-testid="TbaiBadge__6cf222" />
            </div>
            <FieldRow
              label={ui('sifDataTabs.field.chainSequence')}
              data-testid="FieldRow__6cf222">
              <ReadValue value={data?.tbaiSequence} data-testid="ReadValue__6cf222" />
            </FieldRow>
            <FieldRow
              label={ui('sifDataTabs.field.invoiceSeries')}
              data-testid="FieldRow__6cf222">
              <ReadValue value={data?.tbaiInvoicenum} data-testid="ReadValue__6cf222" />
            </FieldRow>
            <FieldRow
              label={ui('sifDataTabs.field.invoiceSequence')}
              data-testid="FieldRow__6cf222">
              <ReadValue value={data?.tbaiInvoiceseq} data-testid="ReadValue__6cf222" />
            </FieldRow>
          </div>
        )}

        {effectiveTab === 'verifactu' && showVerifactu && (
          <div className="flex flex-col gap-1.5">
            <div className="mb-0.5">
              <VerifactuBadge
                status={data?.etvfacInvoiceStatus}
                sent={data?.etvfacSentToVerifac}
                ui={ui}
                data-testid="VerifactuBadge__6cf222" />
            </div>
            <FieldRow
              label={ui('sifDataTabs.field.rfGenerationDate')}
              data-testid="FieldRow__6cf222">
              <ReadValue value={data?.etvfacDateIssue} data-testid="ReadValue__6cf222" />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.csv')} data-testid="FieldRow__6cf222">
              <ReadValue value={data?.cdigoCSV} data-testid="ReadValue__6cf222" />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.hash')} data-testid="FieldRow__6cf222">
              <ReadValue value={data?.etvfacHash} data-testid="ReadValue__6cf222" />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.qrUrl')} data-testid="FieldRow__6cf222">
              <ReadValue value={data?.etvfacQRURL} data-testid="ReadValue__6cf222" />
            </FieldRow>
            <FieldRow
              label={ui('sifDataTabs.field.issueDetail')}
              data-testid="FieldRow__6cf222">
              <ReadValue value={data?.etvfacIssueDescription} data-testid="ReadValue__6cf222" />
            </FieldRow>
          </div>
        )}
      </div>
    </div>
  );
}

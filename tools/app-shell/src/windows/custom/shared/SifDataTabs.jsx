import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { normalizeDateInputValue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';
import { useAuth } from '@/auth/AuthContext';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';

const CLAVE_TIPO_OPTIONS = [
  { value: 'F1', labelKey: 'sifDataTabs.option.invoice' },
  { value: 'F2', labelKey: 'sifDataTabs.option.simplifiedInvoice' },
  { value: 'F4', labelKey: 'sifDataTabs.option.simplifiedInvoiceSummary' },
  { value: 'R', labelKey: 'sifDataTabs.option.correctiveInvoice' },
];

const PURCHASE_CLAVE_TIPO_FC_OPTIONS = [
  { value: 'F6', labelKey: 'sifDataTabs.option.accountingDocument' },
  { value: 'LC', labelKey: 'sifDataTabs.option.customsComplementarySettlement' },
  { value: 'F5', labelKey: 'sifDataTabs.option.importDua' },
  { value: 'F1', labelKey: 'sifDataTabs.option.invoice' },
];

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

export default function SifDataTabs({ data, recordId, token, apiBaseUrl }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const specName = apiBaseUrl?.split('/').filter(Boolean).pop() || 'sales-invoice';
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const { profile } = useFiscalConfig(orgId, token, apiBaseUrl);
  const { showSii, showTbai, showVerifactu } = getInvoiceFiscalTargets(specName, profile);
  const isPurchaseInvoice = specName === 'purchase-invoice';
  const siiTypeField = isPurchaseInvoice ? 'aeatsiiClaveTipoFc' : 'aeatsiiClaveTipo';
  const siiDescriptionMasterIdentifier = isPurchaseInvoice
    ? data?.['aeatsiiPurDescription$_identifier']
    : data?.['aeatsiiDescription$_identifier'];
  const siiTypeOptions = isPurchaseInvoice ? PURCHASE_CLAVE_TIPO_FC_OPTIONS : CLAVE_TIPO_OPTIONS;

  const isDraft = data?.documentStatus === 'DR';
  const isSentToSii = data?.aeatsiiIssent === true || data?.aeatsiiIssent === 'Y';
  const dateReadOnly = !isDraft;
  const siiFieldReadOnly = isSentToSii;

  const [activeTab, setActiveTab] = useState('sii');
  const [siiForm, setSiiForm] = useState({});
  const [savingField, setSavingField] = useState(null);

  if (!showSii && !showTbai && !showVerifactu) return null;

  let effectiveTab = activeTab;
  if (!showSii) {
    effectiveTab = showTbai ? 'tbai' : 'verifactu';
  }

  function getVal(key) {
    return key in siiForm ? siiForm[key] : (data?.[key] ?? '');
  }

  function getDateVal(key) {
    return key in siiForm ? siiForm[key] : normalizeDateInputValue(data?.[key] ?? '');
  }

  function setVal(key, value) {
    setSiiForm(prev => ({ ...prev, [key]: value }));
  }

  async function patchField(fieldKey, value) {
    setSavingField(fieldKey);
    try {
      const res = await fetch(`${base}/${specName}/header/${recordId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ [fieldKey]: value }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.response?.message || json?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      toast.error(err.message || ui('sifDataTabs.errorSavingField'));
      setSiiForm(prev => ({ ...prev, [fieldKey]: data?.[fieldKey] ?? '' }));
    } finally {
      setSavingField(null);
    }
  }

  function handleBlur(fieldKey, value) {
    if (String(value) === String(data?.[fieldKey] ?? '')) return;
    patchField(fieldKey, value);
  }

  function handleCheckboxChange(fieldKey, checked) {
    setVal(fieldKey, checked);
    patchField(fieldKey, checked);
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
              <SiiStatusBadge estado={data?.aeatsiiEstado} ui={ui} />
            </div>
            <FieldRow label={ui('sifDataTabs.field.operationDate')}>
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
            <FieldRow label={ui('sifDataTabs.field.invoiceType')}>
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
            <FieldRow label={ui('sifDataTabs.field.masterDescription')}>
              <ReadValue value={siiDescriptionMasterIdentifier} />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.siiDescription')}>
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
            <FieldRow label={ui('sifDataTabs.field.exemptionCause')}>
              <ReadValue value={data?.['aeatsiiCauseExemption$_identifier']} />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.authorization')}>
              <input
                type="checkbox"
                checked={Boolean(getVal('aeatsiiIsauthorization'))}
                onChange={e => !siiFieldReadOnly && handleCheckboxChange('aeatsiiIsauthorization', e.target.checked)}
                disabled={siiFieldReadOnly || savingField === 'aeatsiiIsauthorization'}
                className={`mt-0.5 ${siiFieldReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
              />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.siiYear')}>
              <ReadValue value={data?.aeatsiiEjercicio} />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.siiPeriod')}>
              <ReadValue value={data?.aeatsiiPeriodo} />
            </FieldRow>
          </div>
        )}

        {effectiveTab === 'tbai' && showTbai && (
          <div className="flex flex-col gap-1.5">
            <div className="mb-0.5">
              <TbaiBadge issent={data?.tbaiIssent} ui={ui} />
            </div>
            <FieldRow label={ui('sifDataTabs.field.chainSequence')}>
              <ReadValue value={data?.tbaiSequence} />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.invoiceSeries')}>
              <ReadValue value={data?.tbaiInvoicenum} />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.invoiceSequence')}>
              <ReadValue value={data?.tbaiInvoiceseq} />
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
              />
            </div>
            <FieldRow label={ui('sifDataTabs.field.rfGenerationDate')}>
              <ReadValue value={data?.etvfacDateIssue} />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.csv')}>
              <ReadValue value={data?.cdigoCSV} />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.hash')}>
              <ReadValue value={data?.etvfacHash} />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.qrUrl')}>
              <ReadValue value={data?.etvfacQRURL} />
            </FieldRow>
            <FieldRow label={ui('sifDataTabs.field.issueDetail')}>
              <ReadValue value={data?.etvfacIssueDescription} />
            </FieldRow>
          </div>
        )}
      </div>
    </div>
  );
}

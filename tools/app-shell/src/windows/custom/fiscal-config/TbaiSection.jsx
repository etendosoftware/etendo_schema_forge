import { useState, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useUI } from '@/i18n';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import CertSection from './CertSection.jsx';
import SectionSaveButton from './SectionSaveButton.jsx';
import {
  getFiscalRecordId,
  isEtendoTrue,
  normalizeDateInputValue,
  normalizeEtendoBoolean,
  serializeBooleanFields,
} from './fiscalConfig.utils.js';

// Confirmed from artifacts/tbai-config/contract.json → backendContract.window.primaryEntity
const TBAI_ENTITY = 'header';

const TERRITORY_NAMES = { ARABA: 'Álava', BIZKAIA: 'Bizkaia', GIPUZKOA: 'Gipuzkoa' };
function formatTerritory(raw) {
  const key = (raw ?? '').toUpperCase();
  if (TERRITORY_NAMES[key]) return TERRITORY_NAMES[key];
  const s = raw ?? '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Two-column section row wrapper
function SectionRow({ label, children, labelExtra, boldLabel, noBorderTop }) {
  return (
    <div className={`flex items-start py-6 gap-6 ${noBorderTop ? '' : 'border-t border-[#E8EAEF]'}`}>
      <div className="w-[160px] flex-shrink-0">
        <span className={`text-sm text-[#121217] ${boldLabel ? 'font-semibold' : 'font-medium'}`}>{label}</span>
        {labelExtra && <div className="mt-0.5">{labelExtra}</div>}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const TbaiSection = forwardRef(function TbaiSection({ record, apiBaseUrl, orgId, onSave, hideSave, hideCert }, ref) {
  const ui = useUI();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [form, setForm] = useState({
    tbaisystemdate:          normalizeDateInputValue(record?.tbaisystemdate),
    productionEnv:           normalizeEtendoBoolean(record?.productionEnv),
    invoiceDescription:      record?.invoiceDescription     ?? '',
    uSEAsproductDesc:        normalizeEtendoBoolean(record?.uSEAsproductDesc),
    autoSendInvoices:        normalizeEtendoBoolean(record?.autoSendInvoices),
    jasperreportPath:        record?.jasperreportPath       ?? '',
    validatePreviousInvoice: normalizeEtendoBoolean(record?.validatePreviousInvoice),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function validate() {
    if (!form.tbaisystemdate) return ui('fiscal.tbai.err.enrollDate');
    if (!form.invoiceDescription) return ui('fiscal.tbai.err.invoiceDesc');
    return null;
  }

  async function save() {
    const validationError = validate();
    if (validationError) { setError(validationError); throw new Error(validationError); }
    const recordId = getFiscalRecordId(record, 'TBAI');
    if (!recordId) {
      const idError = ui('fiscal.tbai.err.noRecordId');
      setError(idError);
      throw new Error(idError);
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/tbai-config/${TBAI_ENTITY}/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializeBooleanFields(form, ['productionEnv', 'uSEAsproductDesc', 'autoSendInvoices', 'validatePreviousInvoice'])),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
      onSave();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ save }));

  return (
    <div>
      {record?.etsgSifTerritory && (
        <SectionRow
          label={ui('fiscal.tbai.territory.label')}
          noBorderTop
          data-testid="SectionRow__f06d4b">
          <Badge variant="secondary" data-testid="Badge__f06d4b">{formatTerritory(record.etsgSifTerritory)}</Badge>
        </SectionRow>
      )}
      {/* Fecha acogida TBAI — top-level, no section name */}
      <div className={`flex items-start py-6 gap-6 ${record?.etsgSifTerritory ? 'border-t border-[#E8EAEF]' : ''}`}>
        <div className="w-[160px] flex-shrink-0">
          <span className="text-sm font-medium text-[#121217]">{ui('fiscal.tbai.field.enrollDate')}</span>
        </div>
        <div className="flex-1 min-w-0">
          <DateField
            value={form.tbaisystemdate}
            onChange={(iso) => set('tbaisystemdate', iso)}
            className="max-w-[376px]"
            data-testid="DateField__f06d4b" />
        </div>
      </div>
      {/* Entorno producción — top-level */}
      <div className="flex items-start py-6 gap-6 border-t border-[#E8EAEF]">
        <div className="w-[160px] flex-shrink-0">
          <span className="text-sm font-medium text-[#121217]">{ui('fiscal.tbai.field.production')}</span>
        </div>
        <div className="flex-1 min-w-0">
          <Switch
            checked={isEtendoTrue(form.productionEnv)}
            onCheckedChange={v => set('productionEnv', v ? 'Y' : 'N')}
            data-testid="Switch__f06d4b" />
        </div>
      </div>
      {/* Facturación */}
      <SectionRow label={ui('fiscal.tbai.legend.billing')} data-testid="SectionRow__f06d4b">
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex items-center gap-2 pt-1 w-[376px]">
            <Switch
              checked={isEtendoTrue(form.uSEAsproductDesc)}
              onCheckedChange={v => set('uSEAsproductDesc', v ? 'Y' : 'N')}
              data-testid="Switch__f06d4b" />
            <span className="text-sm text-[#121217]">{ui('fiscal.tbai.field.useAsProduct')}</span>
          </div>
          <div className="flex items-center gap-2 pt-1 w-[376px]">
            <Switch
              checked={isEtendoTrue(form.autoSendInvoices)}
              onCheckedChange={v => set('autoSendInvoices', v ? 'Y' : 'N')}
              data-testid="Switch__f06d4b" />
            <span className="text-sm text-[#121217]">{ui('fiscal.tbai.field.autoSend')}</span>
          </div>
          <div className="space-y-1 w-[376px]">
            <Label data-testid="Label__f06d4b">{ui('fiscal.tbai.field.invoiceDesc')}</Label>
            <Input
              value={form.invoiceDescription}
              onChange={e => set('invoiceDescription', e.target.value)}
              className="bg-white"
              data-testid="Input__f06d4b" />
          </div>
        </div>
      </SectionRow>
      {/* Técnico */}
      <SectionRow
        label={ui('fiscal.tbai.legend.technical')}
        data-testid="SectionRow__f06d4b">
        <div className="flex items-center gap-2">
          <Switch
            checked={isEtendoTrue(form.validatePreviousInvoice)}
            onCheckedChange={v => set('validatePreviousInvoice', v ? 'Y' : 'N')}
            data-testid="Switch__f06d4b" />
          <span className="text-sm text-[#121217]">{ui('fiscal.tbai.field.validatePrev')}</span>
        </div>
      </SectionRow>
      {/* Certificado digital */}
      {!hideCert && (
        <SectionRow
          label={ui('fiscal.cert.section.legend')}
          boldLabel
          labelExtra={<span className="text-xs text-[#121217] leading-tight">{ui('fiscal.cert.section.hint')}</span>}
          data-testid="SectionRow__f06d4b">
          <CertSection
            context="tbai"
            orgId={orgId}
            apiBaseUrl={apiBaseUrl}
            data-testid="CertSection__f06d4b" />
        </SectionRow>
      )}
      <SectionSaveButton
        error={error}
        hideSave={hideSave}
        save={save}
        saving={saving}
        ui={ui}
        data-testid="SectionSaveButton__f06d4b" />
    </div>
  );
});

export default TbaiSection;

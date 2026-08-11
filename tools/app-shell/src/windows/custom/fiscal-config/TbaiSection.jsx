import { useState, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
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

const TERRITORY_NAMES = { ARABA: 'Álava', BIZKAIA: 'Vizcaya', GIPUZKOA: 'Guipúzcoa' };
function formatTerritory(raw) {
  const key = (raw ?? '').toUpperCase();
  if (TERRITORY_NAMES[key]) return TERRITORY_NAMES[key];
  const s = raw ?? '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Two-column section row wrapper
function SectionRow({ label, children, labelExtra, boldLabel, noBorderTop }) {
  return (
    <div className={`flex items-start py-6 gap-6 ${noBorderTop ? '' : 'border-t border-[hsl(var(--border-subtle))]'}`}>
      <div className="w-[160px] flex-shrink-0">
        <span className={`text-sm text-[hsl(var(--foreground))] ${boldLabel ? 'font-semibold' : 'font-medium'}`}>{label}</span>
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
    invoiceDescription: record?.invoiceDescription ?? '',
    uSEAsproductDesc:   normalizeEtendoBoolean(record?.uSEAsproductDesc),
    autoSendInvoices:   normalizeEtendoBoolean(record?.autoSendInvoices),
    jasperreportPath:   record?.jasperreportPath  ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function validate() {
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
        body: JSON.stringify(serializeBooleanFields({
          ...form,
          tbaisystemdate:          normalizeDateInputValue(record?.tbaisystemdate) || new Date().toISOString().slice(0, 10),
          productionEnv:           'Y',
          validatePreviousInvoice: 'N',
        }, ['productionEnv', 'uSEAsproductDesc', 'autoSendInvoices', 'validatePreviousInvoice'])),
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
      {/* Facturación */}
      <SectionRow label={ui('fiscal.tbai.legend.billing')} data-testid="SectionRow__f06d4b">
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex items-center gap-2 pt-1 w-[376px]">
            <Switch
              checked={isEtendoTrue(form.uSEAsproductDesc)}
              onCheckedChange={v => set('uSEAsproductDesc', v ? 'Y' : 'N')}
              data-testid="Switch__f06d4b" />
            <span className="text-sm text-[hsl(var(--foreground))]">{ui('fiscal.tbai.field.useAsProduct')}</span>
          </div>
          <div className="flex items-center gap-2 pt-1 w-[376px]">
            <Switch
              checked={isEtendoTrue(form.autoSendInvoices)}
              onCheckedChange={v => set('autoSendInvoices', v ? 'Y' : 'N')}
              data-testid="Switch__f06d4b" />
            <span className="text-sm text-[hsl(var(--foreground))]">{ui('fiscal.tbai.field.autoSend')}</span>
          </div>
          <div className="space-y-1 w-[376px]">
            <Label data-testid="Label__f06d4b">{ui('fiscal.tbai.field.invoiceDesc')}</Label>
            <Input
              value={form.invoiceDescription}
              onChange={e => set('invoiceDescription', e.target.value)}
              className="bg-card"
              data-testid="Input__f06d4b" />
          </div>
        </div>
      </SectionRow>
      {/* Certificado digital */}
      {!hideCert && (
        <SectionRow
          label={ui('fiscal.cert.section.legend')}
          boldLabel
          labelExtra={<span className="text-xs text-[hsl(var(--foreground))] leading-tight">{ui('fiscal.cert.section.hint')}</span>}
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

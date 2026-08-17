import { useState, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useUI } from '@/i18n';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import CertSection from './CertSection.jsx';
import SectionSaveButton from './SectionSaveButton.jsx';
import { getFiscalRecordId, isEtendoTrue, mapSiiRecordToForm, normalizeDateInputValue, parseApiError, serializeBooleanFields } from './fiscalConfig.utils.js';

const SII_ENTITY = 'siiConfiguration';

// Two-column section row wrapper
function SectionRow({ label, children, labelExtra, noBorderTop, boldLabel }) {
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

const SiiSection = forwardRef(function SiiSection({ record, apiBaseUrl, orgId, onSave, variant, hideSave, hideCert }, ref) {
  const ui = useUI();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [form, setForm] = useState(mapSiiRecordToForm(record));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function validate() {
    return null;
  }

  async function save() {
    const validationError = validate();
    if (validationError) { setError(validationError); throw new Error(validationError); }
    const recordId = getFiscalRecordId(record, 'SII');
    if (!recordId) {
      const idError = ui('fiscal.sii.err.noRecordId');
      setError(idError);
      throw new Error(idError);
    }
    setSaving(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await apiFetch(`/sii-config/${SII_ENTITY}/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializeBooleanFields({
          ...form,
          acogidaAlSII:      'Y',
          entornoDeProduccin: 'Y',
          adjuntarArchivosXML: 'Y',
          fechaAcogidaSII:   normalizeDateInputValue(record?.fechaAcogidaSII) || today,
          monitordate:       normalizeDateInputValue(record?.monitordate) || today,
        }, ['acogidaAlSII', 'entornoDeProduccin', 'adjuntarArchivosXML', 'recc', 'redeme'])),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      onSave();
    } catch (err) {
      setError(err.message);
      err._sectionHandled = true;
      throw err;
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ save }));

  return (
    <div>
      {/* Régimen especial */}
      <SectionRow label={ui('fiscal.sii.legend.special')} data-testid="SectionRow__fcb159">
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex items-center gap-2 pt-1 w-[376px]">
            <Switch
              checked={isEtendoTrue(form.recc)}
              onCheckedChange={v => set('recc', v ? 'Y' : 'N')}
              data-testid="Switch__fcb159" />
            <span className="text-sm text-[hsl(var(--foreground))]">{ui('fiscal.sii.field.recc')}</span>
          </div>
          <div className="flex items-center gap-2 pt-1 w-[376px]">
            <Switch
              checked={isEtendoTrue(form.redeme)}
              onCheckedChange={v => set('redeme', v ? 'Y' : 'N')}
              data-testid="Switch__fcb159" />
            <span className="text-sm text-[hsl(var(--foreground))]">{ui('fiscal.sii.field.redeme')}</span>
          </div>
        </div>
      </SectionRow>
      {/* Autorizaciones especiales AEAT */}
      <SectionRow label={ui('fiscal.sii.legend.specialAuth')} data-testid="SectionRow__fcb159">
        <div className="flex flex-wrap gap-4 items-start">
          <div className="space-y-1 w-[376px]">
            <Label data-testid="Label__fcb159">{ui('fiscal.sii.field.authRegNo')}</Label>
            <Input
              value={form.authorizationno}
              onChange={e => set('authorizationno', e.target.value)}
              className="bg-card"
              data-testid="Input__fcb159" />
          </div>
        </div>
      </SectionRow>
      {/* Certificado digital — only shown when hideCert is false */}
      {!hideCert && (
        <SectionRow
          label={ui('fiscal.cert.section.legend')}
          boldLabel
          labelExtra={<span className="text-xs text-[hsl(var(--foreground))] leading-tight">{ui('fiscal.cert.section.hint')}</span>}
          data-testid="SectionRow__fcb159">
          <CertSection
            context="sii"
            orgId={orgId}
            apiBaseUrl={apiBaseUrl}
            data-testid="CertSection__fcb159" />
        </SectionRow>
      )}
      <SectionSaveButton
        error={error}
        hideSave={hideSave}
        save={save}
        saving={saving}
        ui={ui}
        data-testid="SectionSaveButton__fcb159" />
    </div>
  );
});

export default SiiSection;

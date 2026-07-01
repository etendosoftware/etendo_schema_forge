import { useState, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useUI } from '@/i18n';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import CertSection from './CertSection.jsx';
import SectionSaveButton from './SectionSaveButton.jsx';
import { getFiscalRecordId, isEtendoTrue, mapSiiRecordToForm, serializeBooleanFields } from './fiscalConfig.utils.js';

const SII_ENTITY = 'siiConfiguration';

// Two-column section row wrapper
function SectionRow({ label, children, labelExtra, noBorderTop, boldLabel }) {
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

const SiiSection = forwardRef(function SiiSection({ record, apiBaseUrl, orgId, onSave, variant, hideSave, hideCert }, ref) {
  const ui = useUI();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [form, setForm] = useState(mapSiiRecordToForm(record));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function validate() {
    if (!form.plazoLmiteDeEnvoASII) return ui('fiscal.sii.err.deadline');
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
      const res = await apiFetch(`/sii-config/${SII_ENTITY}/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializeBooleanFields(form, ['acogidaAlSII', 'entornoDeProduccin', 'adjuntarArchivosXML', 'postedInvoices', 'recc', 'redeme'])),
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
      {/* Estado */}
      <SectionRow
        label={ui('fiscal.sii.legend.status')}
        noBorderTop
        data-testid="SectionRow__fcb159">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1 w-[376px]">
              <Label data-testid="Label__fcb159">{ui('fiscal.sii.field.enrollDate')}</Label>
              <DateField
                value={form.fechaAcogidaSII}
                onChange={(iso) => set('fechaAcogidaSII', iso)}
                data-testid="DateField__fcb159" />
            </div>
            <div className="space-y-1 w-[376px]">
              <Label data-testid="Label__fcb159">{ui('fiscal.sii.field.monitorDate')}</Label>
              <DateField
                value={form.monitordate}
                onChange={(iso) => set('monitordate', iso)}
                data-testid="DateField__fcb159" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={isEtendoTrue(form.acogidaAlSII)}
              onCheckedChange={v => set('acogidaAlSII', v ? 'Y' : 'N')}
              data-testid="Switch__fcb159" />
            <span className="text-sm text-[#121217]">{ui('fiscal.sii.field.enrolled')}</span>
          </div>
        </div>
      </SectionRow>
      {/* Entorno */}
      <SectionRow label={ui('fiscal.sii.legend.env')} data-testid="SectionRow__fcb159">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2 w-[376px]">
            <Switch
              checked={isEtendoTrue(form.entornoDeProduccin)}
              onCheckedChange={v => set('entornoDeProduccin', v ? 'Y' : 'N')}
              data-testid="Switch__fcb159" />
            <span className="text-sm text-[#121217]">{ui('fiscal.sii.field.production')}</span>
          </div>
          <div className="flex items-center gap-2 w-[376px]">
            <Switch
              checked={isEtendoTrue(form.adjuntarArchivosXML)}
              onCheckedChange={v => set('adjuntarArchivosXML', v ? 'Y' : 'N')}
              data-testid="Switch__fcb159" />
            <span className="text-sm text-[#121217]">{ui('fiscal.sii.field.attachXml')}</span>
          </div>
        </div>
      </SectionRow>
      {/* Envíos */}
      <SectionRow label={ui('fiscal.sii.legend.sends')} data-testid="SectionRow__fcb159">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1 w-[376px]">
              <Label data-testid="Label__fcb159">{ui('fiscal.sii.field.deadline')}</Label>
              <div className="flex items-center">
                <input
                  type="number"
                  min={0}
                  value={form.plazoLmiteDeEnvoASII}
                  onChange={e => set('plazoLmiteDeEnvoASII', e.target.value)}
                  className="flex-1 min-w-0 h-10 rounded-l-lg border border-[#D1D4DB] px-3 text-sm bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => set('plazoLmiteDeEnvoASII', Math.max(0, +form.plazoLmiteDeEnvoASII - 1))}
                  className="h-10 w-9 border border-l-0 border-[#D1D4DB] flex items-center justify-center text-sm hover:bg-muted/40 transition-colors"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => set('plazoLmiteDeEnvoASII', +form.plazoLmiteDeEnvoASII + 1)}
                  className="h-10 w-9 rounded-r-lg border border-l-0 border-[#D1D4DB] flex items-center justify-center text-sm hover:bg-muted/40 transition-colors"
                >
                  +
                </button>
              </div>
            </div>
            <div className="space-y-1 w-[376px]">
              <Label data-testid="Label__fcb159">{ui('fiscal.sii.field.cadenceSale')}</Label>
              <Input
                type="number"
                min={0}
                value={form.cadenciaEnvoFacturasVentaASII}
                onChange={e => set('cadenciaEnvoFacturasVentaASII', e.target.value)}
                className="bg-white"
                data-testid="Input__fcb159" />
            </div>
            <div className="space-y-1 w-[376px]">
              <Label data-testid="Label__fcb159">{ui('fiscal.sii.field.cadencePurchase')}</Label>
              <Input
                type="number"
                min={0}
                value={form.cadenciaEnvoFacturasCompraASII}
                onChange={e => set('cadenciaEnvoFacturasCompraASII', e.target.value)}
                className="bg-white"
                data-testid="Input__fcb159" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={isEtendoTrue(form.postedInvoices)}
              onCheckedChange={v => set('postedInvoices', v ? 'Y' : 'N')}
              data-testid="Switch__fcb159" />
            <span className="text-sm text-[#121217]">{ui('fiscal.sii.field.postedOnly')}</span>
          </div>
        </div>
      </SectionRow>
      {/* Régimen especial */}
      <SectionRow label={ui('fiscal.sii.legend.special')} data-testid="SectionRow__fcb159">
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex items-center gap-2 pt-1 w-[376px]">
            <Switch
              checked={isEtendoTrue(form.recc)}
              onCheckedChange={v => set('recc', v ? 'Y' : 'N')}
              data-testid="Switch__fcb159" />
            <span className="text-sm text-[#121217]">{ui('fiscal.sii.field.recc')}</span>
          </div>
          <div className="flex items-center gap-2 pt-1 w-[376px]">
            <Switch
              checked={isEtendoTrue(form.redeme)}
              onCheckedChange={v => set('redeme', v ? 'Y' : 'N')}
              data-testid="Switch__fcb159" />
            <span className="text-sm text-[#121217]">{ui('fiscal.sii.field.redeme')}</span>
          </div>
          <div className="space-y-1 w-[376px]">
            <Label data-testid="Label__fcb159">{ui('fiscal.sii.field.authno')}</Label>
            <Input
              value={form.authorizationno}
              onChange={e => set('authorizationno', e.target.value)}
              className="bg-white"
              data-testid="Input__fcb159" />
          </div>
        </div>
      </SectionRow>
      {/* Certificado digital — only shown when hideCert is false */}
      {!hideCert && (
        <SectionRow
          label={ui('fiscal.cert.section.legend')}
          boldLabel
          labelExtra={<span className="text-xs text-[#121217] leading-tight">{ui('fiscal.cert.section.hint')}</span>}
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

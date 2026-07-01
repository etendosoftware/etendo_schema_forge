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
  buildVerifactuUpdatePayload,
  getFiscalRecordId,
  getVerifactuTaxTypeLabel,
  isEtendoTrue,
  normalizeEtendoBoolean,
  normalizeVerifactuTaxType,
  VERIFACTU_TAX_TYPE_OPTIONS,
} from './fiscalConfig.utils.js';

// Confirmed from artifacts/verifactu-config/contract.json → backendContract.window.primaryEntity
const VERIFACTU_ENTITY = 'cabeceraDeConfiguraciónVerifactu';

// Two-column section row wrapper
function SectionRow({ children, leftContent }) {
  return (
    <div className="flex items-start py-6 gap-6 border-t border-[#E8EAEF]">
      <div className="w-[160px] flex-shrink-0">{leftContent}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const VerifactuSection = forwardRef(function VerifactuSection({ record, apiBaseUrl, orgId, onSave, hideSave }, ref) {
  const ui = useUI();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const isLocked = isEtendoTrue(record?.isReady);

  const [form, setForm] = useState({
    tAXType:   normalizeVerifactuTaxType(record?.tAXType) ?? '',
    defaultQR: normalizeEtendoBoolean(record?.defaultQR),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    if (isLocked) return;
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.tAXType) {
      const taxError = ui('fiscal.verifactu.err.noTaxType');
      setError(taxError);
      throw new Error(taxError);
    }
    const recordId = getFiscalRecordId(record, 'VERIFACTU');
    if (!recordId) {
      const idError = ui('fiscal.verifactu.err.noRecordId');
      setError(idError);
      throw new Error(idError);
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/verifactu-config/${VERIFACTU_ENTITY}/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildVerifactuUpdatePayload(form)),
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

  useImperativeHandle(ref, () => ({ save: handleSave }));

  return (
    <div>
      {/* Verifactu section — left: label + badge, right: 3-column grid */}
      <SectionRow
        leftContent={
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[#121217]">VERI*FACTU</span>
            {isLocked && (
              <Badge variant="default" data-testid="Badge__e30816">{ui('fiscal.verifactu.locked.badge')}</Badge>
            )}
          </div>
        }
        data-testid="SectionRow__e30816">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 items-end">
            <div className="space-y-1">
              <Label data-testid="Label__e30816">{ui('fiscal.verifactu.field.tax')}</Label>
              {isLocked ? (
                <Input
                  value={getVerifactuTaxTypeLabel(form.tAXType)}
                  disabled
                  data-testid="Input__e30816" />
              ) : (
                <select
                  value={form.tAXType}
                  onChange={e => set('tAXType', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="">{ui('fiscal.verifactu.field.selectTax')}</option>
                  {VERIFACTU_TAX_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Switch
                checked={isEtendoTrue(form.defaultQR)}
                onCheckedChange={v => set('defaultQR', v ? 'Y' : 'N')}
                disabled={isLocked}
                data-testid="Switch__e30816" />
              <span className="text-sm text-[#121217]">{ui('fiscal.verifactu.field.qr')}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label data-testid="Label__e30816">{ui('fiscal.verifactu.field.enrollDate')}</Label>
              <Input value={record?.inVfactuSystem ?? ''} disabled data-testid="Input__e30816" />
            </div>
          </div>
        </div>
      </SectionRow>
      {/* Certificado digital */}
      <SectionRow
        leftContent={
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-[#121217]">{ui('fiscal.cert.section.legend')}</span>
            <span className="text-xs text-[#121217] leading-tight">{ui('fiscal.cert.section.hint')}</span>
          </div>
        }
        data-testid="SectionRow__e30816">
        <CertSection
          context="verifactu"
          orgId={orgId}
          apiBaseUrl={apiBaseUrl}
          data-testid="CertSection__e30816" />
      </SectionRow>
      <SectionSaveButton
        error={error}
        hideSave={hideSave}
        locked={isLocked}
        save={handleSave}
        saving={saving}
        savingKey="fiscal.verifactu.saving"
        ui={ui}
        data-testid="SectionSaveButton__e30816" />
    </div>
  );
});

export default VerifactuSection;

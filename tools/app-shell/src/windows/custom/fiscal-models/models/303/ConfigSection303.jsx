// Modelo 303 section of the fiscal-models config drawer (ETP-5716: moved verbatim out of
// FmOverlays.jsx's ConfigDrawer; bound to the model in modelRegistryConfig.js).
//
// The values stay owned by ConfigDrawer (`values` / `onChange(key, value)`), not by this
// component, so they survive switching to the "Declarante" tab and back — exactly as when they
// were ConfigDrawer's own `redeme` / `recc` / `iban` state. `onChange` also marks the drawer dirty.
import React from 'react';
import { CheckboxField } from '@/windows/custom/shared/CheckboxField.jsx';
import { CfgField, CfgSelect, INPUT_ST } from '../../FmConfigFields.jsx';

export default function ConfigSection303({ t, values, onChange }) {
  return (
    <>
      {/* Regímenes fiscales */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: 12 }}>
          {t('fm.config.m303.regimes') ?? 'Regímenes fiscales'}
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))', cursor: 'pointer' }}>
            <CheckboxField
              checked={values.redeme}
              onToggle={val => onChange('redeme', val)}
              data-testid="CheckboxField__cda0bb" />
            {t('fm.config.m303.redeme') ?? 'Inscrito en REDEME'}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))', cursor: 'pointer' }}>
            <CheckboxField
              checked={values.recc}
              onToggle={val => onChange('recc', val)}
              data-testid="CheckboxField__cda0bb" />
            {t('fm.config.m303.recc') ?? 'Régimen RECC'}
          </label>
        </div>
      </div>
      {/* Prorrata + IBAN */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <CfgField
          label={t('fm.config.m303.prorata') ?? 'Prorrata'}
          data-testid="CfgField__cda0bb">
          <CfgSelect
            ariaLabel={t('fm.config.m303.prorata') ?? 'Prorrata'}
            testId="ConfigDrawer__prorata"
            options={[
              { value: 'general',  label: t('fm.config.m303.prorata_general') ?? 'General' },
              { value: 'especial', label: t('fm.config.m303.prorata_especial') ?? 'Especial' },
            ]}
            data-testid="CfgSelect__cda0bb" />
        </CfgField>
        <CfgField
          label={t('fm.config.m303.iban') ?? 'IBAN Domiciliación'}
          data-testid="CfgField__cda0bb">
          <input
            type="text"
            value={values.iban}
            onChange={e => onChange('iban', e.target.value)}
            placeholder="ES00 0000 0000 0000 0000 0000"
            style={{ ...INPUT_ST, fontFamily: 'monospace' }}
          />
        </CfgField>
      </div>
    </>
  );
}

// Initial values of the section's controlled inputs (ConfigDrawer's former useState defaults).
ConfigSection303.initialValues = Object.freeze({ redeme: true, recc: false, iban: '' });

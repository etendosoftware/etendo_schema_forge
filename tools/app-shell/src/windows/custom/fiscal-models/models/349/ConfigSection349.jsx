// Modelo 349 section of the fiscal-models config drawer (ETP-5716: moved verbatim out of
// FmOverlays.jsx, where it was `CfgSection349`; bound to the model in modelRegistryConfig.js).
// Its inputs are uncontrolled (not persisted yet), so it ignores the drawer's `values`/`onChange`.
import React from 'react';
import { CfgSection, CfgField, CfgSelect, INPUT_ST } from '../../FmConfigFields.jsx';

export default function ConfigSection349({ t }) {
  return (
    <CfgSection title={t('fm.config.m349.title')} data-testid="CfgSection__cda0bb">
      <div style={{ display: 'flex', gap: 8 }}>
        <CfgField
          label={t('fm.config.m349.periodicity')}
          style={{ flex: 1 }}
          data-testid="CfgField__cda0bb">
          <CfgSelect
            ariaLabel={t('fm.config.m349.periodicity')}
            testId="ConfigDrawer__periodicity"
            options={[
              { value: 'monthly',   label: t('fm.config.m349.periodicity_monthly') },
              { value: 'quarterly', label: t('fm.config.m349.periodicity_quarterly') },
              { value: 'annual',    label: t('fm.config.m349.periodicity_annual') },
            ]}
            data-testid="CfgSelect__cda0bb" />
        </CfgField>
        <CfgField
          label={t('fm.config.m349.threshold')}
          style={{ flex: 1 }}
          data-testid="CfgField__cda0bb">
          <input type="text" defaultValue="50.000" style={{ ...INPUT_ST, fontFamily: 'monospace' }} />
        </CfgField>
      </div>
      <CfgField label={t('fm.config.m349.viespref')} data-testid="CfgField__cda0bb">
        <CfgSelect
          ariaLabel={t('fm.config.m349.viespref')}
          testId="ConfigDrawer__viesPref"
          options={[
            { value: 'auto',   label: t('fm.config.m349.viespref_auto') },
            { value: 'manual', label: t('fm.config.m349.viespref_manual') },
          ]}
          data-testid="CfgSelect__cda0bb" />
      </CfgField>
      <CfgField label={t('fm.config.m349.keys')} data-testid="CfgField__cda0bb">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['E', 'A', 'T', 'S', 'I'].map(k => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid hsl(var(--border-subtle))', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked />
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{k}</span>
            </label>
          ))}
        </div>
      </CfgField>
    </CfgSection>
  );
}

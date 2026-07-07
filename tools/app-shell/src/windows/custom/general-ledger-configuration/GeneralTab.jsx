import { useUI } from '@/i18n';
import { ToggleRow } from '@/components/contract-ui';
import SectionShell from './SectionShell.jsx';
import Field from './Field.jsx';
import { CURRENCY_OPTIONS } from './mockCatalogs.js';

/**
 * General tab — Identidad del esquema · Calendario y moneda · Políticas contables.
 * Field binding follows the LOCKED "Field data-binding treatment" table in
 * figma-spec.md:
 *  - editable: name, accrual (Devengo/Caja), description, currency
 *  - read-only org-scoped: fiscal calendar, organization (sourced live by the
 *    aggregate handler from the org's calendar + name; mock seed is the fallback)
 */
export default function GeneralTab({ general, orgInfo, currencyOptions = CURRENCY_OPTIONS, setGeneralField, errors = {} }) {
  const ui = useUI();

  const accrualOptions = [
    { value: 'true', name: ui('glc.accrual.accrual') },
    { value: 'false', name: ui('glc.accrual.cash') },
  ];

  return (
    <div className="px-1">
      {/* Identidad del esquema */}
      <SectionShell
        first
        title={ui('glc.section.identity.title')}
        subtitle={ui('glc.section.identity.subtitle')}
        data-testid="glc-section-identity"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field
            label={ui('glc.field.name')}
            value={general.name}
            onChange={(v) => setGeneralField('name', v)}
            required
            error={errors.name}
            data-testid="glc-field-name"
          />
          <Field
            label={ui('glc.field.organization')}
            value={orgInfo?.organization}
            readOnly
            caption={ui('glc.readonly.fromOrgInfo')}
            data-testid="glc-field-organization"
          />
          <Field
            label={ui('glc.field.accrual')}
            type="select"
            value={String(general.accrual)}
            onChange={(v) => setGeneralField('accrual', v === 'true')}
            options={accrualOptions}
            data-testid="glc-field-accrual"
          />
          <div className="hidden xl:block" aria-hidden="true" />
          <div className="md:col-span-2 xl:col-span-4">
            <Field
              label={ui('glc.field.description')}
              value={general.description}
              onChange={(v) => setGeneralField('description', v)}
              data-testid="glc-field-description"
            />
          </div>
        </div>
      </SectionShell>
      {/* Calendario y moneda */}
      <SectionShell title={ui('glc.section.calendar.title')} data-testid="glc-section-calendar">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label={ui('glc.field.calendar')}
            value={orgInfo?.fiscalCalendar}
            required
            readOnly
            caption={ui('glc.readonly.fromOrgInfo')}
            data-testid="glc-field-calendar"
          />
          <Field
            label={ui('glc.field.currency')}
            type="select"
            value={general.currency}
            onChange={(v) => setGeneralField('currency', v)}
            options={currencyOptions}
            required
            error={errors.currency}
            data-testid="glc-field-currency"
          />
        </div>
      </SectionShell>
      {/* Políticas contables */}
      <SectionShell
        title={ui('glc.section.policies.title')}
        subtitle={ui('glc.section.policies.subtitle')}
        data-testid="glc-section-policies"
      >
        <div className="max-w-2xl">
          <ToggleRow
            label={ui('glc.toggle.allowNegative')}
            checked={Boolean(general.allowNegative)}
            onCheckedChange={(checked) => setGeneralField('allowNegative', checked)}
            data-testid="glc-toggle-allow-negative"
          />
        </div>
      </SectionShell>
    </div>
  );
}

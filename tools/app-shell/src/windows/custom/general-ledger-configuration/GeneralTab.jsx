import { useUI } from '@/i18n';
import SectionShell from './SectionShell.jsx';
import Field from './Field.jsx';
import { CURRENCY_OPTIONS } from './mockCatalogs.js';

/**
 * General tab — Identidad del esquema · Calendario y moneda.
 * Field binding follows the LOCKED "Field data-binding treatment" table in
 * figma-spec.md:
 *  - editable: name, description, currency
 *  - read-only org-scoped: fiscal calendar, organization (sourced live by the
 *    aggregate handler from the org's calendar + name; mock seed is the fallback)
 *  - accrual (Devengo/Caja) is hidden and internally fixed to Devengo — Etendo Go
 *    doesn't support Caja for taxes (ETP-5372)
 *  - hidden, backend-only: allowNegative (`AllowNegative`) — decisions.json marks it
 *    `system`-visibility and the handler's write path no longer accepts a
 *    client-supplied value (ETP-4947); the "Políticas contables" section that used to
 *    hold its toggle was removed entirely since it had no other content.
 */
export default function GeneralTab({ general, orgInfo, currencyOptions = CURRENCY_OPTIONS, setGeneralField, errors = {} }) {
  const ui = useUI();

  return (
    <div className="px-1">
      {/* Identidad del esquema */}
      <SectionShell
        first
        title={ui('glc.section.identity.title')}
        subtitle={ui('glc.section.identity.subtitle')}
        data-testid="glc-section-identity"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div className="md:col-span-2">
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
    </div>
  );
}

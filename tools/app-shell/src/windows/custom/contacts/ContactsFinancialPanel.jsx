import { EntityForm } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import BillingPreferencesForm from './BillingPreferencesForm';

function FieldGroup({ title, description, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-gray-800">{title}</div>
          {description && <div className="text-xs text-gray-400 mt-0.5">{description}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function ContactsFinancialPanel({ data, token, apiBaseUrl, catalogs, api, editing, onChange }) {
  const ui = useUI();

  const creditFields = [
    { key: 'creditLimit', column: 'SO_CreditLimit', type: 'number', required: true, section: 'other' },
    { key: 'creditUsed', column: 'SO_CreditUsed', type: 'number', required: true, readOnly: true, section: 'other' },
    { key: 'taxID', column: 'TaxID', type: 'text', section: 'other' },
    { key: 'active', column: 'IsActive', type: 'checkbox', required: true, readOnly: true, section: 'other', defaultValue: 'Y' },
  ];

  return (
    <div className="space-y-4 pt-5 pb-6">
      <FieldGroup title={ui('creditTax')} description={ui('creditTaxDescription')}>
        <EntityForm
          fields={creditFields}
          data={data ?? {}}
          onChange={onChange}
          catalogs={catalogs}
          layout="horizontal"
          displayLogic={{
            readOnly: editing ? {} : { creditLimit: true, creditUsed: true, taxID: true, active: true },
            visibility: {},
          }}
          api={api}
          token={token}
          apiBaseUrl={apiBaseUrl}
        />
      </FieldGroup>
      <FieldGroup title={ui('billingPreferences')} description={ui('billingPreferencesDesc')}>
        <BillingPreferencesForm
          data={data}
          api={api}
          token={token}
          catalogs={catalogs}
          onChange={onChange}
          editing={editing}
          apiBaseUrl={apiBaseUrl}
        />
      </FieldGroup>
    </div>
  );
}

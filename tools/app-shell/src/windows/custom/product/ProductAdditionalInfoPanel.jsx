import { EntityForm } from '@/components/contract-ui';

const commercialFields = ['taxCategory', 'sale', 'purchase'];
const logisticsFields = ['stocked', 'returnable', 'weight', 'uOMForWeight'];

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

export default function ProductAdditionalInfoPanel({ data, token, apiBaseUrl, catalogs, api, editing, onChange }) {
  return (
    <div className="space-y-4 pt-5 pb-6">
      <FieldGroup
        title="Commercial"
        description="Configuración comercial secundaria para el producto."
      >
        <EntityForm
          fields={[
            { key: 'taxCategory', column: 'C_TaxCategory_ID', type: 'selector', label: 'Tax Category', required: true, section: 'other', reference: 'TaxCategory', inputMode: 'selector' },
            { key: 'sale', column: 'IsSold', type: 'checkbox', label: 'Sale', section: 'other', defaultValue: 'Y' },
            { key: 'purchase', column: 'IsPurchased', type: 'checkbox', label: 'Purchase', section: 'other', defaultValue: 'Y' },
          ]}
          data={data ?? {}}
          onChange={onChange}
          catalogs={catalogs}
          layout="horizontal"
          displayLogic={{ readOnly: editing ? {} : { taxCategory: true, sale: true, purchase: true }, visibility: {} }}
          api={api}
          token={token}
          apiBaseUrl={apiBaseUrl}
        />
      </FieldGroup>

      <FieldGroup
        title="Logistics"
        description="Datos operativos para stock, peso y comportamiento logístico."
      >
        <EntityForm
          fields={[
            { key: 'stocked', column: 'IsStocked', type: 'checkbox', label: 'Stocked', section: 'other', defaultValue: 'Y' },
            { key: 'returnable', column: 'Returnable', type: 'checkbox', label: 'Returnable', section: 'other', defaultValue: 'Y' },
            { key: 'weight', column: 'Weight', type: 'number', label: 'Weight', section: 'other' },
            { key: 'uOMForWeight', column: 'C_Uom_Weight_ID', type: 'selector', label: 'UOM for Weight', section: 'other', reference: 'UOM', inputMode: 'selector' },
          ]}
          data={data ?? {}}
          onChange={onChange}
          catalogs={catalogs}
          layout="horizontal"
          displayLogic={{ readOnly: editing ? {} : { stocked: true, returnable: true, weight: true, uOMForWeight: true }, visibility: {} }}
          api={api}
          token={token}
          apiBaseUrl={apiBaseUrl}
        />
      </FieldGroup>
    </div>
  );
}

import { EntityForm } from '@/components/contract-ui';
import { useUI, useLabel } from '@/i18n';

/* eslint-disable react/prop-types */

export default function ProductCategoryCustomForm({ entity, data, token, apiBaseUrl, catalogs, api, onChange, onFieldBlur, displayLogic, section }) {
  if (section && section !== 'principal') return null;
  const ui = useUI();
  const t = useLabel();

  const textFields = [
    { key: 'name', column: 'Name', type: 'text', label: t('Name'), required: true, section: 'principal' },
    { key: 'searchKey', column: 'Value', type: 'text', label: t('Value') ?? ui('searchKey'), required: true, section: 'principal' },
  ];

  const checkboxFields = [
    { key: 'default', column: 'IsDefault', type: 'checkbox', label: ui('categoryDefault'), required: true, section: 'principal' },
    { key: 'active', column: 'IsActive', type: 'checkbox', label: t('IsActive'), required: true, section: 'principal' },
  ];

  const descriptionField = [
    { key: 'description', column: 'Description', type: 'textarea', label: t('Description'), section: 'principal', span: 3, rows: 3 },
  ];

  return (
    <div className="flex flex-col gap-5 [&_input]:bg-card [&_textarea]:bg-card">
      {/* Row 1: Name | Search Key | Configuration checkboxes */}
      <div className="flex flex-row items-end gap-5">
        <div className="w-[325px] shrink-0">
          <EntityForm
            entity={entity}
            fields={[textFields[0]]}
            data={data ?? {}}
            onChange={onChange}
            onFieldBlur={onFieldBlur}
            catalogs={catalogs}
            cols={1}
            displayLogic={displayLogic ?? { readOnly: {}, visibility: {} }}
            api={api}
            token={token}
            apiBaseUrl={apiBaseUrl}
            data-testid="EntityForm__473ce6" />
        </div>
        <div className="w-[325px] shrink-0">
          <EntityForm
            entity={entity}
            fields={[textFields[1]]}
            data={data ?? {}}
            onChange={onChange}
            onFieldBlur={onFieldBlur}
            catalogs={catalogs}
            cols={1}
            displayLogic={displayLogic ?? { readOnly: {}, visibility: {} }}
            api={api}
            token={token}
            apiBaseUrl={apiBaseUrl}
            data-testid="EntityForm__473ce6" />
        </div>
        <div className="w-fit pb-1">
          <EntityForm
            entity={entity}
            fields={checkboxFields}
            data={data ?? {}}
            onChange={onChange}
            onFieldBlur={onFieldBlur}
            catalogs={catalogs}
            cols={2}
            displayLogic={displayLogic ?? { readOnly: {}, visibility: {} }}
            api={api}
            token={token}
            apiBaseUrl={apiBaseUrl}
            data-testid="EntityForm__473ce6" />
        </div>
      </div>
      {/* Row 2: Description full width */}
      <div>
        <EntityForm
          entity={entity}
          fields={descriptionField}
          data={data ?? {}}
          onChange={onChange}
          onFieldBlur={onFieldBlur}
          catalogs={catalogs}
          cols={1}
          displayLogic={displayLogic ?? { readOnly: {}, visibility: {} }}
          api={api}
          token={token}
          apiBaseUrl={apiBaseUrl}
          data-testid="EntityForm__473ce6" />
      </div>
    </div>
  );
}

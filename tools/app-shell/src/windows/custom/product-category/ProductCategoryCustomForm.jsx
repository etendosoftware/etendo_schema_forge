import { EntityForm } from '@/components/contract-ui';
import { useUI, useLabel } from '@/i18n';
import CheckboxGroup from '@/windows/custom/shared/CheckboxGroup';

/* eslint-disable react/prop-types */

export default function ProductCategoryCustomForm({ entity, data, token, apiBaseUrl, catalogs, api, editing, onChange, displayLogic, section }) {
  if (section && section !== 'principal') return null;
  const ui = useUI();
  const t = useLabel();
  const readOnly = !editing;

  const textFields = [
    { key: 'name', column: 'Name', type: 'text', label: t('Name'), required: true, section: 'principal' },
    { key: 'searchKey', column: 'Value', type: 'text', label: t('Value') ?? ui('searchKey'), required: true, section: 'principal' },
  ];

  const descriptionField = [
    { key: 'description', column: 'Description', type: 'textarea', label: t('Description'), section: 'principal', span: 3, rows: 3 },
  ];

  return (
    <div className="flex flex-col gap-5 [&_input]:bg-white [&_textarea]:bg-white">
      {/* Row 1: Name | Search Key | Configuration checkboxes */}
      <div className="flex flex-row items-end gap-5">
        <div className="w-[325px] shrink-0">
          <EntityForm
            entity={entity}
            fields={[textFields[0]]}
            data={data ?? {}}
            onChange={onChange}
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
            catalogs={catalogs}
            cols={1}
            displayLogic={displayLogic ?? { readOnly: {}, visibility: {} }}
            api={api}
            token={token}
            apiBaseUrl={apiBaseUrl}
            data-testid="EntityForm__473ce6" />
        </div>
        <div className="flex-1 pb-1">
          <CheckboxGroup
            label={ui('categoryConfiguration')}
            items={[
              { key: 'default', column: 'IsDefault', label: ui('categoryDefault') },
              { key: 'summaryLevel', column: 'Issummary', label: ui('categoryGroupable') },
            ]}
            data={data}
            readOnly={readOnly}
            onChange={onChange}
            data-testid="CheckboxGroup__473ce6" />
        </div>
      </div>
      {/* Row 2: Description full width */}
      <div>
        <EntityForm
          entity={entity}
          fields={descriptionField}
          data={data ?? {}}
          onChange={onChange}
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

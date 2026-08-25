import { EntityForm } from '@/components/contract-ui';
import { useUI, useLabel } from '@/i18n';

/* eslint-disable react/prop-types */

// ETP-4933: the descriptor shapes, hoisted to module scope WITHOUT labels so they can
// be exposed as the `fields` static below. This window is hand-written rather than
// generated, so the generator's static never reaches it; without this, DetailView has
// nothing to gate on here and the Save button would never block.
// Labels stay inside the component — they need useLabel/useUI — and are merged in
// below, so there is a single source of truth for what the fields ARE.
const TEXT_FIELD_SHAPES = [
  { key: 'name', column: 'Name', type: 'text', required: true, section: 'principal' },
  { key: 'searchKey', column: 'Value', type: 'text', required: true, section: 'principal' },
];
const CHECKBOX_FIELD_SHAPES = [
  { key: 'default', column: 'IsDefault', type: 'checkbox', required: true, section: 'principal' },
  { key: 'active', column: 'IsActive', type: 'checkbox', required: true, section: 'principal' },
];
const DESCRIPTION_FIELD_SHAPES = [
  { key: 'description', column: 'Description', type: 'textarea', section: 'principal', span: 3, rows: 3 },
];

export default function ProductCategoryCustomForm({ entity, data, token, apiBaseUrl, catalogs, api, onChange, onFieldBlur, displayLogic, section }) {
  const ui = useUI();
  const t = useLabel();
  // NOTE: this guard used to sit ABOVE the two hooks. A conditional return before a
  // hook makes the hook count depend on props — the same defect that crashed
  // /sales-order/new with "Rendered fewer hooks than expected" (ETP-4933).
  if (section && section !== 'principal') return null;

  const textFields = [
    { ...TEXT_FIELD_SHAPES[0], label: t('Name') },
    { ...TEXT_FIELD_SHAPES[1], label: t('Value') ?? ui('searchKey') },
  ];

  const checkboxFields = [
    { ...CHECKBOX_FIELD_SHAPES[0], label: ui('categoryDefault') },
    { ...CHECKBOX_FIELD_SHAPES[1], label: t('IsActive') },
  ];

  const descriptionField = [
    { ...DESCRIPTION_FIELD_SHAPES[0], label: t('Description') },
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

// ETP-4933: mirrors the generator's `<Comp>.fields` static so DetailView can gate the
// Save button here too. The two required checkboxes are included for completeness —
// getMissingRequiredFields excludes `type: 'checkbox'` by design, so they never block.
ProductCategoryCustomForm.fields = [
  ...TEXT_FIELD_SHAPES,
  ...CHECKBOX_FIELD_SHAPES,
  ...DESCRIPTION_FIELD_SHAPES,
];

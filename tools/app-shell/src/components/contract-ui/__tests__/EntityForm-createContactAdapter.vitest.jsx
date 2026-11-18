// @covers tools/app-shell/src/components/contract-ui/EntityForm.jsx
// @covers tools/app-shell/src/components/contract-ui/FieldCreateContext.js
/**
 * Covers SearchSelectField's `onCreateRequest` adapter (EntityForm.jsx) — the wrapper that
 * translates createCtx.onOpen's `{ id, name }` object callback (per CreateContactContext /
 * useCreateContactModal.jsx) into CreatableSearchSelect's expected `(id, name)` positional-args
 * onCreated callback.
 */
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ImageField.jsx', () => ({ ImageField: () => null }));
vi.mock('../PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => null }));
vi.mock('../SelectorChip.jsx', () => ({ SelectorChip: (props) => <span>{props.label}</span> }));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

// Exposes onCreateRequest via a button so the test can trigger it directly and inspect what
// arguments it forwards to onChange (through the adapter under test).
vi.mock('../CreatableSearchSelect.jsx', () => ({
  CreatableSearchSelect: (props) => (
    <div data-testid={`creatable-search-select-${props.field?.key}`}>
      {props.onCreateRequest && (
        <button
          type="button"
          data-testid={`trigger-create-${props.field?.key}`}
          onClick={() => props.onCreateRequest('typed query', (id, name) => props.onChange?.(id, name))}
        >
          create
        </button>
      )}
    </div>
  ),
}));

import { EntityForm } from '../EntityForm.jsx';
import { CreateContactContext } from '../CreateContactContext.js';
import { FieldCreateContext } from '../FieldCreateContext.js';

describe('SearchSelectField onCreateRequest adapter (ETP-4600)', () => {
  it('adapts createCtx.onOpen({id,name}) into onCreated(id, name) positional args', () => {
    const onChange = vi.fn();
    // Mirrors useCreateContactModal.jsx: onOpen invokes its callback with an object.
    const onOpen = vi.fn((query, onSelect) => onSelect({ id: 'X', name: 'Y' }));
    const fields = [
      { key: 'businessPartner', label: 'Partner', type: 'search', column: 'C_BPartner_ID' },
    ];

    render(
      <CreateContactContext.Provider value={{ fieldKey: 'businessPartner', onOpen }}>
        <EntityForm
          fields={fields}
          data={{}}
          onChange={onChange}
          token="tok"
          apiBaseUrl="/api"
          entity="header"
        />
      </CreateContactContext.Provider>,
    );

    fireEvent.click(screen.getByTestId('trigger-create-businessPartner'));

    expect(onOpen).toHaveBeenCalledWith('typed query', expect.any(Function));
    // The adapter must have unpacked the {id,name} object into positional args before
    // EntityForm's own searchOnChange forwards them to the field's onChange.
    expect(onChange).toHaveBeenCalledWith('businessPartner', 'X', 'C_BPartner_ID');
    expect(onChange).toHaveBeenCalledWith('businessPartner$_identifier', 'Y');
  });

  it('does not wire onCreateRequest when createCtx.fieldKey does not match the field', () => {
    const onOpen = vi.fn();
    const fields = [
      { key: 'businessPartner', label: 'Partner', type: 'search', column: 'C_BPartner_ID' },
    ];

    render(
      <CreateContactContext.Provider value={{ fieldKey: 'otherField', onOpen }}>
        <EntityForm
          fields={fields}
          data={{}}
          onChange={vi.fn()}
          token="tok"
          apiBaseUrl="/api"
          entity="header"
        />
      </CreateContactContext.Provider>,
    );

    expect(screen.queryByTestId('trigger-create-businessPartner')).not.toBeInTheDocument();
  });
});

describe('FieldCreateContext — a window\'s own create modal on a selector field (ETP-6209)', () => {
  const fields = [
    { key: 'rejectReason', label: 'Reject Reason', type: 'selector', inputMode: 'selector', column: 'C_Reject_Reason_ID' },
  ];

  it('wires the field\'s create row to the context\'s onOpen and selects what it returns', () => {
    const onChange = vi.fn();
    const onOpen = vi.fn((query, onSelect) => onSelect({ id: 'rr-1', name: 'Deudor' }));

    render(
      <FieldCreateContext.Provider value={{ rejectReason: { label: '+ Crear razón', onOpen } }}>
        <EntityForm fields={fields} data={{}} onChange={onChange} token="tok" apiBaseUrl="/api" entity="header" />
      </FieldCreateContext.Provider>,
    );

    fireEvent.click(screen.getByTestId('trigger-create-rejectReason'));

    expect(onOpen).toHaveBeenCalledWith('typed query', expect.any(Function));
    expect(onChange).toHaveBeenCalledWith('rejectReason', 'rr-1', 'C_Reject_Reason_ID');
    expect(onChange).toHaveBeenCalledWith('rejectReason$_identifier', 'Deudor');
  });

  it('leaves a field the context does not name, and every field without a provider, as before', () => {
    const { unmount } = render(
      <FieldCreateContext.Provider value={{ otherField: { label: '+ x', onOpen: vi.fn() } }}>
        <EntityForm fields={fields} data={{}} onChange={vi.fn()} token="tok" apiBaseUrl="/api" entity="header" />
      </FieldCreateContext.Provider>,
    );
    expect(screen.getByTestId('creatable-search-select-rejectReason')).toBeInTheDocument();
    expect(screen.queryByTestId('trigger-create-rejectReason')).not.toBeInTheDocument();
    unmount();

    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} token="tok" apiBaseUrl="/api" entity="header" />);
    expect(screen.queryByTestId('trigger-create-rejectReason')).not.toBeInTheDocument();
  });
});

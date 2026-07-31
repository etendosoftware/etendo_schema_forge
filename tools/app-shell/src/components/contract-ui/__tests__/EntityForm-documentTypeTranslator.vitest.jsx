/**
 * Covers the DocumentType-reference `optionTranslator` built in EntityForm.jsx's
 * renderSelectorField for fields with `reference: 'DocumentType'` — renames/hides
 * transactionDocument options (reversed / credit-memo / return / plain invoice tabs).
 */
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ImageField.jsx', () => ({ ImageField: () => null }));
vi.mock('../PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => null }));
vi.mock('../CreatableSearchSelect.jsx', () => ({ CreatableSearchSelect: () => null }));
vi.mock('../SelectorChip.jsx', () => ({ SelectorChip: (props) => <span>{props.label}</span> }));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

let capturedOptionTranslator;
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: (props) => {
    capturedOptionTranslator = props.optionTranslator;
    return <div data-testid="selector-input" />;
  },
}));

import { EntityForm } from '../EntityForm.jsx';

function renderDocumentTypeField() {
  capturedOptionTranslator = undefined;
  const fields = [
    { key: 'transactionDocument', label: 'Doc Type', type: 'selector', column: 'C_DocTypeTarget_ID', reference: 'DocumentType' },
  ];
  render(
    <EntityForm
      fields={fields}
      data={{ transactionDocument: 'DT1', 'transactionDocument$_identifier': 'Invoice' }}
      onChange={vi.fn()}
      token="tok"
      apiBaseUrl="/api"
      entity="header"
    />,
  );
  expect(screen.getByTestId('selector-input')).toBeInTheDocument();
  return capturedOptionTranslator;
}

describe('EntityForm — DocumentType optionTranslator (ETP-4600)', () => {
  it('filters out options whose name contains "reversed"', () => {
    const translate = renderDocumentTypeField();
    expect(translate('AR Invoice Reversed')).toBeNull();
    expect(translate('reversed something')).toBeNull();
  });

  it('maps "credit" or "memo" names to the creditNotesTab label', () => {
    const translate = renderDocumentTypeField();
    expect(translate('Credit Note')).toBe('creditNotesTab');
    expect(translate('Memo Adjustment')).toBe('creditNotesTab');
  });

  it('maps "return" or "devoluci" names to the returnsTab label', () => {
    const translate = renderDocumentTypeField();
    expect(translate('Sales Return')).toBe('returnsTab');
    expect(translate('Devolucion de venta')).toBe('returnsTab');
  });

  it('maps "rectific" names to the rectificativeInvoicesTab label (ETP-4737)', () => {
    const translate = renderDocumentTypeField();
    expect(translate('Factura Rectificativa')).toBe('rectificativeInvoicesTab');
    expect(translate('Factura Rectificativa (compras)')).toBe('rectificativeInvoicesTab');
  });

  it('falls back to the invoicesTab label for any other document type name', () => {
    const translate = renderDocumentTypeField();
    expect(translate('AR Invoice')).toBe('invoicesTab');
    expect(translate('Standard Order')).toBe('invoicesTab');
  });
});

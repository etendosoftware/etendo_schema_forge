import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * ETP-5184 — every rendered form field must carry `data-testid="field-<key>"`.
 *
 * That attribute is the anchor `inspect_page_dom` indexes and
 * `highlight_element` resolves, so a field branch that omits it is invisible to
 * the Copilot: the model cannot name it and cannot point at it. The
 * customRenderer branch was the gap — the renderer is an opaque component, so
 * the anchor has to live on the wrapper EntityForm controls.
 */

vi.mock('@/i18n', () => ({
  useLabel: () => key => key,
  useMenuLabel: () => key => key,
  useUI: () => key => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ImageField.jsx', () => ({ ImageField: () => <div /> }));
vi.mock('../PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => <div /> }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div /> }));
vi.mock('../CreatableSearchSelect.jsx', () => ({ CreatableSearchSelect: () => <div /> }));
vi.mock('../SelectorChip.jsx', () => ({ SelectorChip: () => <span /> }));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: url => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[`${key}$_identifier`] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

import { EntityForm } from '../EntityForm.jsx';

function CustomWidget({ value }) {
  return <div data-testid="custom-widget">{String(value ?? '')}</div>;
}

const FIELDS = [
  { key: 'name', label: 'Name', type: 'string', column: 'Name' },
  { key: 'riskScore', label: 'Risk Score', type: 'string', column: 'RiskScore', customRenderer: CustomWidget },
];

function renderForm(props = {}) {
  return render(
    <EntityForm
      entity="header"
      fields={FIELDS}
      data={{ name: 'Test Order', riskScore: 'LOW' }}
      onChange={vi.fn()}
      token="test-token"
      apiBaseUrl="/api"
      {...props}
    />
  );
}

describe('EntityForm — Copilot highlight anchors', () => {
  it('anchors a custom-rendered field so the Copilot can point at it', () => {
    renderForm();
    const anchor = screen.getByTestId('field-riskScore');
    expect(anchor).toBeInTheDocument();
    expect(anchor).toContainElement(screen.getByTestId('custom-widget'));
  });

  it('keeps anchoring ordinary fields the same way', () => {
    renderForm();
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
  });

  it('derives the anchor from the field key, not from its label', () => {
    // resolveHighlightTarget() builds `[data-testid="field-<fieldKey>"]` from
    // the contract key the model was given by inspect_page_dom.
    renderForm({ fields: [{ ...FIELDS[1], key: 'lines.0.custom', label: 'Anything' }] });
    expect(screen.getByTestId('field-lines.0.custom')).toBeInTheDocument();
  });
});

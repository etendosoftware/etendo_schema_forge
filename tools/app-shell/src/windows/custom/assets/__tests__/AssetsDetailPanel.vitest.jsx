import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── mock heavy children so we exercise AssetsDetailPanel's own logic ──
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// EntityForm stub renders the field keys it receives, so we can assert which
// groups are mounted and with which fields.
vi.mock('@/components/contract-ui', () => ({
  EntityForm: ({ fields }) => (
    <div data-testid="entity-form" data-fields={(fields || []).map(f => f.key).join(',')} />
  ),
}));

// ETP-4529 — AssetsDetailPanel resolves dimension visibility via
// useAccountingDimensionFields, a thin wrapper around useDisplayLogic (the same
// evaluate-display evaluator DetailView uses — see DetailView.*.vitest.jsx for the
// established `vi.mock('@/hooks/useDisplayLogic', ...)` convention this reuses).
// Defaulting to `{ visibility: {} }` reproduces the evaluator's fail-open behavior
// (a field the server never mentions stays visible), matching production defaults.
vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: vi.fn(() => ({ readOnly: {}, visibility: {} })),
}));

import { useDisplayLogic } from '@/hooks/useDisplayLogic';
import AssetsDetailPanel from '../AssetsDetailPanel.jsx';

const BASE_PROPS = {
  token: 'tok',
  apiBaseUrl: 'http://host/neo/assets',
  api: { labelOverrides: {} },
  catalogs: {},
  editing: true,
  onChange: vi.fn(),
};

function formsByFields(container) {
  return [...container.querySelectorAll('[data-testid="entity-form"]')]
    .map(el => el.getAttribute('data-fields'));
}

beforeEach(() => {
  useDisplayLogic.mockReturnValue({ readOnly: {}, visibility: {} });
});

describe('AssetsDetailPanel — depreciation off', () => {
  it('hides financial, depreciation fields, dates and dimensions when depreciate is off', () => {
    const { container } = render(
      <AssetsDetailPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'N' }} />,
    );
    const forms = formsByFields(container);
    // Only Group 1 (Asset Info) form is rendered.
    expect(forms.some(f => f.includes('searchKey'))).toBe(true);
    // Product is "Siempre" (ETP-4529 corrected matrix) — a plain Asset Info field,
    // always shown regardless of depreciate state or GL Configuration.
    expect(forms.some(f => f.includes('product'))).toBe(true);
    // No dimensions / dates / financial forms.
    expect(forms.some(f => f.includes('project'))).toBe(false);
    expect(forms.some(f => f.includes('purchaseDate'))).toBe(false);
    expect(forms.some(f => f.includes('assetValue'))).toBe(false);
    // Disabled hint shown.
    expect(screen.getByText('assetsDepreciationDisabledHint')).toBeInTheDocument();
  });
});

describe('AssetsDetailPanel — depreciation on', () => {
  it('renders the accounting dimensions form with only the Project candidate (ETP-4529)', () => {
    // ETP-4529 — Contacto/Producto/Centro de costo are "Nunca" for Activo and are no
    // longer candidates at all; Project is the only "Por config" dimension left, and
    // the evaluator (mocked here as visible-by-default) lets it through.
    const { container } = render(
      <AssetsDetailPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y' }} />,
    );
    const dimForm = formsByFields(container).find(f => f.includes('project'));
    expect(dimForm).toBeDefined();
    expect(dimForm.split(',')).toEqual(['project']);
    // The 3 dropped-candidate dimensions and the 5 out-of-scope ones never appear.
    for (const key of [
      'eTADASCostCenter', 'businessPartner', 'product',
      'eTADASUser1', 'eTADASUser2', 'eTADASSalesRegion', 'eTADASActivity', 'eTADASSalesCampaign',
    ]) {
      expect(dimForm).not.toContain(key);
    }
  });

  it('hides the whole dimensions section when the evaluator marks Project not visible (ETP-4529)', () => {
    // NEW behavior under test: before ETP-4529 the dimensions section always rendered
    // whenever depreciate was on, regardless of any config. Now useAccountingDimensionFields
    // calls the same evaluate-display evaluator DetailView uses, and when it explicitly
    // returns visibility.project === false, the candidate is filtered out — and since
    // Project is the only candidate for Assets, the section (title + form) disappears
    // entirely instead of rendering an empty grid.
    useDisplayLogic.mockReturnValue({ readOnly: {}, visibility: { project: false } });
    const { container } = render(
      <AssetsDetailPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y' }} />,
    );
    expect(formsByFields(container).some(f => f.includes('project'))).toBe(false);
    expect(screen.queryByText('assetsGroupDimensionsTitle')).not.toBeInTheDocument();
  });

  it('shows the dimensions section when the evaluator leaves Project visible (ETP-4529)', () => {
    // Explicit visibility.project === true (config enables the dimension for this
    // client) — same observable result as the fail-open default, proven separately.
    useDisplayLogic.mockReturnValue({ readOnly: {}, visibility: { project: true } });
    const { container } = render(
      <AssetsDetailPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y' }} />,
    );
    expect(formsByFields(container).some(f => f.includes('project'))).toBe(true);
    expect(screen.getByText('assetsGroupDimensionsTitle')).toBeInTheDocument();
  });

  it('renders the dimensions section after the dates section', () => {
    const { container } = render(
      <AssetsDetailPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y' }} />,
    );
    const text = container.textContent;
    const datesIdx = text.indexOf('assetsGroupDatesTitle');
    const dimsIdx = text.indexOf('assetsGroupDimensionsTitle');
    expect(datesIdx).toBeGreaterThan(-1);
    expect(dimsIdx).toBeGreaterThan(-1);
    expect(dimsIdx).toBeGreaterThan(datesIdx);
  });

  it('shows the financial info and dates forms when depreciate is on', () => {
    const { container } = render(
      <AssetsDetailPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y' }} />,
    );
    const forms = formsByFields(container);
    expect(forms.some(f => f.includes('assetValue'))).toBe(true);       // financial
    expect(forms.some(f => f.includes('purchaseDate'))).toBe(true);     // dates
  });
});

describe('AssetsDetailPanel — depreciate toggle', () => {
  it('calls onChange when the Depreciate toggle is clicked', () => {
    const onChange = vi.fn();
    render(<AssetsDetailPanel {...BASE_PROPS} onChange={onChange} data={{ id: 'a1', depreciate: 'N' }} />);
    // The Depreciate ToggleCard renders a switch button.
    const toggles = screen.getAllByRole('switch');
    fireEvent.click(toggles[0]);
    expect(onChange).toHaveBeenCalledWith('depreciate', true);
  });

  it('does not toggle when editing is false (read-only)', () => {
    const onChange = vi.fn();
    render(<AssetsDetailPanel {...BASE_PROPS} editing={false} onChange={onChange} data={{ id: 'a1', depreciate: 'N' }} />);
    const toggles = screen.getAllByRole('switch');
    fireEvent.click(toggles[0]);
    expect(onChange).not.toHaveBeenCalledWith('depreciate', true);
  });
});

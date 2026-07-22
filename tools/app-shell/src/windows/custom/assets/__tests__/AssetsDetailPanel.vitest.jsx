import { describe, it, expect, vi } from 'vitest';
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

describe('AssetsDetailPanel — depreciation off', () => {
  it('hides financial (except assetValue), depreciation fields, dates and dimensions when depreciate is off', () => {
    const { container } = render(
      <AssetsDetailPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'N' }} />,
    );
    const forms = formsByFields(container);
    // Only Group 1 (Asset Info) form is rendered.
    expect(forms.some(f => f.includes('searchKey'))).toBe(true);
    // No dimensions / dates / financial forms.
    expect(forms.some(f => f.includes('project'))).toBe(false);
    expect(forms.some(f => f.includes('purchaseDate'))).toBe(false);
    // assetValue moved to the always-visible main group (ETP-4539) — present even
    // when depreciate is off.
    expect(forms.some(f => f.includes('assetValue'))).toBe(true);
    // Disabled hint shown.
    expect(screen.getByText('assetsDepreciationDisabledHint')).toBeInTheDocument();
  });

  it('keeps assetValue visible regardless of the depreciate flag (ETP-4539)', () => {
    const { container: containerOff } = render(
      <AssetsDetailPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'N' }} />,
    );
    expect(formsByFields(containerOff).some(f => f.includes('assetValue'))).toBe(true);

    const { container: containerOn } = render(
      <AssetsDetailPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y' }} />,
    );
    expect(formsByFields(containerOn).some(f => f.includes('assetValue'))).toBe(true);
  });
});

describe('AssetsDetailPanel — depreciation on', () => {
  it('renders the accounting dimensions form with only the 4 kept dimension fields', () => {
    const { container } = render(
      <AssetsDetailPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y' }} />,
    );
    const dimForm = formsByFields(container).find(f => f.includes('project') && f.includes('eTADASCostCenter'));
    expect(dimForm).toBeDefined();
    // Only Proyecto, Centro de coste, Contacto, Producto remain.
    expect(dimForm.split(',')).toEqual([
      'project', 'eTADASCostCenter', 'businessPartner', 'product',
    ]);
    // The 5 out-of-scope accounting dimensions were removed from the panel.
    for (const key of [
      'eTADASUser1', 'eTADASUser2', 'eTADASSalesRegion', 'eTADASActivity', 'eTADASSalesCampaign',
    ]) {
      expect(dimForm).not.toContain(key);
    }
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

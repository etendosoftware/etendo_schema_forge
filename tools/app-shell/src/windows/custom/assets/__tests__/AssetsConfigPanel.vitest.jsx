import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mocks ──
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/contract-ui', () => ({
  EntityForm: ({ fields }) => (
    <div data-testid="entity-form" data-fields={(fields || []).map(f => f.key).join(',')} />
  ),
}));

import AssetsConfigPanel from '../AssetsConfigPanel.jsx';

const BASE_PROPS = {
  data: { id: 'a1' },
  token: 'tok',
  apiBaseUrl: 'http://host/sws/neo/assets',
  catalogs: {},
  api: { labelOverrides: {} },
  editing: true,
  onChange: vi.fn(),
};

function formsByFields(container) {
  return [...container.querySelectorAll('[data-testid="entity-form"]')]
    .map(el => el.getAttribute('data-fields'));
}

describe('AssetsConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing with minimal props', () => {
    render(<AssetsConfigPanel {...BASE_PROPS} />);
    // Description section label
    expect(screen.getByText('assetsConfigDesc')).toBeInTheDocument();
  });

  it('renders currency form always', () => {
    const { container } = render(<AssetsConfigPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'N' }} />);
    const forms = formsByFields(container);
    expect(forms.some(f => f.includes('currency'))).toBe(true);
  });

  it('shows depreciate toggle', () => {
    render(<AssetsConfigPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'N' }} />);
    expect(screen.getByText('assetsDepreciateLabel')).toBeInTheDocument();
    expect(screen.getByText('assetsDepreciateDesc')).toBeInTheDocument();
  });

  it('hides depreciation fields when depreciate is off', () => {
    const { container } = render(
      <AssetsConfigPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'N' }} />,
    );
    const forms = formsByFields(container);
    expect(forms.some(f => f.includes('depreciationType'))).toBe(false);
    expect(forms.some(f => f.includes('purchaseDate'))).toBe(false);
    expect(forms.some(f => f.includes('assetValue'))).toBe(false);
  });

  it('shows depreciation, date, and amount forms when depreciate is Y', () => {
    const { container } = render(
      <AssetsConfigPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y' }} />,
    );
    const forms = formsByFields(container);
    expect(forms.some(f => f.includes('depreciationType'))).toBe(true);
    expect(forms.some(f => f.includes('purchaseDate'))).toBe(true);
    expect(forms.some(f => f.includes('assetValue'))).toBe(true);
  });

  it('shows depreciation forms when depreciate is boolean true', () => {
    const { container } = render(
      <AssetsConfigPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: true }} />,
    );
    const forms = formsByFields(container);
    expect(forms.some(f => f.includes('depreciationType'))).toBe(true);
  });

  it('shows 30-days toggle only when depreciate=Y and calculateType=TI', () => {
    render(
      <AssetsConfigPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y', calculateType: 'TI' }} />,
    );
    expect(screen.getByText('assets30DaysLabel')).toBeInTheDocument();
    expect(screen.getByText('assets30DaysDesc')).toBeInTheDocument();
  });

  it('hides 30-days toggle when calculateType is not TI', () => {
    render(
      <AssetsConfigPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y', calculateType: 'PE' }} />,
    );
    expect(screen.queryByText('assets30DaysLabel')).not.toBeInTheDocument();
  });

  it('toggle switch calls onChange when editing', () => {
    render(
      <AssetsConfigPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'N' }} />,
    );
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(BASE_PROPS.onChange).toHaveBeenCalledWith('depreciate', true);
  });

  it('toggle does not call onChange when not editing', () => {
    render(
      <AssetsConfigPanel {...BASE_PROPS} editing={false} data={{ id: 'a1', depreciate: 'N' }} />,
    );
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(BASE_PROPS.onChange).not.toHaveBeenCalled();
  });

  it('toggle turns off depreciate when already on', () => {
    render(
      <AssetsConfigPanel {...BASE_PROPS} data={{ id: 'a1', depreciate: 'Y' }} />,
    );
    // The first switch is the depreciate toggle
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    expect(BASE_PROPS.onChange).toHaveBeenCalledWith('depreciate', false);
  });

  it('renders with null data gracefully', () => {
    render(<AssetsConfigPanel {...BASE_PROPS} data={null} />);
    expect(screen.getByText('assetsConfigDesc')).toBeInTheDocument();
  });

  it('calls onChange for currency on new records', () => {
    render(
      <AssetsConfigPanel {...BASE_PROPS} data={{ currency: 'EUR' }} />,
    );
    expect(BASE_PROPS.onChange).toHaveBeenCalledWith('currency', 'EUR');
  });

  it('does not call onChange for currency on existing records', () => {
    render(
      <AssetsConfigPanel {...BASE_PROPS} data={{ id: 'existing', currency: 'EUR' }} />,
    );
    expect(BASE_PROPS.onChange).not.toHaveBeenCalledWith('currency', 'EUR');
  });

  it('toggle switch has disabled styling when not editing', () => {
    render(
      <AssetsConfigPanel {...BASE_PROPS} editing={false} data={{ id: 'a1', depreciate: 'Y' }} />,
    );
    const switches = screen.getAllByRole('switch');
    expect(switches[0]).toBeDisabled();
  });
});

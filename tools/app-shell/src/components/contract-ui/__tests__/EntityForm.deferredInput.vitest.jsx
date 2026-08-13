import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks (return keys as-is so no hardcoded strings are asserted).
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Heavy children stubbed (same convention as EntityForm.vitest.jsx).
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ImageField.jsx', () => ({ ImageField: () => <div data-testid="image-field" /> }));
vi.mock('../PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => <div data-testid="partner-address-picker" /> }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
vi.mock('../CreatableSearchSelect.jsx', () => ({ CreatableSearchSelect: () => <div data-testid="creatable-search-select" /> }));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

import { EntityForm } from '../EntityForm.jsx';

/**
 * ETP-4333 — DeferredInput (commit-on-blur) regression coverage.
 *
 * DeferredInput is internal to EntityForm; we exercise it through the public form
 * by declaring a `calloutOn: 'blur'` field. `onChange` is the commit target
 * (EntityForm wires DeferredInput's onCommit = onChange). The regression centers on
 * the `lastUserValueRef` "did it change?" gate and the empty→'0' coercion for number
 * fields, both added in ETP-4333.
 */
describe('EntityForm DeferredInput — commit-on-blur gate (ETP-4333)', () => {
  const numberField = { key: 'assetValue', label: 'Asset Value', type: 'number', column: 'AssetValueAmt', calloutOn: 'blur' };
  const textField = { key: 'name', label: 'Name', type: 'text', column: 'Name', calloutOn: 'blur' };

  it('does NOT commit on a no-op blur (focus then leave value untouched)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EntityForm fields={[numberField]} data={{ assetValue: 1000 }} onChange={onChange} />);
    const input = screen.getByTestId('field-assetValue');
    await user.click(input); // focus
    await user.tab();        // blur, value unchanged
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits once on a changed blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EntityForm fields={[numberField]} data={{ assetValue: 1000 }} onChange={onChange} />);
    const input = screen.getByTestId('field-assetValue');
    await user.clear(input);
    await user.type(input, '2000');
    await user.tab(); // blur commits
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('assetValue', '2000', 'AssetValueAmt');
  });

  it('treats numeric equality as a no-op ("15000" displayed vs 15000 committed)', () => {
    const onChange = vi.fn();
    // committedValue arrives as the number 15000; the buffer shows '15000'. Re-typing the
    // same numeric value and blurring must compare Number-equal and skip the commit.
    render(<EntityForm fields={[numberField]} data={{ assetValue: 15000 }} onChange={onChange} />);
    const input = screen.getByTestId('field-assetValue');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '15000' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits "0" when a number field is cleared (empty → 0 coercion)', () => {
    const onChange = vi.fn();
    render(<EntityForm fields={[numberField]} data={{ assetValue: 1000 }} onChange={onChange} />);
    const input = screen.getByTestId('field-assetValue');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('assetValue', '0', 'AssetValueAmt');
  });

  it('does NOT coerce a cleared TEXT field to "0"', () => {
    const onChange = vi.fn();
    render(<EntityForm fields={[textField]} data={{ name: 'old' }} onChange={onChange} />);
    const input = screen.getByTestId('field-name');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    // Text field: '' differs from 'old' → commits the empty string, not '0'.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('name', '', 'Name');
  });

  it('re-syncs the buffer from committedValue while UNFOCUSED (external/callout write)', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EntityForm fields={[numberField]} data={{ assetValue: 1000 }} onChange={onChange} />,
    );
    const input = screen.getByTestId('field-assetValue');
    expect(input).toHaveValue(1000);
    // Simulate a collateral/external write while the field is idle (not focused).
    rerender(<EntityForm fields={[numberField]} data={{ assetValue: 4000 }} onChange={onChange} />);
    expect(screen.getByTestId('field-assetValue')).toHaveValue(4000);
  });

  it('does NOT clobber the in-progress buffer with committedValue while FOCUSED', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EntityForm fields={[numberField]} data={{ assetValue: 1000 }} onChange={onChange} />,
    );
    const input = screen.getByTestId('field-assetValue');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '777' } });
    // External write arrives mid-edit — must be ignored while focused.
    rerender(<EntityForm fields={[numberField]} data={{ assetValue: 4000 }} onChange={onChange} />);
    expect(screen.getByTestId('field-assetValue')).toHaveValue(777);
  });

  it('after an idle external write, the new value becomes the no-op baseline', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EntityForm fields={[numberField]} data={{ assetValue: 1000 }} onChange={onChange} />,
    );
    // Idle external write moves buffer AND lastUserValueRef to 4000.
    rerender(<EntityForm fields={[numberField]} data={{ assetValue: 4000 }} onChange={onChange} />);
    const input = screen.getByTestId('field-assetValue');
    // Focus + leave the externally-set value untouched → no-op, no commit.
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits clearing-to-0 even when a collateral 0 already sits in committedValue', () => {
    // The exact gate rationale (ETP-4333): committedValue may carry a collateral 0 written
    // behind the user's back, but the user's last value was non-zero. Clearing to 0 must
    // still commit because the gate compares against the USER's last value, not committedValue.
    const onChange = vi.fn();
    const { rerender } = render(
      <EntityForm fields={[numberField]} data={{ assetValue: 1000 }} onChange={onChange} />,
    );
    const input = screen.getByTestId('field-assetValue');
    fireEvent.focus(input); // user starts editing; lastUserValueRef = 1000 captured before focus
    // While focused, a collateral write of 0 arrives — must NOT touch the buffer/baseline.
    rerender(<EntityForm fields={[numberField]} data={{ assetValue: 0 }} onChange={onChange} />);
    fireEvent.change(input, { target: { value: '' } }); // user clears → coerces to '0' on blur
    fireEvent.blur(input);
    // '0' vs user-last 1000 → changed → commit fires.
    expect(onChange).toHaveBeenCalledWith('assetValue', '0', 'AssetValueAmt');
  });
});

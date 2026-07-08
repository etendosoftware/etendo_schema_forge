/**
 * Tests for `resolveProcessLabel`, the pure caption resolver for toolbar
 * process buttons. It backs the optional `labelToggle` mechanism: a process
 * button caption can switch based on a record field value (e.g. the Assets
 * "Create Amortization" button becomes "Recalculate Amortization" once the
 * asset's `processed` field === 'Y', mirroring Etendo Classic ref 800042).
 * The resolver returns the RAW (untranslated) label; the render passes it
 * through `tMenu` so translation stays automatic for both branches.
 */
import { resolveProcessLabel } from '../DetailView.jsx';

describe('resolveProcessLabel', () => {
  const toggle = {
    labelToggle: { field: 'processed', equals: 'Y', label: 'Recalculate Amortization' },
    label: 'Create Amortization',
  };

  it('uses labelToggle.label when the record field === equals (raw AD string)', () => {
    expect(resolveProcessLabel(toggle, { processed: 'Y' })).toBe('Recalculate Amortization');
  });

  it('uses the default label when the record field !== equals', () => {
    expect(resolveProcessLabel(toggle, { processed: 'N' })).toBe('Create Amortization');
  });

  it('uses the default label when the toggle field is absent on the record', () => {
    expect(resolveProcessLabel(toggle, {})).toBe('Create Amortization');
    expect(resolveProcessLabel(toggle, null)).toBe('Create Amortization');
  });

  it('returns the plain label unchanged when labelToggle is absent (legacy behavior)', () => {
    const p = { label: 'Complete' };
    expect(resolveProcessLabel(p, { processed: 'Y' })).toBe('Complete');
    expect(resolveProcessLabel(p, {})).toBe('Complete');
  });
});

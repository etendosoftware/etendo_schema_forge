// Trigger-label contract of the shared date-range picker.
//
// ETP-4956: "all time" is emitted as `value === null` (see handlePresetSelect),
// which is indistinguishable from "nothing chosen" — so the trigger label for
// that state comes from the `placeholder`, and a call site that passed a
// period-specific placeholder kept advertising that period after the user had
// widened the filter to every date. `computeTriggerLabel` now also carries an
// `allTime` entry, for the case where a consumer encodes the state as a preset
// instead of null; without it that would silently fall through to the
// placeholder — the same failure mode.
//
// The placeholder precedence itself is deliberately UNCHANGED, and asserted
// here so a future "fix" cannot quietly drop it.
//
// Note the sibling `date-range-popover.test.js` is picked up by NO runner:
// `npm test` only globs src/{lib,hooks,windows,locales}/__tests__/*.test.js and
// vitest only globs *.vitest.* / *.spec.*.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

import { DateRangePopover, computeTriggerLabel } from '../date-range-popover.jsx';

// Radix's Popover needs pointer capture + scrollIntoView, neither of which
// jsdom implements (same polyfill the other Radix suites install).
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

// Identity translator: the label IS the key, so no literal copy is asserted.
const ui = (key) => key;

describe('computeTriggerLabel — preset labels', () => {
  it('labels every preset the popover offers', () => {
    expect(computeTriggerLabel({ presetId: 'today' }, undefined, ui, 'es-ES')).toBe('dateRangeToday');
    expect(computeTriggerLabel({ presetId: 'yesterday' }, undefined, ui, 'es-ES')).toBe('dateRangeYesterday');
    expect(computeTriggerLabel({ presetId: 'last7' }, undefined, ui, 'es-ES')).toBe('dateRangeLast7Days');
    expect(computeTriggerLabel({ presetId: 'last30' }, undefined, ui, 'es-ES')).toBe('dateRangeLast30Days');
    expect(computeTriggerLabel({ presetId: 'last12m' }, undefined, ui, 'es-ES')).toBe('dateRangeLast12Months');
  });

  it('labels an `allTime` preset with the all-time label, not the placeholder', () => {
    expect(computeTriggerLabel({ presetId: 'allTime' }, undefined, ui, 'es-ES')).toBe('dateRangeAllTime');
    // The defensive half of the fix: a period-specific placeholder must not win
    // over a known preset.
    expect(computeTriggerLabel({ presetId: 'allTime' }, 'dateRangeLast12Months', ui, 'es-ES'))
      .toBe('dateRangeAllTime');
  });
});

describe('computeTriggerLabel — placeholder precedence (unchanged)', () => {
  it('falls back to the placeholder when there is no value', () => {
    expect(computeTriggerLabel(null, 'pickSomething', ui, 'es-ES')).toBe('pickSomething');
    expect(computeTriggerLabel(undefined, 'pickSomething', ui, 'es-ES')).toBe('pickSomething');
  });

  it('falls back to the generic "any date" label when there is no placeholder', () => {
    expect(computeTriggerLabel(null, undefined, ui, 'es-ES')).toBe('dateRangeAnyTime');
  });

  it('falls back to the placeholder for an unknown preset id', () => {
    expect(computeTriggerLabel({ presetId: 'nope' }, 'pickSomething', ui, 'es-ES')).toBe('pickSomething');
    expect(computeTriggerLabel({ presetId: 'nope' }, undefined, ui, 'es-ES')).toBe('dateRangeAnyTime');
  });

  it('renders a custom { from, to } range as a formatted day span', () => {
    const label = computeTriggerLabel(
      { from: new Date(2026, 0, 5), to: new Date(2026, 0, 12) },
      'pickSomething',
      ui,
      'es-ES',
    );
    expect(label).toContain('5');
    expect(label).toContain('12');
    expect(label).toContain('–');
  });
});

/** Controlled host, the way every real call site wires the picker. */
function Host({ initial, placeholder }) {
  const [value, setValue] = useState(initial);
  return <DateRangePopover value={value} onChange={setValue} placeholder={placeholder} />;
}

describe('DateRangePopover — picking "all time" updates the trigger', () => {
  it('replaces a period trigger label with the placeholder once the range is cleared', async () => {
    const user = userEvent.setup();
    render(<Host initial={{ presetId: 'last12m' }} placeholder="dateRangeAnyTime" />);

    expect(screen.getByText('dateRangeLast12Months')).toBeInTheDocument();

    await user.click(screen.getByText('dateRangeLast12Months'));
    await user.click(await screen.findByText('dateRangeAllTime'));

    // "All time" is emitted as null, so the trigger reads the placeholder —
    // which is why the placeholder must never name a bounded period.
    expect(screen.queryByText('dateRangeLast12Months')).not.toBeInTheDocument();
    expect(screen.getByText('dateRangeAnyTime')).toBeInTheDocument();
  });

  it('keeps advertising the picked period when a bounded preset is chosen', async () => {
    const user = userEvent.setup();
    render(<Host initial={null} placeholder="dateRangeAnyTime" />);

    await user.click(screen.getByText('dateRangeAnyTime'));
    await user.click(await screen.findByText('dateRangeLast7Days'));

    expect(screen.getByText('dateRangeLast7Days')).toBeInTheDocument();
  });
});

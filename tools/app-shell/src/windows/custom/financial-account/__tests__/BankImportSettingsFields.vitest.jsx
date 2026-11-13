// @covers tools/app-shell/src/windows/custom/financial-account/BankImportSettingsFields.jsx
/**
 * "Importar desde" + "Agrupación de extractos" for a PSD2 bank connection — the fields the
 * connect flow's account picker and the edit panel of `EditAccountModal` share.
 *
 * Two layers are covered here:
 *  - the pure helpers the two callers gate on (`defaultImportFromDate`,
 *    `importFromBeyondFetchInterval`, `importSettingsIncomplete`, `GROUPING_OPTIONS`);
 *  - the component itself: help lines, per-option grouping help, the four options (and no empty
 *    "Default"), required errors, the fetch-interval advisory and the picker opening on the
 *    committed grouping.
 *
 * The callers' own wiring (disabled "Vincular cuenta", the edit panel's save gate) is asserted in
 * `BankConnectionFlowUI.vitest.jsx` and `EditAccountModal.vitest.jsx`.
 */
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Params are appended so a parameterised key stays distinguishable from its bare form.
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => (vars ? `${key}|${Object.values(vars).join(',')}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

import {
  BankImportSettingsFields,
  GROUPING_OPTIONS,
  defaultImportFromDate,
  importFromBeyondFetchInterval,
  importSettingsIncomplete,
} from '../BankImportSettingsFields.jsx';

beforeAll(() => {
  // jsdom lacks it; the picker scrolls the committed option into view when it opens.
  Element.prototype.scrollIntoView = vi.fn();
});

/**
 * `days` before today as `yyyy-MM-dd`, in the LOCAL calendar. An independent re-implementation of
 * `calendarISODaysAgo` (not an import) so a bug in the helper cannot cancel itself out here.
 */
function isoDaysAgo(days) {
  const now = new Date();
  const then = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${then.getFullYear()}-${pad(then.getMonth() + 1)}-${pad(then.getDate())}`;
}

/** Controlled host: keeps the values the component reports, like both real callers do. */
function Harness({ initial = {}, onChange, ...props }) {
  const [values, setValues] = useState({ importFromDate: '', statementGrouping: '', ...initial });
  return (
    <BankImportSettingsFields
      importFromDate={values.importFromDate}
      statementGrouping={values.statementGrouping}
      onChange={(patch) => {
        onChange?.(patch);
        setValues((v) => ({ ...v, ...patch }));
      }}
      {...props}
    />
  );
}

/** Opens the grouping picker: from its input while empty, from its chip once a value is set. */
async function openGrouping(user) {
  const trigger = screen.queryByTestId('field-statementGrouping-chip')
    ?? screen.getByTestId('field-statementGrouping');
  await user.click(trigger);
  return screen.findByTestId('options-statementGrouping');
}

describe('GROUPING_OPTIONS', () => {
  it('lists exactly the four PSD2 groupings, with no empty "Default" entry', () => {
    expect(GROUPING_OPTIONS).toEqual(['1BD', '1BW', '1BM', '1BE']);
    expect(GROUPING_OPTIONS).not.toContain('');
  });
});

describe('importSettingsIncomplete', () => {
  it('is false only when both the date and the grouping are set', () => {
    expect(importSettingsIncomplete({ importFromDate: '2026-01-01', statementGrouping: '1BM' })).toBe(false);
  });

  it.each([
    ['no date', { importFromDate: '', statementGrouping: '1BM' }],
    ['no grouping', { importFromDate: '2026-01-01', statementGrouping: '' }],
    ['a null date', { importFromDate: null, statementGrouping: '1BD' }],
    ['neither', {}],
  ])('is true with %s', (_label, settings) => {
    expect(importSettingsIncomplete(settings)).toBe(true);
  });

  it('is true when called with nothing at all', () => {
    expect(importSettingsIncomplete()).toBe(true);
  });
});

describe('importFromBeyondFetchInterval', () => {
  const LIMIT = 90;

  it('returns null when no date is set', () => {
    expect(importFromBeyondFetchInterval('', LIMIT)).toBeNull();
  });

  // The bridge OMITS the key when the provider publishes no limit: nothing to advise.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['NaN', Number.NaN],
    ['zero', 0],
    ['negative', -5],
    ['a numeric string', '90'],
  ])('returns null when the limit is %s', (_label, limit) => {
    expect(importFromBeyondFetchInterval(isoDaysAgo(400), limit)).toBeNull();
  });

  it('flags a date further back than the limit, with the limit and the earliest served date', () => {
    expect(importFromBeyondFetchInterval(isoDaysAgo(LIMIT + 1), LIMIT)).toEqual({
      days: LIMIT,
      earliest: isoDaysAgo(LIMIT),
    });
  });

  it('does not flag a date exactly at the limit', () => {
    expect(importFromBeyondFetchInterval(isoDaysAgo(LIMIT), LIMIT)).toBeNull();
  });

  it('does not flag a date within the limit', () => {
    expect(importFromBeyondFetchInterval(isoDaysAgo(10), LIMIT)).toBeNull();
  });
});

describe('defaultImportFromDate', () => {
  it('is the first day of the current month when called with no reference', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    expect(defaultImportFromDate()).toBe(expected);
  });

  it('is the first day of the reference month, rolling nothing over at month end', () => {
    expect(defaultImportFromDate(new Date(2026, 0, 31, 23, 59))).toBe('2026-01-01');
    expect(defaultImportFromDate(new Date(2026, 11, 15))).toBe('2026-12-01');
  });

  /**
   * ETP-4850 class of bug: a date-only value built or read through UTC lands on the wrong
   * calendar day west of UTC. Pinned to America/Argentina/Buenos_Aires (UTC-3) the way the other
   * `*.tz-bug` suites do — `process.env.TZ` takes effect per call in this Node/Vitest setup.
   *
   * The reference instants are given in UTC on purpose: each one is still the PREVIOUS local
   * month in Buenos Aires, so a UTC-based implementation answers the wrong month.
   */
  describe('under a negative-UTC-offset timezone', () => {
    const originalTz = process.env.TZ;

    beforeAll(() => {
      process.env.TZ = 'America/Argentina/Buenos_Aires';
    });

    afterAll(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it('uses the LOCAL month on the evening of the last day (already next month in UTC)', () => {
      // 2026-09-01 02:30 UTC = 2026-08-31 23:30 in Buenos Aires.
      expect(defaultImportFromDate(new Date('2026-09-01T02:30:00Z'))).toBe('2026-08-01');
    });

    it('stays on the 1st on the evening of the 1st (already the 2nd in UTC)', () => {
      // 2026-08-02 01:00 UTC = 2026-08-01 22:00 in Buenos Aires.
      expect(defaultImportFromDate(new Date('2026-08-02T01:00:00Z'))).toBe('2026-08-01');
    });

    it('does not jump back a year on the evening of 31 December', () => {
      // 2027-01-01 02:00 UTC = 2026-12-31 23:00 in Buenos Aires.
      expect(defaultImportFromDate(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-01');
    });

    it('defaults to the first of the current local month', () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      expect(defaultImportFromDate()).toBe(expected);
    });
  });
});

describe('BankImportSettingsFields — help lines', () => {
  it('shows the plain "Importar desde" help when the bank published no limit', () => {
    render(<Harness initial={{ importFromDate: '2026-01-01' }} />);

    const help = screen.getByTestId('bank-connection-import-from-help');
    expect(help).toHaveTextContent('financeAccountsBankConnectionImportFromHelp');
    expect(help).not.toHaveTextContent('financeAccountsBankConnectionImportFromHelpLimit');
  });

  it('adds the provider limit, with its day count, when the bank published one', () => {
    render(<Harness initial={{ importFromDate: '2026-01-01' }} maxFetchInterval={180} />);

    expect(screen.getByTestId('bank-connection-import-from-help')).toHaveTextContent(
      'financeAccountsBankConnectionImportFromHelp financeAccountsBankConnectionImportFromHelpLimit|180',
    );
  });

  it('ignores a non-positive limit in the help line', () => {
    render(<Harness initial={{ importFromDate: '2026-01-01' }} maxFetchInterval={0} />);

    expect(screen.getByTestId('bank-connection-import-from-help'))
      .not.toHaveTextContent('financeAccountsBankConnectionImportFromHelpLimit');
  });

  it('shows the generic grouping help while no grouping is chosen', () => {
    render(<Harness />);

    expect(screen.getByTestId('bank-connection-grouping-help'))
      .toHaveTextContent(/^financeAccountsBankConnectionGroupingHelp$/);
  });

  it.each(['1BD', '1BW', '1BM', '1BE'])('explains the %s grouping with its own help line', (id) => {
    render(<Harness initial={{ statementGrouping: id }} />);

    expect(screen.getByTestId('bank-connection-grouping-help'))
      .toHaveTextContent(new RegExp(`^financeAccountsBankConnectionGroupingHelp_${id}$`));
  });

  it('falls back to the generic grouping help for an unknown stored value', () => {
    render(<Harness initial={{ statementGrouping: 'XYZ' }} />);

    expect(screen.getByTestId('bank-connection-grouping-help'))
      .toHaveTextContent(/^financeAccountsBankConnectionGroupingHelp$/);
  });

  it('follows the grouping the user picks', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openGrouping(user);
    await user.click(screen.getByTestId('option-statementGrouping-1BW'));

    expect(screen.getByTestId('bank-connection-grouping-help'))
      .toHaveTextContent('financeAccountsBankConnectionGroupingHelp_1BW');
  });

  it('prefixes its test ids with testIdPrefix', () => {
    render(<Harness testIdPrefix="bank-connection-link" />);

    expect(screen.getByTestId('bank-connection-link-import-from-help')).toBeInTheDocument();
    expect(screen.getByTestId('bank-connection-link-grouping-help')).toBeInTheDocument();
    expect(screen.getByTestId('field-date-bank-connection-link-import-from')).toBeInTheDocument();
  });
});

describe('BankImportSettingsFields — grouping select', () => {
  it('offers exactly the four groupings, labelled, and no empty "Default" option', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const panel = await openGrouping(user);

    const options = panel.querySelectorAll('[data-testid^="option-statementGrouping-"]:not([data-testid$="-selected-indicator"])');
    expect(Array.from(options, (o) => o.getAttribute('data-testid'))).toEqual([
      'option-statementGrouping-1BD',
      'option-statementGrouping-1BW',
      'option-statementGrouping-1BM',
      'option-statementGrouping-1BE',
    ]);
    expect(screen.queryByTestId('option-statementGrouping-__empty__')).toBeNull();
    expect(screen.getByTestId('option-statementGrouping-1BM'))
      .toHaveTextContent('financeAccountsBankConnectionGrouping_1BM');
  });

  it('reports the picked grouping as a patch', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await openGrouping(user);
    await user.click(screen.getByTestId('option-statementGrouping-1BE'));

    expect(onChange).toHaveBeenCalledWith({ statementGrouping: '1BE' });
  });

  // Pickers open on the committed value (ETP-5846/5903/5948).
  it('opens on the committed grouping, marked as selected', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ statementGrouping: '1BW' }} />);

    // A committed grouping shows as a chip with the option's label…
    expect(screen.getByTestId('field-statementGrouping-chip'))
      .toHaveTextContent('financeAccountsBankConnectionGrouping_1BW');
    await openGrouping(user);

    // …and the picker opens on it.
    expect(screen.getByTestId('option-statementGrouping-1BW')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('option-statementGrouping-1BW-selected-indicator')).toBeInTheDocument();
    for (const other of ['1BD', '1BM', '1BE']) {
      expect(screen.getByTestId(`option-statementGrouping-${other}`)).toHaveAttribute('aria-selected', 'false');
    }
  });
});

describe('BankImportSettingsFields — required errors', () => {
  it('shows no required error on an untouched, empty form', () => {
    render(<Harness />);

    expect(screen.queryByTestId('bank-connection-import-from-required')).toBeNull();
    expect(screen.queryByTestId('bank-connection-grouping-required')).toBeNull();
  });

  it('shows the date error once the user empties the date', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={{ importFromDate: '2026-01-01', statementGrouping: '1BM' }} onChange={onChange} />);

    await user.clear(screen.getByTestId('field-date-bank-connection-import-from'));
    await user.tab();

    expect(onChange).toHaveBeenCalledWith({ importFromDate: '' });
    expect(await screen.findByTestId('bank-connection-import-from-required'))
      .toHaveTextContent('financeAccountsBankConnectionImportFromRequired');
    // Only the field the user touched.
    expect(screen.queryByTestId('bank-connection-grouping-required')).toBeNull();
  });

  it('shows the grouping error once the grouping was touched and is still empty', async () => {
    const user = userEvent.setup();
    // A host that rejects the pick keeps the grouping empty after the user touched it.
    render(
      <BankImportSettingsFields importFromDate="2026-01-01" statementGrouping="" onChange={() => {}} />,
    );
    expect(screen.queryByTestId('bank-connection-grouping-required')).toBeNull();

    await openGrouping(user);
    await user.click(screen.getByTestId('option-statementGrouping-1BD'));

    expect(screen.getByTestId('bank-connection-grouping-required'))
      .toHaveTextContent('financeAccountsBankConnectionGroupingRequired');
  });

  it('shows both errors for empty fields when showRequiredErrors is set, untouched', () => {
    render(<Harness showRequiredErrors />);

    expect(screen.getByTestId('bank-connection-import-from-required')).toBeInTheDocument();
    expect(screen.getByTestId('bank-connection-grouping-required')).toBeInTheDocument();
  });

  it('shows no error for filled fields even with showRequiredErrors set', () => {
    render(<Harness showRequiredErrors initial={{ importFromDate: '2026-01-01', statementGrouping: '1BD' }} />);

    expect(screen.queryByTestId('bank-connection-import-from-required')).toBeNull();
    expect(screen.queryByTestId('bank-connection-grouping-required')).toBeNull();
  });
});

describe('BankImportSettingsFields — fetch-interval advisory', () => {
  const WARNING = 'bank-connection-import-fetch-interval-warning';

  it('shows nothing when the bank published no limit, however old the date', () => {
    render(<Harness initial={{ importFromDate: isoDaysAgo(800) }} />);

    expect(screen.queryByTestId(WARNING)).toBeNull();
  });

  it('warns, naming the day count, when the date reaches beyond the limit', () => {
    render(<Harness initial={{ importFromDate: isoDaysAgo(120) }} maxFetchInterval={90} />);

    expect(screen.getByTestId(WARNING)).toHaveTextContent(
      'financeAccountsBankConnectionImportBeyondFetchInterval|90',
    );
  });

  it('does not warn for a date within the limit', () => {
    render(<Harness initial={{ importFromDate: isoDaysAgo(30) }} maxFetchInterval={90} />);

    expect(screen.queryByTestId(WARNING)).toBeNull();
  });

  it('uses the prefix in the advisory test id', () => {
    render(
      <Harness initial={{ importFromDate: isoDaysAgo(120) }} maxFetchInterval={90} testIdPrefix="bank-connection-link" />,
    );

    expect(screen.getByTestId('bank-connection-link-import-fetch-interval-warning')).toBeInTheDocument();
  });
});

describe('BankImportSettingsFields — slots', () => {
  it('renders children inside the grid and the footer after it, before the advisory', () => {
    render(
      <Harness
        initial={{ importFromDate: isoDaysAgo(120) }}
        maxFetchInterval={90}
        footer={<p data-testid="slot-footer">footer</p>}
      >
        <div data-testid="slot-child">child</div>
      </Harness>,
    );

    const child = screen.getByTestId('slot-child');
    const footer = screen.getByTestId('slot-footer');
    const warning = screen.getByTestId('bank-connection-import-fetch-interval-warning');
    expect(child.parentElement).toBe(screen.getByTestId('bank-connection-import-from-help').parentElement.parentElement);
    // eslint-disable-next-line no-bitwise
    expect(child.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // eslint-disable-next-line no-bitwise
    expect(footer.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

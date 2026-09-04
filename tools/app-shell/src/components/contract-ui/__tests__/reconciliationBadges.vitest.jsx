import { render, screen } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// --- Import under test (after mocks) ----------------------------------------

import { StatusBadge, automatchBadgeKind } from '../reconciliationBadges.jsx';

// ---------------------------------------------------------------------------
// automatchBadgeKind — the classification the automatch modal paints
//
// ETP-4965 QA round: the modal used to label ONLY rule-origin groups, so an exact suggestion and a
// within-tolerance near match were visually identical even though applying the second one posts an
// accounting entry. This function is the whole decision, so it is pinned kind by kind — including
// the precedence rule, which is the only case where two signals are present at once.
// ---------------------------------------------------------------------------

describe('automatchBadgeKind', () => {
  it('classifies a near match as a difference', () => {
    expect(automatchBadgeKind({ nearMatch: true, origin: 'standard' })).toBe('difference');
  });

  it('classifies a rule-origin group as byRule', () => {
    expect(automatchBadgeKind({ origin: 'rule', ruleName: 'Impuestos' })).toBe('byRule');
  });

  it('classifies a plain standard group as suggested', () => {
    expect(automatchBadgeKind({ origin: 'standard' })).toBe('suggested');
  });

  it('lets the near match outrank the rule origin', () => {
    // A group can only really be one or the other, but the near match is the one with an accounting
    // consequence — so if both signals ever arrive together, that is what the user must be told.
    expect(automatchBadgeKind({ nearMatch: true, origin: 'rule' })).toBe('difference');
  });

  it('treats an explicit nearMatch:false as not a difference', () => {
    // The backend only emits the key on a near match; a false must never be read as truthy.
    expect(automatchBadgeKind({ nearMatch: false, origin: 'standard' })).toBe('suggested');
  });

  it('falls back to suggested for a missing group', () => {
    expect(automatchBadgeKind(undefined)).toBe('suggested');
    expect(automatchBadgeKind(null)).toBe('suggested');
    expect(automatchBadgeKind({})).toBe('suggested');
  });
});

// ---------------------------------------------------------------------------
// StatusBadge — moved verbatim out of ReconciliationSplitPanel
//
// It lives in its own module so the left panel and the automatch modal cannot drift: a line the
// panel calls "with difference" has to read the same when the modal proposes it. These assert the
// label mapping (through i18n keys, never literals) and the optional `label` override the modal
// needs to append a rule name.
// ---------------------------------------------------------------------------

describe('StatusBadge', () => {
  const KINDS = [
    ['suggested', 'financeReconcileBadgeSuggested'],
    ['byRule', 'financeReconcileBadgeByRule'],
    ['difference', 'financeReconcileBadgeDifference'],
    ['reconciled', 'financeReconcileBadgeReconciled'],
    ['pending', 'financeReconcileBadgePending'],
    ['invoice', 'financeReconcileBadgeInvoice'],
    ['partial', 'financeReconcileBadgePartial'],
  ];

  it.each(KINDS)('renders the i18n label for kind "%s"', (kind, labelKey) => {
    render(<StatusBadge kind={kind} />);
    expect(screen.getByText(labelKey)).toBeInTheDocument();
  });

  it('falls back to the pending label for an unknown kind', () => {
    render(<StatusBadge kind="not-a-kind" />);
    expect(screen.getByText('financeReconcileBadgePending')).toBeInTheDocument();
  });

  it('falls back to the pending label when no kind is given', () => {
    render(<StatusBadge />);
    expect(screen.getByText('financeReconcileBadgePending')).toBeInTheDocument();
  });

  it('renders the label override instead of the mapped text', () => {
    // The modal's "by rule" badge appends the rule name, which no static key can express.
    render(<StatusBadge kind="byRule" label="financeReconcileAutomatchBadgeByRule Impuestos" />);
    expect(screen.getByText('financeReconcileAutomatchBadgeByRule Impuestos')).toBeInTheDocument();
    expect(screen.queryByText('financeReconcileBadgeByRule')).toBeNull();
  });

  it('keeps the palette override-independent — the kind still styles an overridden label', () => {
    const { container: overridden } = render(<StatusBadge kind="difference" label="0,38 €" />);
    const { container: plain } = render(<StatusBadge kind="difference" />);
    expect(overridden.firstChild.className).toBe(plain.firstChild.className);
  });

  it('gives a suggestion and a difference visibly different styling', () => {
    // The regression this whole module exists for: two groups whose consequences differ must not
    // render as the same pill. Comparing the two classNames avoids pinning the exact palette.
    const { container: suggested } = render(<StatusBadge kind="suggested" />);
    const { container: difference } = render(<StatusBadge kind="difference" />);
    expect(suggested.firstChild.className).not.toBe(difference.firstChild.className);
  });
});

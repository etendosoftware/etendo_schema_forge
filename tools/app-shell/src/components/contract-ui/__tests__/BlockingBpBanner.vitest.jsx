import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlockingBpBanner } from '../BlockingBpBanner.jsx';
import { useCurrency } from '@/hooks/useCurrency';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// formatCurrency's own separator/symbol-placement behavior is covered by its own
// suite (formatCurrency.test.js) — mocked here deterministically so this suite only
// asserts what BlockingBpBanner itself is responsible for: calling formatCurrency
// with the extracted amount + currencyCode, and rebuilding the sentence with an
// explicit space (ETP-5024 follow-up bug).
vi.mock('@/lib/formatCurrency.js', () => ({
  formatCurrency: (currencyCode, value) => `${currencyCode}:${value.toFixed(2)}`,
}));

// ETP-5024 blocker 2: the credit-limit callout fires while creating a brand-new,
// unsaved document, where `data['currency$_identifier']` (the `currencyCode` prop)
// genuinely doesn't exist yet — so BlockingBpBanner falls back to the session-level
// `useCurrency()` hook. Mocked here (not a real CurrencyProvider) so each test can
// control its return value independently; defaults to `null` (no session currency
// resolved), matching the real hook's behavior before the session endpoint answers.
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: vi.fn(() => null),
}));

const ON_HOLD = { kind: 'onHold', text: 'Selected Business Partner is on hold' };
const CREDIT_LIMIT = { kind: 'creditLimit', text: 'Business Partner credit limit exceeded' };

describe('BlockingBpBanner (ETP-5024)', () => {
  it('renders nothing when neither source reports a condition', () => {
    render(<BlockingBpBanner calloutResult={null} blockingCondition={null} completionSignal={0} recordId="doc-1" />);
    expect(screen.queryByTestId('bp-blocking-banner')).toBeNull();
  });

  it('renders the banner text when calloutResult carries a blockingCondition', () => {
    render(
      <BlockingBpBanner
        calloutResult={{ triggerField: 'businessPartner', blockingCondition: ON_HOLD }}
        blockingCondition={null}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    const banner = screen.getByTestId('bp-blocking-banner');
    expect(banner).toHaveTextContent('Selected Business Partner is on hold');
  });

  it('renders the banner text when the entity-side blockingCondition (process failure) is set', () => {
    render(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={CREDIT_LIMIT}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    const banner = screen.getByTestId('bp-blocking-banner');
    expect(banner).toHaveTextContent('Business Partner credit limit exceeded');
  });

  it('prefers/keeps the condition when the process-side source raises it after the callout-side already rendered', () => {
    const { rerender } = render(
      <BlockingBpBanner
        calloutResult={{ triggerField: 'businessPartner', blockingCondition: ON_HOLD }}
        blockingCondition={null}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toHaveTextContent('on hold');

    rerender(
      <BlockingBpBanner
        calloutResult={{ triggerField: 'businessPartner', blockingCondition: ON_HOLD }}
        blockingCondition={CREDIT_LIMIT}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toHaveTextContent('credit limit');
  });

  it('clears when the user selects a different Business Partner (callout fires again without the condition)', () => {
    const { rerender } = render(
      <BlockingBpBanner
        calloutResult={{ triggerField: 'businessPartner', blockingCondition: CREDIT_LIMIT }}
        blockingCondition={null}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();

    // A new businessPartner callout came back WITHOUT the condition — a new
    // object reference so the effect re-fires even though the shape looks similar.
    rerender(
      <BlockingBpBanner
        calloutResult={{ triggerField: 'businessPartner', blockingCondition: null }}
        blockingCondition={null}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.queryByTestId('bp-blocking-banner')).toBeNull();
  });

  it('does NOT clear on a callout for an unrelated field (only businessPartner clears it)', () => {
    const { rerender } = render(
      <BlockingBpBanner
        calloutResult={{ triggerField: 'businessPartner', blockingCondition: CREDIT_LIMIT }}
        blockingCondition={null}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();

    rerender(
      <BlockingBpBanner
        calloutResult={{ triggerField: 'someOtherField', blockingCondition: null }}
        blockingCondition={null}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();
  });

  it('clears when recordId changes (navigated to a different record)', () => {
    const { rerender } = render(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={ON_HOLD}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();

    rerender(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={ON_HOLD}
        completionSignal={0}
        recordId="doc-2"
      />,
    );
    expect(screen.queryByTestId('bp-blocking-banner')).toBeNull();
  });

  // Bug found in manual testing: on a NEW (unsaved, "Nuevo") record, the banner
  // correctly appeared after selecting a blocked BP — then hitting Guardar (Save)
  // made it disappear. FIRST fix attempt assumed `recordId` was falsy/undefined
  // pre-Save and only guarded a falsy -> truthy transition — that fix's own unit
  // test (below, now corrected) used `recordId={undefined}` and passed, but the
  // bug was STILL live in the browser. Root cause, found only via live
  // instrumentation: `DetailView.jsx` passes `recordId: data?.id || recordId`,
  // and the OUTER `recordId` is React Router's `:recordId` route param, which is
  // the literal STRING `'new'` while creating a document — never falsy (see
  // `DetailView.jsx`'s own `const isNew = recordId === 'new'`, and
  // `runtime-routes.jsx`'s `:windowName/:recordId` route). So the real pre-Save
  // value is the truthy string `'new'`, and `'new'` -> `<real id>` is "two
  // different truthy ids" under the naive check — exactly the "genuine record
  // switch" case the effect is supposed to detect — which wiped the banner on
  // every plain Save. `isFirstSaveOfNewRecord` in BlockingBpBanner.jsx now
  // excludes `'new'` explicitly as a real id, so this one transition is exempt.
  it('does NOT clear the banner when a new record is first assigned an id on Save (route sentinel "new" -> real id)', () => {
    const { rerender } = render(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={CREDIT_LIMIT}
        completionSignal={0}
        recordId="new"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();

    // First Save: the record acquires its real id for the first time — same
    // in-progress record, not a navigation to a different one.
    rerender(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={CREDIT_LIMIT}
        completionSignal={0}
        recordId="new-doc-id-123"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();
  });

  // Defensive coverage for a truly absent/falsy pre-Save value too (not just the
  // real-world 'new' sentinel above) — belt and braces in case some future call
  // site ever passes recordId={undefined} pre-Save instead of the route's 'new'.
  it('does NOT clear the banner on a falsy/undefined -> truthy recordId transition either', () => {
    const { rerender } = render(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={CREDIT_LIMIT}
        completionSignal={0}
        recordId={undefined}
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();

    rerender(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={CREDIT_LIMIT}
        completionSignal={0}
        recordId="new-doc-id-123"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();
  });

  it('clears when switching between two genuinely different EXISTING records (truthy -> different truthy)', () => {
    const { rerender } = render(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={ON_HOLD}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();

    rerender(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={ON_HOLD}
        completionSignal={0}
        recordId="doc-2"
      />,
    );
    expect(screen.queryByTestId('bp-blocking-banner')).toBeNull();
  });

  // "Nuevo" after a loaded record: ListView/DetailView navigate to
  // `/${windowName}/new`, so the route's recordId param becomes the literal
  // string "new" — a genuine truthy -> different-truthy switch away from the
  // previously loaded record's real id, so it still clears through the SAME
  // recordId-switch branch (not a special case). useEntity's handleNew also
  // resets its own `blockingCondition` state to null in parallel (see
  // useEntity.js ETP-5024 comment), so the two mechanisms agree.
  it('clears when starting a new record ("Nuevo") after a real record was loaded (id -> "new")', () => {
    const { rerender } = render(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={ON_HOLD}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();

    rerender(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={null}
        completionSignal={0}
        recordId="new"
      />,
    );
    expect(screen.queryByTestId('bp-blocking-banner')).toBeNull();
  });

  it('clears when completionSignal bumps (document completed successfully)', () => {
    const { rerender } = render(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={ON_HOLD}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();

    rerender(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={ON_HOLD}
        completionSignal={1}
        recordId="doc-1"
      />,
    );
    expect(screen.queryByTestId('bp-blocking-banner')).toBeNull();
  });

  it('does NOT clear on mount just because completionSignal starts at 0 (0 -> 0 is not a change)', () => {
    render(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={ON_HOLD}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    expect(screen.getByTestId('bp-blocking-banner')).toBeInTheDocument();
  });

  it('renders InfoBanner with a warning tone (non-dismissible)', () => {
    render(
      <BlockingBpBanner
        calloutResult={null}
        blockingCondition={ON_HOLD}
        completionSignal={0}
        recordId="doc-1"
      />,
    );
    // No dismiss button — InfoBanner only renders one when `dismissible` is passed.
    expect(screen.queryByTestId('info-banner-dismiss')).toBeNull();
  });

  // Bug found in manual testing (Sales Invoice, BP over its credit limit): the
  // banner showed "Aviso: Crédito limite superado4912.6" — no space, and the
  // amount was raw `Double.toString()` output (no thousands separator, no fixed
  // decimals, no currency symbol). `detectBlockingBpCondition` (blockingBpConditions.js)
  // now strips the trailing number off `text` and returns it separately as
  // `amount`; this component is responsible for formatting it back in via
  // `formatCurrency` and rebuilding the sentence with an explicit space.
  describe('creditLimit amount formatting (ETP-5024 follow-up bug)', () => {
    it('formats the extracted amount through formatCurrency and rebuilds the sentence with a space (Spanish source message)', () => {
      render(
        <BlockingBpBanner
          calloutResult={null}
          blockingCondition={{ kind: 'creditLimit', text: 'Aviso: Crédito limite superado', amount: 4912.6 }}
          completionSignal={0}
          recordId="doc-1"
          currencyCode="USD"
        />,
      );
      const banner = screen.getByTestId('bp-blocking-banner');
      expect(banner).toHaveTextContent('Aviso: Crédito limite superado USD:4912.60');
      // No raw unformatted number leaked straight into the DOM.
      expect(banner.textContent).not.toContain('superado4912.6');
    });

    it('formats the extracted amount through formatCurrency (English source message)', () => {
      render(
        <BlockingBpBanner
          calloutResult={null}
          blockingCondition={{ kind: 'creditLimit', text: 'Credit Limit over by', amount: 4912.6 }}
          completionSignal={0}
          recordId="doc-1"
          currencyCode="USD"
        />,
      );
      const banner = screen.getByTestId('bp-blocking-banner');
      expect(banner).toHaveTextContent('Credit Limit over by USD:4912.60');
    });

    // ETP-5024 blocker 2: a REVIEW pass found this used to drop the amount
    // entirely, which silently loses the figure on the ticket's PRIMARY scenario
    // (a brand-new, unsaved document, where there is no `currency$_identifier`
    // yet and — in this test — no session-level currency resolved either). The
    // fixed behavior shows the raw unformatted amount rather than a truncated
    // sentence with no number at all.
    it('falls back to the raw unformatted amount (never drops it) when no currency code is available from either source', () => {
      render(
        <BlockingBpBanner
          calloutResult={null}
          blockingCondition={{ kind: 'creditLimit', text: 'Aviso: Crédito limite superado', amount: 4912.6 }}
          completionSignal={0}
          recordId="doc-1"
          currencyCode={null}
        />,
      );
      const banner = screen.getByTestId('bp-blocking-banner');
      expect(banner).toHaveTextContent('Aviso: Crédito limite superado 4912.6');
    });

    it('renders the label as-is when the message had no trailing amount to extract', () => {
      render(
        <BlockingBpBanner
          calloutResult={null}
          blockingCondition={{ kind: 'creditLimit', text: 'Business Partner credit limit exceeded', amount: null }}
          completionSignal={0}
          recordId="doc-1"
          currencyCode="USD"
        />,
      );
      const banner = screen.getByTestId('bp-blocking-banner');
      expect(banner).toHaveTextContent('Business Partner credit limit exceeded');
    });

    it('ignores currencyCode for the onHold condition (no amount to format)', () => {
      render(
        <BlockingBpBanner
          calloutResult={null}
          blockingCondition={ON_HOLD}
          completionSignal={0}
          recordId="doc-1"
          currencyCode="USD"
        />,
      );
      const banner = screen.getByTestId('bp-blocking-banner');
      expect(banner).toHaveTextContent('Selected Business Partner is on hold');
    });
  });

  // ETP-5024 blocker 2: on a brand-new, unsaved document `data` is `hook.editing`
  // (DetailView.jsx), which has no `currency$_identifier` yet, so the
  // `currencyCode` prop resolved by `resolveHeaderContent` is `null` at exactly the
  // moment the credit-limit callout can fire. These tests assert the FORMATTED
  // AMOUNT actually appears via the session-level `useCurrency()` fallback — the
  // gap a REVIEW pass found: the old suite never asserted on the amount at all,
  // and mocked formatCurrency away entirely, so this exact bug had zero coverage.
  describe('session-level currency fallback for a brand-new/unsaved document (ETP-5024 blocker 2)', () => {
    it('formats the amount via useCurrency() when currencyCode prop is null (new, unsaved document)', () => {
      useCurrency.mockReturnValue('EUR');
      render(
        <BlockingBpBanner
          calloutResult={null}
          blockingCondition={{ kind: 'creditLimit', text: 'Aviso: Crédito limite superado', amount: 4912.6 }}
          completionSignal={0}
          recordId="new"
          currencyCode={null}
        />,
      );
      const banner = screen.getByTestId('bp-blocking-banner');
      expect(banner).toHaveTextContent('Aviso: Crédito limite superado EUR:4912.60');
      useCurrency.mockReturnValue(null);
    });

    it('prefers the header-derived currencyCode prop over the session-level fallback when both are present', () => {
      useCurrency.mockReturnValue('EUR');
      render(
        <BlockingBpBanner
          calloutResult={null}
          blockingCondition={{ kind: 'creditLimit', text: 'Aviso: Crédito limite superado', amount: 4912.6 }}
          completionSignal={0}
          recordId="doc-1"
          currencyCode="USD"
        />,
      );
      const banner = screen.getByTestId('bp-blocking-banner');
      expect(banner).toHaveTextContent('Aviso: Crédito limite superado USD:4912.60');
      useCurrency.mockReturnValue(null);
    });
  });
});

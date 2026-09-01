import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlockingBpBanner } from '../BlockingBpBanner.jsx';

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

    it('drops the amount entirely (shows only the label) when currencyCode is not available', () => {
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
      expect(banner).toHaveTextContent('Aviso: Crédito limite superado');
      expect(banner.textContent).not.toContain('4912');
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
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlockingBpBanner } from '../BlockingBpBanner.jsx';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
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
});

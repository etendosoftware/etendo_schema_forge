/**
 * ListProgressBar — the indeterminate sliding bar shown while a list refreshes over rows it
 * already has on screen.
 *
 * Extracted verbatim out of ListView's inline JSX so the hand-rolled tables (the
 * financial-account detail tabs, ListModalWindow, ReconciliationSplitPanel) can show the same
 * affordance. Two things must hold for every one of those call sites and are locked here:
 *   - ListView's original `list-progress-bar` testid survives the extraction as the default,
 *     so nothing that already targeted it breaks;
 *   - every other host can override it, because several bars can be mounted in the same
 *     document (a tab inside the account detail page) and E2E needs to tell them apart.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { ListProgressBar } from '../ListProgressBar.jsx';

describe('ListProgressBar — testid contract', () => {
  it('defaults to the list-progress-bar testid inherited from ListView', () => {
    render(<ListProgressBar />);
    expect(screen.getByTestId('list-progress-bar')).toBeInTheDocument();
  });

  it('accepts a per-host testId override', () => {
    render(<ListProgressBar testId="movements-progress-bar" />);
    expect(screen.getByTestId('movements-progress-bar')).toBeInTheDocument();
    // The override replaces the default — it must not leave a second, ambiguous node behind.
    expect(screen.queryByTestId('list-progress-bar')).not.toBeInTheDocument();
  });

  it('keeps each mounted bar addressable when several hosts render one at once', () => {
    render(
      <>
        <ListProgressBar testId="statements-progress-bar" />
        <ListProgressBar testId="reconciliation-progress-bar" />
      </>,
    );
    expect(screen.getByTestId('statements-progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('reconciliation-progress-bar')).toBeInTheDocument();
  });
});

describe('ListProgressBar — accessibility', () => {
  it('exposes the bar as a progressbar to assistive tech', () => {
    render(<ListProgressBar />);
    expect(screen.getByRole('progressbar')).toBe(screen.getByTestId('list-progress-bar'));
  });

  it('stays indeterminate — no value is announced while the fetch is in flight', () => {
    render(<ListProgressBar />);
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).not.toHaveAttribute('aria-valuetext');
  });
});

describe('ListProgressBar — markup', () => {
  it('renders the animated inner track driven by the sf-list-progress keyframes', () => {
    const { container } = render(<ListProgressBar />);
    const bar = screen.getByTestId('list-progress-bar');
    const inner = bar.firstElementChild;
    expect(inner).not.toBeNull();
    expect(inner.getAttribute('style')).toContain('sf-list-progress');
    // The keyframes travel with the component (no global stylesheet dependency), otherwise
    // the bar renders frozen in every host that is not ListView.
    const style = container.querySelector('style');
    expect(style).not.toBeNull();
    expect(style.textContent).toContain('@keyframes sf-list-progress');
  });

  it('is purely presentational — it renders no text of its own to translate', () => {
    render(<ListProgressBar />);
    expect(screen.getByTestId('list-progress-bar')).toHaveTextContent('');
  });
});

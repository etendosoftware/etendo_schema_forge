/**
 * ETP-4972 — SelectionToolbar is the dumb, viewport-fixed "shell" every
 * bulk-selection call site now renders through (ListView, DetailView's two
 * bars, AmortizationLinesTable, AssetsAmortizationPanel, the Financial
 * Accounts bulk-delete bar, PeriodsExpandablePanel, ...). This file covers
 * ONLY the shell's own contract — visibility, portaling, children/dividers,
 * and the close button — not any single caller's action buttons.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectionToolbar from '../SelectionToolbar.jsx';

describe('SelectionToolbar', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(
      <SelectionToolbar visible={false} onClose={vi.fn()} closeTitle="close">
        <span>content</span>
      </SelectionToolbar>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('portals to document.body when visible, not inline in the render container', () => {
    const { container } = render(
      <SelectionToolbar visible closing={false} onClose={vi.fn()} closeTitle="close">
        <span>content</span>
      </SelectionToolbar>,
    );
    // The render container (a fresh <div> RTL mounts into) stays empty — the
    // bar's actual DOM lives elsewhere, appended straight to document.body.
    expect(container).toBeEmptyDOMElement();
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByText('content').closest('body')).toBe(document.body);
  });

  it('renders each top-level child as its own segment, with a divider after every one (the last one doubling as the separator before the close button)', () => {
    render(
      <SelectionToolbar visible onClose={vi.fn()} closeTitle="close">
        <span>segment-one</span>
        <span>segment-two</span>
      </SelectionToolbar>,
    );
    expect(screen.getByText('segment-one')).toBeInTheDocument();
    expect(screen.getByText('segment-two')).toBeInTheDocument();
    // One divider (aria-hidden span) after each of the 2 children — the last
    // one is what visually separates the final segment from the close button,
    // there's no extra divider on top of it.
    const dividers = document.querySelectorAll('[aria-hidden="true"]');
    expect(dividers.length).toBe(2);
  });

  it('renders a single divider for a single child (doubling as the separator before the close button)', () => {
    render(
      <SelectionToolbar visible onClose={vi.fn()} closeTitle="close">
        <span>only-segment</span>
      </SelectionToolbar>,
    );
    const dividers = document.querySelectorAll('[aria-hidden="true"]');
    expect(dividers.length).toBe(1);
  });

  it('the trailing close (X) button calls onClose when clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SelectionToolbar visible onClose={onClose} closeTitle="close">
        <span>content</span>
      </SelectionToolbar>,
    );
    await user.click(screen.getByTestId('SelectionToolbar__close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button carries the closeTitle as both title and aria-label', () => {
    render(
      <SelectionToolbar visible onClose={vi.fn()} closeTitle="close-tooltip">
        <span>content</span>
      </SelectionToolbar>,
    );
    const closeButton = screen.getByTitle('close-tooltip');
    expect(closeButton).toHaveAttribute('aria-label', 'close-tooltip');
  });

  it('applies the appear animation class by default and the dismiss class when closing', () => {
    const { rerender } = render(
      <SelectionToolbar visible closing={false} onClose={vi.fn()} closeTitle="close">
        <span>content</span>
      </SelectionToolbar>,
    );
    expect(document.querySelector('.lines-bar-appear')).toBeTruthy();
    expect(document.querySelector('.lines-bar-dismiss')).toBeFalsy();

    rerender(
      <SelectionToolbar visible closing onClose={vi.fn()} closeTitle="close">
        <span>content</span>
      </SelectionToolbar>,
    );
    expect(document.querySelector('.lines-bar-dismiss')).toBeTruthy();
    expect(document.querySelector('.lines-bar-appear')).toBeFalsy();
  });

  it('ignores falsy children (no divider/segment rendered for them)', () => {
    render(
      <SelectionToolbar visible onClose={vi.fn()} closeTitle="close">
        <span>real-segment</span>
        {false}
        {null}
        {undefined}
      </SelectionToolbar>,
    );
    expect(screen.getByText('real-segment')).toBeInTheDocument();
    // Only the one real (non-falsy) segment produces a divider.
    const dividers = document.querySelectorAll('[aria-hidden="true"]');
    expect(dividers.length).toBe(1);
  });
});

/**
 * Regression guard for the actual ETP-4972 bug: the old LinesSelectionBar
 * positioned itself from a measured DOM rect (`getBoundingClientRect()` on a
 * sentinel), which silently broke once that sentinel scrolled out of view on
 * a long list. SelectionToolbar must own its position outright — true
 * `position: fixed` coordinates, never derived from a ref/rect measurement.
 * Asserted here as a DOM-level check (not source-reading) so a future edit
 * that reintroduces a ref-based position — even one that keeps the source
 * text superficially different from the old implementation — still fails
 * this test.
 */
describe('SelectionToolbar — no DOM-measurement-based positioning (ETP-4972 regression guard)', () => {
  it('the fixed-position wrapper carries static bottom/left/transform styles, independent of any element size or scroll state', () => {
    render(
      <SelectionToolbar visible onClose={vi.fn()} closeTitle="close">
        <span>content</span>
      </SelectionToolbar>,
    );
    const fixedWrapper = screen.getByText('content').closest('.fixed');
    expect(fixedWrapper).toBeTruthy();
    expect(fixedWrapper).toHaveStyle({ bottom: '24px', left: '50%' });
    expect(fixedWrapper.style.transform).toMatch(/translateX\(-50%\)/);
  });
});

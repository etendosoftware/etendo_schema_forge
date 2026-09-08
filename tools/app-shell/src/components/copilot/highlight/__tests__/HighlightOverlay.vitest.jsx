import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Every chrome string is echoed back with a marker so the assertions below
// prove the text came THROUGH i18n, not from a hardcoded literal. The keys
// themselves are asserted to exist in all three dictionaries by
// src/locales/__tests__/etp5211-copilot-highlight-keys.vitest.js.
vi.mock('@/i18n', () => ({
  useUI: () => key => `ui:${key}`,
}));

import { HighlightProvider, useHighlight } from '../HighlightContext.jsx';
import { HighlightOverlay } from '../HighlightOverlay.jsx';

/**
 * ETP-5211 — visual half of the Copilot's `highlight_element` tool.
 *
 * The overlay is a portal on document.body that rings the element the model is
 * talking about and shows its explanation. It must never intercept the user's
 * pointer (this tool explains, it never acts) and must leave no listener behind
 * when it unmounts — it lives for the whole app session in AppLayout.
 */

const TARGET_RECT = { top: 100, left: 60, width: 200, height: 24 };

function Harness({ onReady }) {
  const highlight = useHighlight();
  onReady(highlight);
  return <HighlightOverlay />;
}

function renderOverlay() {
  let api = null;
  const result = render(
    <HighlightProvider>
      <Harness onReady={value => { api = value; }} />
    </HighlightProvider>
  );
  return { ...result, get api() { return api; } };
}

describe('HighlightOverlay', () => {
  let target;
  let addSpy;
  let removeSpy;

  beforeEach(() => {
    document.body.innerHTML = '<input id="bp" data-testid="field-businessPartner" />';
    target = document.getElementById('bp');
    target.getBoundingClientRect = () => ({ ...TARGET_RECT });
    target.scrollIntoView = vi.fn();
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Nothing is removed here on purpose: React Testing Library's automatic
    // cleanup unmounts its own container afterwards, and wiping document.body
    // first makes that removal throw. beforeEach resets the body instead.
  });

  it('renders nothing while no element is highlighted', () => {
    renderOverlay();
    expect(screen.queryByTestId('copilot-highlight-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('copilot-highlight-ring')).not.toBeInTheDocument();
  });

  it('renders the ring once an element is highlighted', async () => {
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target }));
    expect(screen.getByTestId('copilot-highlight-ring')).toBeInTheDocument();
  });

  it('scrolls the highlighted element into view', async () => {
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target }));
    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it('lets the pointer through to the app underneath', async () => {
    // This tool points at the UI; the user must keep using it while it points.
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target }));
    expect(screen.getByTestId('copilot-highlight-overlay').className)
      .toContain('pointer-events-none');
  });

  it('shows no note when the model sent none', async () => {
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target }));
    expect(screen.queryByTestId('copilot-highlight-note')).not.toBeInTheDocument();
  });

  it("renders the model's note next to the element", async () => {
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target, note: 'Pick the customer here' }));
    expect(screen.getByTestId('copilot-highlight-note')).toHaveTextContent('Pick the customer here');
  });

  it('announces the note politely for screen readers', async () => {
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target, note: 'Pick the customer here' }));
    const note = screen.getByTestId('copilot-highlight-note');
    expect(note).toHaveAttribute('role', 'status');
    expect(note).toHaveAttribute('aria-live', 'polite');
  });

  it('takes every chrome string from i18n', async () => {
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target, note: 'Pick the customer here' }));
    expect(screen.getByTestId('copilot-highlight-note'))
      .toHaveAttribute('aria-label', 'ui:copilotHighlightNoteLabel');
    const dismiss = screen.getByTestId('copilot-highlight-dismiss');
    expect(dismiss).toHaveAttribute('aria-label', 'ui:copilotHighlightDismiss');
    expect(dismiss).toHaveAttribute('title', 'ui:copilotHighlightDismiss');
  });

  it('renders into document.body so it can point inside a modal', async () => {
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target }));
    expect(screen.getByTestId('copilot-highlight-overlay').parentElement).toBe(document.body);
  });

  it('clears the highlight when the dismiss button is pressed', async () => {
    const user = userEvent.setup();
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target, note: 'Pick the customer here' }));
    await user.click(screen.getByTestId('copilot-highlight-dismiss'));
    expect(screen.queryByTestId('copilot-highlight-overlay')).not.toBeInTheDocument();
  });

  it('clears the highlight on Escape', async () => {
    const user = userEvent.setup();
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target, note: 'Pick the customer here' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('copilot-highlight-overlay')).not.toBeInTheDocument();
  });

  it('ignores other keys', async () => {
    const user = userEvent.setup();
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target, note: 'Pick the customer here' }));
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('copilot-highlight-overlay')).toBeInTheDocument();
  });

  it('stops rendering when the highlighted element leaves the document', async () => {
    const view = renderOverlay();
    await act(() => view.api.highlight({ element: target }));
    target.remove();
    await act(() => window.dispatchEvent(new Event('resize')));
    expect(screen.queryByTestId('copilot-highlight-overlay')).not.toBeInTheDocument();
  });

  describe('listener hygiene', () => {
    const TRACKED = ['scroll', 'resize', 'keydown'];

    function countsFor(spy) {
      return TRACKED.reduce((accumulator, type) => {
        accumulator[type] = spy.mock.calls.filter(call => call[0] === type).length;
        return accumulator;
      }, {});
    }

    it('removes every scroll, resize and keydown listener it added on unmount', async () => {
      const view = renderOverlay();
      await act(() => view.api.highlight({ element: target, note: 'Pick the customer here' }));
      const added = countsFor(addSpy);
      expect(added.scroll).toBeGreaterThan(0);
      expect(added.resize).toBeGreaterThan(0);
      expect(added.keydown).toBeGreaterThan(0);
      view.unmount();
      expect(countsFor(removeSpy)).toEqual(added);
    });

    it('captures scroll so a field inside any scroll container stays ringed', async () => {
      const view = renderOverlay();
      await act(() => view.api.highlight({ element: target }));
      const scrollCall = addSpy.mock.calls.find(call => call[0] === 'scroll');
      expect(scrollCall[2]).toBe(true);
      view.unmount();
      const removal = removeSpy.mock.calls.find(call => call[0] === 'scroll');
      // A capture listener removed without the capture flag is never removed.
      expect(removal[2]).toBe(true);
    });

    it('removes the previous element listeners when the highlight is replaced', async () => {
      const other = document.createElement('button');
      other.getBoundingClientRect = () => ({ top: 10, left: 10, width: 50, height: 20 });
      other.scrollIntoView = vi.fn();
      document.body.appendChild(other);
      const view = renderOverlay();
      await act(() => view.api.highlight({ element: target }));
      await act(() => view.api.highlight({ element: other }));
      view.unmount();
      expect(countsFor(removeSpy)).toEqual(countsFor(addSpy));
    });
  });
});

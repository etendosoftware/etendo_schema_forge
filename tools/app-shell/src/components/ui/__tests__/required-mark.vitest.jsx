import { render, screen } from '@testing-library/react';
import RequiredMark from '../required-mark.jsx';

/**
 * RequiredMark (ETP-5103) — the shared mandatory-field asterisk.
 *
 * The component is three lines long, but each of its properties is load-bearing and
 * every one of them broke something real while ETP-5103 was being built:
 *
 *  - It must render an inline <span> holding ONLY "*", appended after the label text.
 *    That is what keeps Testing Library's text queries working on the plain label key
 *    (they read an element's DIRECT text nodes) while Playwright's getByText, which
 *    matches the full textContent, starts seeing "País*" — the asymmetry that broke
 *    7 integration specs until their locators were taught the trailing `\*?`.
 *  - It must forward unknown props to the DOM, because the repo-wide data-testid
 *    codemod stamps one on every component usage and the pre-push check fails if it
 *    never reaches the rendered element.
 *  - Its own style must survive a caller passing one, which is why `style` sits after
 *    the prop spread in the implementation.
 *
 * These tests pin all three so a future "simplification" cannot quietly undo them.
 */

const TESTID = 'required-mark';
const LABEL_TEXT = 'Nombre';

/**
 * Renders the marker the way every real call site does: immediately after a field
 * label's text, inside the same element. Returns the marker element itself.
 */
function renderMark(props = {}) {
  render(
    <label>{LABEL_TEXT}<RequiredMark data-testid={TESTID} {...props} /></label>,
  );
  return screen.getByTestId(TESTID);
}

describe('RequiredMark', () => {
  it('renders a single asterisk as its only content', () => {
    expect(renderMark().textContent).toBe('*');
  });

  it('renders an inline span, not a block element', () => {
    expect(renderMark().tagName).toBe('SPAN');
  });

  it('appends the asterisk after the label text without absorbing it', () => {
    const mark = renderMark();
    const label = mark.parentElement;

    // The label reads "Nombre*" as a whole — what Playwright's getByText sees...
    expect(label.textContent).toBe(`${LABEL_TEXT}*`);
    // ...while its own direct text node is still just the label — what Testing
    // Library's getByText sees, so existing queries on the plain key keep matching.
    expect(screen.getByText(LABEL_TEXT)).toBe(label);
  });

  it('carries the destructive colour token and the left margin', () => {
    const style = renderMark().getAttribute('style');
    expect(style).toContain('--destructive');
    expect(style).toContain('margin-left: 2px');
  });

  it('forwards extra props to the DOM so the data-testid codemod reaches the element', () => {
    // Not a redundant check of the helper: renderMark() locating the element AT ALL
    // is the assertion. A non-forwarding version of the component would make every
    // other test in this file fail to find it — this one names the reason.
    const mark = renderMark({ 'aria-hidden': 'true', title: 'required' });

    expect(mark.getAttribute('data-testid')).toBe(TESTID);
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.getAttribute('title')).toBe('required');
  });

  it('keeps its own colour when a caller passes a conflicting style', () => {
    const style = renderMark({ style: { color: 'blue', marginLeft: '99px' } }).getAttribute('style');

    expect(style).toContain('--destructive');
    expect(style).not.toContain('blue');
    expect(style).not.toContain('99px');
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { TruncatedText } from '../truncated-text.jsx';

/**
 * TruncatedText — the ellipsis + on-demand tooltip used by the reconciliation panels (ETP-4921).
 *
 * jsdom does no layout, so `scrollWidth` / `clientWidth` are both 0 on every element. Each test
 * stamps the pair it wants onto the rendered span, which is exactly the input the component reads
 * to decide whether there is hidden text worth revealing.
 */
const LONG = 'TRANSFERENCIA INMEDIATA A FAVOR DE Galder Romo CONCEPTO Factura Nº : 10001754 1000896';

const setMetrics = (el, scrollWidth, clientWidth) => {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
};

const renderText = (text = LONG) => {
  render(<TruncatedText text={text} data-testid="desc" />);
  return screen.getByTestId('desc');
};

describe('TruncatedText', () => {
  it('renders the text and asks the browser to ellipsise it', () => {
    const span = renderText();

    expect(span).toHaveTextContent(LONG);
    // `truncate` is the whole point: overflow-hidden + text-overflow-ellipsis + nowrap.
    expect(span.className).toContain('truncate');
  });

  it('reveals the full text on hover when the line is clipped', () => {
    const span = renderText();
    setMetrics(span, 640, 320);

    fireEvent.focus(span);

    // The tooltip is portalled, so it is found on document.body rather than inside the span.
    expect(screen.getByTestId('desc-tooltip')).toHaveTextContent(LONG);
  });

  // Repeating a label the reader can already see in full is noise, not help.
  it('stays silent when the text fits', () => {
    const span = renderText('Nómina');
    setMetrics(span, 80, 320);

    fireEvent.focus(span);

    expect(screen.queryByTestId('desc-tooltip')).toBeNull();
  });

  // Sub-pixel rounding routinely reports a text that fits exactly as 1px too wide.
  it('treats a one-pixel overflow as fitting', () => {
    const span = renderText();
    setMetrics(span, 321, 320);

    fireEvent.focus(span);

    expect(screen.queryByTestId('desc-tooltip')).toBeNull();
  });

  it('closes again once the pointer leaves', () => {
    const span = renderText();
    setMetrics(span, 640, 320);

    fireEvent.focus(span);
    expect(screen.getByTestId('desc-tooltip')).toBeInTheDocument();

    fireEvent.blur(span);
    expect(screen.queryByTestId('desc-tooltip')).toBeNull();
  });

  // It carries its own provider so it works in any tree — no caller setup required.
  it('needs no ambient TooltipProvider', () => {
    expect(() => render(<TruncatedText text="x" data-testid="solo" />)).not.toThrow();
  });
});

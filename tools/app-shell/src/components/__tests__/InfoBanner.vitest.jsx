import { render, screen, fireEvent } from '@testing-library/react';
import { InfoBanner } from '../InfoBanner.jsx';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

describe('InfoBanner', () => {
  it('renders children text', () => {
    render(<InfoBanner>Hello banner</InfoBanner>);
    expect(screen.getByText('Hello banner')).toBeTruthy();
  });

  it('applies info tone by default', () => {
    const { container } = render(<InfoBanner>msg</InfoBanner>);
    expect(container.firstChild.className).toContain('border-status-info-border');
  });

  it('applies warning tone', () => {
    const { container } = render(<InfoBanner tone="warning">msg</InfoBanner>);
    expect(container.firstChild.className).toContain('border-status-warning-border');
  });

  it('applies success tone', () => {
    const { container } = render(<InfoBanner tone="success">msg</InfoBanner>);
    expect(container.firstChild.className).toContain('border-status-success-border');
  });

  it('applies danger tone', () => {
    const { container } = render(<InfoBanner tone="danger">msg</InfoBanner>);
    expect(container.firstChild.className).toContain('border-destructive');
  });

  it('falls back to info tone for unknown tone value', () => {
    const { container } = render(<InfoBanner tone="unknown">msg</InfoBanner>);
    expect(container.firstChild.className).toContain('border-status-info-border');
  });

  it('does not render dismiss button when dismissible is false', () => {
    render(<InfoBanner dismissible={false}>msg</InfoBanner>);
    expect(screen.queryByTestId('info-banner-dismiss')).toBeNull();
  });

  it('renders dismiss button when dismissible is true', () => {
    render(<InfoBanner dismissible onDismiss={() => {}}>msg</InfoBanner>);
    expect(screen.getByTestId('info-banner-dismiss')).toBeTruthy();
  });

  // ETP-5245 — the default flipped from false to true. Every banner is closable unless its
  // caller opts out, so this is the assertion that pins the new default.
  it('renders the dismiss button by default, with no props at all', () => {
    render(<InfoBanner>msg</InfoBanner>);
    expect(screen.getByTestId('info-banner-dismiss')).toBeTruthy();
  });

  it('calls onDismiss when dismiss button clicked', () => {
    const onDismiss = vi.fn();
    render(<InfoBanner dismissible onDismiss={onDismiss}>msg</InfoBanner>);
    fireEvent.click(screen.getByTestId('info-banner-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses custom dismissTestId', () => {
    render(<InfoBanner dismissible dismissTestId="custom-dismiss" onDismiss={() => {}}>msg</InfoBanner>);
    expect(screen.getByTestId('custom-dismiss')).toBeTruthy();
  });

  it('passes extra className to container', () => {
    const { container } = render(<InfoBanner className="my-extra">msg</InfoBanner>);
    expect(container.firstChild.className).toContain('my-extra');
  });

  /**
   * ETP-5245 — `dismissible` used to be a PURE flag: it rendered a button and left the hiding to
   * the caller. Defaulting it to true without giving the component its own closed state would
   * have put an X on every existing banner that did nothing when clicked, because none of the
   * four call sites but ListModalWindow passes `onDismiss`. These tests pin both modes.
   */
  describe('uncontrolled dismissal (no onDismiss)', () => {
    it('hides itself when the dismiss button is clicked', () => {
      render(<InfoBanner>msg</InfoBanner>);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      expect(screen.queryByText('msg')).toBeNull();
      expect(screen.queryByTestId('info-banner-dismiss')).toBeNull();
    });

    it('stays hidden while the reopen signal does not change', () => {
      const { rerender } = render(<InfoBanner reopenSignal={0}>msg</InfoBanner>);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      rerender(<InfoBanner reopenSignal={0}>msg other render</InfoBanner>);
      expect(screen.queryByText('msg other render')).toBeNull();
    });

    it('reappears when the reopen signal changes', () => {
      const { rerender } = render(<InfoBanner reopenSignal={0}>msg</InfoBanner>);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      expect(screen.queryByText('msg')).toBeNull();
      rerender(<InfoBanner reopenSignal={1}>msg</InfoBanner>);
      expect(screen.getByText('msg')).toBeTruthy();
    });

    it('can be dismissed again after reopening', () => {
      const { rerender } = render(<InfoBanner reopenSignal={0}>msg</InfoBanner>);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      rerender(<InfoBanner reopenSignal={1}>msg</InfoBanner>);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      expect(screen.queryByText('msg')).toBeNull();
    });

    // A null signal must still record a dismissal — the NOT_DISMISSED sentinel exists precisely
    // so that null/undefined stay usable as ordinary signal values.
    it('records the dismissal even when the reopen signal is null', () => {
      const { rerender } = render(<InfoBanner reopenSignal={null}>msg</InfoBanner>);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      rerender(<InfoBanner reopenSignal={null}>msg</InfoBanner>);
      expect(screen.queryByText('msg')).toBeNull();
    });
  });

  describe('controlled dismissal (onDismiss supplied)', () => {
    it('does not hide itself — the caller owns visibility', () => {
      render(<InfoBanner onDismiss={() => {}}>msg</InfoBanner>);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      expect(screen.getByText('msg')).toBeTruthy();
    });

    it('ignores the reopen signal', () => {
      const onDismiss = vi.fn();
      const { rerender } = render(
        <InfoBanner onDismiss={onDismiss} reopenSignal={0}>msg</InfoBanner>);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      rerender(<InfoBanner onDismiss={onDismiss} reopenSignal={1}>msg</InfoBanner>);
      expect(screen.getByText('msg')).toBeTruthy();
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });
});

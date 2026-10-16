// @covers tools/app-shell/src/components/contract-ui/TabStripButton.jsx
//
// One button of DetailView's secondary tab strips. `disabledHint` turns it into a
// disabled tab that ignores clicks and explains why through its tooltip.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TabStripButton from '../TabStripButton.jsx';

const tMenu = (key) => key;

function renderButton(props = {}) {
  const onClick = vi.fn();
  const testId = props.testId || 'tab-custom:attachments';
  render(
    <TabStripButton
      iconKey="custom:attachments"
      label="attachments"
      count={null}
      isActive={false}
      onClick={onClick}
      tMenu={tMenu}
      testId={testId}
      {...props}
    />,
  );
  return { onClick, button: screen.getByTestId(testId) };
}

describe('TabStripButton', () => {
  describe('enabled (no disabledHint)', () => {
    it('renders the translated label and the count', () => {
      const { button } = renderButton({ count: 3 });
      expect(button).toHaveTextContent('attachments');
      expect(button).toHaveTextContent('3');
    });

    it('calls onClick when clicked', async () => {
      const user = userEvent.setup();
      const { onClick, button } = renderButton();
      await user.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('has no aria-disabled, no title and no disabled styling', () => {
      const { button } = renderButton();
      expect(button).not.toHaveAttribute('aria-disabled');
      expect(button).not.toHaveAttribute('title');
      expect(button.className).not.toMatch(/cursor-not-allowed/);
      expect(button.className).not.toMatch(/opacity-50/);
    });

    it('treats an explicit null disabledHint as enabled', async () => {
      const user = userEvent.setup();
      const { onClick, button } = renderButton({ disabledHint: null });
      await user.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(button).not.toHaveAttribute('aria-disabled');
    });
  });

  describe('disabled (with disabledHint)', () => {
    const HINT = 'attachmentsSaveFirstHint';

    it('ignores clicks', async () => {
      const user = userEvent.setup();
      const { onClick, button } = renderButton({ disabledHint: HINT });
      await user.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('exposes aria-disabled="true" and the hint as title', () => {
      const { button } = renderButton({ disabledHint: HINT });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('title', HINT);
    });

    it('keeps the native disabled attribute off so the tooltip still shows on hover', () => {
      const { button } = renderButton({ disabledHint: HINT });
      expect(button).not.toBeDisabled();
    });

    it('applies the disabled styling', () => {
      const { button } = renderButton({ disabledHint: HINT });
      expect(button.className).toMatch(/opacity-50/);
      expect(button.className).toMatch(/cursor-not-allowed/);
    });

    it('an empty-string hint still disables the tab (only null/undefined enable it)', async () => {
      const user = userEvent.setup();
      const { onClick, button } = renderButton({ disabledHint: '' });
      await user.click(button);
      expect(onClick).not.toHaveBeenCalled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('hover and active states (ETP-5649)', () => {
    it('enables showHoverLine by default and renders group class on button', () => {
      const { button } = renderButton();
      expect(button.className).toMatch(/\bgroup\b/);
    });

    it('renders inactive tab with gray text and transparent hover underline', () => {
      const { button } = renderButton({ isActive: false });
      expect(button.className).toContain('text-muted-foreground');
      expect(button.className).not.toContain('hover:text-foreground');
      const indicator = button.querySelector('span.transition-colors');
      expect(indicator).not.toBeNull();
      expect(indicator.className).toContain('bg-transparent');
      expect(indicator.className).toContain('group-hover:bg-muted-foreground/30');
      expect(indicator.className).not.toContain('bg-foreground');
    });

    it('renders active tab with dark text and solid foreground underline that does not change on hover', () => {
      const { button } = renderButton({ isActive: true });
      expect(button.className).toContain('text-foreground');
      const indicator = button.querySelector('span.transition-colors');
      expect(indicator).not.toBeNull();
      expect(indicator.className).toContain('bg-foreground');
      expect(indicator.className).not.toContain('group-hover:bg-muted-foreground/30');
    });

    it('matches active and hover indicator geometry when custom indicatorCls is passed (e.g. inlineEditable full-width)', () => {
      const customCls = 'absolute bottom-0 left-0 right-0 h-[2px] bg-foreground';
      const { button: inactiveBtn } = renderButton({ testId: 'tab-custom-inactive', isActive: false, indicatorCls: customCls });
      const inactiveIndicator = inactiveBtn.querySelector('span.transition-colors');
      expect(inactiveIndicator.className).toContain('absolute bottom-0 left-0 right-0 h-[2px]');
      expect(inactiveIndicator.className).not.toContain('left-2');
      expect(inactiveIndicator.className).toContain('group-hover:bg-muted-foreground/30');

      const { button: activeBtn } = renderButton({ testId: 'tab-custom-active', isActive: true, indicatorCls: customCls });
      const activeIndicator = activeBtn.querySelector('span.transition-colors');
      expect(activeIndicator.className).toContain('absolute bottom-0 left-0 right-0 h-[2px]');
      expect(activeIndicator.className).toContain('bg-foreground');
    });

    it('uses rounded default geometry when indicatorCls is not provided', () => {
      const { button } = renderButton({ isActive: false });
      const indicator = button.querySelector('span.transition-colors');
      expect(indicator.className).toContain('absolute bottom-0 left-2 right-2 h-0.5 rounded-full');
    });

    it('does not add hover underline on disabled tab', () => {
      const { button } = renderButton({ isActive: false, disabledHint: 'Not saved' });
      const indicator = button.querySelector('span.transition-colors');
      expect(indicator).not.toBeNull();
      expect(indicator.className).toContain('bg-transparent');
      expect(indicator.className).not.toContain('group-hover:bg-muted-foreground/30');
    });

    it('supports hoverDarkText when explicitly requested', () => {
      const { button } = renderButton({ isActive: false, hoverDarkText: true });
      expect(button.className).toContain('hover:text-foreground');
    });

    it('does not render inactive indicator when showHoverLine is false', () => {
      const { button: inactiveBtn } = renderButton({ testId: 'tab-nohover-inactive', isActive: false, showHoverLine: false });
      expect(inactiveBtn.querySelector('span.transition-colors')).toBeNull();
      expect(inactiveBtn.className).not.toMatch(/\bgroup\b/);

      const { button: activeBtn } = renderButton({ testId: 'tab-nohover-active', isActive: true, showHoverLine: false });
      const activeIndicator = activeBtn.querySelector('span.bg-foreground');
      expect(activeIndicator).not.toBeNull();
    });
  });
});

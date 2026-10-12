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
  render(
    <TabStripButton
      iconKey="custom:attachments"
      label="attachments"
      count={null}
      isActive={false}
      onClick={onClick}
      tMenu={tMenu}
      testId="tab-custom:attachments"
      {...props}
    />,
  );
  return { onClick, button: screen.getByTestId('tab-custom:attachments') };
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
});

/**
 * DetailDeleteButton — the header (detail view) delete trigger.
 *
 * Unit-level coverage of the button contract the detail toolbar relies on:
 * a non-submitting button addressed by `action-delete`, labelled by the given
 * title (tooltip and accessible name), rendering the Iconic trash icon, firing
 * `onClick` once per click, and carrying the Figma outline-destructive styling.
 * The DetailView wiring (confirm -> delete -> navigate) stays in
 * DetailView.confirmHeaderDelete.vitest.jsx.
 */
// @covers tools/app-shell/src/components/contract-ui/DetailDeleteButton.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailDeleteButton } from '../DetailDeleteButton.jsx';

function renderButton(props = {}) {
  const onClick = vi.fn();
  render(<DetailDeleteButton onClick={onClick} title="deleteRecord" {...props} />);
  return { onClick, button: screen.getByTestId('action-delete') };
}

describe('DetailDeleteButton', () => {
  it('renders a non-submitting button labelled by the title', () => {
    const { button } = renderButton({ title: 'deleteRecord' });

    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('title', 'deleteRecord');
    expect(screen.getByRole('button', { name: 'deleteRecord' })).toBe(button);
  });

  it('renders the Iconic trash icon inside the button, hidden from assistive tech', () => {
    const { button } = renderButton();

    const icon = screen.getByTestId('IconicTrashIcon__fa3275');
    expect(button).toContainElement(icon);
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('calls onClick exactly once per click', async () => {
    const user = userEvent.setup();
    const { onClick, button } = renderButton();

    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['pink outline border', 'border-[#FBB1C4]'],
    ['destructive foreground', 'text-[var(--status-destructive-fg)]'],
    ['destructive background on hover', 'hover:bg-[var(--status-destructive-bg)]'],
    ['double focus-visible ring', 'focus-visible:shadow-[0_0_0_2px_#FFFFFF,0_0_0_4px_#F53D6B]'],
    ['40px square size', 'h-10'],
  ])('carries the outline-destructive look: %s', (_label, token) => {
    const { button } = renderButton();

    expect(button.className.split(/\s+/)).toContain(token);
  });
});

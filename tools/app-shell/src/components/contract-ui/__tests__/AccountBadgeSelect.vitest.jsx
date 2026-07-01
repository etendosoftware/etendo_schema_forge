import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// i18n returns the key as-is (no hardcoded strings).
vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
}));

import { AccountBadge, AccountBadgeSelect } from '../AccountBadgeSelect.jsx';

// Radix Popover + cmdk need a few DOM APIs jsdom does not implement.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const OPTIONS = [
  { id: 'acc-572', code: '572', name: 'Bancos c/c' },
  { id: 'acc-5723', code: '5723', name: 'Bancos, cuenta puente' },
  { id: 'acc-626', code: '626', name: 'Servicios bancarios' },
];

describe('AccountBadge', () => {
  it('renders the grey code badge text', () => {
    render(<AccountBadge code="5723" />);
    expect(screen.getByText('5723')).toBeInTheDocument();
  });

  it('renders nothing when no code is provided', () => {
    const { container } = render(<AccountBadge code={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('AccountBadgeSelect', () => {
  it('renders the selected option as code badge + name', () => {
    render(
      <AccountBadgeSelect
        value="acc-5723"
        options={OPTIONS}
        data-testid="acct-select"
      />,
    );
    const root = screen.getByTestId('acct-select');
    expect(within(root).getByText('5723')).toBeInTheDocument();
    expect(within(root).getByText('Bancos, cuenta puente')).toBeInTheDocument();
  });

  it('renders the placeholder when no value is selected', () => {
    render(
      <AccountBadgeSelect
        value={null}
        options={OPTIONS}
        placeholder="Pick one"
        data-testid="acct-select"
      />,
    );
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('renders the label and a required asterisk', () => {
    render(
      <AccountBadgeSelect
        label="Cuenta a cobrar"
        required
        options={OPTIONS}
        data-testid="acct-select"
      />,
    );
    expect(screen.getByText('Cuenta a cobrar')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('opens the dropdown and fires onChange with the option id on selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AccountBadgeSelect
        value={null}
        options={OPTIONS}
        onChange={onChange}
        data-testid="acct-select"
      />,
    );

    await user.click(screen.getByRole('button'));
    // cmdk renders options in a portal; query the whole document.
    const item = await screen.findByText('Servicios bancarios');
    await user.click(item);

    expect(onChange).toHaveBeenCalledWith('acc-626');
  });

  it('filters the option list via the search input', async () => {
    const user = userEvent.setup();
    render(
      <AccountBadgeSelect
        value={null}
        options={OPTIONS}
        searchPlaceholder="Search…"
        data-testid="acct-select"
      />,
    );

    await user.click(screen.getByRole('button'));
    const search = await screen.findByPlaceholderText('Search…');
    await user.type(search, 'Servicios');

    expect(await screen.findByText('Servicios bancarios')).toBeInTheDocument();
    // The two "Bancos…" options are filtered out by cmdk scoring.
    expect(screen.queryByText('Bancos, cuenta puente')).not.toBeInTheDocument();
  });

  it('readOnly mode renders a static badge row without an interactive trigger', () => {
    render(
      <AccountBadgeSelect
        value="acc-572"
        options={OPTIONS}
        readOnly
        data-testid="acct-select"
      />,
    );
    const root = screen.getByTestId('acct-select');
    expect(within(root).getByText('572')).toBeInTheDocument();
    expect(within(root).getByText('Bancos c/c')).toBeInTheDocument();
    // No popover trigger button in read-only mode.
    expect(within(root).queryByRole('button')).toBeNull();
  });
});

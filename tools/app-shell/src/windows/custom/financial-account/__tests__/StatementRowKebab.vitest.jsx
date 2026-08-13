import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import { StatementRowKebab } from '../StatementRowKebab.jsx';

const DRAFT = { id: 'd1', status: 'DRAFT', processed: 'N' };
const PROCESSED = { id: 'p1', status: 'PENDING', processed: 'Y' };

function renderKebab(statement, overrides = {}) {
  const props = {
    statement,
    onProcess: vi.fn(),
    onReactivate: vi.fn(),
    ...overrides,
  };
  return { ...render(<StatementRowKebab {...props} />), props };
}

async function openMenu(user, id) {
  await user.click(screen.getByTestId(`statement-row-menu-${id}`));
}

describe('StatementRowKebab', () => {
  it('enables Procesar for a draft and fires the callback (Reactivar disabled)', async () => {
    const user = userEvent.setup();
    const { props } = renderKebab(DRAFT);
    await openMenu(user, 'd1');

    expect(screen.getByTestId('statement-row-reactivate')).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByTestId('statement-row-process'));
    expect(props.onProcess).toHaveBeenCalledWith(DRAFT);
  });

  it('disables Procesar for a processed statement', async () => {
    const user = userEvent.setup();
    const { props } = renderKebab(PROCESSED);
    await openMenu(user, 'p1');

    const process = screen.getByTestId('statement-row-process');
    expect(process).toHaveAttribute('aria-disabled', 'true');
    await user.click(process);
    expect(props.onProcess).not.toHaveBeenCalled();
  });

  it('enables Reactivate only for a processed statement and fires the callback', async () => {
    const user = userEvent.setup();
    const { props } = renderKebab(PROCESSED);
    await openMenu(user, 'p1');
    await user.click(screen.getByTestId('statement-row-reactivate'));
    expect(props.onReactivate).toHaveBeenCalledWith(PROCESSED);
  });

  it('disables Reactivate for a draft statement', async () => {
    const user = userEvent.setup();
    const { props } = renderKebab(DRAFT);
    await openMenu(user, 'd1');
    const reactivate = screen.getByTestId('statement-row-reactivate');
    expect(reactivate).toHaveAttribute('aria-disabled', 'true');
    await user.click(reactivate);
    expect(props.onReactivate).not.toHaveBeenCalled();
  });

  it('treats a statement with processed="N" as a draft even without DRAFT status', async () => {
    const user = userEvent.setup();
    const { props } = renderKebab({ id: 'x', status: 'PARTIAL', processed: 'N' });
    await openMenu(user, 'x');
    await user.click(screen.getByTestId('statement-row-process'));
    expect(props.onProcess).toHaveBeenCalled();
  });
});

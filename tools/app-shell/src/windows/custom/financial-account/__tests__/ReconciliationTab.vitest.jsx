import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReconciliationTab } from '../ReconciliationTab';

// Mock the heavy split panel — this unit only verifies the tab wires props through.
// `data-tolerance` / `data-gl-difference` exist so the difference-banner plumbing (which the tab
// derives, rather than passes straight through) is assertable at this level.
vi.mock('@/components/contract-ui/ReconciliationSplitPanel.jsx', () => ({
  ReconciliationSplitPanel: ({ accountId, currency, amountTolerance, glItemDifference }) => (
    <div
      data-testid="split-panel"
      data-account={accountId}
      data-currency={currency}
      data-tolerance={JSON.stringify(amountTolerance ?? null)}
      data-gl-difference={JSON.stringify(glItemDifference ?? null)}
    />
  ),
}));

/** Renders the tab for `account` and returns the mocked panel element. */
const renderTab = (account) => {
  render(
    <MemoryRouter>
      <ReconciliationTab account={account} />
    </MemoryRouter>,
  );
  return screen.getByTestId('split-panel');
};

describe('ReconciliationTab', () => {
  it('renders the reconciliation split panel', () => {
    render(
      <MemoryRouter>
        <ReconciliationTab account={{ id: 'ACC-1', currencyIso: 'EUR' }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('split-panel')).toBeDefined();
  });

  it('forwards the account id and currency to the split panel', () => {
    render(
      <MemoryRouter>
        <ReconciliationTab account={{ id: 'ACC-9', currencyIso: 'USD' }} />
      </MemoryRouter>,
    );
    const panel = screen.getByTestId('split-panel');
    expect(panel.getAttribute('data-account')).toBe('ACC-9');
    expect(panel.getAttribute('data-currency')).toBe('USD');
  });

  it('does not crash when no account is provided', () => {
    render(
      <MemoryRouter>
        <ReconciliationTab account={null} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('split-panel')).toBeDefined();
  });

  // ── amountTolerance: the dual read ────────────────────────────────────────
  // The Cuentas LIST serves the W-spec contract name (`eTGOAmountTolerance`) while the account
  // DETAIL comes from the older `financial-accounts-page` R spec, which hand-builds flat names
  // (`amountTolerance`). Reading only one of the two silently disables the difference banner on
  // whichever route did not happen to be tested — hence a case per source.
  describe('amountTolerance dual read', () => {
    it('prefers the contract name (eTGOAmountTolerance)', () => {
      const panel = renderTab({ id: 'ACC-1', eTGOAmountTolerance: 5, amountTolerance: 9 });
      expect(panel.getAttribute('data-tolerance')).toBe('5');
    });

    it('falls back to the flat detail name (amountTolerance)', () => {
      const panel = renderTab({ id: 'ACC-1', amountTolerance: 7 });
      expect(panel.getAttribute('data-tolerance')).toBe('7');
    });

    it('defaults to 0 when neither name is present', () => {
      const panel = renderTab({ id: 'ACC-1' });
      expect(panel.getAttribute('data-tolerance')).toBe('0');
    });

    it('defaults to 0 when there is no account at all', () => {
      const panel = renderTab(null);
      expect(panel.getAttribute('data-tolerance')).toBe('0');
    });

    it('honours an explicitly configured 0 rather than falling through to the other name', () => {
      // `??` (not `||`) matters here: a real "no difference may be posted" setting must not be
      // overridden by a stale flat value.
      const panel = renderTab({ id: 'ACC-1', eTGOAmountTolerance: 0, amountTolerance: 9 });
      expect(panel.getAttribute('data-tolerance')).toBe('0');
    });

    it('forwards a string tolerance as served, without coercing it away', () => {
      const panel = renderTab({ id: 'ACC-1', eTGOAmountTolerance: '5' });
      expect(panel.getAttribute('data-tolerance')).toBe('"5"');
    });
  });

  // ── glItemDifference: composed, not passed through ────────────────────────
  describe('glItemDifference composition', () => {
    it('composes {id, name} from the two flat account fields', () => {
      const panel = renderTab({
        id: 'ACC-1',
        glItemDifferenceId: 'GL-1',
        glItemDifferenceName: 'Comisiones bancarias',
      });
      expect(JSON.parse(panel.getAttribute('data-gl-difference')))
        .toEqual({ id: 'GL-1', name: 'Comisiones bancarias' });
    });

    it('keeps the id usable when only the name is missing', () => {
      const panel = renderTab({ id: 'ACC-1', glItemDifferenceId: 'GL-1' });
      expect(JSON.parse(panel.getAttribute('data-gl-difference')))
        .toEqual({ id: 'GL-1', name: '' });
    });

    it('is null when no difference concept is configured', () => {
      const panel = renderTab({ id: 'ACC-1', glItemDifferenceName: 'orphan name' });
      expect(panel.getAttribute('data-gl-difference')).toBe('null');
    });

    it('is null when there is no account at all', () => {
      const panel = renderTab(null);
      expect(panel.getAttribute('data-gl-difference')).toBe('null');
    });
  });
});

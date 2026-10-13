// @covers artifacts/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx
// @covers artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx
//
// Behavioral coverage for the form-view kebab (`menuActions`) of both generated invoice
// HeaderPages: mounts the REAL generated component with DetailView stubbed, and invokes the
// actual `menuActions({ data, status })` DetailView receives — same pattern as
// amortization/__tests__/HeaderPage.menuActions.vitest.jsx. The generated text is driven by
// decisions.json → window.menuActions, so a regeneration that changes the visibility rule
// fails here instead of only in a regex.
let capturedDetailViewProps = null;

vi.mock('@/components/contract-ui/ListView.jsx', () => ({
  ListView: () => <div data-testid="list-view" />,
}));

vi.mock('@/components/contract-ui/DetailView.jsx', () => ({
  DetailView: (props) => {
    capturedDetailViewProps = props;
    return <div data-testid="detail-view" />;
  },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useWindowAccess: () => 'full',
  WindowAccessGuard: () => <div data-testid="window-access-guard" />,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import SalesInvoiceHeaderPage from '@generated/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx';
import PurchaseInvoiceHeaderPage from '@generated/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx';

const WINDOWS = [
  ['sales-invoice', SalesInvoiceHeaderPage],
  ['purchase-invoice', PurchaseInvoiceHeaderPage],
];

function actionsByKey(data) {
  const actions = capturedDetailViewProps.menuActions({ data, status: data?.documentStatus });
  return Object.fromEntries(actions.map((a) => [a.key, a]));
}

for (const [windowName, HeaderPage] of WINDOWS) {
  describe(`${windowName} HeaderPage — menuActions Unpost visibility`, () => {
    beforeEach(() => {
      capturedDetailViewProps = null;
      render(<HeaderPage windowName={windowName} recordId="inv-1" apiBaseUrl={`/api/${windowName}`} token="tkn" />);
    });

    it('declares an unpost entry wired to the neo unpost action', () => {
      const { unpost } = actionsByKey({ documentStatus: 'CO', processed: true, posted: 'Y' });
      expect(unpost).toMatchObject({
        labelKey: 'unpost', neoAction: 'unpost', successKey: 'documentUnposted', destructive: true,
      });
    });

    it.each([
      ['Y'],
      [true],
    ])('Completed and posted (%s): Unpost visible, Post hidden', (posted) => {
      const actions = actionsByKey({ documentStatus: 'CO', processed: true, posted });
      expect(actions.unpost.visible).toBe(true);
      expect(actions.post.visible).toBe(false);
    });

    it.each([
      ['N'],
      ['i'],
      ['E'],
      [false],
    ])('Completed but not posted (%s): Unpost hidden', (posted) => {
      const actions = actionsByKey({ documentStatus: 'CO', processed: true, posted });
      expect(actions.unpost.visible).toBe(false);
    });

    it.each([
      ['DR', false],
      ['VO', true],
    ])('posted but status %s: Unpost hidden', (documentStatus, processed) => {
      const actions = actionsByKey({ documentStatus, processed, posted: 'Y' });
      expect(actions.unpost.visible).toBe(false);
    });

    it('never shows Unpost and Post at the same time', () => {
      for (const documentStatus of ['DR', 'CO', 'VO']) {
        for (const posted of ['Y', true, 'N', 'i', 'E', false]) {
          const actions = actionsByKey({ documentStatus, processed: documentStatus !== 'DR', posted });
          expect(actions.unpost.visible && actions.post.visible).toBe(false);
        }
      }
    });
  });
}

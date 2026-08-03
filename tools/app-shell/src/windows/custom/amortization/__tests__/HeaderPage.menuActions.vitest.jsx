// Behavioral coverage for the amortization HeaderPage menuActions visibility
// (ETP-4538 QA follow-up). The prior coverage only regex-matched the generated
// JSX (see HeaderTable.test.js in this window's artifacts dir); this mounts
// the REAL HeaderPage component (mocking its heavy dependencies, mirroring
// purchase-order's index.vitest.jsx pattern) and invokes the actual
// menuActions({ data, status }) function DetailView receives, so a change to
// the underlying visibility rules fails this test instead of only a regex.
let capturedDetailViewProps = null;

// ETP-4730 retargeted the generated pages off the `@/components/contract-ui`
// barrel onto the concrete modules, so mocking the barrel no longer intercepts
// these two — the real DetailView would mount and `capturedDetailViewProps`
// would never be set. Mock the same paths HeaderPage.jsx now imports.
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

vi.mock('@generated/amortization/generated/web/amortization/HeaderTable', () => ({
  default: () => <div data-testid="header-table" />,
}));

vi.mock('@generated/amortization/generated/web/amortization/HeaderForm', () => ({
  default: () => <div data-testid="header-form" />,
}));

vi.mock('@/windows/custom/amortization/AmortizationLinesTable', () => ({
  default: () => <div data-testid="amortization-lines-table" />,
}));

vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => <div data-testid="attachments-tab" />,
}));

vi.mock('@generated/amortization/custom/AmortizationConfirmModal', () => ({
  default: () => <div data-testid="amortization-confirm-modal" />,
}));

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import HeaderPage from '@generated/amortization/generated/web/amortization/HeaderPage.jsx';

function actionsByKey(data) {
  const actions = capturedDetailViewProps.menuActions({ data, status: data?.processed });
  return Object.fromEntries(actions.map((a) => [a.key, a]));
}

describe('Amortization HeaderPage — menuActions visibility by status (ETP-4538)', () => {
  beforeEach(() => {
    capturedDetailViewProps = null;
    render(<HeaderPage windowName="amortization" recordId="amz-1" apiBaseUrl="/api/amortization" token="tkn" />);
  });

  it('Borrador (not processed): neither Reactivate nor Post is visible', () => {
    const actions = actionsByKey({ processed: false, posted: false });
    expect(actions.reactivate.visible).toBe(false);
    expect(actions.post.visible).toBe(false);
  });

  it('Procesado sin contabilizar: both Reactivate and Post are visible', () => {
    const actions = actionsByKey({ processed: 'Y', posted: false });
    expect(actions.reactivate.visible).toBe(true);
    expect(actions.post.visible).toBe(true);
  });

  it('Procesado y contabilizado: only Reactivate remains visible (Post hidden)', () => {
    const actions = actionsByKey({ processed: 'Y', posted: 'Y' });
    expect(actions.reactivate.visible).toBe(true);
    expect(actions.post.visible).toBe(false);
  });

  it('never exposes a separate "Descontabilizar"/unpost menu action, in any state', () => {
    for (const data of [
      { processed: false, posted: false },
      { processed: 'Y', posted: false },
      { processed: 'Y', posted: 'Y' },
    ]) {
      const actions = capturedDetailViewProps.menuActions({ data, status: data.processed });
      expect(actions.map((a) => a.key)).not.toContain('unpost');
      expect(actions.map((a) => a.labelKey)).not.toContain('unpost');
    }
  });
});

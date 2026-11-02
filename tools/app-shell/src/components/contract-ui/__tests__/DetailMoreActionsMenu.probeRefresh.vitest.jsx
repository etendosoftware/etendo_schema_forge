// @covers tools/app-shell/src/components/contract-ui/DetailMoreActionsMenu.jsx
/**
 * ETP-5562 — the kebab of a freshly created record must appear without a reload.
 *
 * `customMenuContent` renders null for an unsaved header (`recordId === 'new'`), so the hidden
 * probe measured "no content". The early `return null` then unmounted the probe, and the stale
 * verdict kept the kebab hidden after the first save until the page was reloaded.
 */
import { render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('./../DetailView.jsx', () => ({ resolveHideMoreMenu: () => false }));
vi.mock('./../detailViewHelpers.jsx', () => ({ maybeSaveBeforeConfirm: vi.fn() }));
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));

import { DetailMoreActionsMenu } from '../DetailMoreActionsMenu.jsx';

function CustomMenu({ recordId }) {
  if (!recordId || recordId === 'new') return null;
  return <button type="button">custom-action</button>;
}

const baseProps = {
  apiBaseUrl: '/sws/neo/physical-inventory',
  customMenuContent: CustomMenu,
  docAction: { loading: false, execute: vi.fn() },
  hook: {},
  menuActions: [],
  neoAction: { loading: false, execute: vi.fn() },
  setDocsRefreshSignal: vi.fn(),
  sqBtnSize: 'h-9 w-9',
  statusField: 'processed',
  token: 't',
  ui: (k) => k,
  windowReadOnly: false,
};

describe('DetailMoreActionsMenu probe refresh (ETP-5562)', () => {
  it('hides the kebab on a new record and shows it once the record has an id, without remounting', () => {
    const { rerender } = render(
      <DetailMoreActionsMenu {...baseProps} recordId="new" data={{}} />,
    );
    expect(screen.queryByTestId('action-more')).toBeNull();

    rerender(<DetailMoreActionsMenu {...baseProps} recordId="ABC123" data={{ id: 'ABC123', processed: false }} />);
    expect(screen.getByTestId('action-more')).toBeTruthy();
  });

  it('still hides the kebab when the custom content has nothing to show for a saved record', () => {
    const Empty = () => null;
    render(<DetailMoreActionsMenu {...baseProps} customMenuContent={Empty} recordId="ABC123" data={{ id: 'ABC123' }} />);
    expect(screen.queryByTestId('action-more')).toBeNull();
  });
});

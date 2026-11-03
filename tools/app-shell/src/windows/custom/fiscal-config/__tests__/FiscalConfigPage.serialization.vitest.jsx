// @covers tools/app-shell/src/windows/custom/fiscal-config/FiscalConfigPage.jsx
// ETP-5112 regression — `FiscalConfigPage.saveTwoRefs` must run its two section saves one
// after the other, never with `Promise.allSettled([...])`.
//
// Each section's `save()` is a PUT carrying the record's `updated` optimistic-locking
// token, and core parses that token through a `private final static SimpleDateFormat`
// (`JsonToDataConverter` line 129) which is not thread-safe: two writes landing together
// corrupt each other's parse and one comes back refused as a conflict against a record
// nobody touched.
//
// Since ETP-5831 the `sii+tbai` layout keeps BOTH sections mounted (switching the SII | TicketBAI
// tab only hides one) and Save saves every section with unsaved changes. Both refs are live at
// save time, so the two PUTs genuinely could overlap here — this file therefore asserts the real
// non-overlap (`minOverlapGap() > 0`, the SII save is held open 30 ms), the same assertion
// `OnboardingWizard.serialization.vitest.jsx` carries. It also pins that each save is awaited (a
// rejection surfaces as the page's save error), that a failure does not stop the next section,
// and that a clean section is not re-saved.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { createRequestJournal } from '@/test/requestJournal.js';

const journalRef = { current: null };
const saveOutcome = { sii: 'ok', tbai: 'ok' };
// Which section doubles report unsaved changes (ETP-5831: only dirty sections are saved).
const dirtyState = { sii: true, tbai: true };

vi.mock('@/i18n', () => ({ useUI: () => (key) => key, useLocaleSwitch: () => ({ locale: 'es_ES' }) }));

// ETP-5395 Fix 3: FiscalConfigPage is now gated by useWindowAccess — default to 'full' so
// this suite keeps exercising the window as before (mirrors financial-account's own
// ETP-4658 test convention).
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: vi.fn(() => ({
    selectedOrg: { id: 'org-1', name: 'Test Org' },
    selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
    selectOrg: vi.fn(),
  })),
  useWindowAccess: () => 'full',
  WindowAccessGuard: () => <div data-testid="window-access-guard" />,
}));

vi.mock('react-router-dom', () => ({ useNavigate: vi.fn(() => vi.fn()) }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));

vi.mock('../useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(() => ({
    loading: false,
    error: null,
    profile: 'sii+tbai',
    siiRecord: { id: 'sii-1' },
    tbaiRecord: { id: 'tbai-1' },
    verifactuRecord: null,
    refetch: vi.fn(),
    createComplementary: vi.fn(),
  })),
}));

vi.mock('../../fiscal-monitor/useDebugMode.js', () => ({ useDebugMode: () => false }));
vi.mock('../useCertExpiry.js', () => ({ useCertExpiry: () => ({ daysLeft: null }) }));
vi.mock('../useFiscalTestMode.js', () => ({ useFiscalTestMode: () => ({ forceTestMode: false }) }));
vi.mock('../fiscalConfig.utils.js', async (importActual) => ({
  ...(await importActual()),
  detectProfile: vi.fn(() => 'sii+tbai'),
}));
vi.mock('../ChangeSifDialog.jsx', () => ({ default: () => null }));
vi.mock('../FiscalConfigDebugPanel.jsx', () => ({ default: () => <div data-testid="debug-panel" /> }));
vi.mock('../OnboardingWizard.jsx', () => ({ default: () => <div data-testid="onboarding-wizard" /> }));
vi.mock('../CertExpiryBanner.jsx', () => ({ default: () => <div data-testid="cert-expiry-banner" /> }));

/** Section doubles whose imperative `save()` is journalled. */
function makeSectionMock(label, delayMs) {
  return React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      save: () => journalRef.current.track(label, {
        delayMs,
        fail: saveOutcome[label] === 'fail' ? new Error(`${label} boom`) : undefined,
      }),
    }));
    // ETP-5831: the page's Save is enabled only while a section reports unsaved changes, and only
    // dirty sections are saved; `dirtyState` decides what each double reports.
    React.useEffect(() => { props.onDirtyChange?.(dirtyState[label] ?? true); }, [props.onDirtyChange]);
    return <div data-testid={`${label}-section`} />;
  });
}

vi.mock('../SiiSection.jsx', () => ({ default: makeSectionMock('sii', 30) }));
vi.mock('../TbaiSection.jsx', () => ({ default: makeSectionMock('tbai', 0) }));
vi.mock('../VerifactuSection.jsx', () => ({ default: makeSectionMock('verifactu', 0) }));

vi.mock('../TabBar.jsx', () => ({
  default: ({ tabs, active, onChange }) => (
    <div data-testid="tab-bar">
      {tabs.map((tab, i) => (
        <button key={tab} onClick={() => onChange(i)} data-active={active === i}>{tab}</button>
      ))}
    </div>
  ),
}));

vi.mock('../FiscalOrgDropdown.jsx', () => ({ default: () => <div data-testid="org-dropdown" /> }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));
vi.mock('lucide-react', () => ({
  Save: () => <svg data-testid="icon-save" />,
  RefreshCw: () => <svg data-testid="icon-refresh" />,
  PlusCircle: () => <svg data-testid="icon-plus-circle" />,
  MoreVertical: () => <svg data-testid="icon-more-vertical" />,
  AlertTriangle: () => <svg data-testid="icon-alert-triangle" />,
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: () => null,
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
}));

import FiscalConfigPage from '../FiscalConfigPage.jsx';

function renderPage() {
  return render(<FiscalConfigPage token="test-token" apiBaseUrl="/api" />);
}

function clickSave() {
  fireEvent.click(screen.getByText('fiscal.save').closest('button'));
}

beforeEach(() => {
  vi.clearAllMocks();
  journalRef.current = createRequestJournal();
  saveOutcome.sii = 'ok';
  saveOutcome.tbai = 'ok';
  dirtyState.sii = true;
  dirtyState.tbai = true;
});

describe('FiscalConfigPage — sii+tbai save (ETP-5112)', () => {
  it('keeps both tab sections mounted, hiding the inactive one', () => {
    renderPage();

    expect(screen.getByTestId('FiscalConfigPage__siiPane')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('FiscalConfigPage__tbaiPane')).toHaveAttribute('hidden');
    expect(screen.getByTestId('tbai-section')).toBeInTheDocument();

    fireEvent.click(screen.getByText('fiscal.tab.tbai'));

    expect(screen.getByTestId('FiscalConfigPage__siiPane')).toHaveAttribute('hidden');
    expect(screen.getByTestId('sii-section')).toBeInTheDocument();
  });

  it('saves both dirty sections one after the other, never overlapping', async () => {
    renderPage();

    clickSave();
    await waitFor(() => expect(journalRef.current.allSettled(2)).toBe(true));

    expect(journalRef.current.labels()).toEqual(['sii', 'tbai']);
    expect(journalRef.current.minOverlapGap()).toBeGreaterThan(0);
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
  });

  it('saves only the dirty section, whichever tab is visible', async () => {
    dirtyState.sii = false;
    renderPage();

    clickSave();
    await waitFor(() => expect(journalRef.current.allSettled(1)).toBe(true));

    expect(journalRef.current.labels()).toEqual(['tbai']);
  });

  it('surfaces a failing section save as the page save error and still attempts the next one', async () => {
    saveOutcome.sii = 'fail';
    renderPage();

    clickSave();

    await waitFor(() => expect(screen.getByText('sii boom')).toBeInTheDocument());
    expect(journalRef.current.labels()).toEqual(['sii', 'tbai']);
  });

  it('brings the failing section to the front when its tab is hidden', async () => {
    saveOutcome.tbai = 'fail';
    renderPage();

    clickSave();

    await waitFor(() => expect(screen.getByText('tbai boom')).toBeInTheDocument());
    expect(screen.getByTestId('FiscalConfigPage__tbaiPane')).not.toHaveAttribute('hidden');
  });
});

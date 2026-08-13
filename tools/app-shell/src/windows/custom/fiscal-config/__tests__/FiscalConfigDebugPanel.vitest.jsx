// Vitest render tests for FiscalConfigDebugPanel

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => vi.fn() }));
vi.mock('../../fiscal-monitor/useDraggable.js', () => ({
  useDraggable: () => ({
    panelRef: { current: null },
    posStyle: {},
    handleMouseDown: vi.fn(),
  }),
}));
vi.mock('../CertModal.jsx', () => ({
  default: () => <div data-testid="cert-modal" />,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import FiscalConfigDebugPanel from '../FiscalConfigDebugPanel.jsx';

const baseProps = {
  orgId: 'org-1',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/fiscal-config',
  onDeleted: vi.fn(),
  onSetMock: vi.fn(),
  activeMockKey: null,
  mockCertDays: null,
  onSetCertDays: vi.fn(),
};

describe('FiscalConfigDebugPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders panel title', () => {
    render(<FiscalConfigDebugPanel {...baseProps} />);
    expect(screen.getByText('fiscalDebug.title')).toBeInTheDocument();
  });

  it('shows org ID', () => {
    render(<FiscalConfigDebugPanel {...baseProps} />);
    expect(screen.getByText('org-1')).toBeInTheDocument();
  });

  it('renders mock profile buttons', () => {
    render(<FiscalConfigDebugPanel {...baseProps} />);
    expect(screen.getByText('fiscalDebug.profile.sii')).toBeInTheDocument();
    expect(screen.getByText('fiscalDebug.profile.tbai')).toBeInTheDocument();
    expect(screen.getByText('fiscalDebug.profile.verifactu')).toBeInTheDocument();
  });

  it('renders cert expiry options', () => {
    render(<FiscalConfigDebugPanel {...baseProps} />);
    expect(screen.getByText(/fiscalDebug\.certExpiry\.none/)).toBeInTheDocument();
    expect(screen.getByText(/fiscalDebug\.certExpiry\.warn/)).toBeInTheDocument();
    expect(screen.getByText(/fiscalDebug\.certExpiry\.crit/)).toBeInTheDocument();
  });

  it('renders delete buttons for each config', () => {
    render(<FiscalConfigDebugPanel {...baseProps} />);
    expect(screen.getByText(/fiscalDebug\.label\.sii/)).toBeInTheDocument();
    expect(screen.getByText(/fiscalDebug\.label\.tbai/)).toBeInTheDocument();
    expect(screen.getByText(/fiscalDebug\.label\.verifactu/)).toBeInTheDocument();
    expect(screen.getByText(/fiscalDebug\.label\.cert/)).toBeInTheDocument();
  });

  it('renders delete all button', () => {
    render(<FiscalConfigDebugPanel {...baseProps} />);
    expect(screen.getByText('fiscalDebug.deleteAll')).toBeInTheDocument();
  });

  it('calls onSetMock when a profile button is clicked', () => {
    const onSetMock = vi.fn();
    render(<FiscalConfigDebugPanel {...baseProps} onSetMock={onSetMock} />);
    fireEvent.click(screen.getByText('fiscalDebug.profile.sii'));
    expect(onSetMock).toHaveBeenCalled();
  });

  it('calls onSetCertDays when cert expiry option is clicked', () => {
    const onSetCertDays = vi.fn();
    render(<FiscalConfigDebugPanel {...baseProps} onSetCertDays={onSetCertDays} />);
    fireEvent.click(screen.getByText('fiscalDebug.certExpiry.warn'));
    expect(onSetCertDays).toHaveBeenCalledWith(45);
  });

  it('collapses and expands panel', () => {
    render(<FiscalConfigDebugPanel {...baseProps} />);
    // Initially expanded — org ID is visible
    expect(screen.getByText('org-1')).toBeInTheDocument();
    // Click collapse button (the one with arrow char)
    const collapseBtn = screen.getByText('▴');
    fireEvent.click(collapseBtn);
    // After collapse, org ID should not be visible
    expect(screen.queryByText('org-1')).toBeNull();
  });

  it('renders cert modal debug buttons', () => {
    render(<FiscalConfigDebugPanel {...baseProps} />);
    expect(screen.getByText('fiscalDebug.certModal.pick')).toBeInTheDocument();
    expect(screen.getByText('fiscalDebug.certModal.done')).toBeInTheDocument();
  });

  it('renders wizard profile button', () => {
    render(<FiscalConfigDebugPanel {...baseProps} />);
    expect(screen.getByText('fiscalDebug.profile.wizard')).toBeInTheDocument();
  });
});

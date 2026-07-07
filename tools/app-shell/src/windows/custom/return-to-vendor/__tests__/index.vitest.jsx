// ETP-4372 Part 2 — regression guard for the return-to-vendor custom window.
//
// LIST mode  → generated HeaderPage receives rowQuickActions.onEmail (row-hover
//              email access point) + a renderPreview function (side-panel).
// DETAIL mode → generated HeaderPage receives topbarRight = ReturnToVendorActions
//              (form-view envelope access point).

// --- Mock the generated HeaderPage to a stub that surfaces the props we assert on
vi.mock('@generated/return-to-vendor/generated/web/return-to-vendor/HeaderPage', () => ({
  default: ({ rowQuickActions, renderPreview, topbarRight }) => (
    <div
      data-testid="generated-header"
      data-has-on-email={typeof rowQuickActions?.onEmail === 'function' ? 'yes' : 'no'}
      data-has-render-preview={typeof renderPreview === 'function' ? 'yes' : 'no'}
      data-topbar-name={topbarRight?.name || ''}
    >
      {topbarRight ? <div data-testid="topbar-slot">{(() => {
        const Topbar = topbarRight;
        return <Topbar data={{ documentStatus: 'CO', documentNo: 'RTV-1' }} recordId="rtv-1" token="tok" apiBaseUrl="/api" />;
      })()}</div> : null}
      {renderPreview ? (
        <div data-testid="preview-slot">
          {renderPreview({ row: { id: 'rtv-1', documentNo: 'RTV-1' }, onClose: () => {}, onEdit: () => {} })}
        </div>
      ) : null}
    </div>
  ),
}));

// --- Heavy children stubbed away
vi.mock('../ReturnToVendorActions.jsx', () => ({
  default: (props) => <div data-testid="rtv-actions" data-record={props.recordId} />,
}));

vi.mock('../ReturnToVendorPreview.jsx', () => ({
  default: (props) => <div data-testid="rtv-preview" data-order={props.order?.id} />,
}));

// --- Email-modal / delete hooks return inert portals
let capturedUsePdf = null;
vi.mock('../../shared/useRowEmailModal.jsx', () => ({
  useRowEmailModal: (opts) => {
    capturedUsePdf = opts?.usePdf ?? null;
    return { onEmail: vi.fn(), emailModalPortal: <div data-testid="email-portal" /> };
  },
}));

vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: () => ({ requestDelete: vi.fn(), deleteDialog: <div data-testid="delete-dialog" /> }),
}));

vi.mock('../useReturnToVendorOrderPdf.js', () => ({
  useReturnToVendorOrderPdf: () => ({ pdfUrl: 'blob:x', loading: false }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReturnToVendorWindow from '../index.jsx';
import { useReturnToVendorOrderPdf } from '../useReturnToVendorOrderPdf.js';

const DEFAULT_PROPS = {
  token: 'tok',
  apiBaseUrl: '/api',
  windowName: 'return-to-vendor',
};

describe('ReturnToVendorWindow — LIST mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedUsePdf = null;
  });

  it('renders the generated HeaderPage', () => {
    render(<ReturnToVendorWindow {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('generated-header')).toBeInTheDocument();
  });

  it('passes rowQuickActions with a defined onEmail function (row-hover email point)', () => {
    render(<ReturnToVendorWindow {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('generated-header').dataset.hasOnEmail).toBe('yes');
  });

  it('passes a renderPreview function that renders ReturnToVendorPreview', () => {
    render(<ReturnToVendorWindow {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('generated-header').dataset.hasRenderPreview).toBe('yes');
    const preview = screen.getByTestId('rtv-preview');
    expect(preview).toBeInTheDocument();
    expect(preview.dataset.order).toBe('rtv-1');
  });

  it('wires the PDF hook into the row email modal', () => {
    render(<ReturnToVendorWindow {...DEFAULT_PROPS} />);
    expect(capturedUsePdf).toBe(useReturnToVendorOrderPdf);
  });

  it('renders the email modal portal', () => {
    render(<ReturnToVendorWindow {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('email-portal')).toBeInTheDocument();
  });

  it('does NOT pass a topbarRight in list mode', () => {
    render(<ReturnToVendorWindow {...DEFAULT_PROPS} />);
    expect(screen.queryByTestId('topbar-slot')).not.toBeInTheDocument();
  });
});

describe('ReturnToVendorWindow — DETAIL mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes topbarRight = ReturnToVendorActions to HeaderPage (form-view envelope point)', () => {
    render(<ReturnToVendorWindow {...DEFAULT_PROPS} recordId="rtv-1" />);
    // The stub HeaderPage mounts the topbarRight component into topbar-slot.
    expect(screen.getByTestId('topbar-slot')).toBeInTheDocument();
    const actions = screen.getByTestId('rtv-actions');
    expect(actions).toBeInTheDocument();
    expect(actions.dataset.record).toBe('rtv-1');
  });

  it('does NOT render a preview slot in detail mode', () => {
    render(<ReturnToVendorWindow {...DEFAULT_PROPS} recordId="rtv-1" />);
    expect(screen.queryByTestId('preview-slot')).not.toBeInTheDocument();
  });
});

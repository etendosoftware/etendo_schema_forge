// Mocks BEFORE imports
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => {
    if (vars) return key.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
    return key;
  },
}));

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createPortal: (node) => node };
});

// ConfirmDocumentModal exports shared primitives — mock it to avoid portal issues there
vi.mock('@/components/contract-ui/ConfirmDocumentModal', async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeData(overrides = {}) {
  return {
    documentNo: 'SO-001',
    'businessPartner$_identifier': 'Acme Corp',
    grandTotalAmount: 1500,
    'currency$_identifier': 'USD',
    ...overrides,
  };
}

function renderModal(props = {}) {
  const defaults = {
    data: makeData(),
    loading: false,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  return { ...render(<CreateInvoiceConfirmModal {...merged} />), props: merged };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateInvoiceConfirmModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) }),
    ));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the modal title key', () => {
    renderModal();
    expect(screen.getByText('soManageDocsTitle')).toBeInTheDocument();
  });

  it('renders bpName when provided', () => {
    renderModal({ data: makeData({ 'businessPartner$_identifier': 'My Supplier' }) });
    expect(screen.getByText('My Supplier')).toBeInTheDocument();
  });

  it('does not render bpName when absent', () => {
    renderModal({ data: makeData({ 'businessPartner$_identifier': '' }) });
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
  });

  it('shows the formatted grandTotal with the real currency symbol (es-ES, grouped), never the raw ISO code', () => {
    renderModal({ data: makeData({ grandTotalAmount: 1234.56, 'currency$_identifier': 'EUR' }) });
    expect(screen.getByText(/1\.234,56\s€/)).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).toBeNull();
  });

  it('shows documentNo when grandTotal is 0', () => {
    renderModal({ data: makeData({ grandTotalAmount: 0, documentNo: 'SO-ZERO' }) });
    expect(screen.getByText('SO-ZERO')).toBeInTheDocument();
  });

  it('shows documentNo when grandTotal is missing', () => {
    const { documentNo: _dn, grandTotalAmount: _gt, ...rest } = makeData();
    renderModal({ data: { ...rest, documentNo: 'SO-NULL' } });
    expect(screen.getByText('SO-NULL')).toBeInTheDocument();
  });

  it('uses linkedOrders grandTotal and currency when present', () => {
    const data = {
      documentNo: 'SO-002',
      'businessPartner$_identifier': 'Partner',
      grandTotalAmount: 0,
      'currency$_identifier': 'USD',
      linkedOrders: [
        { grandTotalAmount: 9999, 'currency$_identifier': 'GBP' },
      ],
    };
    renderModal({ data });
    expect(screen.getByText(/9\.999,00\s£/)).toBeInTheDocument();
    expect(screen.queryByText(/GBP/)).toBeNull();
  });

  // ── Checkbox state ─────────────────────────────────────────────────────────

  it('starts with checkbox checked', () => {
    const { container } = renderModal();
    // The checkmark SVG polyline is rendered only when checked
    expect(container.querySelector('polyline')).toBeInTheDocument();
  });

  it('toggles checkbox when the row is clicked', () => {
    const { container } = renderModal();
    // Find the clickable checkbox row by its title text's parent
    const checkboxRow = screen.getByText('soCreateInvoiceTitle').closest('div[style]');
    fireEvent.click(checkboxRow);
    // After toggle: unchecked → no polyline
    expect(container.querySelector('polyline')).not.toBeInTheDocument();
  });

  it('confirm button is enabled when checkbox is checked and not loading', () => {
    renderModal();
    const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
    expect(confirmBtn).not.toBeDisabled();
  });

  it('confirm button is disabled when checkbox is unchecked', () => {
    renderModal();
    const checkboxRow = screen.getByText('soCreateInvoiceTitle').closest('div[style]');
    fireEvent.click(checkboxRow); // uncheck
    const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
    expect(confirmBtn).toBeDisabled();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows Spinner and soProcessing label when loading=true', () => {
    renderModal({ loading: true });
    expect(screen.getByText('soProcessing')).toBeInTheDocument();
    // Spinner renders an SVG — verify it exists
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('disables confirm button when loading=true', () => {
    renderModal({ loading: true });
    const confirmBtn = screen.getByText('soProcessing').closest('button');
    expect(confirmBtn).toBeDisabled();
  });

  it('disables cancel button when loading=true', () => {
    renderModal({ loading: true });
    const cancelBtn = screen.getByText('cancel').closest('button');
    expect(cancelBtn).toBeDisabled();
  });

  // ── Interactions ───────────────────────────────────────────────────────────

  it('calls onClose when cancel button is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('cancel'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when × (close) button is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('×'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when confirm button is clicked and checkbox is checked', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('soCreateDocsBtn'));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not call onConfirm when checkbox is unchecked', () => {
    const { props } = renderModal();
    const checkboxRow = screen.getByText('soCreateInvoiceTitle').closest('div[style]');
    fireEvent.click(checkboxRow); // uncheck
    // Confirm button is disabled — verify attribute before asserting
    const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
    expect(confirmBtn).toBeDisabled();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  // ── pendingQtyUrl — subtitle behavior ─────────────────────────────────────

  it('shows generic subtitle when pendingQtyUrl is not provided', () => {
    renderModal();
    expect(screen.getByText('soCreateInvoiceCheckDesc')).toBeInTheDocument();
  });

  it('fetches pendingQtyUrl and shows formatted pending qty subtitle', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          response: { data: [{ pendingQty: 5 }, { pendingQty: 3 }] },
        }),
      }),
    ));

    renderModal({ pendingQtyUrl: '/api/pending' });

    await waitFor(() => {
      // soAmountPendingInvoice with substituted {pending}
      expect(screen.getByText(/soAmountPendingInvoice/)).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith('/api/pending');
  });

  it('falls back to generic subtitle when pendingQtyUrl fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network'))));

    renderModal({ pendingQtyUrl: '/api/pending' });

    // Give time for the effect to resolve/reject
    await act(async () => {});
    expect(screen.getByText('soCreateInvoiceCheckDesc')).toBeInTheDocument();
  });

  it('falls back to generic subtitle when pendingQtyUrl response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: false, json: async () => ({}) }),
    ));

    renderModal({ pendingQtyUrl: '/api/pending' });

    await act(async () => {});
    expect(screen.getByText('soCreateInvoiceCheckDesc')).toBeInTheDocument();
  });

  it('shows soGenerateDocs section label', () => {
    renderModal();
    expect(screen.getByText('soGenerateDocs')).toBeInTheDocument();
  });

  it('shows soCreateInvoiceTitle inside the checkbox row', () => {
    renderModal();
    expect(screen.getByText('soCreateInvoiceTitle')).toBeInTheDocument();
  });
});

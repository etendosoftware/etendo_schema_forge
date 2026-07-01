vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => {
    if (vars) return key.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
    return key;
  },
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmResultModal } from '../ConfirmResultModal.jsx';

const DOCS = [
  { type: 'entrada',      num: 'GR-001', amount: 100,  route: '/goods-receipt/1' },
  { type: 'facturaCompra', num: 'PI-002', amount: 200,  route: '/purchase-invoice/2' },
];

function renderModal(overrides = {}) {
  const defaults = {
    title: 'Operation complete',
    docs: DOCS,
    navigate: vi.fn(),
    currency: 'EUR',
    onClose: vi.fn(),
  };
  return render(<ConfirmResultModal {...defaults} {...overrides} />);
}

describe('ConfirmResultModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the title', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Operation complete')).toBeInTheDocument());
  });

  it('renders the type label for each doc', () => {
    renderModal();
    expect(screen.getByText('confirmResultModal.docType.entrada')).toBeInTheDocument();
    expect(screen.getByText('confirmResultModal.docType.facturaCompra')).toBeInTheDocument();
  });

  it('renders doc numbers', () => {
    renderModal();
    expect(screen.getByText('GR-001')).toBeInTheDocument();
    expect(screen.getByText('PI-002')).toBeInTheDocument();
  });

  it('shows plural subtitle for multiple docs', () => {
    renderModal();
    expect(screen.getByText('confirmResultModal.subtitleMany')).toBeInTheDocument();
  });

  it('shows singular subtitle for a single doc', () => {
    renderModal({ docs: [DOCS[0]] });
    expect(screen.getByText('confirmResultModal.subtitleOne')).toBeInTheDocument();
  });

  it('shows no subtitle when docs is empty', () => {
    renderModal({ docs: [] });
    expect(screen.queryByText('confirmResultModal.subtitleOne')).not.toBeInTheDocument();
    expect(screen.queryByText('confirmResultModal.subtitleMany')).not.toBeInTheDocument();
  });

  it('navigates and closes when a doc card is clicked', () => {
    const navigate = vi.fn();
    const onClose  = vi.fn();
    renderModal({ navigate, onClose });
    fireEvent.click(screen.getByText('GR-001'));
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/goods-receipt/1');
  });

  it('closes when the close button is clicked (without reloading)', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByText('soClose'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows primary button for a single doc when primary is provided', () => {
    const navigate = vi.fn();
    const onClose  = vi.fn();
    renderModal({ docs: [DOCS[0]], primary: 'View receipt', navigate, onClose });
    const btn = screen.getByText('View receipt');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/goods-receipt/1');
  });

  it('does not show primary button for multiple docs', () => {
    renderModal({ primary: 'View' });
    expect(screen.queryByText('View')).not.toBeInTheDocument();
  });

  it('derives the primary button label from the single doc type when primary is not provided', () => {
    const navigate = vi.fn();
    const onClose  = vi.fn();
    // DOCS[0] is an 'entrada' (goods receipt) → label derived from its type, not a hardcoded invoice label.
    renderModal({ docs: [DOCS[0]], navigate, onClose });
    const btn = screen.getByText('poViewReceipt');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/goods-receipt/1');
  });

  it('does not show primary button when there is no single doc', () => {
    renderModal({ docs: [] });
    expect(screen.queryByRole('button', { name: /view/i })).not.toBeInTheDocument();
  });

  it('activates doc card with Enter key', () => {
    const navigate = vi.fn();
    const onClose  = vi.fn();
    renderModal({ navigate, onClose });
    fireEvent.keyDown(screen.getByText('GR-001').closest('[role="button"]'), { key: 'Enter' });
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/goods-receipt/1');
  });

  it('activates doc card with Space key', () => {
    const navigate = vi.fn();
    const onClose  = vi.fn();
    renderModal({ navigate, onClose });
    fireEvent.keyDown(screen.getByText('GR-001').closest('[role="button"]'), { key: ' ' });
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores other keys on doc card', () => {
    const navigate = vi.fn();
    renderModal({ navigate });
    fireEvent.keyDown(screen.getByText('GR-001').closest('[role="button"]'), { key: 'Tab' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('triggers hover state on mouse enter/leave', () => {
    renderModal({ docs: [DOCS[0]] });
    const card = screen.getByText('GR-001').closest('[role="button"]');
    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
  });

  it('triggers focus/blur handlers on doc card', () => {
    renderModal({ docs: [DOCS[0]] });
    const card = screen.getByText('GR-001').closest('[role="button"]');
    fireEvent.focus(card);
    fireEvent.blur(card);
  });

  it('shows doc.status badge when provided', () => {
    renderModal({ docs: [{ type: 'entrada', num: 'GR-X', status: 'Completado', route: '/r' }] });
    expect(screen.getByText('Completado')).toBeInTheDocument();
  });

  it('falls back to statusDraft when doc.status is not provided', () => {
    renderModal({ docs: [{ type: 'entrada', num: 'GR-Y', route: '/r' }] });
    expect(screen.getByText('statusDraft')).toBeInTheDocument();
  });

  it('renders amount span when amount is provided', () => {
    renderModal({ docs: [{ type: 'entrada', num: 'GR-Z', amount: 1234.5, route: '/r' }], currency: '' });
    const card = screen.getByText('GR-Z').closest('[role="button"]');
    expect(card.querySelector('span[style*="color"]')).toBeTruthy();
  });

  // ── ETP-4312: single-source arrow on the derived primary button ──────────────
  describe('single arrow invariant (ETP-4312)', () => {
    const ARROW_PATH = 'M5 12h14M12 5l7 7-7 7';

    it('primary button has exactly one arrow SVG and no "→" glyph in its text', () => {
      // 'entrada' → derived label 'poViewReceipt' (mock returns the key verbatim).
      renderModal({ docs: [{ type: 'entrada', num: 'GR-1', route: '/r' }] });
      const btn = screen.getByText('poViewReceipt').closest('button');
      const svgs = btn.querySelectorAll('svg');
      expect(svgs).toHaveLength(1);
      const paths = svgs[0].querySelectorAll('path');
      expect(paths).toHaveLength(1);
      expect(paths[0].getAttribute('d')).toBe(ARROW_PATH);
      // The arrow comes from the SVG only — the label text must not include "→".
      expect(btn.textContent).not.toContain('→');
    });

    // Each doc type derives its own view label. Mock i18n returns the key verbatim.
    const TYPE_TO_KEY = [
      ['facturaCompra', 'poViewInvoice'],
      ['facturaVenta', 'soViewInvoice'],
      ['salida', 'soViewShipment'],
      ['entrada', 'poViewReceipt'],
    ];

    for (const [type, expectedKey] of TYPE_TO_KEY) {
      it(`derives primary label '${expectedKey}' for doc type '${type}'`, () => {
        renderModal({ docs: [{ type, num: 'X-1', route: '/r' }] });
        expect(screen.getByText(expectedKey)).toBeInTheDocument();
      });
    }

    it('explicit primary prop overrides the derived label', () => {
      // 'salida' would derive 'soViewShipment'; the explicit primary must win.
      renderModal({ docs: [{ type: 'salida', num: 'SH-1', route: '/r' }], primary: 'X' });
      expect(screen.getByText('X')).toBeInTheDocument();
      expect(screen.queryByText('soViewShipment')).not.toBeInTheDocument();
    });

    it('renders no primary button for an unknown doc type and does not crash', () => {
      renderModal({ docs: [{ type: 'zzz', num: 'UNK-1', route: '/r' }] });
      // Unknown type → no viewKey → no derived primary label, but the card still renders.
      expect(screen.getByText('UNK-1')).toBeInTheDocument();
      expect(screen.queryByText('poViewReceipt')).not.toBeInTheDocument();
      expect(screen.queryByText('soViewInvoice')).not.toBeInTheDocument();
      // Only the close button is present in the footer (no primary button).
      expect(screen.getByText('soClose')).toBeInTheDocument();
    });
  });
});

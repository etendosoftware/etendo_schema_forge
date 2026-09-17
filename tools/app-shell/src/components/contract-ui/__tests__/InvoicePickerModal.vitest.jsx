// @vitest-environment jsdom
//
// ETP-5381 — the invoice picker of the "Rectificaciones" tab was extracted out of
// ReversedInvoicesPanel so the return-document flow could reuse it instead of growing a second,
// subtly different list. The reuse added one prop, `multiple`; everything below exists to prove
// that addition did not change the single-select behaviour the tab has always had.
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  // The key plus its interpolation vars: lets a test assert the number a label carries
  // (e.g. the footer counter) without hardcoding a translated string.
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import InvoicePickerModal from '../InvoicePickerModal.jsx';

const INVOICES = [
  { id: 'inv-1', documentNo: 'FAC-001', businessPartner: 'Acme Corp', invoiceDate: '2026-08-10', grandTotalAmount: 1234.5 },
  { id: 'inv-2', documentNo: 'FAC-002', businessPartner: 'Globex SA', invoiceDate: '2026-08-11' },
  { id: 'inv-3', documentNo: 'ALB-777', businessPartner: 'Acme Corp', invoiceDate: '2026-08-12', suggested: true },
];

const BASE = {
  invoices: INVOICES,
  onSelect: vi.fn(),
  onApply: vi.fn(),
  onClose: vi.fn(),
};

const optionIds = () => [...document.body.querySelectorAll('[data-testid^="invoice-picker-option-"]')]
  .map(node => node.getAttribute('data-testid'));

const rowOf = (id) => screen.getByTestId(`invoice-picker-option-${id}`);
// The interactive control nested inside the clickable row — the path a user actually aims at,
// and the one no test covered while it was broken.
const checkboxOf = (id) => rowOf(id).querySelector('input[type="checkbox"]');
const footerCount = () => screen.getByText(/rectifySelectedCount/).textContent;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InvoicePickerModal — shell', () => {
  it('is an accessible dialog on the default modal tier', () => {
    render(<InvoicePickerModal {...BASE} />);
    const dialog = screen.getByTestId('invoice-picker-picker-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // 50 is the app's modal tier; only a picker opened on top of another modal raises it.
    expect(dialog).toHaveStyle({ zIndex: '50' });
  });

  it('raises the stacking level on request', () => {
    render(<InvoicePickerModal {...BASE} zIndex={60} />);
    expect(screen.getByTestId('invoice-picker-picker-modal')).toHaveStyle({ zIndex: '60' });
  });

  it('falls back to its own title and takes the caller’s when given', () => {
    const { unmount } = render(<InvoicePickerModal {...BASE} />);
    expect(screen.getByText('rectPickerTitle')).toBeInTheDocument();
    unmount();

    render(<InvoicePickerModal {...BASE} title="invoiceToRectifyLabel" />);
    expect(screen.getByText('invoiceToRectifyLabel')).toBeInTheDocument();
    expect(screen.queryByText('rectPickerTitle')).not.toBeInTheDocument();
  });

  it('closes on a backdrop click but not on a click inside the panel', () => {
    const onClose = vi.fn();
    render(<InvoicePickerModal {...BASE} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('invoice-picker-search'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('invoice-picker-picker-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the × and from Cancel without selecting anything', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<InvoicePickerModal {...BASE} onSelect={onSelect} onClose={onClose} />);
    const dialog = within(screen.getByTestId('invoice-picker-picker-modal'));
    fireEvent.click(dialog.getByLabelText('cancel'));
    fireEvent.click(dialog.getByText('cancel'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the loading placeholder instead of rows or an empty notice', () => {
    render(<InvoicePickerModal {...BASE} invoices={[]} loading={true} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-picker-no-matches')).not.toBeInTheDocument();
    expect(optionIds()).toEqual([]);
  });

  it('honours a custom idPrefix', () => {
    render(<InvoicePickerModal {...BASE} idPrefix="rect-tab" />);
    expect(screen.getByTestId('rect-tab-picker-modal')).toBeInTheDocument();
    expect(screen.getByTestId('rect-tab-search')).toBeInTheDocument();
    expect(screen.getByTestId('rect-tab-option-inv-1')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-picker-picker-modal')).not.toBeInTheDocument();
  });
});

describe('InvoicePickerModal — single select (the Rectificaciones tab)', () => {
  it('selects on click and closes immediately', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<InvoicePickerModal {...BASE} onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('invoice-picker-option-inv-2'));
    expect(onSelect).toHaveBeenCalledWith('inv-2', 'FAC-002');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('selects with the keyboard too', () => {
    const onSelect = vi.fn();
    render(<InvoicePickerModal {...BASE} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId('invoice-picker-option-inv-1'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('inv-1', 'FAC-001');
  });

  it('offers no multi-select affordance: no apply button and no row ever marked', () => {
    render(<InvoicePickerModal {...BASE} />);
    expect(screen.queryByTestId('invoice-picker-apply')).not.toBeInTheDocument();
    expect(screen.queryByText(/rectifySelectedCount/)).not.toBeInTheDocument();
    // No nested control to mis-aim at either: the checkbox belongs to `multiple` alone.
    expect(rowOf('inv-1').querySelector('input[type="checkbox"]')).toBeNull();
    for (const id of ['inv-1', 'inv-2', 'inv-3']) {
      expect(screen.getByTestId(`invoice-picker-option-${id}`)).toHaveAttribute('data-selected', 'false');
    }
  });

  it('ignores selectedIds and never reorders by `suggested` — that is multi-select behaviour', () => {
    render(<InvoicePickerModal {...BASE} selectedIds={['inv-1']} />);
    expect(optionIds()).toEqual([
      'invoice-picker-option-inv-1',
      'invoice-picker-option-inv-2',
      'invoice-picker-option-inv-3',
    ]);
    expect(screen.getByTestId('invoice-picker-option-inv-1')).toHaveAttribute('data-selected', 'false');
  });

  it('never offers the record itself as a candidate', () => {
    render(<InvoicePickerModal {...BASE} currentId="inv-2" />);
    expect(optionIds()).toEqual(['invoice-picker-option-inv-1', 'invoice-picker-option-inv-3']);
  });
});

describe('InvoicePickerModal — multiple select (the return-document flow)', () => {
  const MULTI = { ...BASE, multiple: true };

  it('holds the clicks as a draft: no onSelect, no close', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<InvoicePickerModal {...MULTI} onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('invoice-picker-option-inv-1'));
    expect(screen.getByTestId('invoice-picker-option-inv-1')).toHaveAttribute('data-selected', 'true');
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('commits the draft only through Apply, in click order', () => {
    const onApply = vi.fn();
    render(<InvoicePickerModal {...MULTI} onApply={onApply} />);
    fireEvent.click(screen.getByTestId('invoice-picker-option-inv-3'));
    fireEvent.click(screen.getByTestId('invoice-picker-option-inv-1'));
    fireEvent.click(screen.getByTestId('invoice-picker-apply'));
    expect(onApply).toHaveBeenCalledWith(['inv-3', 'inv-1']);
  });

  it('starts from the caller’s selection and can unpick it', () => {
    const onApply = vi.fn();
    render(<InvoicePickerModal {...MULTI} selectedIds={['inv-2']} onApply={onApply} />);
    expect(screen.getByTestId('invoice-picker-option-inv-2')).toHaveAttribute('data-selected', 'true');
    fireEvent.click(screen.getByTestId('invoice-picker-option-inv-2'));
    fireEvent.click(screen.getByTestId('invoice-picker-apply'));
    expect(onApply).toHaveBeenCalledWith([]);
  });

  it('leads with the backend-detected invoices and badges them', () => {
    render(<InvoicePickerModal {...MULTI} />);
    expect(optionIds()[0]).toBe('invoice-picker-option-inv-3');
    expect(screen.getByTestId('invoice-picker-suggested-inv-3')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-picker-suggested-inv-1')).not.toBeInTheDocument();
  });

  it('reports the draft size', () => {
    render(<InvoicePickerModal {...MULTI} selectedIds={['inv-1']} />);
    expect(footerCount()).toBe('rectifySelectedCount:{"count":1}');
  });

  // ── clicking the checkbox itself ────────────────────────────────────────────
  //
  // The regression these guard reached the UI precisely because every other test in this file
  // clicks the ROW container. The shared Checkbox is a <label> wrapping a hidden <input>, so a
  // click on it reached the row twice — once from the label, once from the click the browser
  // forwards to the input — and the row's toggle selected and immediately deselected in a single
  // gesture: aiming at the box did nothing at all, while aiming anywhere else worked.
  describe('clicking the checkbox itself, not the row container', () => {
    it('selects the row with a single click on the checkbox element', () => {
      render(<InvoicePickerModal {...MULTI} />);
      expect(rowOf('inv-1')).toHaveAttribute('data-selected', 'false');
      fireEvent.click(checkboxOf('inv-1'));
      expect(rowOf('inv-1')).toHaveAttribute('data-selected', 'true');
    });

    it('deselects an already-selected row with a single click on the checkbox element', () => {
      render(<InvoicePickerModal {...MULTI} selectedIds={['inv-1']} />);
      expect(rowOf('inv-1')).toHaveAttribute('data-selected', 'true');
      fireEvent.click(checkboxOf('inv-1'));
      expect(rowOf('inv-1')).toHaveAttribute('data-selected', 'false');
    });

    it('lands on the parity the clicks imply — the assert that tells "does nothing" from "does two things that cancel out"', () => {
      render(<InvoicePickerModal {...MULTI} />);
      // An even number of clicks must return to unselected...
      for (let i = 0; i < 4; i += 1) fireEvent.click(checkboxOf('inv-1'));
      expect(rowOf('inv-1')).toHaveAttribute('data-selected', 'false');
      // ...and the next one must actually select. A double-firing handler passes the first
      // assertion by accident and fails this one.
      fireEvent.click(checkboxOf('inv-1'));
      expect(rowOf('inv-1')).toHaveAttribute('data-selected', 'true');
    });

    it('keeps the footer counter in step with every checkbox click', () => {
      render(<InvoicePickerModal {...MULTI} />);
      expect(footerCount()).toBe('rectifySelectedCount:{"count":0}');
      fireEvent.click(checkboxOf('inv-1'));
      expect(footerCount()).toBe('rectifySelectedCount:{"count":1}');
      fireEvent.click(checkboxOf('inv-2'));
      expect(footerCount()).toBe('rectifySelectedCount:{"count":2}');
      fireEvent.click(checkboxOf('inv-1'));
      expect(footerCount()).toBe('rectifySelectedCount:{"count":1}');
    });

    it('applies what the checkbox clicks drafted', () => {
      const onApply = vi.fn();
      render(<InvoicePickerModal {...MULTI} onApply={onApply} />);
      fireEvent.click(checkboxOf('inv-2'));
      fireEvent.click(checkboxOf('inv-1'));
      fireEvent.click(screen.getByTestId('invoice-picker-apply'));
      expect(onApply).toHaveBeenCalledWith(['inv-2', 'inv-1']);
    });

    it('never lets the row close or select through the single-select path', () => {
      const onSelect = vi.fn();
      const onClose = vi.fn();
      render(<InvoicePickerModal {...MULTI} onSelect={onSelect} onClose={onClose} />);
      fireEvent.click(checkboxOf('inv-1'));
      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    // The visible box is what a user actually clicks, and it was the broken path: the label and
    // the click the browser forwards to the hidden input both reached the row, so its toggle ran
    // twice and the selection netted to nothing. stopPropagation on the Checkbox is observable in
    // JSDOM, so these assert the behaviour instead of the styling that used to stand in for it.
    it('selects when the visible box is clicked, not just the input', () => {
      render(<InvoicePickerModal {...MULTI} />);
      const box = checkboxOf('inv-1').closest('label').querySelector('div');
      fireEvent.click(box);
      expect(rowOf('inv-1').getAttribute('data-selected')).toBe('true');
    });

    it('toggles once per click on the visible box — the double-fire regression', () => {
      render(<InvoicePickerModal {...MULTI} />);
      const box = checkboxOf('inv-1').closest('label').querySelector('div');
      // Odd number of clicks must leave it selected. A double-firing row nets to zero on every
      // click, so it would read 'false' here while a dead control would too — the alternation
      // below is what tells those two apart.
      fireEvent.click(box);
      expect(rowOf('inv-1').getAttribute('data-selected')).toBe('true');
      fireEvent.click(box);
      expect(rowOf('inv-1').getAttribute('data-selected')).toBe('false');
      fireEvent.click(box);
      expect(rowOf('inv-1').getAttribute('data-selected')).toBe('true');
    });

    it('does not let a click on the visible box reach the row twice', () => {
      render(<InvoicePickerModal {...MULTI} />);
      const box = checkboxOf('inv-2').closest('label').querySelector('div');
      fireEvent.click(box);
      expect(screen.getByText('rectifySelectedCount:{"count":1}')).toBeInTheDocument();
    });
  });
});

describe('InvoicePickerModal — search', () => {
  it('filters by document number', () => {
    render(<InvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('invoice-picker-search'), { target: { value: 'FAC-002' } });
    expect(optionIds()).toEqual(['invoice-picker-option-inv-2']);
  });

  it('filters by business partner, case-insensitively', () => {
    render(<InvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('invoice-picker-search'), { target: { value: 'globex' } });
    expect(optionIds()).toEqual(['invoice-picker-option-inv-2']);
  });

  it('drops the suggested-first ordering once the user types', () => {
    render(<InvoicePickerModal {...BASE} multiple />);
    expect(optionIds()[0]).toBe('invoice-picker-option-inv-3');
    fireEvent.change(screen.getByTestId('invoice-picker-search'), { target: { value: 'acme' } });
    expect(optionIds()).toEqual(['invoice-picker-option-inv-1', 'invoice-picker-option-inv-3']);
  });

  it('trims the query', () => {
    render(<InvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('invoice-picker-search'), { target: { value: '  ALB  ' } });
    expect(optionIds()).toEqual(['invoice-picker-option-inv-3']);
  });

  it('reports no matches instead of an empty void', () => {
    render(<InvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('invoice-picker-search'), { target: { value: 'nothing-like-this' } });
    expect(screen.getByTestId('invoice-picker-no-matches')).toHaveTextContent('rectNoInvoices');
    expect(optionIds()).toEqual([]);
  });

  it('reports no matches on an empty candidate list', () => {
    render(<InvoicePickerModal {...BASE} invoices={[]} />);
    expect(screen.getByTestId('invoice-picker-no-matches')).toBeInTheDocument();
  });
});

describe('InvoicePickerModal — row rendering', () => {
  it('reads the two response shapes its callers produce', () => {
    // The tab reads the NEO header entity, the return flow reads its own action endpoint.
    render(<InvoicePickerModal {...BASE} invoices={[
      { id: 'a', _identifier: 'FAC-NEO', 'businessPartner$_identifier': 'NEO Partner' },
      { id: 'b', documentNo: 'FAC-ACT', businessPartner: 'Action Partner' },
      { id: 'c' },
    ]} />);
    expect(screen.getByTestId('invoice-picker-option-a')).toHaveTextContent('FAC-NEO');
    expect(screen.getByTestId('invoice-picker-option-a')).toHaveTextContent('NEO Partner');
    expect(screen.getByTestId('invoice-picker-option-b')).toHaveTextContent('FAC-ACT');
    // Last resort so a row is never blank.
    expect(screen.getByTestId('invoice-picker-option-c')).toHaveTextContent('c');
  });

  it('prefers the $_identifier twin over the raw id column for the partner name', () => {
    // NEO header rows carry the UUID in `businessPartner` and the display name in the
    // `$_identifier` twin — reading the raw column first renders a UUID at the user.
    render(<InvoicePickerModal {...BASE} invoices={[{
      id: 'a',
      documentNo: 'FAC-001',
      businessPartner: '8A1B2C3D4E5F60718293A4B5C6D7E8F9',
      'businessPartner$_identifier': 'Acme Corp',
    }]} />);
    const row = screen.getByTestId('invoice-picker-option-a');
    expect(row).toHaveTextContent('Acme Corp');
    // The negative assertion is the one that matters: the previous order rendered the UUID and
    // every fixture in the panel suite defined only the twin, so the wrong branch was never taken.
    expect(row).not.toHaveTextContent('8A1B2C3D4E5F60718293A4B5C6D7E8F9');
    expect(screen.queryByText('8A1B2C3D4E5F60718293A4B5C6D7E8F9')).not.toBeInTheDocument();
  });

  it('serves the mirror row shape of the return flow, which has no twin at all', () => {
    // The rectifiableInvoices action puts the readable name straight in `businessPartner`.
    render(<InvoicePickerModal {...BASE} invoices={[
      { id: 'a', documentNo: 'FAC-001', businessPartner: 'Laura Morat' },
    ]} />);
    expect(screen.getByTestId('invoice-picker-option-a')).toHaveTextContent('Laura Morat');
  });

  it('prefers documentNo over the _identifier twin for the document label', () => {
    render(<InvoicePickerModal {...BASE} invoices={[
      { id: 'a', documentNo: 'FAC-001', _identifier: 'FAC-001 - Laura Morat' },
    ]} />);
    const row = screen.getByTestId('invoice-picker-option-a');
    expect(row).toHaveTextContent('FAC-001');
    expect(row).not.toHaveTextContent('FAC-001 - Laura Morat');
  });

  it('searches the fallback identifiers too', () => {
    render(<InvoicePickerModal {...BASE} invoices={[
      { id: 'a', _identifier: 'FAC-NEO', 'businessPartner$_identifier': 'NEO Partner' },
      { id: 'b', documentNo: 'FAC-ACT', businessPartner: 'Action Partner' },
    ]} />);
    fireEvent.change(screen.getByTestId('invoice-picker-search'), { target: { value: 'neo partner' } });
    expect(optionIds()).toEqual(['invoice-picker-option-a']);
  });

  it('shows an em dash where there is no amount and no date', () => {
    render(<InvoicePickerModal {...BASE} invoices={[{ id: 'a', documentNo: 'FAC-001' }]} />);
    expect(screen.getByTestId('invoice-picker-option-a').textContent).toContain('—');
  });

  it('accepts either amount field name', () => {
    render(<InvoicePickerModal {...BASE} invoices={[
      { id: 'a', documentNo: 'A', grandTotalAmount: 10 },
      { id: 'b', documentNo: 'B', grandTotalAmt: 20 },
    ]} />);
    expect(screen.getByTestId('invoice-picker-option-a')).toHaveTextContent('10,00');
    expect(screen.getByTestId('invoice-picker-option-b')).toHaveTextContent('20,00');
  });
});

describe('InvoicePickerModal — overflow', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => ({ id: `inv-${i}`, documentNo: `FAC-${i}` }));

  it('caps at 5 rows by default and announces the remainder', () => {
    render(<InvoicePickerModal {...BASE} invoices={many(9)} />);
    expect(optionIds()).toHaveLength(5);
    expect(screen.getByText(/rectMoreInvoicesHint/)).toHaveTextContent('4');
  });

  it('honours a wider cap when a caller asks for one', () => {
    render(<InvoicePickerModal {...BASE} invoices={many(57)} maxVisible={50} />);
    expect(optionIds()).toHaveLength(50);
    expect(screen.getByText(/rectMoreInvoicesHint/)).toHaveTextContent('7');
  });

  it('counts the overflow after the currentId row is removed, not before', () => {
    render(<InvoicePickerModal {...BASE} invoices={many(6)} maxVisible={5} currentId="inv-0" />);
    expect(optionIds()).toHaveLength(5);
    expect(screen.queryByText(/rectMoreInvoicesHint/)).not.toBeInTheDocument();
  });

  it('says nothing about hidden rows when everything fits', () => {
    render(<InvoicePickerModal {...BASE} />);
    expect(screen.queryByText(/rectMoreInvoicesHint/)).not.toBeInTheDocument();
  });
});

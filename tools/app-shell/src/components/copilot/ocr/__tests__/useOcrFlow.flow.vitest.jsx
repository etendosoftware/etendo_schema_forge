/**
 * End-to-end flow coverage for useOcrFlow.
 *
 * The sibling useOcrFlow.vitest.jsx stubs the review modals as `() => null`, so
 * the header-review promise never settles and the flow stops at "loading". This
 * file drives the WHOLE pipeline instead: the mocked modals render real buttons
 * that call `onSubmit`/`onCancel`, so every downstream branch (pre-resolvers,
 * line resolution, product resolver popup, batch commit, batch failure, throw)
 * actually runs and can be asserted on.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const H = vi.hoisted(() => ({
  docType: null,
  showResult: vi.fn(),
  runBatch: vi.fn(),
  buildBatch: vi.fn(),
  preResolvers: {},
  reviewProps: null,
  linesProps: null,
  popupProps: null,
  reviewSubmitValue: { vendor: 'reviewed-vendor' },
  linesSubmitValue: [{ description: 'reviewed-line' }],
  popupSubmitValue: [{ picked: 'p1' }],
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/hooks/useBulkActionToast', () => ({
  useBulkActionToast: () => ({ showResult: H.showResult }),
}));

vi.mock('../ingest/useBatch', () => ({
  useBatch: () => ({ runBatch: H.runBatch }),
}));

vi.mock('../ingest/purchaseInvoiceDescriptor', () => ({
  buildPurchaseInvoiceBatch: (...args) => H.buildBatch(...args),
}));

vi.mock('../ocrDocTypes', () => ({
  getOcrDocType: () => H.docType,
}));

vi.mock('../contactApi', () => ({
  deriveContactsApiBase: (base) => `${base}/contacts`,
}));

// PRE_RESOLVERS is read at call time (`PRE_RESOLVERS[field.preResolve]`), so
// keeping the SAME object and mutating it per test is enough.
vi.mock('../strategies', () => ({
  CREATE_COMPONENTS: {},
  PRE_RESOLVERS: H.preResolvers,
}));

vi.mock('../OcrReviewModal', () => ({
  default: (props) => {
    H.reviewProps = props;
    return (
      <div data-testid="review-modal">
        <span data-testid="review-resolving">{String(props.resolving)}</span>
        <span data-testid="review-pre-resolved">{JSON.stringify(props.preResolved)}</span>
        <span data-testid="review-contacts-base">{String(props.contactsBase)}</span>
        <button type="button" data-testid="review-submit" onClick={() => props.onSubmit(H.reviewSubmitValue)}>
          submit
        </button>
        <button type="button" data-testid="review-cancel" onClick={() => props.onCancel()}>
          cancel
        </button>
      </div>
    );
  },
}));

vi.mock('../OcrLinesReviewModal', () => ({
  default: (props) => {
    H.linesProps = props;
    return (
      <div data-testid="lines-modal">
        <span data-testid="lines-payload">{JSON.stringify(props.lines)}</span>
        <button type="button" data-testid="lines-submit" onClick={() => props.onSubmit(H.linesSubmitValue)}>
          submit
        </button>
        <button type="button" data-testid="lines-cancel" onClick={() => props.onCancel()}>
          cancel
        </button>
      </div>
    );
  },
}));

vi.mock('../ProductResolverPopup', () => ({
  default: (props) => {
    H.popupProps = props;
    return (
      <div data-testid="popup">
        <span data-testid="popup-unmatched">{JSON.stringify(props.unmatched)}</span>
        <button type="button" data-testid="popup-submit" onClick={() => props.onSubmit(H.popupSubmitValue)}>
          submit
        </button>
        <button type="button" data-testid="popup-cancel" onClick={() => props.onCancel()}>
          cancel
        </button>
      </div>
    );
  },
}));

import { useOcrFlow } from '../useOcrFlow.jsx';

const EVENT = 'ocr:test-event';

/** Renders the hook and exposes its state in the DOM so it can be asserted on. */
function Harness(props) {
  const { result, loading, pendingModal } = useOcrFlow(props);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="result">{JSON.stringify(result)}</span>
      {pendingModal}
    </div>
  );
}

function docType(overrides = {}) {
  return {
    id: 'purchase-invoice',
    eventName: EVENT,
    headerFields: [],
    lineColumns: [],
    ...overrides,
  };
}

function readResult() {
  const raw = screen.getByTestId('result').textContent;
  return raw ? JSON.parse(raw) : null;
}

function renderFlow(props = {}) {
  const onRefresh = vi.fn();
  render(<Harness docTypeId="purchase-invoice" token="tok" apiBaseUrl="/api" onRefresh={onRefresh} {...props} />);
  return { onRefresh };
}

async function fireOcr(detail) {
  await waitFor(() => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  });
}

describe('useOcrFlow — full flow', () => {
  beforeEach(() => {
    H.docType = docType();
    H.reviewProps = null;
    H.linesProps = null;
    H.popupProps = null;
    H.reviewSubmitValue = { vendor: 'reviewed-vendor' };
    H.linesSubmitValue = [{ description: 'reviewed-line' }];
    H.popupSubmitValue = [{ picked: 'p1' }];
    for (const key of Object.keys(H.preResolvers)) delete H.preResolvers[key];
    H.showResult.mockReset();
    H.runBatch.mockReset().mockResolvedValue({ committed: true, operations: [] });
    H.buildBatch.mockReset().mockResolvedValue({ ops: [{ id: 'inv' }], unmatched: [] });
  });

  describe('committed batch', () => {
    it('reports the created header, counts the ln* line ops and refreshes', async () => {
      const user = userEvent.setup();
      H.runBatch.mockResolvedValue({
        committed: true,
        operations: [
          { id: 'inv', recordId: 'INV-1' },
          { id: 'ln1', recordId: 'L1' },
          { id: 'ln2', recordId: 'L2' },
          { id: 'attach', recordId: 'A1' },
        ],
      });
      H.buildBatch.mockResolvedValue({ ops: [{ id: 'inv' }], unmatched: ['Widget X'] });

      const { onRefresh } = renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(readResult()).not.toBeNull());
      expect(readResult()).toEqual({
        committed: true,
        recordId: 'INV-1',
        linesCreated: 2,
        linesFailed: 0,
        unresolved: ['Widget X'],
      });
      // ok = 1 header + 2 lines; unmatched products surface as soft failures.
      expect(H.showResult).toHaveBeenCalledWith({
        ok: 3,
        failed: [{ reason: 'product_not_found: Widget X' }],
      });
      expect(onRefresh).toHaveBeenCalledWith('INV-1');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      // The review modal is unmounted once the flow completes.
      expect(screen.queryByTestId('review-modal')).not.toBeInTheDocument();
    });

    it('passes the reviewed header to the descriptor and no lines when there are none', async () => {
      const user = userEvent.setup();
      renderFlow();
      await fireOcr({ vendor_name: 'Acme', line_items: [] });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(H.buildBatch).toHaveBeenCalled());
      const [payload, context] = H.buildBatch.mock.calls[0];
      expect(payload).toEqual({ vendor_name: 'Acme', line_items: [] });
      expect(context.reviewedHeader).toEqual({ vendor: 'reviewed-vendor' });
      expect(context.reviewedLines).toBeNull();
      // ETP-4576 — the descriptor ctx no longer carries a token; the resolvers
    // it drives read the session credential themselves.
    expect(context.token).toBeUndefined();
      expect(context.apiBaseUrl).toBe('/api');
    });

    it('tolerates an event with no detail (empty payload)', async () => {
      const user = userEvent.setup();
      renderFlow();
      await fireOcr(undefined);
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(H.buildBatch).toHaveBeenCalled());
      expect(H.buildBatch.mock.calls[0][0]).toEqual({});
    });
  });

  describe('header review pre-resolution', () => {
    it('pre-resolves header fields before opening the modal and drops null results', async () => {
      H.preResolvers.findBp = vi.fn(async ({ value, extracted, field }) => (
        { id: 'BP-1', label: `${value}/${extracted.tax_id}/${field.key}` }
      ));
      H.preResolvers.findNothing = vi.fn(async () => null);
      H.docType = docType({
        headerFields: [
          { key: 'vendor', extractFrom: ['vendor_name', 'tax_id'], preResolve: 'findBp' },
          { key: 'ghost', extractFrom: 'nope', preResolve: 'findNothing' },
          { key: 'documentNo', extractFrom: 'document_no' },
        ],
      });

      renderFlow();
      await fireOcr({ vendor_name: 'Acme', tax_id: 'B123', document_no: 'F-1' });

      await screen.findByTestId('review-modal');
      // Only the resolver that returned a value is seeded; `resolving` is back to false.
      expect(JSON.parse(screen.getByTestId('review-pre-resolved').textContent)).toEqual({
        vendor: { id: 'BP-1', label: 'Acme/B123/vendor' },
      });
      expect(screen.getByTestId('review-resolving')).toHaveTextContent('false');
      expect(H.preResolvers.findBp).toHaveBeenCalledTimes(1);
      // A field with no `preResolve` never reaches a resolver.
      expect(H.reviewProps.fields).toHaveLength(3);
      expect(H.reviewProps.contactsBase).toBe('/api/contacts');
      expect(H.reviewProps.extracted).toEqual({ vendor_name: 'Acme', tax_id: 'B123', document_no: 'F-1' });
    });

    it('falls back to the second extractFrom key when the first is missing', async () => {
      H.preResolvers.findBp = vi.fn(async ({ value }) => ({ id: 'BP-2', label: String(value) }));
      H.docType = docType({
        headerFields: [{ key: 'vendor', extractFrom: ['vendor_name', 'tax_id'], preResolve: 'findBp' }],
      });

      renderFlow();
      await fireOcr({ tax_id: 'B999' });

      await screen.findByTestId('review-modal');
      expect(JSON.parse(screen.getByTestId('review-pre-resolved').textContent)).toEqual({
        vendor: { id: 'BP-2', label: 'B999' },
      });
    });

    it('skips a field whose preResolve key has no registered resolver', async () => {
      H.docType = docType({
        headerFields: [{ key: 'vendor', extractFrom: 'vendor_name', preResolve: 'notRegistered' }],
      });

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });

      await screen.findByTestId('review-modal');
      expect(JSON.parse(screen.getByTestId('review-pre-resolved').textContent)).toEqual({});
    });
  });

  describe('cancellation', () => {
    it('cancelling the header review aborts before building the batch', async () => {
      const user = userEvent.setup();
      const { onRefresh } = renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-cancel'));

      await waitFor(() => expect(readResult()).toEqual({ committed: false, cancelled: true }));
      expect(H.showResult).toHaveBeenCalledWith({ ok: 0, failed: [{ reason: 'cancelled_by_user' }] });
      expect(H.buildBatch).not.toHaveBeenCalled();
      expect(onRefresh).not.toHaveBeenCalled();
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    it('cancelling the lines review aborts before building the batch', async () => {
      const user = userEvent.setup();
      H.preResolvers.findTax = vi.fn(async () => ({ id: 'T1', label: 'IVA 21%', rate: 21 }));
      H.docType = docType({
        lineColumns: [{ key: 'tax', kind: 'entity', extractFrom: 'tax_label', preResolve: 'findTax' }],
      });

      renderFlow();
      await fireOcr({ line_items: [{ description: 'A', tax_label: 'iva' }] });
      await user.click(await screen.findByTestId('review-submit'));
      await user.click(await screen.findByTestId('lines-cancel'));

      await waitFor(() => expect(readResult()).toEqual({ committed: false, cancelled: true }));
      expect(H.buildBatch).not.toHaveBeenCalled();
    });

    it('a descriptor that reports cancelled surfaces as a cancelled result', async () => {
      const user = userEvent.setup();
      H.buildBatch.mockResolvedValue({ cancelled: true });

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(readResult()).toEqual({ committed: false, cancelled: true }));
      expect(H.runBatch).not.toHaveBeenCalled();
    });

    it('a descriptor returning nothing at all is treated as cancelled', async () => {
      const user = userEvent.setup();
      H.buildBatch.mockResolvedValue(null);

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(readResult()).toEqual({ committed: false, cancelled: true }));
      expect(H.runBatch).not.toHaveBeenCalled();
    });
  });

  describe('line resolution', () => {
    it('resolves entity line columns and mirrors the tax id/rate aliases', async () => {
      const user = userEvent.setup();
      H.preResolvers.findTax = vi.fn(async ({ value }) => ({ id: 'T1', label: `IVA(${value})`, rate: 21 }));
      H.docType = docType({
        lineColumns: [
          { key: 'tax', kind: 'entity', extractFrom: 'tax_label', preResolve: 'findTax' },
          { key: 'description', kind: 'text', extractFrom: 'description' },
        ],
      });

      renderFlow();
      await fireOcr({ line_items: [{ description: 'A', tax_label: '21%' }] });
      await user.click(await screen.findByTestId('review-submit'));

      await screen.findByTestId('lines-modal');
      const lines = JSON.parse(screen.getByTestId('lines-payload').textContent);
      expect(lines).toEqual([{
        description: 'A',
        tax_label: 'IVA(21%)',
        tax_id: 'T1',
        tax_rate: 21,
      }]);
      expect(H.linesProps.columns).toBe(H.docType.lineColumns);

      await user.click(screen.getByTestId('lines-submit'));
      await waitFor(() => expect(H.buildBatch).toHaveBeenCalled());
      expect(H.buildBatch.mock.calls[0][1].reviewedLines).toEqual([{ description: 'reviewed-line' }]);
    });

    it('keeps the extracted label and nulls the id when the resolver finds nothing', async () => {
      const user = userEvent.setup();
      H.preResolvers.findTax = vi.fn(async () => null);
      H.docType = docType({
        lineColumns: [{ key: 'tax', kind: 'entity', extractFrom: 'tax_label', preResolve: 'findTax' }],
      });

      renderFlow();
      await fireOcr({ line_items: [{ description: 'A', tax_label: '21%' }] });
      await user.click(await screen.findByTestId('review-submit'));

      await screen.findByTestId('lines-modal');
      // Unresolved: the line keeps its raw label and gets the null id/rate defaults.
      expect(JSON.parse(screen.getByTestId('lines-payload').textContent)).toEqual([{
        description: 'A',
        tax_label: '21%',
        tax_id: null,
        tax_rate: null,
      }]);
    });

    it('resolves a non-tax entity column without touching the tax aliases', async () => {
      const user = userEvent.setup();
      H.preResolvers.findProduct = vi.fn(async () => ({ id: 'P1', label: 'Widget' }));
      H.docType = docType({
        lineColumns: [{ key: 'product', kind: 'entity', extractFrom: 'product_name', preResolve: 'findProduct' }],
      });

      renderFlow();
      await fireOcr({ line_items: [{ product_name: 'widgt' }] });
      await user.click(await screen.findByTestId('review-submit'));

      await screen.findByTestId('lines-modal');
      expect(JSON.parse(screen.getByTestId('lines-payload').textContent)).toEqual([{
        product_name: 'Widget',
        product_id: 'P1',
        // mapLineValue fills the entity id/rate keys, falling back to the tax_* aliases.
        product_rate: null,
      }]);
    });

    it('reviews the raw lines untouched when no entity column declares a pre-resolver', async () => {
      const user = userEvent.setup();
      H.docType = docType({
        lineColumns: [{ key: 'description', kind: 'text', extractFrom: 'description' }],
      });

      renderFlow();
      await fireOcr({ line_items: [{ description: 'A' }] });
      await user.click(await screen.findByTestId('review-submit'));

      // No entity pre-resolver ⇒ resolveLines short-circuits and hands the
      // extracted lines straight to the review modal.
      await screen.findByTestId('lines-modal');
      expect(JSON.parse(screen.getByTestId('lines-payload').textContent)).toEqual([{ description: 'A' }]);

      await user.click(screen.getByTestId('lines-submit'));
      await waitFor(() => expect(H.buildBatch).toHaveBeenCalled());
      expect(H.buildBatch.mock.calls[0][1].reviewedLines).toEqual([{ description: 'reviewed-line' }]);
    });

    it('skips the lines review when the payload carries no line_items', async () => {
      const user = userEvent.setup();
      H.preResolvers.findTax = vi.fn(async () => ({ id: 'T1', label: 'IVA', rate: 21 }));
      H.docType = docType({
        lineColumns: [{ key: 'tax', kind: 'entity', extractFrom: 'tax_label', preResolve: 'findTax' }],
      });

      renderFlow();
      await fireOcr({ vendor_name: 'Acme', line_items: [] });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(H.buildBatch).toHaveBeenCalled());
      expect(screen.queryByTestId('lines-modal')).not.toBeInTheDocument();
      expect(H.preResolvers.findTax).not.toHaveBeenCalled();
    });
  });

  describe('product resolver popup', () => {
    it('resolves the descriptor promise with the user picks', async () => {
      const user = userEvent.setup();
      let picks;
      H.buildBatch.mockImplementation(async (_payload, ctx) => {
        picks = await ctx.askUserForProducts({
          unmatched: ['Widget X'],
          selectorUrl: '/sel',
          productSpecUrl: '/spec',
        });
        return { ops: [{ id: 'inv' }], unmatched: [] };
      });

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));

      await screen.findByTestId('popup');
      expect(JSON.parse(screen.getByTestId('popup-unmatched').textContent)).toEqual(['Widget X']);
      expect(H.popupProps.selectorUrl).toBe('/sel');
      expect(H.popupProps.productSpecUrl).toBe('/spec');
      expect(H.popupProps.token).toBeUndefined();

      await user.click(screen.getByTestId('popup-submit'));
      await waitFor(() => expect(picks).toEqual([{ picked: 'p1' }]));
      // Closing the popup clears it from pendingModal.
      expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
    });

    it('resolves with null when the user dismisses the popup', async () => {
      const user = userEvent.setup();
      let picks = 'untouched';
      H.buildBatch.mockImplementation(async (_payload, ctx) => {
        picks = await ctx.askUserForProducts({ unmatched: ['Widget X'] });
        return { ops: [], unmatched: [] };
      });

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));
      await user.click(await screen.findByTestId('popup-cancel'));

      await waitFor(() => expect(picks).toBeNull());
    });
  });

  describe('failure paths', () => {
    it('reports an empty batch without calling the backend', async () => {
      const user = userEvent.setup();
      H.buildBatch.mockResolvedValue({ ops: [], unmatched: [] });

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(readResult()).toEqual({ committed: false, error: 'Empty batch' }));
      expect(H.showResult).toHaveBeenCalledWith({ ok: 0, failed: [{ reason: 'empty_batch' }] });
      expect(H.runBatch).not.toHaveBeenCalled();
    });

    it('surfaces the backend error message when the batch is not committed', async () => {
      const user = userEvent.setup();
      H.runBatch.mockResolvedValue({
        committed: false,
        error: { message: 'invoice date is mandatory' },
        failedAt: { id: 'inv' },
      });

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(readResult()).toEqual({
        committed: false,
        error: 'invoice date is mandatory',
        failedAt: { id: 'inv' },
      }));
      expect(H.showResult).toHaveBeenCalledWith({
        ok: 0,
        failed: [{ reason: 'invoice date is mandatory' }],
      });
    });

    it('falls back to the failed operation id when the backend sends no message', async () => {
      const user = userEvent.setup();
      H.runBatch.mockResolvedValue({ committed: false, failedAt: { id: 'ln3' } });

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(readResult()).toEqual({
        committed: false,
        error: "Operation 'ln3' failed",
        failedAt: { id: 'ln3' },
      }));
    });

    it('catches a thrown error and stops loading', async () => {
      const user = userEvent.setup();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      H.runBatch.mockRejectedValue(new Error('kaboom'));

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(readResult()).toEqual({ committed: false, error: 'kaboom' }));
      expect(H.showResult).toHaveBeenCalledWith({ ok: 0, failed: [{ reason: 'kaboom' }] });
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      errorSpy.mockRestore();
    });

    it('uses a generic reason when the thrown value carries no message', async () => {
      const user = userEvent.setup();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      H.buildBatch.mockRejectedValue('plain string');

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(H.showResult).toHaveBeenCalledWith({
        ok: 0,
        failed: [{ reason: 'flow_failed' }],
      }));
      expect(readResult()).toEqual({ committed: false });
      errorSpy.mockRestore();
    });
  });

  describe('doc-type wiring', () => {
    it('warns and registers no listener when the doc type has no descriptor', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      H.docType = docType({ id: 'sales-order' });

      renderFlow();
      await fireOcr({ vendor_name: 'Acme' });

      expect(warnSpy).toHaveBeenCalledWith('[OCR] no descriptor registered for docType', 'sales-order');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      expect(screen.queryByTestId('review-modal')).not.toBeInTheDocument();
      warnSpy.mockRestore();
    });

    it('registers no listener for an unknown doc type', async () => {
      H.docType = null;
      renderFlow({ docTypeId: 'nope' });
      await fireOcr({ vendor_name: 'Acme' });

      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      expect(readResult()).toBeNull();
      expect(screen.queryByTestId('review-modal')).not.toBeInTheDocument();
    });

    it('completes without an onRefresh callback', async () => {
      const user = userEvent.setup();
      H.runBatch.mockResolvedValue({ committed: true, operations: [{ id: 'inv', recordId: 'INV-9' }] });

      render(<Harness docTypeId="purchase-invoice" token="tok" apiBaseUrl="/api" />);
      await fireOcr({ vendor_name: 'Acme' });
      await user.click(await screen.findByTestId('review-submit'));

      await waitFor(() => expect(readResult()).toEqual({
        committed: true,
        recordId: 'INV-9',
        linesCreated: 0,
        linesFailed: 0,
        unresolved: [],
      }));
    });

    it('omits contactsBase when no apiBaseUrl is configured', async () => {
      H.docType = docType();
      render(<Harness docTypeId="purchase-invoice" token="tok" />);
      await fireOcr({ vendor_name: 'Acme' });

      await screen.findByTestId('review-modal');
      expect(screen.getByTestId('review-contacts-base')).toHaveTextContent('null');
    });
  });
});

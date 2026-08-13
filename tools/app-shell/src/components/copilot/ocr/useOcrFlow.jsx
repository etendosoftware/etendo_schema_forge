import { useCallback, useEffect, useRef, useState } from 'react';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import { getOcrDocType } from './ocrDocTypes';
import { useBatch } from './ingest/useBatch';
import { buildPurchaseInvoiceBatch } from './ingest/purchaseInvoiceDescriptor';
import ProductResolverPopup from './ProductResolverPopup';
import OcrReviewModal from './OcrReviewModal';
import OcrLinesReviewModal from './OcrLinesReviewModal';
import { deriveContactsApiBase } from './contactApi';
import { CREATE_COMPONENTS, PRE_RESOLVERS } from './strategies';

/* eslint-disable react/prop-types */

// Maps doc-type id to the descriptor that builds its /batch ops. Adding a new
// window is one entry here plus the descriptor file.
const DESCRIPTORS = {
  'purchase-invoice': buildPurchaseInvoiceBatch,
};

async function resolveField(field, extracted, context) {
  const resolver = PRE_RESOLVERS[field.preResolve];
  if (!resolver) return null;
  const value = Array.isArray(field.extractFrom)
    ? extracted?.[field.extractFrom[0]] ?? extracted?.[field.extractFrom[1]] ?? null
    : extracted?.[field.extractFrom] ?? null;
  return resolver({
    ...context,
    field,
    value,
    extracted,
  });
}

async function resolvePreResolvedFields(fields, extracted, context) {
  const entries = await Promise.all((fields || []).map(async (field) => {
    if (!field?.preResolve) return [field.key, null];
    return [field.key, await resolveField(field, extracted, context)];
  }));
  return Object.fromEntries(entries.filter(([key, value]) => key && value));
}

function mapLineValue(column, row) {
  if (column.kind === 'entity') {
    const idKey = `${column.key}_id`;
    const rateKey = `${column.key}_rate`;
    return {
      ...row,
      [idKey]: row?.[idKey] ?? row?.tax_id ?? null,
      [rateKey]: row?.[rateKey] ?? row?.tax_rate ?? null,
    };
  }
  return row;
}

async function resolveLines(columns, lines, context) {
  const entityColumns = (columns || []).filter((column) => column?.kind === 'entity' && column?.preResolve);
  if (entityColumns.length === 0) return Array.isArray(lines) ? lines : [];

  return Promise.all((Array.isArray(lines) ? lines : []).map(async (line) => {
    let nextLine = { ...line };
    for (const column of entityColumns) {
      const resolved = await resolveField(column, nextLine, context);
      if (!resolved) continue;
      const idKey = `${column.key}_id`;
      const rateKey = `${column.key}_rate`;
      nextLine = {
        ...nextLine,
        [column.extractFrom]: resolved.label || nextLine?.[column.extractFrom] || '',
        [idKey]: resolved.id || null,
      };
      if (resolved.rate != null) nextLine[rateKey] = resolved.rate;
      if (column.key === 'tax') {
        nextLine.tax_id = resolved.id || nextLine.tax_id || null;
        if (resolved.rate != null) nextLine.tax_rate = resolved.rate;
      }
    }
    return mapLineValue(entityColumns[0], nextLine);
  }));
}

function mapCreateComponents(fields) {
  return Object.fromEntries((fields || []).map((field) => [
    field.key,
    field.createComponent ? CREATE_COMPONENTS[field.createComponent] || null : null,
  ]));
}

function hasLinesToReview(docType, payload) {
  return Boolean(docType?.lineColumns?.length) && Array.isArray(payload?.line_items) && payload.line_items.length > 0;
}

export function useOcrFlow({
  docTypeId,
  token,
  apiBaseUrl,
  onRefresh,
} = {}) {
  const docType = getOcrDocType(docTypeId);
  const { runBatch } = useBatch({ apiBaseUrl, token });
  const { showResult } = useBulkActionToast();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewExtracted, setReviewExtracted] = useState(null);
  const [reviewPreResolved, setReviewPreResolved] = useState({});
  const [reviewResolving, setReviewResolving] = useState(false);
  const resolveRef = useRef(null);

  const [linesOpen, setLinesOpen] = useState(false);
  const [linesPayload, setLinesPayload] = useState([]);
  const linesResolveRef = useRef(null);

  const [pendingPopup, setPendingPopup] = useState(null);

  const askUserForProducts = useCallback(({ unmatched, selectorUrl, productSpecUrl }) => new Promise((resolve) => {
    const close = (value) => { setPendingPopup(null); resolve(value); };
    setPendingPopup(
      <ProductResolverPopup
        unmatched={unmatched}
        selectorUrl={selectorUrl}
        productSpecUrl={productSpecUrl}
        token={token}
        onSubmit={(picks) => close(picks)}
        onCancel={() => close(null)}
        data-testid="ProductResolverPopup__ebdfaa" />
    );
  }), [token]);

  const closeReview = (value) => {
    setReviewOpen(false);
    setReviewExtracted(null);
    setReviewPreResolved({});
    setReviewResolving(false);
    const fn = resolveRef.current;
    resolveRef.current = null;
    if (fn) fn(value);
  };

  const closeLines = (value) => {
    setLinesOpen(false);
    setLinesPayload([]);
    const fn = linesResolveRef.current;
    linesResolveRef.current = null;
    if (fn) fn(value);
  };

  const askUserToReviewLines = useCallback((lines) => new Promise((resolve) => {
    linesResolveRef.current = resolve;
    setLinesPayload(Array.isArray(lines) ? lines : []);
    setLinesOpen(true);
  }), []);

  const askUserToReview = useCallback((extracted) => new Promise((resolve) => {
    resolveRef.current = resolve;
    // Resolve pre-resolvers BEFORE opening the modal so the initial render
    // already shows the matched vendor with its toggle on. OcrReviewModal seeds
    // its row state from `preResolved` in a useState initializer that only
    // runs on mount, so a late update would otherwise be ignored.
    setReviewExtracted(extracted);
    setReviewPreResolved({});
    setReviewResolving(true);
    (async () => {
      const preResolved = await resolvePreResolvedFields(docType?.headerFields, extracted, {
        token,
        apiBaseUrl,
      });
      setReviewPreResolved(preResolved);
      setReviewResolving(false);
      setReviewOpen(true);
    })();
  }), [docType, token, apiBaseUrl]);

  useEffect(() => {
    if (!docType?.eventName) return undefined;
    const buildBatch = DESCRIPTORS[docType.id];
    if (!buildBatch) {
      console.warn('[OCR] no descriptor registered for docType', docType.id);
      return undefined;
    }

    const handler = async (event) => {
      const payload = event.detail || {};
      setLoading(true);
      setResult(null);
      try {
        const reviewed = await askUserToReview(payload);
        if (!reviewed) {
          showResult({ ok: 0, failed: [{ reason: 'cancelled_by_user' }] });
          setResult({ committed: false, cancelled: true });
          return;
        }
        const extractedLines = hasLinesToReview(docType, payload)
          ? await resolveLines(docType.lineColumns, payload.line_items, { token, apiBaseUrl })
          : [];
        let reviewedLines = null;
        if (extractedLines.length > 0) {
          reviewedLines = await askUserToReviewLines(extractedLines);
          if (!reviewedLines) {
            showResult({ ok: 0, failed: [{ reason: 'cancelled_by_user' }] });
            setResult({ committed: false, cancelled: true });
            return;
          }
        }
        const built = await buildBatch(payload, {
          token,
          apiBaseUrl,
          askUserForProducts,
          reviewedHeader: reviewed,
          reviewedLines,
        });
        if (!built || built.cancelled) {
          showResult({ ok: 0, failed: [{ reason: 'cancelled_by_user' }] });
          setResult({ committed: false, cancelled: true });
          return;
        }
        const ops = built.ops || [];
        const unmatched = built.unmatched || [];
        if (ops.length === 0) {
          showResult({ ok: 0, failed: [{ reason: 'empty_batch' }] });
          setResult({ committed: false, error: 'Empty batch' });
          return;
        }
        console.log('[OCR][batch] POSTing', ops.length, 'op(s)');
        const response = await runBatch(ops);
        if (response?.committed) {
          const recordOps = response.operations || [];
          const headerOp = recordOps.find(o => o.id === 'inv');
          const lineCount = recordOps.filter(o => /^ln\d+$/.test(o.id || '')).length;
          showResult({
            ok: 1 + lineCount,
            failed: unmatched.map(name => ({ reason: `product_not_found: ${name}` })),
          });
          setResult({
            committed: true,
            recordId: headerOp?.recordId,
            linesCreated: lineCount,
            linesFailed: 0,
            unresolved: unmatched,
          });
          onRefresh?.(headerOp?.recordId);
        } else {
          const message = response?.error?.message
            || `Operation '${response?.failedAt?.id}' failed`;
          console.warn('[OCR][batch] not committed', response);
          showResult({ ok: 0, failed: [{ reason: message }] });
          setResult({
            committed: false,
            error: message,
            failedAt: response?.failedAt,
          });
        }
      } catch (e) {
        console.error('[OCR][batch] flow failed', e);
        showResult({ ok: 0, failed: [{ reason: e?.message || 'flow_failed' }] });
        setResult({ committed: false, error: e?.message });
      } finally {
        setLoading(false);
      }
    };

    window.addEventListener(docType.eventName, handler);
    return () => window.removeEventListener(docType.eventName, handler);
  }, [docType, token, apiBaseUrl, askUserToReview, askUserToReviewLines, askUserForProducts, runBatch, showResult, onRefresh]);

  const contactsBase = apiBaseUrl ? deriveContactsApiBase(apiBaseUrl) : null;
  let pendingModal = pendingPopup;
  if (linesOpen) {
    pendingModal = (
      <OcrLinesReviewModal
        columns={docType.lineColumns}
        lines={linesPayload}
        token={token}
        apiBaseUrl={apiBaseUrl}
        onSubmit={(value) => closeLines(value)}
        onCancel={() => closeLines(null)}
        data-testid="OcrLinesReviewModal__ebdfaa" />
    );
  }
  if (reviewOpen) {
    pendingModal = (
      <OcrReviewModal
        extracted={reviewExtracted}
        fields={docType.headerFields}
        preResolved={reviewPreResolved}
        resolving={reviewResolving}
        contactsBase={contactsBase}
        apiBaseUrl={apiBaseUrl}
        token={token}
        onSubmit={(value) => closeReview(value)}
        onCancel={() => closeReview(null)}
        data-testid="OcrReviewModal__ebdfaa" />
    );
  }

  return { result, loading, pendingModal };
}

export default useOcrFlow;

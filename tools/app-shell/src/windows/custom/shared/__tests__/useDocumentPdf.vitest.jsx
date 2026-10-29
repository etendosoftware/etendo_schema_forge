// ETP-5988 — useDocumentPdf reads the organization's saved template BEFORE generating: a document
// that has one never serves a cached PDF, one that has none keeps the cache untouched, and a type
// with no template concept is not delayed at all.
// @covers tools/app-shell/src/windows/custom/shared/documentPdf.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';

const generator = vi.hoisted(() => ({ calls: [] }));
const loader = vi.hoisted(() => ({ value: null, calls: [], pending: null }));
vi.mock('../pdfUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  usePdfGenerator: (...args) => { generator.calls.push(args); return { pdfUrl: null, loading: false }; },
}));
vi.mock('../docTemplateConfig.js', () => ({
  loadDocTemplateConfig: (...a) => { loader.calls.push(a); return loader.pending ?? Promise.resolve(loader.value); },
}));

import { useDocumentPdf } from '../documentPdf.js';

const CACHE = { tableName: 'C_Invoice', storeCondition: true };
const last = () => generator.calls[generator.calls.length - 1];
const run = (docType, recordId = 'R1') => renderHook(() => useDocumentPdf(
  recordId, 'https://h/etendo/sws/neo/sales-invoice', 't', async () => ({}), {}, CACHE, docType));

describe('useDocumentPdf — saved template', () => {
  beforeEach(() => { generator.calls = []; loader.calls = []; loader.value = null; loader.pending = null; });

  it('waits for the template before generating, reading it from the NEO base', async () => {
    let release;
    loader.pending = new Promise((resolve) => { release = resolve; });
    run('sales-invoice');
    expect(last()[0]).toBeNull();
    expect(loader.calls[0]).toEqual(['sales-invoice', 'https://h/etendo/sws/neo', 't']);
    release(null);
    await waitFor(() => expect(last()[0]).toBe('R1'));
  });

  it('no saved template: generates with the cache config untouched', async () => {
    loader.value = null;
    run('sales-invoice');
    await waitFor(() => expect(last()[0]).toBe('R1'));
    expect(last()[4]).toBe(CACHE);
  });

  it('a saved template: generates without the cache, so the cached PDF cannot hide it', async () => {
    loader.value = { configured: true, variant: 'modern' };
    run('sales-invoice');
    await waitFor(() => expect(last()[0]).toBe('R1'));
    expect(last()[4]).toBeNull();
  });

  it('a type with no template concept is not delayed and reads nothing', () => {
    run(null);
    expect(last()[0]).toBe('R1');
    expect(last()[4]).toBe(CACHE);
    expect(loader.calls).toEqual([]);
  });

  it('no record (modal closed): nothing is read and nothing generated', () => {
    run('sales-invoice', null);
    expect(loader.calls).toEqual([]);
    expect(last()[0]).toBeNull();
  });
});

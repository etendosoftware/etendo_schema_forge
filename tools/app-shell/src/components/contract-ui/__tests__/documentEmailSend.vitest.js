import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildEmailContractCommand,
  buildPreviewFileName,
  cacheDocumentPreviewFile,
  readEmailContractResponse,
  resolveDocumentEmailContract,
  resolveNeoBaseUrl,
  sendDocumentEmail,
} from '../documentEmailSend.js';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe('documentEmailSend', () => {
  it('builds the minimal contract command without provider payload fields', () => {
    const command = buildEmailContractCommand('sales-invoice-send', 'invoice-1');

    expect(command).toEqual({
      version: 'v1',
      recordId: 'invoice-1',
      intent: 'send-document',
      idempotencyKey: 'sales-invoice-send:invoice-1:send:v1',
    });
    expect(command.to).toBeUndefined();
    expect(command.template).toBeUndefined();
    expect(command.data).toBeUndefined();
    expect(command.subject).toBeUndefined();
  });

  // ETP-4717 — messageEdits mirrors the existing recipientEdits opt-in
  // pattern: included only when the operator actually changed subject/message.
  it('includes messageEdits in the command when the operator edited subject/message', () => {
    const command = buildEmailContractCommand('sales-invoice-send', 'invoice-1', {
      messageEdits: { subject: 'S', message: 'M' },
    });

    expect(command.messageEdits).toEqual({ subject: 'S', message: 'M' });
  });

  it('omits messageEdits from the command when no message edits are provided', () => {
    const command = buildEmailContractCommand('sales-invoice-send', 'invoice-1', {});

    expect(command.messageEdits).toBeUndefined();
  });

  it('resolves sales document contract names', () => {
    expect(resolveDocumentEmailContract('sales-invoice')).toBe('sales-invoice-send');
    expect(resolveDocumentEmailContract('sales-order')).toBe('sales-order-send');
    expect(resolveDocumentEmailContract('sales-quotation')).toBe('sales-quotation-send');
  });

  it('resolves NEO base URL with and without a window path', () => {
    expect(resolveNeoBaseUrl('http://localhost:8080/etendo/neo/sales-invoice')).toBe('http://localhost:8080/etendo/neo');
    expect(resolveNeoBaseUrl()).toBe('/sws/neo');
  });

  it('returns an empty response object when contract response JSON cannot be parsed', async () => {
    await expect(readEmailContractResponse({ json: async () => { throw new Error('bad json'); } })).resolves.toEqual({});
  });

  it('builds a flat preview file name from document numbers with separators', () => {
    expect(buildPreviewFileName('sales-invoice', 'FVE/2026/0001', 'invoice-1')).toBe('sales-invoice-FVE-2026-0001.pdf');
  });

  it('collapses repeated unsafe preview file name characters', () => {
    expect(buildPreviewFileName('sales-invoice', 'INV///???001', 'invoice-1')).toBe('sales-invoice-INV-001.pdf');
  });

  it('preserves valid falsy document numbers in preview file names', () => {
    expect(buildPreviewFileName('sales-invoice', 0, 'invoice-1')).toBe('sales-invoice-0.pdf');
  });

  it('falls back to a deterministic preview file name when sanitized content is empty', () => {
    expect(buildPreviewFileName('', '///', 'invoice-1')).toBe('document-invoice-1.pdf');
  });

  it('caches a generated PDF before sending the email contract', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ response: { data: { status: 'SENT' } } }) });

    const result = await sendDocumentEmail({
      apiBaseUrl: 'http://localhost:8080/etendo/neo/sales-invoice',
      token: 'tok',
      documentId: 'invoice-1',
      windowName: 'sales-invoice',
      documentNo: 'INV-001',
      pdfBlob: new Blob(['%PDF'], { type: 'application/pdf' }),
    });

    expect(result).toEqual({ status: 'SENT' });
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8080/etendo/neo/preview-file',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8080/etendo/neo/email-contracts/sales-invoice-send/send',
      expect.objectContaining({ method: 'POST' }),
    );
    const previewBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(previewBody).toMatchObject({
      specName: 'sales-invoice',
      recordId: 'invoice-1',
      fileName: 'sales-invoice-INV-001.pdf',
      mimeType: 'application/pdf',
    });
    expect(previewBody.fileData).toBeTruthy();
  });

  it('uses an existing PDF blob URL as the default preview cache source', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ response: { data: { status: 'SENT' } } }) });

    await sendDocumentEmail({
      apiBaseUrl: 'http://localhost:8080/etendo/neo/sales-invoice',
      token: 'tok',
      documentId: 'invoice-1',
      windowName: 'sales-invoice',
      documentNo: 'INV-001',
      pdfBlobUrl: 'blob:invoice-preview',
    });

    expect(global.fetch).toHaveBeenNthCalledWith(1, 'blob:invoice-preview');
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8080/etendo/neo/preview-file',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:8080/etendo/neo/email-contracts/sales-invoice-send/send',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not call preview-file when no PDF blob is available', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { data: { status: 'SENT' } } }),
    });

    await sendDocumentEmail({
      apiBaseUrl: 'http://localhost:8080/etendo/neo/sales-order',
      token: 'tok',
      documentId: 'order-1',
      windowName: 'sales-order',
      documentNo: 'SO-001',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/etendo/neo/email-contracts/sales-order-send/send',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('stops the send when preview cache persistence fails', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(cacheDocumentPreviewFile({
      apiBaseUrl: 'http://localhost:8080/etendo/neo/sales-invoice',
      token: 'tok',
      specName: 'sales-invoice',
      documentId: 'invoice-1',
      documentNo: 'INV-001',
      pdfBlob: new Blob(['%PDF'], { type: 'application/pdf' }),
    })).rejects.toThrow('Preview file cache failed (500)');
  });

  it('stops the send when preview blob URL cannot be read', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(sendDocumentEmail({
      apiBaseUrl: 'http://localhost:8080/etendo/neo/sales-invoice',
      token: 'tok',
      documentId: 'invoice-1',
      windowName: 'sales-invoice',
      documentNo: 'INV-001',
      pdfBlobUrl: 'blob:missing',
    })).rejects.toThrow('Preview PDF fetch failed (404)');
  });
});

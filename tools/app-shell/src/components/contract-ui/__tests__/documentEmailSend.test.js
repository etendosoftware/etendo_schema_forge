import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveNeoBaseUrl,
  resolveDocumentEmailContract,
  buildEmailContractCommand,
  buildPreviewFileName,
  readEmailContractResponse,
} from '../documentEmailSend.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'documentEmailSend.js'), 'utf8');

test('documentEmailSend exports preview cache and contract send helpers', () => {
  assert.match(src, /export function buildPreviewFileName/);
  assert.match(src, /export async function cacheDocumentPreviewFile/);
  assert.match(src, /export async function sendDocumentEmail/);
});

test('documentEmailSend sanitizes preview file names before preview-file upload', () => {
  assert.match(src, /function sanitizeFileNamePart/);
  assert.match(src, /function isSafeFileNameChar/);
  assert.match(src, /function trimDashes/);
  assert.match(src, /fileName: buildPreviewFileName\(specName, documentNo, documentId\)/);
});

// ETP-4226 — the email-contract command shape is the key backend contract:
// WITHOUT recipientEdits the client supplies the idempotency key; WITH
// recipientEdits the key is omitted so the server derives it from the final set.

describe('resolveNeoBaseUrl', () => {
  it('strips the trailing path segment', () => {
    assert.equal(resolveNeoBaseUrl('/sws/neo/sales-order'), '/sws/neo');
  });

  it('strips a single trailing segment of an absolute URL', () => {
    assert.equal(resolveNeoBaseUrl('https://host/sws/neo'), 'https://host/sws');
  });

  it('falls back to /sws/neo when given a falsy value', () => {
    assert.equal(resolveNeoBaseUrl(''), '/sws/neo');
    assert.equal(resolveNeoBaseUrl(null), '/sws/neo');
    assert.equal(resolveNeoBaseUrl(undefined), '/sws/neo');
  });
});

describe('resolveDocumentEmailContract', () => {
  it('appends the -send suffix to the window name', () => {
    assert.equal(resolveDocumentEmailContract('sales-order'), 'sales-order-send');
  });
});

describe('buildEmailContractCommand', () => {
  it('includes a client-derived idempotencyKey and no recipientEdits when none provided', () => {
    const cmd = buildEmailContractCommand('sales-order-send', 'DOC-1');
    assert.deepEqual(cmd, {
      version: 'v1',
      recordId: 'DOC-1',
      intent: 'send-document',
      idempotencyKey: 'sales-order-send:DOC-1:send:v1',
    });
    assert.equal('recipientEdits' in cmd, false);
  });

  it('includes recipientEdits and OMITS the idempotencyKey when edits are provided', () => {
    const recipientEdits = { to: { add: ['b@x.com'] } };
    const cmd = buildEmailContractCommand('sales-order-send', 'DOC-1', { recipientEdits });
    assert.deepEqual(cmd, {
      version: 'v1',
      recordId: 'DOC-1',
      intent: 'send-document',
      recipientEdits,
    });
    assert.equal('idempotencyKey' in cmd, false);
  });

  it('treats an explicitly falsy recipientEdits as "no edits" (keeps idempotencyKey)', () => {
    const cmd = buildEmailContractCommand('c', 'D', { recipientEdits: null });
    assert.equal(cmd.idempotencyKey, 'c:D:send:v1');
    assert.equal('recipientEdits' in cmd, false);
  });
});

describe('buildPreviewFileName', () => {
  it('builds {spec}-{documentNo}.pdf', () => {
    assert.equal(buildPreviewFileName('sales-order', 'SO-1', 'id-1'), 'sales-order-SO-1.pdf');
  });

  it('falls back to the documentId when documentNo is missing', () => {
    assert.equal(buildPreviewFileName('sales-order', null, 'id-1'), 'sales-order-id-1.pdf');
  });

  it('sanitizes unsafe characters into single dashes', () => {
    assert.equal(buildPreviewFileName('sales/order', 'SO 1/2', 'id'), 'sales-order-SO-1-2.pdf');
  });

  it('collapses runs of unsafe characters and trims leading/trailing dashes', () => {
    assert.equal(buildPreviewFileName('  spec!!  ', '##doc##', 'id'), 'spec-doc.pdf');
  });

  it('defaults the spec part to "document" when it sanitizes to empty', () => {
    assert.equal(buildPreviewFileName('///', 'doc', 'id'), 'document-doc.pdf');
  });
});

describe('readEmailContractResponse', () => {
  it('unwraps response.data when present', async () => {
    const res = { json: async () => ({ response: { data: { ok: true } } }) };
    assert.deepEqual(await readEmailContractResponse(res), { ok: true });
  });

  it('falls back to top-level data', async () => {
    const res = { json: async () => ({ data: { ok: 1 } }) };
    assert.deepEqual(await readEmailContractResponse(res), { ok: 1 });
  });

  it('returns the raw payload when neither response.data nor data exists', async () => {
    const res = { json: async () => ({ status: 'sent' }) };
    assert.deepEqual(await readEmailContractResponse(res), { status: 'sent' });
  });

  it('returns {} when the body is not valid JSON', async () => {
    const res = { json: async () => { throw new Error('bad json'); } };
    assert.deepEqual(await readEmailContractResponse(res), {});
  });
});

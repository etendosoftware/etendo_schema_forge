// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxUploadPolicy.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInboxSelection, selectionWarnings, rejectionReason, fileExtension, isImageFileName,
  MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD, ACCEPT_ATTRIBUTE, REJECT_FORMAT, REJECT_EMPTY, REJECT_TOO_LARGE,
} from '../invoiceInboxUploadPolicy.js';

const file = (name, size = 1024) => ({ name, size });

describe('validateInboxSelection', () => {
  it('uploads nothing and flags tooMany above 20 files, even when all are valid', () => {
    const files = Array.from({ length: MAX_FILES_PER_UPLOAD + 1 }, (_, i) => file(`f${i}.pdf`));
    const result = validateInboxSelection(files);
    assert.deepEqual(result, { blocked: 'tooMany', accepted: [], rejected: [] });
    assert.deepEqual(selectionWarnings(result), [{ key: 'invoiceInboxErrorTooMany' }]);
  });

  it('accepts exactly 20 files', () => {
    const files = Array.from({ length: MAX_FILES_PER_UPLOAD }, (_, i) => file(`f${i}.pdf`));
    const result = validateInboxSelection(files);
    assert.equal(result.blocked, null);
    assert.equal(result.accepted.length, 20);
  });

  it('uploads the valid files and names the rejected one when the selection is mixed', () => {
    const result = validateInboxSelection([file('a.pdf'), file('b.webp'), file('c.png')]);
    assert.deepEqual(result.accepted.map((f) => f.name), ['a.pdf', 'c.png']);
    assert.deepEqual(result.rejected.map((r) => [r.file.name, r.reason]), [['b.webp', REJECT_FORMAT]]);
    assert.deepEqual(selectionWarnings(result), [
      { key: 'invoiceInboxRejectedFormatOne', params: { count: 1, files: 'b.webp' } },
    ]);
  });

  it('uploads nothing and warns when no file is valid', () => {
    const result = validateInboxSelection([file('a.webp'), file('b.gif')]);
    assert.equal(result.accepted.length, 0);
    assert.deepEqual(selectionWarnings(result), [
      { key: 'invoiceInboxRejectedFormatMany', params: { count: 2, files: 'a.webp, b.gif' } },
    ]);
  });

  it('rejects a file over 10 MB but accepts exactly 10 MB', () => {
    const result = validateInboxSelection([file('big.pdf', MAX_FILE_BYTES + 1), file('edge.pdf', MAX_FILE_BYTES)]);
    assert.deepEqual(result.accepted.map((f) => f.name), ['edge.pdf']);
    assert.deepEqual(result.rejected.map((r) => r.reason), [REJECT_TOO_LARGE]);
  });

  it('rejects an empty file', () => {
    const result = validateInboxSelection([file('empty.pdf', 0)]);
    assert.deepEqual(result.rejected.map((r) => r.reason), [REJECT_EMPTY]);
    assert.deepEqual(selectionWarnings(result)[0].key, 'invoiceInboxRejectedEmptyOne');
  });

  it('accepts upper-case extensions', () => {
    const result = validateInboxSelection([file('A.PDF'), file('B.JPG'), file('C.JPEG'), file('D.PNG')]);
    assert.equal(result.accepted.length, 4);
    assert.equal(result.rejected.length, 0);
  });

  it('rejects a file with no extension or a double extension that ends in an unsupported one', () => {
    const result = validateInboxSelection([file('noext'), file('scan.pdf.exe')]);
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected.length, 2);
  });

  it('handles an empty or missing selection', () => {
    assert.deepEqual(validateInboxSelection([]), { blocked: null, accepted: [], rejected: [] });
    assert.deepEqual(validateInboxSelection(null), { blocked: null, accepted: [], rejected: [] });
    assert.deepEqual(selectionWarnings({ blocked: null, rejected: [] }), []);
  });
});

describe('selectionWarnings', () => {
  it('emits one warning per reason, using the plural key for several files', () => {
    const result = validateInboxSelection([file('a.webp'), file('b.pdf', 0), file('c.pdf', 0), file('d.pdf', MAX_FILE_BYTES + 1)]);
    const warnings = selectionWarnings(result);
    assert.deepEqual(warnings, [
      { key: 'invoiceInboxRejectedFormatOne', params: { count: 1, files: 'a.webp' } },
      { key: 'invoiceInboxRejectedEmptyMany', params: { count: 2, files: 'b.pdf, c.pdf' } },
      { key: 'invoiceInboxRejectedTooLargeOne', params: { count: 1, files: 'd.pdf' } },
    ]);
  });
});

describe('helpers', () => {
  it('fileExtension lower-cases and tolerates missing names', () => {
    assert.equal(fileExtension('X.PDF'), 'pdf');
    assert.equal(fileExtension('a.b.png'), 'png');
    assert.equal(fileExtension('none'), '');
    assert.equal(fileExtension(undefined), '');
  });

  it('isImageFileName is true for jpg/jpeg/png only', () => {
    assert.equal(isImageFileName('a.JPG'), true);
    assert.equal(isImageFileName('a.pdf'), false);
  });

  it('rejectionReason is null for a valid file and format for a missing one', () => {
    assert.equal(rejectionReason(file('a.pdf')), null);
    assert.equal(rejectionReason(undefined), REJECT_FORMAT);
  });

  it('exposes the accept attribute for the file input', () => {
    assert.equal(ACCEPT_ATTRIBUTE, '.pdf,.jpg,.jpeg,.png');
  });
});

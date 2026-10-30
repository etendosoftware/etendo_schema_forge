// @covers tools/app-shell/src/windows/custom/shared/attachmentFileTypes.js
// New file: no existing test covers attachmentFileTypes.js (make find-tests found none).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAttachmentMime } from '../attachmentFileTypes.js';

describe('resolveAttachmentMime', () => {
  it('keeps a non-generic stored type even when the extension disagrees', () => {
    assert.equal(resolveAttachmentMime('image/png', 'x.webp'), 'image/png');
    assert.equal(resolveAttachmentMime('application/pdf', 'x.png'), 'application/pdf');
  });

  for (const generic of [null, undefined, '', 'application/octet-stream']) {
    it(`falls back to the extension when the stored type is ${JSON.stringify(generic)}`, () => {
      assert.equal(resolveAttachmentMime(generic, 'x.webp'), 'image/webp');
    });
  }

  it('resolves every accepted extension', () => {
    const g = 'application/octet-stream';
    assert.equal(resolveAttachmentMime(g, 'a.pdf'), 'application/pdf');
    assert.equal(resolveAttachmentMime(g, 'a.png'), 'image/png');
    assert.equal(resolveAttachmentMime(g, 'a.jpg'), 'image/jpeg');
    assert.equal(resolveAttachmentMime(g, 'a.jpeg'), 'image/jpeg');
    assert.equal(resolveAttachmentMime(g, 'a.gif'), 'image/gif');
    assert.equal(resolveAttachmentMime(g, 'a.svg'), 'image/svg+xml');
  });

  it('is case-insensitive on the extension and uses the last dot', () => {
    assert.equal(resolveAttachmentMime('application/octet-stream', 'X.WEBP'), 'image/webp');
    assert.equal(resolveAttachmentMime(null, 'my.scan.v2.PNG'), 'image/png');
  });

  it('returns the stored value unchanged when there is no extension or it is unknown', () => {
    assert.equal(resolveAttachmentMime('application/octet-stream', 'noext'), 'application/octet-stream');
    assert.equal(resolveAttachmentMime('application/octet-stream', 'photo.heic'), 'application/octet-stream');
    assert.equal(resolveAttachmentMime(null, 'photo.heic'), null);
    assert.equal(resolveAttachmentMime(undefined, null), undefined);
    assert.equal(resolveAttachmentMime('', ''), '');
  });
});

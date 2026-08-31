import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentWrittenAtMs, isAttachmentStale, toInstantMs } from '../attachmentFreshness.js';

// ETP-4787 — the cached-PDF invalidation predicate. Both wire formats have to line up
// (the attachments endpoint emits UTC with a 'Z', DAL emits a local time with an
// offset), and every "we don't know" case has to keep the pre-existing cache behaviour.
describe('attachmentFreshness', () => {
  describe('toInstantMs', () => {
    it('parses the attachments endpoint UTC format', () => {
      assert.equal(toInstantMs('2026-08-24T10:15:30Z'), Date.UTC(2026, 7, 24, 10, 15, 30));
    });

    it('parses DAL\'s offset-bearing format to the same instant', () => {
      assert.equal(
        toInstantMs('2026-08-24T12:15:30+02:00'),
        toInstantMs('2026-08-24T10:15:30Z'),
      );
    });

    it('returns null for absent or unparseable values', () => {
      for (const v of [null, undefined, '', 'not a date', NaN]) {
        assert.equal(toInstantMs(v), null, `expected null for ${String(v)}`);
      }
    });
  });

  describe('isAttachmentStale', () => {
    it('is stale when the file was uploaded before the record was last edited', () => {
      assert.equal(
        isAttachmentStale({ uploadedAt: '2026-08-24T10:00:00Z' }, '2026-08-24T12:15:30+02:00'),
        true,
      );
    });

    it('is fresh when the file was uploaded after the last edit', () => {
      assert.equal(
        isAttachmentStale({ uploadedAt: '2026-08-24T11:00:00Z' }, '2026-08-24T12:15:30+02:00'),
        false,
      );
    });

    it('treats the same second as fresh — both timestamps are truncated on the wire', () => {
      assert.equal(
        isAttachmentStale({ uploadedAt: '2026-08-24T10:15:30Z' }, '2026-08-24T10:15:30Z'),
        false,
      );
    });

    // The whole point of the null-safety: a window whose backend does not yet expose
    // `updated` must keep serving its cache, not silently stop caching altogether.
    it('is never stale without a record timestamp', () => {
      assert.equal(isAttachmentStale({ uploadedAt: '2000-01-01T00:00:00Z' }, null), false);
      assert.equal(isAttachmentStale({ uploadedAt: '2000-01-01T00:00:00Z' }, undefined), false);
    });

    it('is never stale without a usable attachment timestamp', () => {
      assert.equal(isAttachmentStale(null, '2026-08-24T10:15:30Z'), false);
      assert.equal(isAttachmentStale({}, '2026-08-24T10:15:30Z'), false);
      assert.equal(isAttachmentStale({ uploadedAt: 'garbage' }, '2026-08-24T10:15:30Z'), false);
    });

    // Regression: verified live against a re-rendered invoice whose row was reused —
    // uploadedAt still pointed at the FIRST render (17:08) while the bytes were the
    // newest ones (updatedAt 00:24). Comparing against uploadedAt alone never converged:
    // the file read as stale forever, so every open paid a re-render AND an upload.
    it('uses the LATEST timestamp — the backend overwrites the row in place', () => {
      const reusedRow = { uploadedAt: '2026-08-24T17:08:10Z', updatedAt: '2026-08-25T00:24:01Z' };
      assert.equal(isAttachmentStale(reusedRow, '2026-08-24T22:00:01+00:00'), false);
      assert.equal(attachmentWrittenAtMs(reusedRow), Date.parse('2026-08-25T00:24:01Z'));
    });

    it('still detects a row whose latest write predates the record', () => {
      assert.equal(
        isAttachmentStale(
          { uploadedAt: '2026-08-24T17:08:10Z', updatedAt: '2026-08-24T18:54:00Z' },
          '2026-08-24T22:00:01+00:00',
        ),
        true,
      );
    });

    it('falls back to createdAt / creationDate when uploadedAt is absent', () => {
      assert.equal(
        isAttachmentStale({ createdAt: '2026-08-24T10:00:00Z' }, '2026-08-24T10:15:30Z'),
        true,
      );
      assert.equal(
        isAttachmentStale({ creationDate: '2026-08-24T10:00:00Z' }, '2026-08-24T10:15:30Z'),
        true,
      );
    });
  });
});

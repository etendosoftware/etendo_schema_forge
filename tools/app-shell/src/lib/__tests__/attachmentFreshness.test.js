import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentWrittenAtMs,
  isAttachmentStale,
  isCachedRenderingStale,
  isRenderedByOlderBundle,
  toInstantMs,
  RENDERER_BUILD_EPOCH_MS,
} from '../attachmentFreshness.js';

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

// ETP-5125 — the SECOND reason a cached rendering stops representing the record: the
// renderer changed. The template, the CSS, the labels and the Handlebars helpers are
// inputs to the PDF just as much as the record's data, but they live in the code, where
// a change moves no timestamp — so a completed document cached under the previous
// design served it forever. That is the reported bug: the printable still read "IVA%"
// after the labels had been fixed and the record had not been touched since.
describe('attachmentFreshness — renderer (bundle) invalidation', () => {
  // The file is NEWER than the record but OLDER than the bundle: the exact shape
  // ETP-4787's record-vs-file comparison cannot see.
  const BUNDLE_BUILT_MS = Date.parse('2026-09-03T00:00:00Z');
  const WRITTEN_BEFORE_BUNDLE = '2026-09-02T23:00:00Z';
  const WRITTEN_AFTER_BUNDLE = '2026-09-03T01:00:00Z';
  const RECORD_UPDATED = '2026-09-01T00:00:00Z';

  const olderBundleFile = { updatedAt: WRITTEN_BEFORE_BUNDLE };
  const currentBundleFile = { updatedAt: WRITTEN_AFTER_BUNDLE };

  describe('isRenderedByOlderBundle', () => {
    it('is true when the file predates the running bundle', () => {
      assert.equal(isRenderedByOlderBundle(olderBundleFile, BUNDLE_BUILT_MS), true);
    });

    it('is false when the file was written by the running bundle', () => {
      assert.equal(isRenderedByOlderBundle(currentBundleFile, BUNDLE_BUILT_MS), false);
    });

    // Outside a Vite build the global is absent and the constant is 0, so the whole
    // check must disappear rather than declare every cached file stale.
    it('is inert for an unknown or non-finite build epoch', () => {
      for (const epoch of [0, undefined, null, NaN, Infinity, -1]) {
        assert.equal(
          isRenderedByOlderBundle(olderBundleFile, epoch),
          false,
          `expected inert for epoch ${String(epoch)}`,
        );
      }
    });

    it('is false when the attachment carries no usable timestamp', () => {
      for (const attachment of [null, undefined, {}, { updatedAt: 'garbage' }]) {
        assert.equal(isRenderedByOlderBundle(attachment, BUNDLE_BUILT_MS), false);
      }
    });

    it('defaults to the module constant, which is 0 outside a Vite build', () => {
      assert.equal(RENDERER_BUILD_EPOCH_MS, 0);
      assert.equal(isRenderedByOlderBundle(olderBundleFile), false);
    });
  });

  describe('isCachedRenderingStale', () => {
    // The regression this ticket closes: nothing edited the record, so ETP-4787's half
    // says "fresh", yet the file was rendered by the previous design.
    it('catches a file the OLD bundle rendered, which isAttachmentStale calls fresh', () => {
      assert.equal(isAttachmentStale(olderBundleFile, RECORD_UPDATED), false);
      assert.equal(isCachedRenderingStale(olderBundleFile, RECORD_UPDATED, BUNDLE_BUILT_MS), true);
    });

    it('is fresh when the file postdates both the record and the bundle', () => {
      assert.equal(isCachedRenderingStale(currentBundleFile, RECORD_UPDATED, BUNDLE_BUILT_MS), false);
    });

    it('still catches the ETP-4787 case — a file older than the record', () => {
      const editedAfterUpload = { updatedAt: WRITTEN_AFTER_BUNDLE };
      assert.equal(
        isCachedRenderingStale(editedAfterUpload, '2026-09-03T02:00:00Z', BUNDLE_BUILT_MS),
        true,
      );
    });

    // THE guard that protects real user files. purchase-invoice, goods-receipt and
    // return-material-receipt deliberately pass no `recordUpdated`, because their
    // marked attachment is the COUNTERPARTY's own document (the supplier's invoice, the
    // customer's signed receipt) — not a cache of anything we rendered. Flagging one
    // stale would invite the write half to overwrite it. This must hold no matter how
    // old the file is, and no matter what the bundle epoch says.
    it('never flags an attachment from a window that opted out of invalidation', () => {
      const counterpartyDocument = { uploadedAt: '2001-01-01T00:00:00Z' };
      for (const recordUpdated of [null, undefined, '', 'not a date']) {
        assert.equal(
          isCachedRenderingStale(counterpartyDocument, recordUpdated, BUNDLE_BUILT_MS),
          false,
          `expected opt-out to hold for recordUpdated ${String(recordUpdated)}`,
        );
      }
    });

    it('falls back to pure ETP-4787 behaviour when the build epoch is unknown', () => {
      assert.equal(isCachedRenderingStale(olderBundleFile, RECORD_UPDATED, 0), false);
      assert.equal(isCachedRenderingStale(olderBundleFile, '2026-09-03T02:00:00Z', 0), true);
    });

    it('is false when the attachment carries no usable timestamp', () => {
      assert.equal(isCachedRenderingStale(null, RECORD_UPDATED, BUNDLE_BUILT_MS), false);
      assert.equal(isCachedRenderingStale({}, RECORD_UPDATED, BUNDLE_BUILT_MS), false);
    });
  });
});

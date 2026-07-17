import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

// Faithful replica of the exported `resolveHideMoreMenu` from DetailView.jsx.
// We cannot import the real one because the directory's runner is plain
// `node --test` (no JSX transpiler); a source assertion below proves this
// replica stays in lock-step with the live implementation.
function resolveHideMoreMenu(hideMoreMenu, data) {
  return typeof hideMoreMenu === 'function' ? hideMoreMenu({ data }) : hideMoreMenu;
}

/**
 * Regression guard for ETP-4097:
 *
 * The form action-bar "more actions" kebab button (data-testid="action-more")
 * used to ALWAYS render whenever `hideMoreMenu` was falsy. The check for
 * whether there were any items to show was nested INSIDE the `showMoreMenu`
 * open-state block, so in Draft state the button rendered but the dropdown
 * was empty. This affected every document window (Sales/Purchase Order,
 * Sales/Purchase Invoice) and any window without `hideMoreMenu`.
 *
 * The fix lifts the gating to render scope: the button is only rendered when,
 * for the current record state, there is at least one visible action OR
 * `customMenuContent` is set, and the IIFE returns `null` BEFORE the button
 * otherwise.
 *
 * This file guards the invariant two ways:
 *   1. Behaviorally — `resolveHideMoreMenu` (exported) and a replica of the
 *      exact gating expression from source prove the boolean logic.
 *   2. Source-reading — the live source must compute `visibleActions` and
 *      `return null` on the empty/no-custom-content case BEFORE rendering the
 *      `action-more` button, with no unguarded render path. This is what
 *      catches a re-introduction of the original (nested) bug.
 *
 * DetailView itself is a very heavy component (dozens of hooks, contexts and
 * props) that is impractical to render here, which is why the directory's
 * convention is source-reading; see DetailView.neoAction.test.js (ETP-4298).
 */

// Replica of the exact gating logic from the render IIFE in DetailView.jsx.
// Returns whether the `action-more` button SHOULD be rendered for the given props.
function shouldRenderMoreButton({ menuActions = [], customMenuContent = null, hideMoreMenu = false, data = {}, statusField = 'documentStatus' }) {
  if (resolveHideMoreMenu(hideMoreMenu, data)) return false;
  const resolvedActions = typeof menuActions === 'function'
    ? menuActions({ data, status: data?.[statusField] })
    : menuActions;
  const visibleActions = (Array.isArray(resolvedActions) ? resolvedActions : [])
    .filter(a => a.visible !== false);
  if (visibleActions.length === 0 && !customMenuContent) return false;
  return true;
}

describe('DetailView — "more actions" button gating (ETP-4097)', () => {
  describe('behavioral gating logic', () => {
    it('1. hides the button when menuActions is empty and there is no customMenuContent', () => {
      assert.equal(shouldRenderMoreButton({ menuActions: [], customMenuContent: null }), false);
    });

    it('2. renders the button when at least one action has visible !== false', () => {
      assert.equal(
        shouldRenderMoreButton({ menuActions: [{ key: 'reactivate', label: 'Reactivate' }] }),
        true,
      );
    });

    it('2b. hides the button when every action is explicitly visible: false', () => {
      assert.equal(
        shouldRenderMoreButton({ menuActions: [{ key: 'reactivate', visible: false }] }),
        false,
      );
    });

    it('3. function menuActions — Draft (empty) hides, Completed (non-empty) renders', () => {
      // Mirrors the real sales-order `reactivate` case gated to status CO.
      const menuActions = ({ status }) =>
        status === 'CO' ? [{ key: 'reactivate', label: 'Reactivate' }] : [];

      const draft = shouldRenderMoreButton({
        menuActions,
        data: { documentStatus: 'DR' },
        statusField: 'documentStatus',
      });
      const completed = shouldRenderMoreButton({
        menuActions,
        data: { documentStatus: 'CO' },
        statusField: 'documentStatus',
      });

      assert.equal(draft, false, 'button must be absent in Draft state');
      assert.equal(completed, true, 'button must be present in Completed state');
    });

    it('4. renders the button when customMenuContent is set even if menuActions is empty', () => {
      const CustomMenuContent = () => null;
      assert.equal(
        shouldRenderMoreButton({ menuActions: [], customMenuContent: CustomMenuContent }),
        true,
      );
    });

    it('5. hides the button when hideMoreMenu is true regardless of actions/content', () => {
      const CustomMenuContent = () => null;
      assert.equal(
        shouldRenderMoreButton({
          menuActions: [{ key: 'reactivate' }],
          customMenuContent: CustomMenuContent,
          hideMoreMenu: true,
        }),
        false,
      );
    });

    it('5b. hideMoreMenu as a function of { data } is honored (resolveHideMoreMenu)', () => {
      const hideMoreMenu = ({ data }) => data?.documentStatus === 'CL';
      assert.equal(
        shouldRenderMoreButton({
          menuActions: [{ key: 'reactivate' }],
          hideMoreMenu,
          data: { documentStatus: 'CL' },
        }),
        false,
      );
      assert.equal(
        shouldRenderMoreButton({
          menuActions: [{ key: 'reactivate' }],
          hideMoreMenu,
          data: { documentStatus: 'CO' },
        }),
        true,
      );
    });

    it('resolveHideMoreMenu replica resolves both a boolean and a function form', () => {
      assert.equal(resolveHideMoreMenu(true, {}), true);
      assert.equal(resolveHideMoreMenu(false, {}), false);
      assert.equal(resolveHideMoreMenu(({ data }) => data?.x === 1, { x: 1 }), true);
      assert.equal(resolveHideMoreMenu(({ data }) => data?.x === 1, { x: 2 }), false);
    });

    it('the resolveHideMoreMenu replica stays in lock-step with the exported source', () => {
      // Guard against the local replica drifting from the real implementation.
      assert.match(
        src,
        /export function resolveHideMoreMenu\(hideMoreMenu,\s*data\)\s*\{\s*return\s+typeof\s+hideMoreMenu\s*===\s*'function'\s*\?\s*hideMoreMenu\(\{\s*data\s*\}\)\s*:\s*hideMoreMenu;\s*\}/,
      );
    });
  });

  describe('source structure — gating must precede the button render (no nested-check regression)', () => {
    // Extract the single IIFE that owns the action-more button so assertions
    // are scoped to the fixed block, not to coincidental matches elsewhere.
    const buttonIdx = src.indexOf('data-testid="action-more"');
    const moreBlock = src.slice(0, buttonIdx);
    const commentIdx = moreBlock.lastIndexOf('More actions');
    const iife = src.slice(commentIdx, buttonIdx);

    it('locates exactly one action-more button in the source', () => {
      const matches = src.match(/data-testid="action-more"/g) || [];
      assert.equal(matches.length, 1);
    });

    it('resolves menuActions as a function of { data, status } at render scope', () => {
      assert.match(
        iife,
        /const\s+resolvedActions\s*=\s*typeof\s+menuActions\s*===\s*'function'[\s\S]*?menuActions\(\{\s*data,\s*status:\s*data\?\.\[statusField\]\s*\}\)[\s\S]*?:\s*menuActions/,
      );
    });

    it('computes visibleActions by filtering out visible === false entries', () => {
      assert.match(
        iife,
        /const\s+visibleActions\s*=\s*\(Array\.isArray\(resolvedActions\)\s*\?\s*resolvedActions\s*:\s*\[\]\)\s*\.filter\(a\s*=>\s*a\.visible\s*!==\s*false\)/,
      );
    });

    it('returns null (hides the button) when there are no visible actions and no custom content — BEFORE the button', () => {
      // The core invariant: this guard sits in the same IIFE, ahead of the button.
      // Uses hasCustomContent (derived from customMenuContent && customMenuHasContent !== false)
      // to also handle the case where customMenuContent renders nothing.
      assert.match(
        iife,
        /if\s*\(visibleActions\.length\s*===\s*0\s*&&\s*!hasCustomContent\)\s*return\s+null;/,
      );
    });

    it('returns null when hideMoreMenu resolves truthy — also BEFORE the button', () => {
      assert.match(iife, /if\s*\(resolveHideMoreMenu\(hideMoreMenu,\s*data\)\)\s*return\s+null;/);
    });

    it('keeps the empty-state guard ahead of the visibleActions.map render path', () => {
      const guardIdx = src.indexOf('if (visibleActions.length === 0 && !hasCustomContent) return null;');
      const mapIdx = src.indexOf('visibleActions.map(');
      assert.ok(guardIdx !== -1, 'empty-state guard must exist');
      assert.ok(mapIdx !== -1, 'visibleActions.map render must exist');
      assert.ok(
        guardIdx < buttonIdx && buttonIdx < mapIdx,
        'order must be: empty-state guard → action-more button → visibleActions.map',
      );
    });

    it('still gates the dropdown contents on showMoreMenu (button vs. dropdown stay independent)', () => {
      // The dropdown body remains open-state gated; only the empty-state check
      // was lifted out of it. This ensures we did not accidentally remove the
      // open/close behavior while fixing the always-rendered button.
      assert.match(src, /\{showMoreMenu\s*&&\s*\(/);
      const openStateIdx = src.indexOf('{showMoreMenu && (', buttonIdx);
      assert.ok(openStateIdx > buttonIdx, 'showMoreMenu dropdown must render after the button');
    });
  });
});

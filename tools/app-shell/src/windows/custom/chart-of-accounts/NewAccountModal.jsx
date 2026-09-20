import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.jsx';
import AccountCodeField from '@generated/chart-of-accounts/custom/AccountCodeField';
import { AccountBadgeSelect } from '@/components/contract-ui';
import { ACCOUNT_TYPE_UI_KEYS } from './accountTypeLabels';

import { useApiFetch } from '@/auth/useApiFetch.js';
/**
 * NewAccountModal — quick create dialog for a new sub-account.
 *
 * Props:
 *   isOpen        — boolean, controls Dialog open state
 *   onClose       — () => void
 *   onSaved       — () => void — called after a successful POST (use to refresh the list)
 *   currentRecord — the row that was selected when the modal was opened
 *                   (used to derive the default parent account)
 *   allAccounts   — full flat list already loaded in the tree
 *                   (used to build the parent selector — no extra fetch)
 *   apiBaseUrl    — NEO base URL, e.g. "/sws/neo/chart-of-accounts"
 *   token         — JWT for Authorization header
 *
 * Parent auto-selection (ETP-5399):
 *   - When `currentRecord` carries tree structure (`elementLevel` and/or real `children` —
 *     i.e. it came from AccountTreeView's live tree, or is a real leaf row with the
 *     backend's `insertionChildren` field), the real Breakdown-level insertion point is
 *     resolved structurally via `resolveInsertionCandidates` — see that function for the
 *     algorithm (mirrors the backend's `ChartOfAccountsTreeMath.resolveInsertionChildren`).
 *     A single confident candidate is used as the default parent; zero or multiple
 *     candidates (real ambiguity — e.g. a letter-suffixed heading fanning out into several
 *     real children) fall back to no default selection rather than guessing.
 *   - Legacy heuristic (only reached when no structural data is available at all, e.g. a
 *     bare `{searchKey, summaryLevel}` shape): if `currentRecord.summaryLevel === 'Y'` and
 *     its code is 4 numeric digits, use it directly as parent; otherwise look at
 *     `currentRecord.searchKey.substring(0, 4)` and find the matching 4-digit summary
 *     account in the available parent options. Falls back to empty selection if nothing
 *     matches.
 *
 * POST body: { searchKey: <8-digit code>, name, accountType }
 *   accountType — required (C_ElementValue.AccountType is mandatory in AD),
 *   defaults to "E" (Expense), matching the AD column's default value.
 */

const INPUT_CLS =
  'w-full h-10 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] focus:border-transparent';

const SELECT_CLS =
  'w-full h-10 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] focus:border-transparent cursor-pointer';

const FIELD_LABEL_CLS = 'block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5';
const ERROR_CLS = 'mt-1 text-xs text-destructive';

// C_ElementValue.ElementLevel — 'D' (Breakdown) is the correct new-subaccount grouping
// depth; 'S' (Subaccount) is a real leaf. See ChartOfAccountsTreeMath.java (com.etendoerp.go)
// for the backend counterpart this mirrors.
const LEVEL_BREAKDOWN = 'D';
const LEVEL_SUBACCOUNT = 'S';

// Defensive cap mirroring the backend's MAX_TREE_DEPTH guard against a circular
// AD_TreeNode reference — this repo's chart of accounts never nests anywhere close
// to this deep.
const MAX_RESOLUTION_DEPTH = 50;

/** Builds one `{id, value, name, elementLevel}` candidate from a local tree node. */
function toCandidate(node) {
  return {
    id: node.id,
    value: node.searchKey,
    name: node.name,
    elementLevel: node.elementLevel ?? null,
  };
}

/**
 * Resolves the real, structural insertion point(s) for a new subaccount under `node` —
 * the frontend half of ETP-5399, mirroring
 * `ChartOfAccountsTreeMath.resolveInsertionChildren` on the backend, but walking the
 * already-loaded LOCAL tree node (real leaf or virtual folder heading, as built by
 * `AccountTreeView.buildGroupedTree`) instead of making a network round-trip.
 *
 * Every node in the rendered tree already carries its own `elementLevel` — virtual
 * folder nodes copy it from their ancestor entry, real leaves carry their own AD
 * `ElementLevel` from the API — and a real leaf additionally carries the backend's own
 * pre-resolved `insertionChildren` (computed server-side from THAT leaf's direct
 * parent). This is what lets the client resolve the same answer with no extra fetch:
 *
 *   - `elementLevel === 'D'` (Breakdown) — this IS the correct grouping depth, whether
 *     its `Value` is numeric ("2000") or letter-suffixed ("4300A"). Returns the node
 *     itself. This is the exact case the old "4 characters" heuristic missed for
 *     letter-suffixed families (e.g. clicking "430A" directly no longer locks "430A"
 *     itself as the prefix).
 *   - `elementLevel === 'S'` (a real leaf) — reuse its own `insertionChildren` as-is;
 *     no local walk needed, the backend already resolved it from this leaf's parent.
 *   - Any other level (`E`/`C`/unknown) — not yet at grouping depth: drill into the
 *     node's real `children` (built from the full, unfiltered leaf list). Zero children
 *     degrades gracefully to the node itself (first-ever subaccount under a brand-new
 *     branch — nothing to drill into); exactly one child recurses; two or more children
 *     surface ALL of them as candidates — never guessing a single answer among several
 *     real siblings (covers both a plain-numeric fan-out, e.g. "160B" -> "1603"/"1604",
 *     and a still-letter-suffixed one, e.g. "430A" -> "4300A"/"4304A"/"4309A").
 *
 * @returns a possibly-empty array of `{id, value, name, elementLevel}` candidates — the
 *   same shape as the backend's `insertionChildren` — so callers don't need to know
 *   whether the answer came from a network round-trip or a local walk.
 */
function resolveInsertionCandidates(node, depth = 0) {
  if (!node) return [];
  if (node.elementLevel === LEVEL_BREAKDOWN) {
    return [toCandidate(node)];
  }
  if (node.elementLevel === LEVEL_SUBACCOUNT) {
    return Array.isArray(node.insertionChildren) ? node.insertionChildren : [];
  }

  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length === 0 || depth >= MAX_RESOLUTION_DEPTH) {
    // Graceful fallback to this node itself — covers the first-ever-subaccount case
    // and the recursion-depth guard uniformly, mirroring the backend's own fallback.
    return [toCandidate(node)];
  }
  if (children.length === 1) {
    return resolveInsertionCandidates(children[0], depth + 1);
  }
  // More than one real child — surface all of them. Never average/guess a single answer.
  return children.map(toCandidate);
}

/**
 * Derive the default parent account for a newly-selected `currentRecord`.
 * Returns the parent account id string, or '' if none found (including a genuine
 * structural ambiguity — see `resolveInsertionCandidates` — where the caller is
 * expected to let the user pick manually rather than guessing).
 */
function deriveDefaultParentId(currentRecord, parentOptions) {
  if (!currentRecord) return '';
  const code = currentRecord.searchKey ?? '';

  // Structural resolution (ETP-5399): the clicked/selected node carries tree structure
  // (elementLevel and/or real children) — resolve the true insertion point instead of
  // trusting "4 characters" as a proxy for "real grouping node." That heuristic cannot
  // tell a genuine numeric grouping ("2000") apart from a letter-suffixed heading one
  // level too shallow ("430A").
  if (currentRecord.elementLevel != null || Array.isArray(currentRecord.children)) {
    const candidates = resolveInsertionCandidates(currentRecord);
    if (candidates.length === 1) {
      const match = parentOptions.find(
        (p) => String(p.searchKey) === String(candidates[0].value),
      );
      if (match) return match.id;
    }
    // 0 candidates (a real leaf chosen directly, no confident answer) or 2+ (real
    // ambiguity, e.g. clicking a fanning-out heading directly) — no default selection;
    // the user picks from the dropdown instead of the modal guessing.
    return '';
  }

  // Legacy heuristic — only reachable when the caller hands a bare
  // `{searchKey, summaryLevel}` shape with no structural fields at all (e.g. a caller
  // that predates this field, or a minimal test fixture). Kept numeric-only so a
  // letter-suffixed 4-character code no longer matches — closing the original bug even
  // without elementLevel data, mirroring the backend's own defensive fallback in
  // `ChartOfAccountsTreeMath.isTerminalGroupingLevel`.
  if (currentRecord.summaryLevel === 'Y' && code.length === 4 && /^\d+$/.test(code)) {
    return currentRecord.id;
  }

  // Look for a 4-digit summary account whose code matches the first 4 chars
  const prefix4 = code.substring(0, 4);
  if (!prefix4) return '';
  const match = parentOptions.find(
    (a) => a.summaryLevel === 'Y' && a.searchKey === prefix4,
  );
  return match ? match.id : '';
}

/**
 * Derives the Account Type default for a new subaccount. `accountRows` only ever
 * contains leaf (posting) accounts — the parent options here are synthetic 4-digit
 * group headings with no `accountType` of their own — so this looks at the
 * selected record itself when it's a real leaf, and otherwise falls back to any
 * existing leaf already filed under the same parent prefix.
 *
 * ETP-5399: `parentPrefix` may now be a structurally-resolved value (e.g. "4300A")
 * that a leaf's own legacy `parentCode4` field ("430A", one level too shallow for a
 * Pattern-A letter family) would never match — matching only against `parentCode4`
 * would silently break this sibling lookup for exactly the families this ticket
 * fixes. Prefer each candidate leaf's own resolved insertion value
 * (`insertionChildren[0].value`) when available, falling back to `parentCode4`
 * otherwise (older API response, or a fixture predating that field).
 */
function deriveDefaultAccountType(currentRecord, parentPrefix, accountRows) {
  if (currentRecord && !currentRecord.isVirtual && currentRecord.accountType) {
    return currentRecord.accountType;
  }
  const sibling = accountRows.find((a) => {
    if (a.isVirtual || !a.accountType) return false;
    const resolved = Array.isArray(a.insertionChildren) ? a.insertionChildren[0]?.value : null;
    const ownPrefix = resolved != null ? String(resolved) : String(a.parentCode4 ?? '');
    return ownPrefix === parentPrefix;
  });
  return sibling ? sibling.accountType : DEFAULT_ACCOUNT_TYPE;
}

// 'E' (Expense) mirrors the AD column's own default value for C_ElementValue.AccountType.
const DEFAULT_ACCOUNT_TYPE = 'E';

const EMPTY_FORM = { parentAccountId: '', name: '', searchKey: '', accountType: DEFAULT_ACCOUNT_TYPE };

export default function NewAccountModal({
  isOpen,
  onClose,
  onSaved,
  currentRecord,
  allAccounts = [],
  apiBaseUrl,
  token,
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [loadedAccounts, setLoadedAccounts] = useState([]);
  const [accountsFetched, setAccountsFetched] = useState(false);
  const accountRows = allAccounts.length > 0 ? allAccounts : loadedAccounts;

  // Reset the fetch latch on close so a fresh open always retries — otherwise
  // a transient failure (or stale data) on the first open would permanently
  // block the parent-selector fetch for the component's whole mounted life.
  useEffect(() => {
    if (!isOpen) setAccountsFetched(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || allAccounts.length > 0 || accountsFetched || !apiBaseUrl) return;
    apiFetch('/elementValue?_startRow=0&_endRow=9999')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setLoadedAccounts(data?.response?.data ?? []))
      .catch(() => setLoadedAccounts([]))
      .finally(() => setAccountsFetched(true));
  }, [isOpen, allAccounts.length, accountsFetched, apiBaseUrl, apiFetch]);

  // Built from each leaf's own resolved insertion point (ETP-5399), so the dropdown
  // — like the tree-click entry point — never offers a letter-suffixed heading one
  // level too shallow (e.g. "430A", "160B") as if it were a real terminal grouping
  // node; only genuine Breakdown-level codes appear (numeric or letter-suffixed).
  const virtualParentOptions = useMemo(() => {
    const byCode = new Map();
    for (const account of accountRows) {
      // Prefer the structurally-resolved insertion point: each leaf's own
      // `insertionChildren[0]` is the real Breakdown-level grouping node the backend
      // resolved from THAT leaf's direct parent — correct for both plain-numeric and
      // letter-suffixed families (a leaf's direct parent is always Breakdown-level, so
      // this is normally a single-element array). Fall back to the legacy parentCode4
      // heuristic only when insertionChildren hasn't been provided (older API
      // response, or a caller/fixture that predates this field) so the dropdown still
      // renders something instead of going empty.
      const resolved = Array.isArray(account.insertionChildren) ? account.insertionChildren[0] : null;
      const code = resolved ? String(resolved.value ?? '') : String(account.parentCode4 ?? '');
      if (!code || byCode.has(code)) continue;
      // The legacy heuristic only ever considered a 4-CHARACTER code a valid group —
      // keep that guard on the fallback path so a malformed/partial parentCode4 can't
      // leak through. The resolved path has no such restriction: a real Breakdown-level
      // value can be any length once ElementLevel backs it.
      if (!resolved && code.length !== 4) continue;
      const name = resolved ? (resolved.name ?? code) : (account.parentCode4Name ?? code);
      byCode.set(code, {
        id: `group-${code}`,
        searchKey: code,
        name,
        summaryLevel: 'Y',
        isVirtual: true,
      });
    }
    return [...byCode.values()].sort((a, b) => String(a.searchKey).localeCompare(String(b.searchKey)));
  }, [accountRows]);

  const summaryParentOptions = useMemo(
    () =>
      accountRows
        .filter((a) => a.summaryLevel === 'Y' && String(a.searchKey ?? '').length === 4)
        .sort((a, b) => String(a.searchKey).localeCompare(String(b.searchKey))),
    [accountRows],
  );

  // Derive 4-digit summary accounts for the parent selector. The API list contains
  // posting accounts only, so virtual group rows provide the visible parent options.
  const parentOptions = useMemo(() => [...summaryParentOptions, ...virtualParentOptions], [summaryParentOptions, virtualParentOptions]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const selectedParentCodePrefix = useMemo(() => {
    const parent = parentOptions.find((p) => p.id === form.parentAccountId);
    return parent ? String(parent.searchKey) : '';
  }, [form.parentAccountId, parentOptions]);

  // Re-initialise once per open/currentRecord cycle. `initDoneRef` resets on
  // open so a fresh session always recomputes, but once initialization has
  // run it latches — later parentOptions changes (e.g. a background refetch)
  // must not reset user-entered name/searchKey mid-edit.
  const initDoneRef = useRef(false);
  useEffect(() => {
    if (isOpen) initDoneRef.current = false;
  }, [isOpen, currentRecord]);

  useEffect(() => {
    if (!isOpen || initDoneRef.current) return;
    // When allAccounts wasn't provided, the self-fetch above populates
    // parentOptions asynchronously — wait for it to settle so the default
    // parent/prefix isn't computed against a still-empty option list.
    const waitingForFetch = allAccounts.length === 0 && !accountsFetched && !!apiBaseUrl;
    if (waitingForFetch) return;

    const defaultParentId = deriveDefaultParentId(currentRecord, parentOptions);
    const defaultParent = parentOptions.find((p) => p.id === defaultParentId);
    const prefix = defaultParent ? String(defaultParent.searchKey) : '';
    const defaultAccountType = deriveDefaultAccountType(currentRecord, prefix, accountRows);
    setForm({ parentAccountId: defaultParentId, name: '', searchKey: prefix, accountType: defaultAccountType });
    setErrors({});
    initDoneRef.current = true;
  }, [isOpen, currentRecord, parentOptions, allAccounts.length, accountsFetched, apiBaseUrl, accountRows]);

  // When parent changes, update the code prefix in the searchKey field
  const handleParentChange = useCallback(
    (e) => {
      const newId = e.target.value;
      const parent = parentOptions.find((p) => p.id === newId);
      const prefix = parent ? String(parent.searchKey) : '';
      const accountType = deriveDefaultAccountType(null, prefix, accountRows);
      setForm((prev) => ({ ...prev, parentAccountId: newId, searchKey: prefix, accountType }));
      setErrors((prev) => ({ ...prev, parentAccountId: undefined }));
    },
    [parentOptions, accountRows],
  );

  const handleNameChange = useCallback((e) => {
    setForm((prev) => ({ ...prev, name: e.target.value }));
    setErrors((prev) => ({ ...prev, name: undefined }));
  }, []);

  const handleCodeChange = useCallback((fullCode) => {
    setForm((prev) => ({ ...prev, searchKey: fullCode }));
    setErrors((prev) => ({ ...prev, searchKey: undefined }));
  }, []);

  const handleAccountTypeChange = useCallback((e) => {
    setForm((prev) => ({ ...prev, accountType: e.target.value }));
    setErrors((prev) => ({ ...prev, accountType: undefined }));
  }, []);

  // Derive the record passed to AccountCodeField
  const accountCodeRecord = useMemo(() => {
    return {
      summaryLevel: 'N', // always leaf for a new account
      codePrefix: selectedParentCodePrefix,
    };
  }, [selectedParentCodePrefix]);

  const validate = useCallback(() => {
    const next = {};
    if (!form.parentAccountId) next.parentAccountId = ui('required');
    if (!form.name.trim()) next.name = ui('required');
    if (String(form.searchKey).length !== 8) next.searchKey = ui('codeExact8Digits');
    if (!form.accountType) next.accountType = ui('required');
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, ui]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const res = await apiFetch('/elementValue', {
        method: 'POST',
        body: JSON.stringify({
          searchKey: form.searchKey,
          name: form.name.trim(),
          accountType: form.accountType,
        }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Error ${res.status}`);
      }

      toast.success(ui('newSubAccountSuccess'));
      onSaved?.();
    } catch (err) {
      toast.error(ui('newSubAccountError'));
      // eslint-disable-next-line no-console
      console.error('[NewAccountModal] save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [form, validate, apiFetch, onSaved, ui]);

  const handleOpenChange = useCallback(
    (open) => {
      if (!open) onClose?.();
    },
    [onClose],
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      data-testid="Dialog__2c756f">
      <DialogContent
        className="max-w-md"
        data-testid="new-account-modal"
      >
        <DialogHeader data-testid="DialogHeader__2c756f">
          <DialogTitle
            className="text-lg font-semibold text-[hsl(var(--foreground))]"
            data-testid="DialogTitle__2c756f">
            {ui('newSubAccount')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2 min-w-0" data-testid="new-account-modal-fields">
          {/* ── Parent Account ── */}
          <AccountBadgeSelect
            label={ui('parentAccount')}
            required
            value={form.parentAccountId || null}
            options={parentOptions.map((p) => ({ id: p.id, code: p.searchKey, name: p.name }))}
            onChange={(id) => handleParentChange({ target: { value: id ?? '' } })}
            error={errors.parentAccountId}
            data-testid="new-account-modal-parent"
          />

          {/* ── Name ── */}
          <div>
            <label htmlFor="nam-name" className={FIELD_LABEL_CLS}>
              {ui('name')}
              <span className="ml-1 text-destructive select-none">*</span>
            </label>
            <input
              id="nam-name"
              data-testid="new-account-modal-name"
              type="text"
              className={INPUT_CLS}
              value={form.name}
              onChange={handleNameChange}
              placeholder={ui('name')}
              autoComplete="off"
            />
            {errors.name && (
              <p className={ERROR_CLS} role="alert">
                {errors.name}
              </p>
            )}
          </div>

          {/* ── Account Code ── */}
          <div>
            <label className={FIELD_LABEL_CLS}>
              {ui('accountCode')}
              <span className="ml-1 text-destructive select-none">*</span>
            </label>
            <div data-testid="new-account-modal-code">
              <AccountCodeField
                value={form.searchKey}
                onChange={handleCodeChange}
                record={accountCodeRecord}
                readOnly={false}
                data-testid="AccountCodeField__2c756f"
              />
            </div>
            {errors.searchKey && (
              <p className={ERROR_CLS} role="alert">
                {errors.searchKey}
              </p>
            )}
          </div>

          {/* ── Account Type ── */}
          <div>
            <label htmlFor="nam-account-type" className={FIELD_LABEL_CLS}>
              {ui('accountTreeFilterType')}
              <span className="ml-1 text-destructive select-none">*</span>
            </label>
            <select
              id="nam-account-type"
              data-testid="new-account-modal-account-type"
              className={SELECT_CLS}
              value={form.accountType}
              onChange={handleAccountTypeChange}
            >
              {Object.entries(ACCOUNT_TYPE_UI_KEYS).map(([code, uiKey]) => (
                <option key={code} value={code}>
                  {ui(uiKey)}
                </option>
              ))}
            </select>
            {errors.accountType && (
              <p className={ERROR_CLS} role="alert">
                {errors.accountType}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2" data-testid="DialogFooter__2c756f">
          <button
            type="button"
            data-testid="new-account-modal-cancel"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] bg-card border border-[hsl(var(--border-control))] rounded-full shadow-sm hover:bg-[hsl(var(--muted))] disabled:opacity-50 transition-colors"
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            data-testid="new-account-modal-save"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-primary-foreground bg-[hsl(var(--foreground))] rounded-full hover:bg-[hsl(var(--foreground))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? ui('loading') : ui('save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

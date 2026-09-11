import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { renderPrimaryTabButtons } from './detailViewHelpers.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { mergeDefaultsPreservingUserEdits } from '@/hooks/useEntity.js';
import { LocaleProvider, useLocale, useLocaleSwitch, useMenuLabel, useUI } from '@/i18n';

/**
 * RecordCreateModal — creates a record of another spec using THAT spec's own generated
 * form, rendered inside a dialog.
 *
 * The point of this component is what it does NOT do: it does not declare a field list.
 * `target.loadForm()` lazily imports the generated `<Entity>Form.jsx` from the artifact
 * (via the `@generated` vite alias) and renders it as-is, so labels, types, options,
 * requiredness, defaults, references and compiled `readOnlyLogic` all stay owned by
 * `decisions.json` — a `make regen` propagates here for free. This is deliberately
 * unlike `CreateContactModal` / `EntityCreationModal`, which hand-roll their field list
 * and have already drifted from the Contacts window they mirror.
 *
 * It runs in two phases, because the window's own Price and Attachments panels cannot
 * exist before the record does (`ProductPriceBar` derives `recordId` from `data?.id` and
 * reads `/price?parentId=<id>`):
 *
 *   1. Collect the header. Fetch backend defaults, merge them without clobbering user
 *      input, validate the required fields the user can actually see, POST.
 *   2. Keep the record and reveal `target.loadPostCreateTabs()` — those same panels,
 *      mounted against it. The header stays editable and commits on blur, matching the
 *      window's own `autoSaveOnBlur: true`. `onCreated` fires only when the user closes,
 *      which is the single point that hands the record back to the caller.
 *
 * Deliberately NOT replicated from `DetailView` — callouts (the Products window itself
 * wires none: its `decisions.json` `rules` is empty and no callout is emitted into its
 * generated form), `evaluate-display` (these fields carry no `displayLogic`), processes,
 * and the `secondaryTabs` machinery (see `lookupCreateTargets.js` on why Accounting is
 * out of reach).
 *
 * @param {boolean}  open         - whether the dialog is shown.
 * @param {object}   target       - entry from `lookupCreateTargets.js`, already resolved
 *                                  (carries `entity`, `apiBaseUrl`, i18n keys, `loadForm`).
 * @param {string}   initialQuery - text typed in the lookup, used to prefill the name.
 * @param {string}   token        - session token, forwarded to the embedded form's selectors.
 * @param {Function} onCancel     - () => void. Closes without writing anything.
 * @param {Function} onCreated    - (createdRecord) => void. Receives the POST response.
 */
export default function RecordCreateModal({
  open,
  target,
  initialQuery = '',
  token,
  onCancel,
  onCreated,
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(target?.apiBaseUrl);
  const tMenu = useMenuLabel();
  const coreDict = useLocale();
  const { locale, setLocale } = useLocaleSwitch();

  const [FormComponent, setFormComponent] = useState(null);
  const [labelSlice, setLabelSlice] = useState(null);
  // Phase 2: the saved record. null while the popup is still collecting header fields.
  const [createdRecord, setCreatedRecord] = useState(null);
  const [postCreateTabs, setPostCreateTabs] = useState(null);
  const [activePostTab, setActivePostTab] = useState(null);
  const [postTabCounts, setPostTabCounts] = useState({});
  // Key currently being PATCHed in phase 2, so EntityForm can show its per-field spinner.
  const [savingField, setSavingField] = useState(null);
  const [activeTab, setActiveTab] = useState(target?.tabs?.[0]?.key ?? DEFAULT_TABS[0].key);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Shape is EntityForm's own contract: { [fieldKey]: message }, rendered under the field.
  const [fieldErrors, setFieldErrors] = useState({});

  // Keys the user has touched. Passed to mergeDefaultsPreservingUserEdits so a slow
  // /defaults response cannot overwrite what was already typed.
  const userChangedKeysRef = useRef(new Set());
  // formId → visible field descriptors, accumulated from every embedded EntityForm
  // instance (we render two: the `principal` section and the `other` one). Mirrors
  // useEntity's own formFieldsRef bookkeeping.
  const registeredFieldsRef = useRef(new Map());

  const registerFields = useCallback((fields, formId) => {
    if (fields === null) registeredFieldsRef.current.delete(formId);
    else registeredFieldsRef.current.set(formId, fields);
  }, []);

  // Reset everything each time the dialog opens, then load the form module and the
  // backend defaults in parallel.
  useEffect(() => {
    if (!open || !target) return undefined;
    let cancelled = false;

    setError(null);
    setSaving(false);
    setFieldErrors({});
    userChangedKeysRef.current = new Set();
    registeredFieldsRef.current = new Map();
    setData(target.prefill?.(initialQuery) ?? {});
    setActiveTab((target.tabs ?? DEFAULT_TABS)[0].key);
    setCreatedRecord(null);
    setPostCreateTabs(null);
    setActivePostTab(null);
    setPostTabCounts({});
    setSavingField(null);
    setLoading(true);

    target.loadForm()
      .then((mod) => { if (!cancelled) setFormComponent(() => mod.default); })
      .catch(() => { if (!cancelled) setError(ui(target.errorKey)); });

    // Best-effort, exactly like WindowLoader's own slice load: a missing slice just means
    // labels fall back to the shared core dictionary.
    target.loadLabels?.()
      .then((mod) => { if (!cancelled) setLabelSlice(mod.default ?? null); })
      .catch(() => { if (!cancelled) setLabelSlice(null); });

    // Mandatory defaults are resolved server-side (NeoDefaultsService). This is not
    // optional polish: `productCategory`'s defaultValue in the generated form is the
    // literal string `@SQL=SELECT MAX(...)`, which the client cannot evaluate — without
    // this call that macro would be POSTed as an FK value.
    apiFetch(`/${target.entity}/defaults`)
      .then(res => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        const defaults = { ...(body?.defaults ?? {}) };
        // The endpoint answers with a synthetic id; it must never be seeded into a POST.
        delete defaults.id;
        setData(prev => mergeDefaultsPreservingUserEdits(prev, defaults, userChangedKeysRef.current));
      })
      .catch(() => { /* defaults are best-effort; the form still renders */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [open, target, initialQuery, apiFetch, ui]);

  const handleChange = useCallback((key, value) => {
    userChangedKeysRef.current.add(key);
    setData(prev => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Read straight from the ref at submit time rather than memoising: the embedded forms
  // register from their own effects, which run after this component's render, so any memo
  // would be computed from a set that is one render stale — and if `/defaults` failed there
  // would be no follow-up state change to recompute it at all, making validation pass
  // vacuously on an empty form.
  const collectVisibleFields = useCallback(
    () => [...registeredFieldsRef.current.values()].flat(),
    [],
  );

  // Merge the target window's field labels into the active-locale core dictionary, then
  // re-provide it for the modal subtree. Same shape and same wrapping as WindowLoader:
  // the slice is `{ <locale>: { <column>: <label> } }` while `resolveLabel` reads
  // `dictionary.fields[column].label`.
  const modalDictionaries = useMemo(() => {
    const base = coreDict || {};
    const localeSlice = (labelSlice && labelSlice[locale]) || {};
    const fields = { ...(base.fields || {}) };
    for (const [column, label] of Object.entries(localeSlice)) {
      fields[column] = { label };
    }
    return { [locale]: { ...base, fields } };
  }, [coreDict, labelSlice, locale]);

  /**
   * Phase 2 field save. The Products window declares `autoSaveOnBlur: true`, so committing
   * on blur is what "behaves like the window" means here — not a bespoke choice.
   *
   * No-op in phase 1 (nothing to PATCH yet) and for fields the user never touched, so
   * tabbing through the form is silent.
   *
   * `updated` is passed explicitly even though core's apiFetch injects the version it
   * harvested for this (entity, id): the explicit value always wins, and it costs nothing
   * to be certain. The response refreshes `createdRecord`, so the NEXT edit carries the new
   * version rather than the stale one — without that, a second edit is a 409.
   */
  const handleFieldBlur = useCallback(async (key) => {
    if (!createdRecord?.id) return;
    if (!userChangedKeysRef.current.has(key)) return;
    setSavingField(key);
    try {
      const res = await apiFetch(`/${target.entity}/${createdRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: data[key], updated: createdRecord.updated }),
      });
      if (!res.ok) {
        setError((await readErrorBody(res)) || ui(target.errorKey));
        return;
      }
      const saved = unwrapCreated(await res.json().catch(() => null));
      if (saved?.id) setCreatedRecord(prev => ({ ...prev, ...saved }));
      userChangedKeysRef.current.delete(key);
      setError(null);
    } catch {
      setError(ui(target.errorKey));
    } finally {
      setSavingField(null);
    }
  }, [apiFetch, createdRecord, data, target, ui]);

  const tabs = target?.tabs ?? DEFAULT_TABS;

  const submit = async () => {
    if (saving) return;
    const missing = collectVisibleFields()
      .filter(f => f.required && !f.readOnly && isBlank(data[f.key]));
    if (missing.length > 0) {
      const errs = {};
      for (const field of missing) errs[field.key] = ui('fieldRequired');
      setFieldErrors(errs);
      setError(ui('requiredFieldsMissing'));
      // Surface the problem: the first offender may well sit on the tab the user is not
      // looking at (taxCategory is the common case), and an inline error on a hidden panel
      // is no error at all.
      const offendingTab = tabs.find(t => t.section === missing[0]?.section);
      if (offendingTab) setActiveTab(offendingTab.key);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/${target.entity}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRecordCreatePayload(data)),
      });
      const body = res.ok ? await res.json().catch(() => null) : await readErrorBody(res);
      if (!res.ok) {
        setError(body || ui(target.errorKey));
        setSaving(false);
        return;
      }
      const created = unwrapCreated(body);
      if (!created?.id) {
        setError(ui(target.errorKey));
        setSaving(false);
        return;
      }
      // Phase 2, not "done": the record now exists, so the panels that need a persisted
      // parent (tariffs, attachments) become available. The line is not touched yet —
      // `onCreated` fires when the user closes, which is the single completion point.
      setSaving(false);
      if (target.loadPostCreateTabs) {
        setCreatedRecord(created);
        target.loadPostCreateTabs()
          .then((loaded) => {
            setPostCreateTabs(loaded);
            setActivePostTab(loaded[0]?.key ?? null);
          })
          .catch(() => setPostCreateTabs([]));
      } else {
        onCreated(created);
      }
    } catch {
      setError(ui(target.errorKey));
      setSaving(false);
    }
  };

  // Closing during phase 2 is "done", never "cancel": the record already exists, and the
  // whole point of the popup is to hand it back to the line.
  const finish = () => onCreated(createdRecord);
  const dismiss = () => (createdRecord ? finish() : onCancel());

  if (!open || !target) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <DialogContent
        data-testid="record-create-modal"
        className="max-w-5xl max-h-[85vh] overflow-y-auto gap-0 rounded-lg bg-card p-6"
      >
      {/*
        Re-provide the locale for the modal subtree with the TARGET window's field labels
        merged in — the surrounding document window provided its own slice, which does not
        contain the product columns.
      */}
      <LocaleProvider dictionaries={modalDictionaries} locale={locale} setLocale={setLocale}>
        <DialogHeader>
          <DialogTitle className="text-xl">{ui(target.titleKey)}</DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {FormComponent && (
            <>
              {/*
                The very tab strip the Products window renders — same helper, same `pill`
                variant, same menu dictionary — so the popup is not a lookalike of the
                window but literally the same control.
              */}
              <div className="flex items-center gap-2" data-testid="record-create-tabs">
                {renderPrimaryTabButtons(target.tabsVariant, tabs, setActiveTab, activeTab, tMenu)}
              </div>
              {/*
                Both panels stay MOUNTED — the inactive one is only hidden. Unmounting it
                would fire EntityForm's registerFields cleanup and silently drop that tab's
                fields from validation: `taxCategory` is required, lives in the `other`
                section, and has no static default, so submitting from the General tab
                would sail past the check straight into a backend 400.
              */}
              {tabs.map(tab => (
                <div
                  key={tab.key}
                  role="tabpanel"
                  className={`pt-5 ${tab.key === activeTab ? '' : 'hidden'}`}
                  data-testid={`record-create-panel-${tab.key}`}
                >
                  <FormComponent
                    entity={target.entity}
                    section={tab.section}
                    // `image` needs the /image upload endpoint and a saved record, so it
                    // cannot work before the record exists.
                    excludeFields={EXCLUDED_FIELDS}
                    data={data}
                    onChange={handleChange}
                    apiBaseUrl={target.apiBaseUrl}
                    token={token}
                    cols={target.cols}
                    onFieldBlur={createdRecord ? handleFieldBlur : undefined}
                    savingField={savingField}
                    labelOverrides={target.labelOverrides}
                    registerFields={registerFields}
                    fieldErrors={fieldErrors}
                  />
                </div>
              ))}
            </>
          )}
          {!FormComponent && (
            <p className="py-8 text-center text-sm text-muted-foreground">{ui('loading')}</p>
          )}
        </div>

        {/*
          Phase 2. These are the window's OWN panels (same components, same extra props
          DetailView hands them), mounted against the record that was just saved. They
          persist themselves against `/price` and the attachment endpoints, so the popup
          has nothing to save on their behalf.
        */}
        {createdRecord && postCreateTabs?.length > 0 && (
          <div className="mt-6 border-t border-border pt-2" data-testid="record-create-post-tabs">
            <Tabs value={activePostTab} onValueChange={setActivePostTab}>
              <TabsList className="border-b border-border">
                {postCreateTabs.map(tab => (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    badge={postTabCounts[tab.key]}
                    data-testid={`record-create-post-tab-${tab.key}`}
                  >
                    {ui(tab.labelKey)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {postCreateTabs.map((tab) => {
                const TabComponent = tab.Component;
                const isActive = tab.key === activePostTab;
                return (
                  <div
                    key={tab.key}
                    className="pt-3"
                    style={isActive ? undefined : { display: 'none' }}
                    data-testid={`record-create-post-panel-${tab.key}`}
                  >
                    <TabComponent
                      recordId={createdRecord.id}
                      data={createdRecord}
                      token={token}
                      apiBaseUrl={target.apiBaseUrl}
                      isActive={isActive}
                      isNew={false}
                      onCountChange={(count) => setPostTabCounts(prev => (
                        prev[tab.key] === count ? prev : { ...prev, [tab.key]: count }
                      ))}
                      {...(tab.props || {})}
                    />
                  </div>
                );
              })}
            </Tabs>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive" data-testid="record-create-error">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {!createdRecord && (
            <button
              type="button"
              onClick={onCancel}
              data-testid="record-create-cancel"
              className="inline-flex h-10 items-center justify-center rounded-full border border-[hsl(var(--border-control))] bg-card px-4 text-sm font-medium text-[hsl(var(--foreground))] shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] transition-colors hover:bg-muted/40"
            >
              {ui('cancel')}
            </button>
          )}
          <button
            type="button"
            onClick={createdRecord ? finish : submit}
            disabled={saving || loading || !FormComponent}
            data-testid={createdRecord ? 'record-create-finish' : 'record-create-submit'}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-4 py-2 text-sm font-medium leading-6 text-primary-foreground transition-colors disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground enabled:bg-[hsl(var(--foreground))] enabled:hover:bg-[hsl(var(--accent-highlight))] enabled:hover:text-[hsl(var(--accent-highlight-foreground))]"
          >
            {resolveActionLabel({ ui, saving, createdRecord })}
          </button>
        </div>
      </LocaleProvider>
      </DialogContent>
    </Dialog>
  );
}

const EXCLUDED_FIELDS = ['image'];
const DEFAULT_TABS = [{ key: 'general', label: 'General', section: 'principal' }];

/** Primary action caption: "Create" while collecting, "Done" once the record exists. */
export function resolveActionLabel({ ui, saving, createdRecord }) {
  if (saving) return ui('processing');
  return createdRecord ? ui('done') : ui('create');
}

function isBlank(value) {
  return value === undefined || value === null || value === '';
}


/**
 * Strips what must never reach a create payload: the id (a POST assigns it) and the
 * `<key>$_identifier` display siblings EntityForm writes alongside every FK value.
 */
export function buildRecordCreatePayload(data) {
  const payload = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (key === 'id' || key.endsWith('$_identifier')) continue;
    payload[key] = value;
  }
  return payload;
}

/**
 * NEO answers a create with several shapes depending on the handler. Same defensive
 * ladder `InlineCreateSelector.createLookupRecord` already uses.
 */
export function unwrapCreated(body) {
  return body?.response?.data?.[0] ?? body?.response?.data ?? body?.data?.[0] ?? body ?? null;
}

async function readErrorBody(res) {
  try {
    const body = await res.json();
    return body?.response?.error?.message || body?.error?.message || body?.message || null;
  } catch {
    return null;
  }
}

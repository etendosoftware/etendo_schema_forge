import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useLocaleSwitch, useUI } from '@/i18n';
import ActionChoiceModal, { isOwnEscape, useDialogFocusTrap } from '@/components/contract-ui/ActionChoiceModal.jsx';
import { ConfirmResultModal } from '@/components/contract-ui/ConfirmResultModal.jsx';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect.jsx';
import RequiredMark from '@/components/ui/required-mark.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { followUpInputLabels, readConfiguredFollowUpEntries, readFollowUpInputValue } from './followUpDocuments.js';

/**
 * ETP-5576 — generic follow-up document modal: the choice → loading → result flow on top
 * of ActionChoiceModal (choice, Figma "PopUps") and ConfirmResultModal (result, link to the
 * created document — rendered with `variant="popup"`, the same PopUps shell, so the two phases
 * look like one dialog). It renders nothing while `session` is null.
 *
 * Layout (product decision, ETP-5576) — decided ONLY by how many configured follow-ups are
 * available, nothing window-specific:
 *   - one  → ActionChoiceModal's single-option mode: a direct confirmation (summary, the
 *            question, ONE static option card — title, badge, description with the pending
 *            line count, no radio — and a primary button named after the action, focused so
 *            Enter creates);
 *   - two+ → the Figma choice cards, one per real follow-up document (future orders).
 * There is no "not now" card: rejecting is Cancel, the close icon, Esc or the backdrop, and
 * the source document simply stays as it is.
 *
 * Input-required round-trip: while `session.inputRequest` is set (the backend answered the
 * POST with an `input` block), a required selector is rendered below the option(s) — the
 * same searchable combo the other document modals use (CreatableSearchSelect over static
 * options, as PriceListSelectField does). Its label is `followUpInput<Key>` (generic
 * `followUpInputGeneric` fallback) and its helper text `followUpInput<Key>Help`; the key and
 * the options come from the backend, nothing here is window-specific. Focus moves to it
 * when it appears, the primary button stays disabled until a value is chosen, Enter on the
 * closed selector retries, and Esc on the closed selector cancels like anywhere else.
 * The request belongs to the follow-up whose action asked (`session.inputs.forKey`): in the
 * multi-option layout the selector and the disabled primary apply only while that option is
 * the selected one, and selecting another option releases the request (`onSelectionChange`).
 *
 * @param {object} props
 * @param {object|null} props.session from useFollowUpDocuments
 * @param {Object<string, FollowUpOptionConfig>} props.options per-key config
 * @param {FollowUpSummaryConfig} [props.summary] which record fields feed the summary table
 * @param {string} [props.titleKey] title when more than one follow-up is offered
 * @param {string} [props.questionKey] question above the option(s) — window-specific
 *   («¿Qué vas a hacer con esta factura?»); defaults to the generic `followUpQuestion`
 * @param {() => void} props.onClose reject / close (Cancel, close icon, Esc, backdrop, result close)
 * @param {(key: string) => void} props.onCreate create the follow-up document for `key`
 * @param {(value: string|null) => void} [props.onInputChange] records the value chosen in the
 *   backend-requested selector (useFollowUpDocuments' `setInputValue`)
 * @param {(key: string) => void} [props.onSelectionChange] the selected follow-up changed
 *   (useFollowUpDocuments' `releaseInput`)
 *
 * @typedef {object} FollowUpOptionConfig
 * @property {string} labelKey        card title
 * @property {string} descriptionKey  description sentence; receives `{ count }` (pending lines)
 * @property {string} [descriptionOneKey] singular variant, used when exactly one line is pending
 * @property {string} actionLabelKey  primary button label in the single-option layout (e.g. «Crear albarán»)
 * @property {import('react').ComponentType<{size?: number}>} [icon] card icon (lucide)
 * @property {string} [badgeKey]      optional badge (e.g. 'draft', 'soRecommended')
 * @property {'success'|'info'} [badgeTone='success'] badge colours: 'success' green
 *                                    («Recomendado»), 'info' blue («Borrador»)
 * @property {string} [titleKey]      modal title when this is the only follow-up offered
 * @property {string} [buttonLabelKey] topbar button label when this is the only follow-up
 * @property {string} resultDocType   ConfirmResultModal doc type ('salida', 'entrada', 'facturaVenta', 'facturaCompra')
 * @property {string} [resultTitleKey] result modal title
 *
 * @typedef {object} FollowUpSummaryConfig
 * @property {string} documentLabelKey               REQUIRED — label of the source document column
 *                                                  (e.g. 'invoice'); the column is omitted without it
 * @property {string} [documentNoField='documentNo']   falls back to `documentNo`
 * @property {string} [dateLabelKey]                   date column shown only with dateField
 * @property {string} [dateField]
 * @property {string} [contactField='businessPartner$_identifier']
 * @property {string} [totalField='grandTotalAmount']
 * @property {string} [currencyField='currency$_identifier']
 * @property {string} [linesLabelKey='lines'] label of the pending-lines column (single follow-up only)
 */
export default function FollowUpDocumentModal({
  session, options, summary, titleKey, questionKey, onClose, onCreate, onInputChange, onSelectionChange,
}) {
  if (!session) return null;
  const content = session.phase === 'result'
    ? (
      <FollowUpResult
        session={session}
        options={options}
        onClose={onClose}
        data-testid="FollowUpResult__ccd4ed" />
    )
    : (
      <FollowUpChoice
        session={session}
        options={options}
        summary={summary}
        titleKey={titleKey}
        questionKey={questionKey}
        onClose={onClose}
        onCreate={onCreate}
        onInputChange={onInputChange}
        onSelectionChange={onSelectionChange}
        data-testid="FollowUpChoice__ccd4ed" />
    );
  // Portal: the trigger lives in the detail topbar, whose ancestors must not become the
  // containing block of a `position: fixed` overlay.
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}

function FollowUpChoice({
  session, options, summary, titleKey, questionKey, onClose, onCreate, onInputChange, onSelectionChange,
}) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const entries = useMemo(
    () => readConfiguredFollowUpEntries(session.record, options),
    [session.record, options],
  );
  const single = entries.length === 1 ? entries[0] : null;
  const singleConfig = single ? options[single.key] : null;

  const choiceOptions = useMemo(() => entries.map((entry) => {
    const cfg = options[entry.key];
    const count = entry.pendingLines ?? 0;
    const descriptionKey = count === 1 && cfg.descriptionOneKey ? cfg.descriptionOneKey : cfg.descriptionKey;
    return {
      id: entry.key,
      label: ui(cfg.labelKey),
      description: ui(descriptionKey, { count }),
      badge: cfg.badgeKey ? ui(cfg.badgeKey) : undefined,
      badgeTone: cfg.badgeTone,
      icon: cfg.icon,
      actionLabel: cfg.actionLabelKey ? ui(cfg.actionLabelKey) : undefined,
      testId: `follow-up-option-${entry.key}`,
    };
  }), [entries, options, ui]);

  const { columns, data } = useMemo(
    () => buildSummary({ record: session.record, summary, single, ui, locale }),
    [session.record, summary, single, ui, locale],
  );

  const title = (single && singleConfig?.titleKey && ui(singleConfig.titleKey))
    || (titleKey && ui(titleKey))
    || ui('followUpManageTitle');

  const { inputRequest, inputs } = session;
  const inputValue = inputRequest ? readFollowUpInputValue(inputs?.values, inputRequest.key) : '';
  // The request applies only while its own follow-up is the selected option.
  const inputApplies = (selectedId) => Boolean(inputRequest) && selectedId === inputs?.forKey;

  return (
    <ActionChoiceModal
      title={title}
      summaryColumns={columns}
      summaryData={data}
      question={ui(questionKey || 'followUpQuestion')}
      options={choiceOptions}
      defaultOptionId={entries[0]?.key}
      onCancel={onClose}
      onContinue={onCreate}
      loading={session.loading}
      error={session.error}
      loadingLabel={ui('creating')}
      testId="follow-up-document-modal"
      primaryDisabled={(selectedId) => inputApplies(selectedId) && !inputValue}
      onSelectionChange={onSelectionChange}
      data-testid="ActionChoiceModal__ccd4ed">
      {(selectedId) => inputApplies(selectedId) && (
        <FollowUpInputField
          request={inputRequest}
          value={inputValue}
          loading={session.loading}
          onChange={(value) => onInputChange?.(value)}
          onSubmit={() => onCreate(inputs?.forKey)}
          onCancel={onClose}
          data-testid="FollowUpInputField__ccd4ed" />
      )}
    </ActionChoiceModal>
  );
}

/**
 * The value the backend asked for (`session.inputRequest`): a required, labelled
 * CreatableSearchSelect over the options the backend sent, with a helper text. A disabled
 * fieldset while the retry is in flight (every control inside is disabled at once).
 *
 * Keyboard, on top of the combo's own (Arrows / Enter pick an option, Esc closes the list):
 *   - Enter with the list closed and a value chosen retries — same as the primary button;
 *   - Esc with the list closed cancels the modal (the combo's input swallows every Esc, so
 *     the dialog would otherwise never see it while focus is here).
 */
function FollowUpInputField({ request, value, loading, onChange, onSubmit, onCancel }) {
  const ui = useUI();
  const wrapperRef = useRef(null);
  const fieldKey = `follow-up-input-${request.key}`;
  const labelId = `${fieldKey}-label`;
  const helpId = `${fieldKey}-help`;
  const { label, help } = followUpInputLabels(request.key, ui);
  // Stable reference (CreatableSearchSelect keys internal effects off `field`).
  const field = useMemo(() => ({ key: fieldKey, id: fieldKey, required: true }), [fieldKey]);
  const displayValue = request.options.find((opt) => opt.id === value)?.name || '';

  // Focus moves to the selector when it appears (or when the backend asks again): the
  // search input, or the chip of a preselected single option.
  useEffect(() => {
    wrapperRef.current?.querySelector('input, button')?.focus?.();
  }, [request]);

  const handleKeyDownCapture = (event) => {
    if (loading) return;
    const target = event.target;
    if (target?.getAttribute?.('aria-expanded') === 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === 'Enter' && value && target?.getAttribute?.('role') !== 'button') {
      // role="button" is the chip's clear (X) control: Enter there clears, it must not submit.
      event.preventDefault();
      event.stopPropagation();
      onSubmit();
    }
  };

  return (
    <fieldset
      ref={wrapperRef}
      disabled={loading}
      aria-labelledby={labelId}
      aria-describedby={help ? helpId : undefined}
      data-testid="follow-up-input"
      data-input-key={request.key}
      onKeyDownCapture={handleKeyDownCapture}
      style={inputFieldsetStyle}
    >
      {/* htmlFor only while the combo's <input id={fieldKey}> exists: with a value chosen it
          renders a chip button instead (no id), and the fieldset carries the name. */}
      <label id={labelId} htmlFor={value ? undefined : fieldKey} style={inputLabelStyle}>
        {label}
        <RequiredMark aria-hidden="true" data-testid="RequiredMark__ccd4ed" />
      </label>
      <CreatableSearchSelect
        field={field}
        value={value || null}
        displayValue={displayValue}
        onChange={(id) => onChange(id ?? null)}
        resolvedLabel={label}
        staticOptions={request.options}
        data-testid="CreatableSearchSelect__ccd4ed" />
      {help && <p id={helpId} style={inputHelpStyle}>{help}</p>}
    </fieldset>
  );
}

const inputFieldsetStyle = {
  display: 'flex', flexDirection: 'column', gap: 6,
  margin: 0, padding: 0, border: 'none', minWidth: 0,
};

const inputLabelStyle = { fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))' };

const inputHelpStyle = { margin: 0, fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))' };

/**
 * Summary table: document number, optional date, contact, pending lines (only when one
 * follow-up is offered — with several, each card states its own count; labelled
 * `linesLabelKey`, «Líneas» by default) and total.
 * Amounts through formatCurrency, dates through formatCalendarDate (never by hand).
 */
export function buildSummary({ record, summary = {}, single, ui, locale }) {
  const {
    documentLabelKey,
    documentNoField = 'documentNo',
    dateLabelKey,
    dateField,
    contactField = 'businessPartner$_identifier',
    totalField = 'grandTotalAmount',
    currencyField = 'currency$_identifier',
    linesLabelKey = 'lines',
  } = summary;
  // No default label on purpose: this component is not invoice-specific, each window's
  // config names its own document (see windows/custom/shared/invoiceFollowUp.js).
  const columns = [];
  const data = {};
  if (documentLabelKey) {
    columns.push({ key: 'document', label: ui(documentLabelKey), testId: 'follow-up-summary-document' });
    data.document = record?.[documentNoField] || record?.documentNo || '—';
  }
  if (dateField && dateLabelKey) {
    columns.push({ key: 'date', label: ui(dateLabelKey), testId: 'follow-up-summary-date' });
    data.date = formatCalendarDate(record?.[dateField], locale);
  }
  columns.push({ key: 'contact', label: ui('contact'), testId: 'follow-up-summary-contact' });
  data.contact = record?.[contactField] || '—';
  if (single) {
    columns.push({ key: 'pendingLines', label: ui(linesLabelKey), testId: 'follow-up-summary-pending-lines' });
    data.pendingLines = single.pendingLines ?? '—';
  }
  columns.push({ key: 'total', label: ui('total'), testId: 'follow-up-summary-total' });
  const total = record?.[totalField];
  data.total = total == null ? '—' : formatCurrency(record?.[currencyField] || '', Number(total));
  return { columns, data };
}

function FollowUpResult({ session, options, onClose }) {
  const ui = useUI();
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const first = session.created[0];
  const cfg = options[first?.key] ?? {};

  // ConfirmResultModal has no keyboard handling of its own (and other windows rely on it
  // unchanged), so the result phase adds it here, with the same rules as the choice phase
  // (ActionChoiceModal): Tab is trapped in the dialog, Esc closes only when it is this
  // dialog's own (not one a layer on top already handled), and focus starts on the link to
  // the created document so Enter opens it.
  useDialogFocusTrap(wrapperRef);
  // On close, focus goes back to whoever opened the flow (the topbar button, or whatever
  // was focused when the post-Confirm prompt opened it) — the choice phase already handed
  // focus back to it when it unmounted, so it is the active element at this point.
  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    const wrapper = wrapperRef.current;
    (wrapper?.querySelector('[role="button"]') ?? wrapper)?.focus?.();
    return () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus?.();
    };
  }, []);

  const docs = session.created.map((doc) => ({
    type: options[doc.key]?.resultDocType,
    num: doc.documentNo,
    route: `/${doc.spec}/${doc.id}`,
    documentStatus: doc.documentStatus,
  }));

  return (
    <div
      ref={wrapperRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      style={{ outline: 'none' }}
      aria-label={ui(cfg.resultTitleKey || 'followUpDocumentCreated')}
      onKeyDown={(e) => { if (isOwnEscape(e, wrapperRef.current)) { e.stopPropagation(); onClose(); } }}
    >
      <ConfirmResultModal
        title={ui(cfg.resultTitleKey || 'followUpDocumentCreated')}
        docs={docs}
        navigate={navigate}
        onClose={onClose}
        variant="popup"
        data-testid="ConfirmResultModal__ccd4ed" />
    </div>
  );
}

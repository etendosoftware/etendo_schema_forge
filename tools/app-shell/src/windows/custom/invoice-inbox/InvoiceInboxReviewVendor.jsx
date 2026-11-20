import { useState } from 'react';
import { BuildingsIcon, MagnifyingGlassIcon, UserPlusIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildOp, extractedCountry, joinMeta, MAX_TEXT, vendorView } from './invoiceInboxReviewModel.js';
import {
  AiChip, FieldError, OptionRow, ReviewField, ReviewTag, SectionTitle,
} from './InvoiceInboxReviewParts.jsx';
import { CommitInput } from './InvoiceInboxReviewInputs.jsx';
import { EntityPicker } from './InvoiceInboxReviewPickers.jsx';
import { useReviewEditor } from './useInvoiceInboxReviewEditor.js';

const NONE_VALUE = '__none__';
/** `matchedBy` of a linked vendor → `genericLabels` key. */
const MATCHED_BY_KEYS = Object.freeze({
  taxId: 'invoiceInboxReviewVendorLinkedByTaxId',
  name: 'invoiceInboxReviewVendorLinkedByName',
  manual: 'invoiceInboxReviewVendorLinkedManual',
});

let opSequence = 0;
/** A key no other operation shares: vendor resolutions never coalesce in the write queue. */
function uniqueKey(prefix) {
  opSequence += 1;
  return `${prefix}:${opSequence}`;
}

/** A ghost button. Without the panel's editor (a section rendered on its own) it is inert. */
function GhostButton({ label, testId, icon = null, onClick, editable }) {
  const ui = useUI();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-disabled={!editable || undefined}
      title={editable ? undefined : ui('invoiceInboxRowActionSoon', { action: label })}
      className={`flex-none ${editable ? '' : 'cursor-not-allowed opacity-60'}`}
      onClick={editable ? onClick : (event) => event.preventDefault()}
      data-testid={testId}>
      {icon}
      {label}
    </Button>
  );
}

/** Choosing / creating, as operations. `hint` is the display copy of the picked vendor. */
function useVendorActions() {
  const editor = useReviewEditor();
  return {
    editor,
    select: (id, hint) => editor.commit(uniqueKey('vendor'), buildOp.selectVendor(id), hint),
    createNew: () => editor.commit(uniqueKey('vendor'), buildOp.newVendor()),
    editField: (field, value) => editor.commit(`vendor:field:${field}`, buildOp.newVendor({ [field]: value })),
  };
}

/** The radios of the candidates plus "none · create new"; `checkedId` / `noneChecked` say what is committed. */
function CandidateRadios({ view, readOnly, checkedId = null, noneChecked = false, onSelect }) {
  const ui = useUI();
  const { candidates } = view;
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={ui('invoiceInboxReviewSectionVendor')}>
      {candidates.map((candidate, position) => (
        <OptionRow
          key={candidate.id}
          value={candidate.id}
          checked={checkedId === candidate.id}
          onSelect={onSelect}
          readOnly={readOnly}
          testId={`invoice-inbox-review-vendor-candidate-${candidate.id}`}
          badge={position === 0
            ? <ReviewTag
            tone="info"
            label={ui('invoiceInboxReviewMostLikely')}
            testId={`invoice-inbox-review-vendor-likely-${candidate.id}`}
            data-testid="ReviewTag__3b4318" />
            : null}
          data-testid="OptionRow__3b4318">
          <span className="block truncate text-sm font-semibold">{candidate.name}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {joinMeta([candidate.taxId, candidate.city])}
          </span>
        </OptionRow>
      ))}
      <OptionRow
        value={NONE_VALUE}
        checked={noneChecked}
        onSelect={onSelect}
        readOnly={readOnly}
        testId="invoice-inbox-review-vendor-none-option"
        data-testid="OptionRow__3b4318">
        <span className="block text-sm font-medium text-primary">{ui('invoiceInboxReviewVendorCreateNew')}</span>
      </OptionRow>
    </div>
  );
}

/** The search over the Etendo vendors (`purchase-invoice` selector); picking one links it. */
function VendorSearch({ view, apiBaseUrl, actions }) {
  const ui = useUI();
  return (
    <div data-testid="invoice-inbox-review-vendor-search">
      <EntityPicker
        kind="vendor"
        apiBaseUrl={apiBaseUrl}
        value={view.state === 'linked' ? view.vendor.id : null}
        label={view.state === 'linked' ? view.name : ''}
        placeholder={ui('invoiceInboxReviewVendorNoneHint')}
        fieldKey="inbox-vendor"
        onPick={({ id, name, option }) => {
          if (view.state === 'linked' && view.vendor.id === id) return;
          actions.select(id, { name, taxId: option?.taxId, city: option?.city });
        }}
        data-testid="EntityPicker__vendor" />
    </div>
  );
}

/** What a radio click does: the candidate is selected, "none" creates the vendor from the extracted data. */
function radioHandler(view, actions) {
  return (value) => {
    if (value === NONE_VALUE) {
      if (view.state !== 'new') actions.createNew();
      return;
    }
    const candidate = view.candidates.find((item) => item.id === value);
    if (!candidate || (view.state === 'linked' && view.vendor.id === candidate.id)) return;
    actions.select(candidate.id, { name: candidate.name, taxId: candidate.taxId, city: candidate.city });
  };
}

function LinkedVendor({ view, readOnly, apiBaseUrl }) {
  const ui = useUI();
  const actions = useVendorActions();
  const editable = Boolean(actions.editor) && !readOnly;
  const [changing, setChanging] = useState(false);
  const matchedKey = MATCHED_BY_KEYS[view.vendor.matchedBy];
  const meta = joinMeta([view.taxId, view.city]);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-3 rounded-xl border border-border p-3"
        data-testid="invoice-inbox-review-vendor-linked">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
          <BuildingsIcon className="h-[18px] w-[18px]" aria-hidden="true" data-testid="Building2__review-vendor" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" data-testid="invoice-inbox-review-vendor-name">{view.name}</p>
          {meta && (
            <p className="truncate font-mono text-xs text-muted-foreground" data-testid="invoice-inbox-review-vendor-meta">
              {meta}
            </p>
          )}
        </div>
        {matchedKey && (
          <ReviewTag
            tone="success"
            label={ui(matchedKey)}
            testId="invoice-inbox-review-vendor-matched-by"
            data-testid="ReviewTag__3b4318" />
        )}
        <GhostButton
          label={ui('invoiceInboxReviewVendorChange')}
          testId="invoice-inbox-review-vendor-change"
          editable={editable}
          onClick={() => setChanging((open) => !open)}
          data-testid="GhostButton__3b4318" />
      </div>
      {editable && changing && (
        <div className="flex flex-col gap-2" data-testid="invoice-inbox-review-vendor-change-panel">
          <VendorSearch view={view} apiBaseUrl={apiBaseUrl} actions={actions} data-testid="VendorSearch__3b4318" />
          {view.candidates.length > 0 && (
            <CandidateRadios
              view={view}
              readOnly={false}
              checkedId={view.vendor.id}
              onSelect={radioHandler(view, actions)}
              data-testid="CandidateRadios__3b4318" />
          )}
        </div>
      )}
    </div>
  );
}

/** A confirmed or discarded document: the vendor as plain text. */
function PlainVendor({ view }) {
  const name = view.name || view.extracted.name || '';
  const taxId = view.taxId || view.extracted.taxId || '';
  return (
    <div data-testid="invoice-inbox-review-vendor-plain">
      <p className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]" data-testid="invoice-inbox-review-vendor-name">{name}</p>
      {taxId && (
        <p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid="invoice-inbox-review-vendor-meta">{taxId}</p>
      )}
    </div>
  );
}

function AmbiguousVendor({ view, missing, readOnly, apiBaseUrl }) {
  const ui = useUI();
  const actions = useVendorActions();
  const editable = Boolean(actions.editor) && !readOnly;
  const { extracted, candidates } = view;
  return (
    <div className="flex flex-col gap-2" data-testid="invoice-inbox-review-vendor-ambiguous">
      <div className="flex flex-wrap items-center gap-2">
        <AiChip
          label={candidates.length === 1
            ? ui('invoiceInboxReviewVendorAmbiguousTitleOne')
            : ui('invoiceInboxReviewVendorAmbiguousTitle', { count: candidates.length })}
          testId="invoice-inbox-review-vendor-ambiguous-title"
          data-testid="AiChip__3b4318" />
        <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid="invoice-inbox-review-vendor-in-document">
          {ui('invoiceInboxReviewVendorInDocument', { name: extracted.name ?? '' })}
          {!String(extracted.taxId ?? '').trim() && ui('invoiceInboxReviewVendorNoTaxId')}
        </span>
      </div>
      <CandidateRadios
        view={view}
        readOnly={!editable}
        onSelect={editable ? radioHandler(view, actions) : undefined}
        data-testid="CandidateRadios__3b4318" />
      {editable && <VendorSearch view={view} apiBaseUrl={apiBaseUrl} actions={actions} data-testid="VendorSearch__3b4318" />}
      {missing.has('vendor') && (
        <FieldError
          testId="invoice-inbox-review-vendor-error"
          data-testid="FieldError__3b4318">{ui('invoiceInboxReviewVendorPickError')}</FieldError>
      )}
    </div>
  );
}

/** One text field of the new vendor: autosaves a `newVendor` patch of that key. */
function NewVendorField({ field, label, value, readOnly, required = false, invalid = false, error = null, testId, actions, className = '' }) {
  return (
    <ReviewField
      label={label}
      className={className}
      readOnly={readOnly}
      required={required}
      invalid={invalid}
      error={error}
      value={value}
      testId={testId}
      control={actions.editor && !readOnly ? (
        <CommitInput
          id={testId}
          value={value ?? ''}
          display={(text) => String(text ?? '')}
          maxLength={MAX_TEXT}
          invalid={invalid}
          onCommit={(text) => actions.editField(field, text)}
          testId={testId}
          data-testid="CommitInput__3b4318" />
      ) : null}
      data-testid="ReviewField__3b4318" />
  );
}

function NewVendor({ view, missing, readOnly, apiBaseUrl }) {
  const ui = useUI();
  const actions = useVendorActions();
  const editable = Boolean(actions.editor) && !readOnly;
  const [searching, setSearching] = useState(false);
  const [countryId, setCountryId] = useState(null);
  const { extracted } = view;
  const noName = missing.has('vendor') && !String(extracted.name ?? '').trim();
  const typedCountry = String(extracted.countryName ?? '').trim();
  const country = extractedCountry(extracted) || ui('invoiceInboxReviewCountryDefault');
  const field = (key, label, extra = {}) => (
    <NewVendorField
      field={key}
      label={label}
      value={extracted[key]}
      readOnly={readOnly}
      testId={`invoice-inbox-review-vendor-new-${extra.testSuffix ?? key.toLowerCase()}`}
      actions={actions}
      {...extra}
      data-testid="NewVendorField__3b4318" />
  );
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 p-3.5"
      data-testid="invoice-inbox-review-vendor-new">
      <div className="flex flex-wrap items-start gap-2.5">
        <UserPlusIcon className="mt-px h-[18px] w-[18px] flex-none text-primary" aria-hidden="true" data-testid="UserPlus__review-vendor" />
        <p className="min-w-[180px] flex-1 text-[13px] leading-normal text-muted-foreground [overflow-wrap:anywhere]" data-testid="invoice-inbox-review-vendor-new-hint">
          <b className="font-bold text-foreground" data-testid="invoice-inbox-review-vendor-new-title">
            {ui('invoiceInboxReviewVendorNewTitle')}.
          </b>
          {' '}
          {ui('invoiceInboxReviewVendorNewHint')}
        </p>
        <GhostButton
          label={ui('invoiceInboxReviewVendorSearchExisting')}
          testId="invoice-inbox-review-vendor-search-existing"
          icon={<MagnifyingGlassIcon className="h-3.5 w-3.5" aria-hidden="true" data-testid="Search__review-vendor" />}
          editable={editable}
          onClick={() => setSearching((open) => !open)}
          data-testid="GhostButton__3b4318" />
      </div>
      {editable && searching && (
        <VendorSearch view={view} apiBaseUrl={apiBaseUrl} actions={actions} data-testid="VendorSearch__3b4318" />
      )}
      {field('name', ui('invoiceInboxReviewFieldName'), {
        required: true,
        invalid: noName,
        error: noName ? ui('invoiceInboxReviewVendorRequired') : null,
        testSuffix: 'name',
      })}
      <div className="grid grid-cols-[minmax(96px,160px)_minmax(0,1fr)] gap-3">
        {field('taxId', ui('invoiceInboxReviewFieldTaxId'), { testSuffix: 'taxid' })}
        {field('address', ui('invoiceInboxReviewFieldAddress'))}
      </div>
      {/* Postal code | city | country wrap onto a second row when the pane is too narrow for the three. */}
      <div className="flex flex-wrap gap-3">
        {field('postalCode', ui('invoiceInboxReviewFieldPostalCode'), { testSuffix: 'postalcode', className: 'min-w-[96px] flex-[1_1_96px]' })}
        {field('city', ui('invoiceInboxReviewFieldCity'), { className: 'min-w-[120px] flex-[2_1_120px]' })}
        <ReviewField
          className="min-w-[120px] flex-[1_1_120px]"
          label={ui('invoiceInboxReviewFieldCountry')}
          value={country}
          readOnly={readOnly}
          testId="invoice-inbox-review-vendor-new-country"
          control={editable ? (
            <EntityPicker
              kind="country"
              apiBaseUrl={apiBaseUrl}
              value={countryId ?? `name:${typedCountry || 'default'}`}
              label={country}
              placeholder={ui('invoiceInboxReviewFieldCountry')}
              fieldKey="inbox-vendor-country"
              onPick={({ id, name }) => {
                setCountryId(id);
                actions.editField('countryName', name);
              }}
              data-testid="EntityPicker__country" />
          ) : null}
          data-testid="ReviewField__3b4318" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('email', ui('invoiceInboxReviewFieldEmail'))}
        {field('phone', ui('invoiceInboxReviewFieldPhone'))}
      </div>
    </div>
  );
}

function NoVendor({ view, missing, readOnly, apiBaseUrl }) {
  const ui = useUI();
  const actions = useVendorActions();
  const editable = Boolean(actions.editor) && !readOnly;
  const hasExtracted = Object.values(view.extracted).some((value) => String(value ?? '').trim());
  return (
    <div className="flex flex-col gap-2" data-testid="invoice-inbox-review-vendor-none">
      {editable ? (
        <VendorSearch view={view} apiBaseUrl={apiBaseUrl} actions={actions} data-testid="VendorSearch__3b4318" />
      ) : (
        <Input
          readOnly
          aria-disabled="true"
          placeholder={ui('invoiceInboxReviewVendorNoneHint')}
          aria-invalid={missing.has('vendor') || undefined}
          className={missing.has('vendor') ? 'border-destructive' : undefined}
          data-testid="invoice-inbox-review-vendor-none-hint" />
      )}
      {editable && hasExtracted && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={actions.createNew}
          data-testid="invoice-inbox-review-vendor-create-new">
          <UserPlusIcon className="h-3.5 w-3.5" aria-hidden="true" data-testid="UserPlus__review-vendor-create" />
          {ui('invoiceInboxReviewVendorCreateNewButton')}
        </Button>
      )}
      {missing.has('vendor') && (
        <FieldError
          testId="invoice-inbox-review-vendor-error"
          data-testid="FieldError__3b4318">{ui('invoiceInboxReviewVendorRequired')}</FieldError>
      )}
    </div>
  );
}

/**
 * ETP-6050 F5/F6 — the "Proveedor" section, in its four states (`vendor.state`): linked (card with
 * the tag of how it was matched and "Cambiar", which opens the search and the candidates),
 * ambiguous (the AI chip, full-row candidates, "Ninguno · crear proveedor nuevo", the search, the
 * error while unresolved), new (block + the extracted data, all editable, the address STRUCTURED,
 * country by name with the Spain fallback — decision 8 — and "Buscar existente") and none (search,
 * or "crear nuevo" when data was extracted). Choosing and editing go through the panel's editor
 * (`selectVendor` / `newVendor`); nothing is created in Etendo until the confirm (ETP-6051).
 * `locked` (confirmed / discarded / not editable) shows the vendor as plain text.
 *
 * @param {{document: object, missing: Set<string>, readOnly?: boolean, locked?: boolean,
 *   apiBaseUrl?: string}} props
 */
export default function InvoiceInboxReviewVendor({
  document, missing, readOnly = true, locked = false, apiBaseUrl = '',
}) {
  const ui = useUI();
  const view = vendorView(document);
  const common = { view, missing, readOnly, apiBaseUrl };
  return (
    <section className="flex flex-col gap-3" data-testid="invoice-inbox-review-vendor" data-state={view.state}>
      <SectionTitle
        testId="invoice-inbox-review-vendor-title"
        data-testid="SectionTitle__3b4318">{ui('invoiceInboxReviewSectionVendor')}</SectionTitle>
      {locked && <PlainVendor view={view} data-testid="PlainVendor__3b4318" />}
      {!locked && view.state === 'linked' && <LinkedVendor {...common} data-testid="LinkedVendor__3b4318" />}
      {!locked && view.state === 'ambiguous' && <AmbiguousVendor {...common} data-testid="AmbiguousVendor__3b4318" />}
      {!locked && view.state === 'new' && <NewVendor {...common} data-testid="NewVendor__3b4318" />}
      {!locked && view.state === 'none' && <NoVendor {...common} data-testid="NoVendor__3b4318" />}
    </section>
  );
}

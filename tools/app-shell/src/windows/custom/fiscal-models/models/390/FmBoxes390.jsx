// Modelo 390 — the "Casillas" tab (ETP-5716): block index, box search and the blocks of
// fm390Layouts.js. Presentational: values, inputs and every change come from FmModel390Page.jsx.
// The box search (and "Ir a la casilla") reveals a box hidden in a folded "Sin operaciones" group
// or behind the territory toggle before scrolling to it and highlighting it.
//
// Visual pattern: the Modelo 303 boxes (`.fm-aeat-*` classes of fiscal-models.css) — concept on
// the left with a dotted leader, one cell per column with the box number on its left; calculated
// cells grey and read-only, manual cells white with a pencil, totals in bold.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  TrendingUp, TrendingDown, Pencil, RotateCcw, Search, ChevronLeft, ChevronRight, TriangleAlert,
  ReceiptText, Star,
} from 'lucide-react';
import { CheckboxField } from '@/windows/custom/shared/CheckboxField.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { formatAmount, formatPercent } from '../../fiscalModelsUtils.js';
import {
  INPUT, FLAG, TERRITORY_PERCENT_INPUTS, cellInput, cellBox, buildBoxIndex, findBox, parseAmount,
  inputOrigin, isTerritoryMode, territoryPercentSum, isSubstitutive, isMonthlyReturn, isConcurso,
  inputMessages390, MODELO_390_OTHER_ACTIVITY_LIMIT,
} from './fm390Layouts.js';

const BLOCK_ICON = {
  accrued: <TrendingUp size={20} strokeWidth={1.75} data-testid="TrendingUp__fm390" />,
  deductible: <TrendingDown size={20} strokeWidth={1.75} data-testid="TrendingDown__fm390" />,
};

/** DOM id of a box cell, used by the box search to scroll to it. */
export const boxDomId = (box) => `fm390-box-${box}`;

function formatRate(rate, bcpLocale) {
  return new Intl.NumberFormat(bcpLocale, { maximumFractionDigits: 2 }).format(Number(rate));
}

function isFlagOn(inputs, key) {
  return inputs?.[key] === 'Y';
}

// ── Cells ────────────────────────────────────────────────────────────────────

function BoxNumber({ box }) {
  return <span className="fm-aeat-cell__num">{box != null ? String(box).padStart(2, '0') : ''}</span>;
}

// "Ver facturas": shown on a box filled from invoices (`invoiceBoxes` of the boxes payload) when
// the page can open the Facturas tab filtered by it.
function ViewInvoicesLink({ box, ctx }) {
  if (!ctx?.onViewInvoices || !ctx.invoiceBoxes?.has(box)) return null;
  const label = ctx.t('fm.m390.sources.view_invoices_box', { box: String(box).padStart(2, '0') });
  return (
    <button
      type="button"
      className="fm-390-cell__invoices"
      title={label}
      aria-label={label}
      onClick={() => ctx.onViewInvoices(box)}
      data-testid={`FmBoxes390__viewInvoices_${box}`}
    >
      <ReceiptText size={13} strokeWidth={1.75} data-testid="ReceiptText__fm390" />
    </button>
  );
}

function CalcCell({ box, value, highlighted, ctx }) {
  return (
    <div
      id={boxDomId(box)}
      className={`fm-aeat-cell fm-390-cell--calc${highlighted ? ' fm-390-cell--highlight' : ''}`}
      data-testid={`FmBoxes390__box_${box}`}
      data-origin="calc"
    >
      <BoxNumber box={box} />
      <span className="fm-aeat-cell__value">{value != null ? formatAmount(value) : ''}</span>
      <ViewInvoicesLink box={box} ctx={ctx} />
    </div>
  );
}

// A manual input cell. Always an <input> (not pencil-to-edit), so Tab walks only the editable
// fields and the box search can focus it: the stored value is shown formatted while the cell is
// not focused, the raw text while it is being edited. Committed on blur / Enter, reverted on Esc.
function InputCell({ spec, inputs, preloaded, onInputChange, onRestore, readOnly, disabled, disabledTitle, highlighted, ariaLabel, t }) {
  const key = spec.input;
  const stored = inputs?.[key];
  const [draft, setDraft] = useState(null);
  const origin = inputOrigin(key, inputs, preloaded);
  const n = parseAmount(stored);
  let shown = '';
  if (n != null) shown = spec.percent ? `${formatPercent(n)} %` : formatAmount(n);
  const locked = readOnly || disabled;

  const commit = () => {
    if (draft == null) return;
    const next = draft;
    setDraft(null);
    onInputChange?.(key, next, spec);
  };

  return (
    <div
      id={spec.box != null ? boxDomId(spec.box) : undefined}
      className={`fm-aeat-cell fm-aeat-cell--editable fm-390-cell--input${origin === 'modified' ? ' fm-390-cell--modified' : ''}${highlighted ? ' fm-390-cell--highlight' : ''}${locked ? ' fm-390-cell--locked' : ''}`}
      title={disabled ? disabledTitle : undefined}
      data-testid={`FmBoxes390__input_${key}`}
      data-origin={origin}
    >
      <BoxNumber box={spec.box} />
      <input
        className="fm-aeat-cell__input fm-390-cell__input"
        type="text"
        inputMode="decimal"
        aria-label={spec.box != null ? `[${spec.box}] ${ariaLabel ?? ''}`.trim() : (ariaLabel ?? key)}
        value={draft ?? shown}
        disabled={locked}
        onFocus={() => setDraft(stored ?? '')}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); }
        }}
        data-testid={`FmBoxes390__inputField_${key}`}
      />
      {!locked && origin === 'modified' && (
        <button
          type="button"
          className="fm-aeat-cell__edit-btn"
          title={t('fm.m390.origin.restore')}
          aria-label={t('fm.m390.origin.restore')}
          onClick={() => onRestore?.(key)}
          data-testid={`FmBoxes390__restore_${key}`}
        >
          <RotateCcw size={12} strokeWidth={1.5} data-testid="RotateCcw__fm390" />
        </button>
      )}
      {!locked && <span className="fm-390-cell__pencil" aria-hidden="true"><Pencil size={12} strokeWidth={1.5} data-testid="Pencil__fm390" /></span>}
    </div>
  );
}

function Cell({ cell, boxes, ctx, ariaLabel }) {
  if (cell == null) return <div className="fm-aeat-cell fm-aeat-cell--empty" />;
  const spec = cellInput(cell);
  const box = cellBox(cell);
  const highlighted = box != null && box === ctx.highlightBox;
  if (spec) {
    const territory = isTerritoryMode(ctx.inputs);
    const lockedByTerritory = Boolean(spec.liquidationOnly && territory);
    const lockedByMonthlyReturn = Boolean(spec.monthlyReturnOnly && !isMonthlyReturn(ctx.inputs));
    const disabled = lockedByTerritory || lockedByMonthlyReturn;
    const disabledTitle = lockedByMonthlyReturn
      ? ctx.t('fm.m390.monthly_return.devolver_disabled')
      : ctx.t('fm.m390.territory.compensation_disabled');
    return (
      <InputCell
        spec={spec}
        inputs={ctx.inputs}
        preloaded={ctx.preloaded}
        onInputChange={ctx.onInputChange}
        onRestore={ctx.onRestore}
        readOnly={ctx.readOnly}
        disabled={disabled}
        disabledTitle={disabledTitle}
        highlighted={highlighted}
        ariaLabel={ariaLabel}
        t={ctx.t}
      />
    );
  }
  return <CalcCell box={box} value={boxes[box] ?? null} highlighted={highlighted} ctx={ctx} />;
}

function BoxRow({ row, boxes, ctx, label, displayLabel, columns }) {
  const text = label ?? ctx.t(row.labelKey);
  const cls = ['fm-aeat-row', 'fm-aeat-row--labeled', row.total ? 'fm-aeat-row--total' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} data-testid={`FmBoxes390__row_${row.id}`}>
      <span className="fm-aeat-row__label">
        <span>
          {displayLabel ?? text}
          {row.formula && <span className="fm-aeat-row__formula"> {row.formula}</span>}
        </span>
      </span>
      {row.cells.map((cell, i) => (
        <Cell
          key={i}
          cell={cell}
          boxes={boxes}
          ctx={ctx}
          ariaLabel={columns?.length > 1 ? `${text} · ${ctx.t(columns[i])}` : text} />
      ))}
    </div>
  );
}

// A rate group: rate rows with any amount are shown; the empty ones are folded behind one
// "Sin operaciones" line (so a year without 0 % or 5 % operations does not fill the screen with
// zeros). The group total, when the form has one, is always shown.
function RateGroup({ group, boxes, ctx, columns }) {
  const [expanded, setExpanded] = useState(false);
  const hasAmount = (rate) => rate.cells.some(c => {
    const b = cellBox(c);
    return b != null && (boxes[b] ?? 0) !== 0;
  });
  const active = group.rates.filter(hasAmount);
  const empty = group.rates.filter(rt => !hasAmount(rt));
  // A searched box in a folded rate unfolds the group: at once in this render (so the page can
  // scroll to it) and for good once the highlight fades.
  const holdsHighlight = ctx.highlightBox != null
    && empty.some(rt => rt.cells.some(c => cellBox(c) === ctx.highlightBox));
  useEffect(() => { if (holdsHighlight) setExpanded(true); }, [holdsHighlight]);
  const shown = expanded || holdsHighlight ? group.rates : active;
  return (
    <div className="fm-390-rate-group" data-testid={`FmBoxes390__group_${group.id}`}>
      <div className="fm-aeat-subheading">{ctx.t(group.labelKey)}</div>
      {shown.map(rate => (
        <BoxRow
          key={`${group.id}.${rate.rate}`}
          row={{ id: `${group.id}.${rate.rate}`, cells: rate.cells }}
          boxes={boxes}
          ctx={ctx}
          label={`${ctx.t(group.labelKey)} · ${ctx.t('fm.m390.rate', { rate: formatRate(rate.rate, ctx.bcpLocale) })}`}
          displayLabel={ctx.t('fm.m390.rate', { rate: formatRate(rate.rate, ctx.bcpLocale) })}
          columns={columns}
        />
      ))}
      {empty.length > 0 && (
        <button
          type="button"
          className="fm-link-btn fm-390-fold"
          onClick={() => setExpanded(v => !v)}
          data-testid={`FmBoxes390__fold_${group.id}`}
        >
          {expanded
            ? ctx.t('fm.m390.fold.hide')
            : ctx.t('fm.m390.fold.show', { count: empty.length })}
        </button>
      )}
      {group.total && <BoxRow row={group.total} boxes={boxes} ctx={ctx} columns={columns} />}
    </div>
  );
}

// ── Read-only organization blocks ────────────────────────────────────────────

function ReadOnlyField({ label, value, testId }) {
  return (
    <div className="fm-aeat-ident-field" data-testid={testId}>
      <span className="fm-aeat-ident-field__label">{label}</span>
      <div className="fm-aeat-ident-field__value">{value || '—'}</div>
    </div>
  );
}

function FlagCheckbox({ flag, labelKey, ctx }) {
  return (
    <div className="fm-aeat-ident-cb">
      <CheckboxField
        checked={isFlagOn(ctx.inputs, flag)}
        disabled={ctx.readOnly}
        onToggle={(next) => ctx.onFlagChange?.(flag, next)}
        data-testid={`FmBoxes390__flag_${flag}`} />
      <span className="fm-aeat-ident-cb__label">{ctx.t(labelKey)}</span>
    </div>
  );
}

/**
 * Card of a block whose data comes from the Organization (Identificación, Estadística,
 * Representante): bold title, muted "… sincronizado con Organización" subtitle and the
 * "Editar en Organización" pill on the right; the read-only data goes in `children`.
 */
function OrgSyncedCard({ title, subtitle, ctx, testId, children }) {
  return (
    <div className="fm-section-card fm-section-card--flush fm-390-org-card" data-testid={testId}>
      <div className="fm-section-card__header">
        <div>
          <div className="fm-390-org-card__title">{title}</div>
          <div className="fm-section-card__sub">{subtitle}</div>
        </div>
        <button
          type="button"
          className="fm-btn fm-btn--cancel-pill fm-390-org-card__edit"
          onClick={() => ctx.onEditOrganization?.()}
          data-testid="FmBoxes390__editOrganization"
        >
          <Pencil size={14} strokeWidth={1.75} data-testid="Pencil__fm390OrgCard" />
          {ctx.t('fm.m390.edit_in_organization')}
        </button>
      </div>
      <div className="fm-390-org-card__body">{children}</div>
    </div>
  );
}

/** "N <things> · sincronizado(s) con Organización", with the `_one` / `_many` keys. */
function syncedCount(t, keyBase, count) {
  return t(count === 1 ? `${keyBase}_one` : `${keyBase}_many`, { count });
}

function OrgField({ label, value, mono, testId }) {
  return (
    <div className="fm-390-org-field" data-testid={testId}>
      <span className="fm-390-org-field__label">{label}</span>
      <span className={`fm-390-org-field__value${mono ? ' fm-390-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}

const TAXPAYER_NAME_FIELDS = new Set(['socialName', 'surname1', 'surname2', 'firstName']);
const REPRESENTATIVE_NAME_FIELDS = new Set(['personRepresentative', 'legalRepresentative']);

/**
 * Non-blocking notice for the identity texts classic cuts in the file (`nameWarnings`: the
 * backend's NAME_TRUNCATED incidents, filtered to the fields of one block).
 */
function NameTruncationWarnings({ ctx, fields, testId }) {
  const warnings = (ctx.nameWarnings ?? []).filter(w => fields.has(w.field));
  if (warnings.length === 0) return null;
  return (
    <div className="fm-390-warnings" role="status" data-testid={testId}>
      <TriangleAlert size={14} strokeWidth={1.75} />
      <ul>
        {warnings.map((w, i) => (
          <li key={`${w.field}-${i}`}>
            {ctx.t('fm.m390.ident.truncated', {
              field: ctx.t(`fm.m390.ident.field.${w.field}`, { name: w.label ?? '' }),
              limit: w.limit,
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdentityBlock({ ctx }) {
  const org = ctx.orgIdentity;
  return (
    <div className="fm-aeat-ident">
      <OrgSyncedCard
        title={ctx.t('fm.m390.org_card.taxpayer_title')}
        subtitle={ctx.t('fm.m390.org_card.synced')}
        ctx={ctx}
        testId="FmBoxes390__taxpayerCard"
      >
        <div className="fm-390-org-fields">
          <OrgField label={ctx.t('fm.ident.nif')} value={org?.nif} mono testId="FmBoxes390__nif" />
          <OrgField label={ctx.t('fm.ident.nombre')} value={org?.name} testId="FmBoxes390__name" />
        </div>
        <NameTruncationWarnings ctx={ctx} fields={TAXPAYER_NAME_FIELDS} testId="FmBoxes390__nameTruncated" />
      </OrgSyncedCard>
      <FlagCheckbox flag={FLAG.MONTHLY_RETURN} labelKey="fm.m390.flag.monthly_return" ctx={ctx} />
      <FlagCheckbox flag={FLAG.CONCURSO} labelKey="fm.m390.flag.concurso" ctx={ctx} />
      {isFlagOn(ctx.inputs, FLAG.CONCURSO) && (
        <FlagCheckbox flag={FLAG.CONCURSO_LAST_PERIOD} labelKey="fm.m390.flag.concurso_last_period" ctx={ctx} />
      )}
    </div>
  );
}

function DevengoBlock({ ctx }) {
  const ident = ctx.identification ?? {};
  const substitutive = isSubstitutive(ident);
  return (
    <div className="fm-aeat-ident">
      <div className="fm-aeat-ident-fields">
        <ReadOnlyField label={ctx.t('fm.m390.devengo.exercise')} value={String(ctx.year ?? '')} testId="FmBoxes390__exercise" />
        <ReadOnlyField
          label={ctx.t('fm.m349.type.label')}
          value={substitutive ? ctx.t('fm.m349.type.substitutive') : ctx.t('fm.m349.type.normal')}
          testId="FmBoxes390__declType" />
        {substitutive && (
          <ReadOnlyField
            label={ctx.t('fm.m349.substitutive_banner.former_statement')}
            value={ident.formerStatement}
            testId="FmBoxes390__formerStatement" />
        )}
        {substitutive && isConcurso(ctx.inputs) && (
          <ReadOnlyField
            label={ctx.t('fm.m390.substitutive.by_quotas')}
            value={ident.rectificacionCuotas ? ctx.t('fm.m390.yes') : ctx.t('fm.m390.no')}
            testId="FmBoxes390__byQuotas" />
        )}
      </div>
      <p className="fm-390-hint">{ctx.t('fm.m390.devengo.hint')}</p>
    </div>
  );
}

/**
 * "Tipo" column: the main activity, then the others in the order the file writes them (2ª…6ª,
 * `rank` 1…5). One past the file's limit is listed but not declared (TOO_MANY_IAE incident).
 */
function ActivityRank({ activity, t }) {
  if (activity.isDefault) {
    return (
      <span className="fm-390-rank fm-390-rank--main">
        <Star size={11} strokeWidth={2} fill="currentColor" data-testid="Star__fm390Main" />
        {t('fm.m390.statistics.main_yes')}
      </span>
    );
  }
  if (activity.rank > MODELO_390_OTHER_ACTIVITY_LIMIT) {
    return <span className="fm-390-rank fm-390-rank--muted">{t('fm.m390.statistics.not_declared')}</span>;
  }
  return <span className="fm-390-rank">{t('fm.m390.statistics.other', { n: activity.rank + 1 })}</span>;
}

function StatisticsBlock({ ctx }) {
  const activities = ctx.orgIdentity?.activities ?? [];
  return (
    <div className="fm-aeat-ident">
      <OrgSyncedCard
        title={ctx.t('fm.m390.org_card.activities_title')}
        subtitle={syncedCount(ctx.t, 'fm.m390.org_card.activities', activities.length)}
        ctx={ctx}
        testId="FmBoxes390__activitiesCard"
      >
        {activities.length === 0 ? (
          <p className="fm-390-hint" data-testid="FmBoxes390__noActivities">{ctx.t('fm.m390.statistics.empty')}</p>
        ) : (
          <table className="fm-dtable fm-dtable--plain fm-390-org-table" data-testid="FmBoxes390__activities">
            <thead>
              <tr>
                <th>{ctx.t('fm.m390.statistics.activity')}</th>
                <th>{ctx.t('fm.m390.statistics.code')}</th>
                <th>{ctx.t('fm.m390.statistics.epigraph')}</th>
                <th className="num">{ctx.t('fm.m390.statistics.main')}</th>
              </tr>
            </thead>
            <tbody>
              {activities.map(a => (
                <tr key={a.id ?? `${a.epigraph}-${a.code}`} data-testid="FmBoxes390__activityRow">
                  <td className="fm-390-org-table__name">{a.description || '—'}</td>
                  <td title={a.codeDescription || undefined}>
                    {a.code ? <span className="fm-390-code-badge">{a.code}</span> : '—'}
                    {a.codeDescription ? <span className="fm-390-org-table__muted"> {a.codeDescription}</span> : null}
                  </td>
                  <td className="fm-390-mono strong" title={a.typeLabel || undefined}>{a.epigraph || '—'}</td>
                  <td className="num"><ActivityRank activity={a} t={ctx.t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </OrgSyncedCard>
      <FlagCheckbox flag={FLAG.THIRD_PARTY_DECLARATION} labelKey="fm.m390.flag.third_party" ctx={ctx} />
    </div>
  );
}

function RepresentativeBlock({ ctx }) {
  const org = ctx.orgIdentity ?? {};
  let rows = [];
  if (org.isPerson) {
    if (org.personRepresentative) rows = [{ ...org.personRepresentative, person: true }];
  } else {
    rows = org.representatives ?? [];
  }
  const full = !org.isPerson;
  return (
    <div className="fm-aeat-ident">
      <OrgSyncedCard
        title={ctx.t(org.isPerson ? 'fm.m390.org_card.representative_title' : 'fm.m390.org_card.representatives_title')}
        subtitle={syncedCount(ctx.t, 'fm.m390.org_card.representatives', rows.length)}
        ctx={ctx}
        testId="FmBoxes390__representativesCard"
      >
        {rows.length === 0 ? (
          <p className="fm-390-hint" data-testid="FmBoxes390__noRepresentative">{ctx.t('fm.m390.representative.empty')}</p>
        ) : (
          <table className="fm-dtable fm-dtable--plain fm-390-org-table" data-testid="FmBoxes390__representatives">
            <thead>
              <tr>
                <th>{ctx.t('fm.m390.representative.nif')}</th>
                <th>{ctx.t('fm.m390.representative.name')}</th>
                {full && <th>{ctx.t('fm.m390.representative.power_date')}</th>}
                {full && <th>{ctx.t('fm.m390.representative.notary')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(rep => (
                <tr key={rep.id ?? rep.nif ?? 'person'}>
                  <td className="fm-390-mono" data-testid={rep.person ? 'FmBoxes390__repNif' : undefined}>{rep.nif || '—'}</td>
                  <td className="fm-390-org-table__name" data-testid={rep.person ? 'FmBoxes390__repName' : undefined}>{rep.name || '—'}</td>
                  {full && <td>{rep.powerDate ? formatCalendarDate(rep.powerDate, ctx.bcpLocale) : '—'}</td>}
                  {full && <td>{rep.notary || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <NameTruncationWarnings ctx={ctx} fields={REPRESENTATIVE_NAME_FIELDS} testId="FmBoxes390__repNameTruncated" />
      </OrgSyncedCard>
    </div>
  );
}

// ── Box blocks ───────────────────────────────────────────────────────────────

function TerritoryToggle({ open, onToggle, ctx }) {
  return (
    <div className="fm-aeat-ident-cb fm-390-territory-toggle">
      <CheckboxField
        checked={open}
        disabled={ctx.readOnly}
        onToggle={onToggle}
        data-testid="FmBoxes390__territoryToggle" />
      <span className="fm-aeat-ident-cb__label">{ctx.t('fm.m390.territory.toggle')}</span>
    </div>
  );
}

function BoxesBlock({ block, boxes, ctx }) {
  const hasTerritoryValues = TERRITORY_PERCENT_INPUTS.some(k => parseAmount(ctx.inputs?.[k]) != null)
    || parseAmount(ctx.inputs?.[INPUT.COMMON_TERRITORY_COMPENSATION]) != null;
  const [open, setOpen] = useState(!block.toggle || hasTerritoryValues);
  // A searched box behind the territory toggle opens it (showing it writes no input).
  const revealHighlight = Boolean(block.toggle && ctx.highlightInBlock);
  useEffect(() => { if (revealHighlight) setOpen(true); }, [revealHighlight]);
  const visible = !block.toggle || open || hasTerritoryValues || revealHighlight;
  const percentSum = territoryPercentSum(ctx.inputs);
  const showSumError = block.toggle && isTerritoryMode(ctx.inputs) && Math.abs(percentSum - 100) > 0.001;

  const toggle = (next) => {
    setOpen(next);
    if (!next) ctx.onClearTerritory?.();
  };

  return (
    <>
      {block.toggle && <TerritoryToggle open={visible} onToggle={toggle} ctx={ctx} />}
      {block.noteKey && <p className="fm-390-hint">{ctx.t(block.noteKey)}</p>}
      {visible && (
        <>
          <div className="fm-aeat-col-headers">
            <span className="fm-aeat-col-headers__label" />
            {block.columns.map(k => <span key={k} className="fm-aeat-col-headers__cell">{ctx.t(k)}</span>)}
          </div>
          {block.items.map(item => (item.type === 'rates'
            ? <RateGroup key={item.id} group={item} boxes={boxes} ctx={ctx} columns={block.columns} />
            : <BoxRow key={item.id} row={item} boxes={boxes} ctx={ctx} columns={block.columns} />))}
          {showSumError && (
            <p className="fm-390-inline-error" role="alert" data-testid="FmBoxes390__territorySumError">
              {ctx.t('fm.m390.territory.sum_error', { sum: formatPercent(percentSum) })}
            </p>
          )}
          {(ctx.messages ?? []).filter(m => m.blockId === block.id).map(m => (
            <p
              key={m.id}
              className={m.level === 'error' ? 'fm-390-inline-error' : 'fm-390-inline-warning'}
              role={m.level === 'error' ? 'alert' : 'status'}
              data-testid={`FmBoxes390__check_${m.id}`}>
              {ctx.t(m.key)}
            </p>
          ))}
        </>
      )}
    </>
  );
}

function BlockBody({ block, boxes, ctx }) {
  switch (block.kind) {
    case 'identity': return <IdentityBlock ctx={ctx} />;
    case 'devengo': return <DevengoBlock ctx={ctx} />;
    case 'statistics': return <StatisticsBlock ctx={ctx} />;
    case 'representative': return <RepresentativeBlock ctx={ctx} />;
    default: return <BoxesBlock block={block} boxes={boxes} ctx={ctx} />;
  }
}

// ── Search, index ────────────────────────────────────────────────────

function BoxSearch({ onSearch, notFound, t }) {
  const [query, setQuery] = useState('');
  return (
    <div className="fm-390-search">
      <div className="fm-390-search__field">
        <Search size={14} strokeWidth={1.75} data-testid="Search__fm390" />
        <input
          type="search"
          value={query}
          placeholder={t('fm.m390.search.placeholder')}
          aria-label={t('fm.m390.search.placeholder')}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSearch(query); } }}
          data-testid="FmBoxes390__search"
        />
      </div>
      {notFound && <span className="fm-390-search__miss" role="status" data-testid="FmBoxes390__searchMiss">{t('fm.m390.search.not_found')}</span>}
    </div>
  );
}

function BlockIndex({ blocks, active, onSelect, t }) {
  return (
    <>
      <nav className="fm-390-index" aria-label={t('fm.m390.index')} data-testid="FmBoxes390__index">
        {blocks.map((b, i) => (
          <button
            key={b.id}
            type="button"
            className={`fm-390-index__item${b.id === active ? ' fm-390-index__item--active' : ''}`}
            aria-current={b.id === active ? 'true' : undefined}
            onClick={() => onSelect(b.id)}
            data-testid={`FmBoxes390__index_${b.id}`}
          >
            <span className="fm-390-index__num">{i + 1}</span>
            {t(b.titleKey)}
          </button>
        ))}
      </nav>
      {/* Below 1200px the index folds into the app Select (no native selects — ETP-5584). */}
      <div className="fm-390-index-select">
        <Select value={active} onValueChange={onSelect}>
          <SelectTrigger aria-label={t('fm.m390.index')} data-testid="FmBoxes390__indexSelect">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {blocks.map((b, i) => (
              <SelectItem key={b.id} value={b.id} data-testid={`FmBoxes390__indexOption_${b.id}`}>
                {`${i + 1}. ${t(b.titleKey)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * @param {object}   props.layout          blocks of `getLayout390()`
 * @param {object}   props.boxes           display values `{ <box>: number }` (already derived)
 * @param {object}   props.inputs          `manualData.aeatInputs` on screen
 * @param {object}   [props.preloaded]     `manualData.aeatPreloaded` (origin "Modificado" + restore)
 * @param {object}   [props.identification] header "Tipo" control state (Devengo block)
 * @param {object}   [props.orgIdentity]   organization data (useOrg390Identity)
 * @param {Array}    [props.warnings]      `warnings` of the boxes payload
 * @param {boolean}  [props.readOnly]
 * @param {Function} props.onInputChange   (key, rawValue, spec) => void
 * @param {Function} [props.onRestore]     (key) => void
 * @param {Function} [props.onFlagChange]  (flagKey, boolean) => void
 * @param {Function} [props.onClearTerritory]
 * @param {Function} [props.onEditOrganization]
 * @param {Array}    [props.invoiceBoxes]    `invoiceBoxes` of the boxes payload (boxes with invoices)
 * @param {Function} [props.onViewInvoices]  (box) => void — "Ver facturas" on those boxes
 * @param {object}   [props.blockExtras]     `{ <blockId>: node }` rendered under that block's boxes
 *                                           (e.g. the year's 303s under "Resultado de las liquidaciones")
 * @param {object}   [props.goToBox]         `{ box, nonce }` — opens the block of that box and
 *                                           highlights it ("Ir a la casilla" of an incident); a new
 *                                           nonce repeats the jump to the same box
 * @param {Array}    [props.nameWarnings]    `[{ field, limit, label? }]` — the identity texts the
 *                                           file will cut (the NAME_TRUNCATED incidents)
 */
export default function FmBoxes390({
  layout, boxes, inputs, preloaded, identification, orgIdentity, warnings, year, readOnly,
  onInputChange, onRestore, onFlagChange, onClearTerritory, onEditOrganization, t, bcpLocale = 'es-ES',
  invoiceBoxes, onViewInvoices, blockExtras, goToBox, nameWarnings,
}) {
  const [activeId, setActiveId] = useState(layout[0]?.id);
  const [highlightBox, setHighlightBox] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const index = useMemo(() => buildBoxIndex(layout), [layout]);
  const invoiceBoxSet = useMemo(() => new Set((invoiceBoxes ?? []).map(Number)), [invoiceBoxes]);
  const contentRef = useRef(null);
  const activeIdx = Math.max(0, layout.findIndex(b => b.id === activeId));
  const block = layout[activeIdx];

  useEffect(() => {
    if (highlightBox == null) return undefined;
    const el = document.getElementById(boxDomId(highlightBox));
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    el?.querySelector?.('input:not([disabled])')?.focus?.();
    const timer = setTimeout(() => setHighlightBox(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightBox, activeId]);

  // "Ir a la casilla" from an incident: same jump as the box search.
  useEffect(() => {
    if (goToBox?.box == null) return;
    const hit = findBox(String(goToBox.box), index, t);
    if (!hit) return;
    setActiveId(hit.blockId);
    setHighlightBox(hit.box);
  }, [goToBox?.box, goToBox?.nonce]);

  const onSearch = (query) => {
    const hit = findBox(query, index, t);
    setNotFound(!hit && String(query ?? '').trim() !== '');
    if (!hit) return;
    setActiveId(hit.blockId);
    setHighlightBox(hit.box);
  };

  const select = (id) => {
    setActiveId(id);
    contentRef.current?.scrollIntoView?.({ block: 'start' });
  };

  // Cross-input checks (DEVOLVER_12 with [97], [98] with [96]/[97]) — shown inline in their block.
  const messages = readOnly ? [] : inputMessages390(inputs);
  const highlightInBlock = highlightBox != null && index.some(e => e.box === highlightBox && e.blockId === block.id);
  const ctx = {
    t, bcpLocale, inputs, preloaded, identification, orgIdentity, year, readOnly, highlightBox, highlightInBlock, messages,
    nameWarnings: nameWarnings ?? [],
    onInputChange, onRestore, onFlagChange, onClearTerritory, onEditOrganization,
    invoiceBoxes: invoiceBoxSet, onViewInvoices,
  };

  return (
    <div className="fm-390-boxes" data-testid="FmBoxes390">
      <BlockIndex blocks={layout} active={block.id} onSelect={select} t={t} />
      <div className="fm-390-boxes__content" ref={contentRef}>
        <div className="fm-390-toolbar">
          <BoxSearch onSearch={onSearch} notFound={notFound} t={t} />
        </div>
        {Array.isArray(warnings) && warnings.length > 0 && (
          <div className="fm-390-warnings" role="status" data-testid="FmBoxes390__warnings">
            <TriangleAlert size={14} strokeWidth={1.75} data-testid="TriangleAlert__fm390" />
            <ul>
              {warnings.map((w, i) => (
                <li key={`${w.code}-${w.parameter}-${i}`}>
                  {t(w.code === 'UNSUPPORTED_RATE' ? 'fm.m390.warning.unsupported_rate' : 'fm.m390.warning.no_box', {
                    parameter: w.parameter ?? '', rate: w.rate != null ? formatPercent(parseAmount(w.rate)) : '',
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
        <section className="fm-aeat-section fm-aeat-section--compact" data-testid={`FmBoxes390__block_${block.id}`}>
          <div className="fm-aeat-section__title">
            {block.icon && <span className="fm-aeat-section__icon">{BLOCK_ICON[block.icon]}</span>}
            {t(block.titleKey)}
          </div>
          <BlockBody key={block.id} block={block} boxes={boxes ?? {}} ctx={ctx} />
          {blockExtras?.[block.id] ?? null}
        </section>
        <div className="fm-390-pager">
          <button
            type="button"
            className="fm-btn fm-btn--cancel-pill"
            disabled={activeIdx === 0}
            onClick={() => select(layout[activeIdx - 1].id)}
            data-testid="FmBoxes390__prev"
          >
            <ChevronLeft size={14} strokeWidth={1.75} data-testid="ChevronLeft__fm390" />
            {t('fm.m390.pager.prev')}
          </button>
          <button
            type="button"
            className="fm-btn fm-btn--cancel-pill"
            disabled={activeIdx === layout.length - 1}
            onClick={() => select(layout[activeIdx + 1].id)}
            data-testid="FmBoxes390__next"
          >
            {t('fm.m390.pager.next')}
            <ChevronRight size={14} strokeWidth={1.75} data-testid="ChevronRight__fm390" />
          </button>
        </div>
      </div>
    </div>
  );
}

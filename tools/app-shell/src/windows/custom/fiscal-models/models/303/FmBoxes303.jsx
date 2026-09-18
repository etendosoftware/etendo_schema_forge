import React, { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { CheckboxField } from '@/windows/custom/shared/CheckboxField.jsx';
import { TrendingUp, TrendingDown, Pencil } from 'lucide-react';
import { getLayout303, matchesVisibility } from './fm303Layouts.js';
import { formatAmount, formatPercent } from '../../fiscalModelsUtils.js';

const SECTION_ICON = {
  iva_devengado: <TrendingUp
    size={20}
    strokeWidth={1.75}
    style={{ color: 'hsl(var(--foreground))' }}
    data-testid="TrendingUp__49d327" />,
  iva_deducible: <TrendingDown
    size={20}
    strokeWidth={1.75}
    style={{ color: 'hsl(var(--foreground))' }}
    data-testid="TrendingDown__49d327" />,
};

function formatCell(val, colType) {
  return colType === 'percent' ? formatPercent(val) : formatAmount(val);
}

const COMPACT_SECTIONS = new Set(['iva_devengado', 'iva_deducible', 'resultado', 'info_adicional', 'resultado_final']);
const TITLED_SECTIONS  = new Set(['iva_devengado', 'iva_deducible']);

// Applies a derivedValue's `clampMin` (if any) to an already-computed display value.
// A `null` display (nothing to compute) is left untouched — clamping never manufactures
// a value out of "no value".
function applyClampMin(value, clampMin) {
  return value != null && clampMin != null ? Math.max(clampMin, value) : value;
}

// treatMissingAsZero branch of computeDerivedValue (box 87, box110-box78 only — AEAT
// semantics confirmed by the product owner): a missing operand defaults to 0, EXCEPT
// when BOTH operands are missing, in which case the cell stays blank.
function computeDerivedValueZeroFill(dv, valueMap) {
  const rawMinuend = valueMap[dv.box] ?? null;
  const rawSubtrahend = dv.subtractBox != null ? (valueMap[dv.subtractBox] ?? null) : null;
  if (rawMinuend == null && rawSubtrahend == null) return null;
  let display = dv.abs ? Math.abs(rawMinuend ?? 0) : (rawMinuend ?? 0);
  if (dv.subtractBox != null) display -= (rawSubtrahend ?? 0);
  return applyClampMin(display, dv.clampMin);
}

// Default branch of computeDerivedValue (importe_devolucion, box71-box70; also casilla 107's
// live mirror of box 65, ETP-5391): a missing operand blanks the whole result, UNLESS the
// `derivedValue` declares its own `defaultValue` (e.g. box 107's `{ box: 65, defaultValue: 100 }`),
// in which case that default is used instead of blanking. This was the original behavior for
// importe_devolucion and was never disputed; `defaultValue` is additive and a no-op for any
// `derivedValue` that doesn't declare one.
function computeDerivedValueBlankOnMissing(dv, valueMap) {
  const raw = valueMap[dv.box] ?? dv.defaultValue ?? null;
  const absRaw = dv.abs ? Math.abs(raw) : raw;
  let display = raw != null ? absRaw : null;
  if (display != null && dv.subtractBox != null) {
    const subtrahend = valueMap[dv.subtractBox] ?? null;
    // Blank out (not "assume 0") when the subtrahend operand is missing — mirrors the
    // minuend's own missing-value behavior above. A `?? 0` fallback here silently displayed
    // the raw minuend as the result whenever the subtrahend box was empty (ETP-5338 QA cycle 1).
    display = subtrahend != null ? display - subtrahend : null;
  }
  return applyClampMin(display, dv.clampMin);
}


export default function FmBoxes303({ boxes, year, period, sectionIds, identification, onIdentChange, onBoxChange, readOnly }) {
  const ui = useUI();
  const t = ui;
  const layout = getLayout303(year, period);
  const [editingCell, setEditingCell] = useState(null);
  const [pendingValues, setPendingValues] = useState({});

  useEffect(() => {
    if (readOnly) setEditingCell(null);
  }, [readOnly]);

  const valueMap = {};
  if (Array.isArray(boxes)) {
    boxes.forEach(b => { valueMap[b.num] = b.value; });
  } else if (boxes && typeof boxes === 'object') {
    Object.assign(valueMap, boxes);
  }

  const sections = sectionIds
    ? layout.sections.filter(s => sectionIds.includes(s.id))
    : layout.sections;

  // Percent boxes (casillas 65/89/90/91/92) follow the AEAT rule "los porcentajes se expresarán
  // con dos decimales": never above 100, never negative, at most 2 decimal places. The HTML
  // `max` attribute alone doesn't stop someone typing 150 and tabbing away, so the value is also
  // clamped/rounded here, right before it's committed via onBoxChange. Returns the raw string
  // unchanged when it isn't a parseable number (e.g. empty string, to preserve "clear the field").
  const clampPercentValue = (raw) => {
    const num = parseFloat(String(raw ?? '').replace(',', '.'));
    if (isNaN(num)) return raw;
    const clamped = Math.min(100, Math.max(0, num));
    return String(Math.round(clamped * 100) / 100);
  };

  const renderCellInput = (boxNum, val, colType = 'amount') => {
    const isPercent = colType === 'percent';
    const commit = () => {
      const raw = pendingValues[boxNum];
      onBoxChange?.(boxNum, isPercent ? clampPercentValue(raw) : raw);
      setEditingCell(null);
    };
    return (
      <input
        type="number"
        step="any"
        className="fm-aeat-cell__input"
        value={pendingValues[boxNum] ?? (val != null ? String(val) : '')}
        onChange={e => setPendingValues(prev => ({ ...prev, [boxNum]: e.target.value }))}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur(); } if (e.key === 'Escape') setEditingCell(null); }}
        autoFocus
        disabled={readOnly}
        max={isPercent ? 100 : undefined}
        min={isPercent ? 0 : undefined}
      />
    );
  };

  const renderIdentSelectField = (f, compact = false) => (
    <div key={f.id} className="fm-aeat-ident-inline-field">
      <span className="fm-aeat-ident-inline-field__label">
        {t(f.labelKey)}{f.required && <span className="fm-aeat-required-mark" aria-hidden="true">*</span>}
      </span>
      <select
        className={`fm-aeat-ident-inline-field__select${compact ? ' fm-aeat-ident-inline-field__select--compact' : ''}`}
        value={identification?.[f.id] ?? ''}
        onChange={e => onIdentChange?.(f.id, e.target.value)}
        disabled={readOnly}
      >
        <option value="">{t('fm.ident.decl.placeholder')}</option>
        {f.options?.map(opt => (
          <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
        ))}
      </select>
    </div>
  );

  // Supports a single-field condition ({field, in:[...] | equals:...}) or an
  // OR-of-conditions shape ({ anyOf: [condition, ...] }) — kept minimal on
  // purpose, just enough to express "tipo X OR rectificativa checked" cleanly.
  // Single source of truth for visibility evaluation lives in fm303Layouts.js's
  // `matchesVisibility` (ETP-5187: extracted so FmModel303Page.jsx's required-field
  // validation gate reads the exact same rules) — this is a thin wrapper closing over
  // `identification` so call sites below don't need to pass it explicitly. Do not fork a
  // second implementation, extend `matchesVisibility` instead.
  const matchesSvw = (svw) => matchesVisibility(svw, identification);

  // editableWhen: single condition object or array of conditions (all must match)
  const resolveEditable = (item) => {
    if (item.editable) return true;
    if (!item.editableWhen) return false;
    const conds = Array.isArray(item.editableWhen) ? item.editableWhen : [item.editableWhen];
    return conds.every(c => matchesSvw(c));
  };

  // Single source of computation for `derivedValue` ({ box, abs?, subtractBox?, clampMin?,
  // defaultValue?, treatMissingAsZero? }) — shared by renderDerivedCell (rows whose derivedValue
  // does NOT opt into treatMissingAsZero, e.g. importe_devolucion and casilla 107's live mirror
  // of box 65, ETP-5391) and renderBoxCell's fallback below (rows that DO have a real box number
  // AND opt into treatMissingAsZero, e.g. box 87 — ETP-5338 pt.2). Client-side display only;
  // never feeds `manualData`/submission. See renderRowCell below for how the two are routed.
  //
  // Two confirmed-with-the-user semantics coexist here (ETP-5338 pt.2, cycle 2) — see
  // computeDerivedValueZeroFill / computeDerivedValueBlankOnMissing above for the detail of each.
  const computeDerivedValue = (dv) =>
    dv.treatMissingAsZero
      ? computeDerivedValueZeroFill(dv, valueMap)
      : computeDerivedValueBlankOnMissing(dv, valueMap);

  // `boxNum`/`colType`/`unit` are optional — passed by renderRowCell when the derived cell should
  // also carry its own AD box number (e.g. casilla 107 mirroring box 65, ETP-5391) and format per
  // the row's declared cellTypes/colTypes (reuses the same `formatCell` every other cell uses),
  // rather than always formatting as 'amount' regardless of what the underlying box actually is.
  // Note this path always BLANKS a computed 0 (see the `display !== 0` check below) — that's the
  // deliberate behavioral split from renderBoxCell's derivedValue fallback, which shows a computed
  // 0. See renderRowCell for which rows go through which.
  const renderDerivedCell = (dv, ci, boxNum = null, colType = 'amount', unit = null) => {
    const display = computeDerivedValue(dv);
    return (
      <div key={ci} className="fm-aeat-cell">
        {boxNum != null && <span className="fm-aeat-cell__num">{String(boxNum).padStart(2, '0')}</span>}
        <span className="fm-aeat-cell__value">{display != null && display !== 0 ? formatCell(display, colType) : ''}</span>
        {unit && <span className="fm-aeat-cell__unit">{unit}</span>}
      </div>
    );
  };

  const renderBoxCell = (row, section, ci, boxNum) => {
    const isCellEditable = row.editable || row.editableCells?.includes(boxNum);
    const isFixed = !isCellEditable && row.fixedValues != null &&
      Object.prototype.hasOwnProperty.call(row.fixedValues, boxNum);
    let val = isFixed
      ? row.fixedValues[boxNum]
      : (valueMap[boxNum] ?? row.defaultValues?.[boxNum] ?? null);
    // Fallback for a real box that has no backend/manual value but declares a derivedValue
    // formula (e.g. box 87 = box 110 - box 78, computed entirely client-side) — see
    // computeDerivedValue above. Never overrides a real value; only fills the gap when the box
    // is genuinely empty.
    if (val == null && row.derivedValue) val = computeDerivedValue(row.derivedValue);
    const colType = row.cellTypes?.[ci] ?? section.colTypes?.[ci] ?? 'amount';
    const unit = row.cellUnits?.[ci];
    const isCellEditing = isCellEditable && editingCell === boxNum;
    return (
      <div key={ci} className={`fm-aeat-cell${isFixed ? ' fm-aeat-cell--fixed' : ''}${isCellEditable ? ' fm-aeat-cell--editable' : ''}`}>
        <span className="fm-aeat-cell__num">{String(boxNum).padStart(2, '0')}</span>
        {isCellEditing ? renderCellInput(boxNum, val, colType) : (
          <>
            <span className="fm-aeat-cell__value">{val != null ? formatCell(val, colType) : ''}</span>
            {unit && <span className="fm-aeat-cell__unit">{unit}</span>}
            {isCellEditable && !readOnly && (
              <button className="fm-aeat-cell__edit-btn" onClick={() => setEditingCell(boxNum)}>
                <Pencil size={12} strokeWidth={1.5} data-testid="Pencil__49d327" />
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  const renderRowCell = (row, section, ci) => {
    const boxNum = row.cells?.[ci] ?? null;
    // Routing split (ETP-5391 + ETP-5338 pt.2 reconciled): a `derivedValue` row that does NOT
    // opt into `treatMissingAsZero` (importe_devolucion, casilla 107) always renders through
    // renderDerivedCell — even when it carries a real `boxNum` (107) — because that path blanks
    // a computed 0 and never looks at a stray real value in valueMap. A `derivedValue` row that
    // DOES opt into `treatMissingAsZero` (box 87) must instead go through renderBoxCell below, so
    // a genuine non-null backend/manual value for that box wins over the derived formula, and a
    // computed 0 still displays as "0,00" rather than blanking — see the tests in
    // FmBoxes303.vitest.jsx for both rows for the exact contract.
    if (row.derivedValue && !row.derivedValue.treatMissingAsZero) {
      const colType = row.cellTypes?.[ci] ?? section.colTypes?.[ci] ?? 'amount';
      const unit = row.cellUnits?.[ci];
      return renderDerivedCell(row.derivedValue, ci, boxNum, colType, unit);
    }
    if (boxNum === null) {
      return row.total ? null : <div key={ci} className="fm-aeat-cell fm-aeat-cell--empty" />;
    }
    return renderBoxCell(row, section, ci, boxNum);
  };

  return (
    <div className="fm-aeat-table">
      {sections.map((section) => {

        // ── Identificación + meta sections (sin_actividad, rectificativa) ──
        if (section.sectionType === 'identificacion') {
          const visibleFields = section.fields.filter(f => !f.visibleWhen || matchesSvw(f.visibleWhen));

          // Main identificacion section:
          // - read-only text fields (NIF/nombre) → top group
          // - remaining fields rendered in declaration order (checkboxes + editable text interleaved)
          if (section.id === 'identificacion') {
            const displayFields  = visibleFields.filter(f => f.type === 'text' && f.readOnly !== false);
            const inlineFields   = visibleFields.filter(f => !(f.type === 'text' && f.readOnly !== false));
            return (
              <div key={section.id} className="fm-aeat-section">
                <div className="fm-aeat-ident">
                  <div className="fm-aeat-ident-fields">
                    {displayFields.map(f => (
                      <div key={f.id} className="fm-aeat-ident-field">
                        <span className="fm-aeat-ident-field__label">{t(f.labelKey)}</span>
                        <div className="fm-aeat-ident-field__value" style={{ color: 'hsl(var(--text-disabled))' }}>
                          {identification?.[f.id] ?? ''}
                        </div>
                      </div>
                    ))}
                  </div>
                  {inlineFields.map(f => {
                    if (f.type === 'checkbox') {
                      return (
                        <div key={f.id} className="fm-aeat-ident-cb">
                          <CheckboxField
                            checked={identification?.[f.id] ?? false}
                            onToggle={val => onIdentChange?.(f.id, val)}
                            disabled={readOnly}
                            data-testid="CheckboxField__49d327" />
                          <span className="fm-aeat-ident-cb__label">{t(f.labelKey)}</span>
                        </div>
                      );
                    }
                    if (f.type === 'select') return renderIdentSelectField(f, true);
                    return (
                      <div key={f.id} className="fm-aeat-ident-inline-field">
                        <span className="fm-aeat-ident-inline-field__label">
                          {t(f.labelKey)}{f.required && <span className="fm-aeat-required-mark" aria-hidden="true">*</span>}
                        </span>
                        <input
                          type={f.type === 'date' ? 'date' : 'text'}
                          className="fm-aeat-ident-inline-field__input"
                          style={{ width: f.type === 'date' ? 160 : 180, flexShrink: 0 }}
                          value={identification?.[f.id] ?? ''}
                          onChange={e => onIdentChange?.(f.id, e.target.value)}
                          autoComplete="off"
                          disabled={readOnly}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          // Meta sections (datos_bancarios, sin_actividad, rectificativa/complementaria): render fields in declaration order
          if (section.sectionVisibleWhen && !matchesSvw(section.sectionVisibleWhen)) return null;
          const sectionTitle = section.titleKeyMap
            ? section.titleKeyMap[identification?.[section.titleKeyFrom]]
            : section.titleKey;
          return (
            <div key={section.id} className="fm-aeat-section">
              {sectionTitle && (
                <div className="fm-aeat-section__title">{t(sectionTitle)}</div>
              )}
              <div className={`fm-aeat-ident${section.fieldLayout === 'aligned' ? ' fm-aeat-ident--aligned' : ''}`}>
                {visibleFields.map(f => {
                  if (f.type === 'subheading') {
                    return (
                      <div key={f.id} className="fm-aeat-ident-subheading">{t(f.labelKey)}</div>
                    );
                  }
                  if (f.type === 'checkbox') {
                    const handleChange = () => {
                      const next = !(identification?.[f.id] ?? false);
                      onIdentChange?.(f.id, next);
                      if (next && f.radioGroup) {
                        visibleFields.forEach(other => {
                          if (other.radioGroup === f.radioGroup && other.id !== f.id) {
                            onIdentChange?.(other.id, false);
                          }
                        });
                      }
                    };
                    return (
                      <div key={f.id} className="fm-aeat-ident-cb">
                        <CheckboxField
                          checked={identification?.[f.id] ?? false}
                          onToggle={handleChange}
                          disabled={readOnly}
                          data-testid="CheckboxField__49d327" />
                        <span className="fm-aeat-ident-cb__label">{t(f.labelKey)}</span>
                      </div>
                    );
                  }
                  if (f.type === 'select') return renderIdentSelectField(f);
                  return (
                    <div key={f.id} className="fm-aeat-ident-inline-field">
                      <span className="fm-aeat-ident-inline-field__label">
                        {t(f.labelKey)}{f.required && <span className="fm-aeat-required-mark" aria-hidden="true">*</span>}
                      </span>
                      <input
                        type={f.type === 'date' ? 'date' : 'text'}
                        className="fm-aeat-ident-inline-field__input"
                        style={section.fieldLayout !== 'aligned' ? { width: f.type === 'date' ? 160 : 180, flexShrink: 0 } : undefined}
                        value={identification?.[f.id] ?? ''}
                        onChange={e => onIdentChange?.(f.id, e.target.value)}
                        autoComplete="off"
                        disabled={readOnly}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // ── Grid sections (IVA devengado, deducible, resultado…) ────
        const cols = section.colHeaderKeys?.length || 1;

        return (
          <div key={section.id} className={`fm-aeat-section${COMPACT_SECTIONS.has(section.id) ? ' fm-aeat-section--compact' : ''}${section.id === 'iva_deducible' ? ' fm-aeat-section--divided' : ''}`}>
            {/* Section title — only for IVA Devengado and IVA Deducible */}
            {TITLED_SECTIONS.has(section.id) && (
              <div className="fm-aeat-section__title">
                {SECTION_ICON[section.id] && (
                  <span className="fm-aeat-section__icon">{SECTION_ICON[section.id]}</span>
                )}
                {t(section.titleKey)}
              </div>
            )}
            {/* Column headers */}
            {cols > 0 && section.colHeaderKeys?.length > 0 && (
              <div className="fm-aeat-col-headers">
                <span className="fm-aeat-col-headers__label" />
                {section.colHeaderKeys.map((k) => (
                  <span key={k} className="fm-aeat-col-headers__cell">{t(k)}</span>
                ))}
              </div>
            )}
            {/* Leading section.fields checkbox(es) — e.g. info_adicional_ultimo_periodo's merged
                declaracion_terceros (ETP-5391). Row-based (non-identificacion) sections don't
                otherwise render `fields`; kept minimal on purpose — reuses the exact same
                Checkbox markup/behavior as the identificacion-type sections above, just checkbox
                fields, rendered ahead of the row grid. */}
            {Array.isArray(section.fields) && section.fields.length > 0 && (
              <div className="fm-aeat-ident">
                {section.fields
                  .filter(f => !f.visibleWhen || matchesSvw(f.visibleWhen))
                  .map(f => f.type === 'checkbox' && (
                    <div key={f.id} className="fm-aeat-ident-cb">
                      <CheckboxField
                        checked={identification?.[f.id] ?? false}
                        onToggle={val => onIdentChange?.(f.id, val)}
                        disabled={readOnly}
                        data-testid="CheckboxField__49d327" />
                      <span className="fm-aeat-ident-cb__label">{t(f.labelKey)}</span>
                    </div>
                  ))}
              </div>
            )}
            {/* Rows — group consecutive group rows into bracket containers */}
            {(() => {
              const items = [];
              let buf = null;
              section.rows.forEach((row, i) => {
                if (row.group) {
                  if (!buf) { buf = []; items.push({ isBracket: true, rows: buf }); }
                  buf.push([row, i]);
                } else {
                  buf = null;
                  items.push({ isBracket: false, row, i });
                }
              });

              const renderRow = (row, i) => {
                if (row.rowVisibleWhen && !matchesSvw(row.rowVisibleWhen)) return null;
                if (row.type === 'heading') {
                  return (
                    <div key={row.id ?? `heading-${i}`} className={`fm-aeat-subheading${row.separator ? ' fm-aeat-subheading--sep' : ''}`}>
                      {t(row.titleKey)}
                    </div>
                  );
                }

                if (row.type === 'bicolumn') {
                  return (
                    <div key={row.id} className="fm-aeat-bicolumn">
                      <div className="fm-aeat-bicolumn__left">
                        {row.infoboxes.map(box => {
                          const boxNum = box.cells?.[0] ?? null;
                          const val = boxNum != null ? (valueMap[boxNum] ?? null) : null;
                          const isCellEditable = resolveEditable(box);
                          const isCellEditing = isCellEditable && editingCell === boxNum;
                          return (
                            <div key={box.id} className="fm-aeat-infobox">
                              <p className="fm-aeat-infobox__text">{t(box.labelKey)}</p>
                              {boxNum != null && (
                                <div className={`fm-aeat-cell${isCellEditable ? ' fm-aeat-cell--editable' : ''}`}>
                                  <span className="fm-aeat-cell__num">{String(boxNum).padStart(2, '0')}</span>
                                  {isCellEditing ? (
                                    renderCellInput(boxNum, val)
                                  ) : (
                                    <>
                                      <span className="fm-aeat-cell__value">{val != null ? formatCell(val, 'amount') : ''}</span>
                                      {isCellEditable && !readOnly && (
                                        <button className="fm-aeat-cell__edit-btn" onClick={() => setEditingCell(boxNum)}>
                                          <Pencil size={12} strokeWidth={1.5} data-testid="Pencil__49d327" />
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="fm-aeat-bicolumn__right">
                        {row.rows.map((r, ri) => renderRow(r, ri))}
                      </div>
                    </div>
                  );
                }

                if (row.type === 'terrbox') {
                  return (
                    <div key={row.id} className="fm-aeat-terrbox">
                      <div className="fm-aeat-terrbox__header">
                        <span className="fm-aeat-terrbox__title">{t(row.titleKey)}</span>
                        {row.subtitleKey && <span className="fm-aeat-terrbox__subtitle">{t(row.subtitleKey)}</span>}
                      </div>
                      <div className="fm-aeat-terrbox__rows">
                        {row.territories.map(terr => {
                          const val = valueMap[terr.cell] ?? null;
                          return (
                            <div key={terr.id} className="fm-aeat-terrbox__row">
                              <span className="fm-aeat-terrbox__label">{t(terr.labelKey)}</span>
                              <div className="fm-aeat-cell">
                                <span className="fm-aeat-cell__num">{String(terr.cell).padStart(2, '0')}</span>
                                <span className="fm-aeat-cell__value">{val != null ? formatPercent(val) : ''}</span>
                              </div>
                              <span className="fm-aeat-terrbox__unit">%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                const rowCols = row.rowColHeaders
                  ? (row.cells?.length ?? cols)
                  : Math.max(cols, row.cells?.length ?? 0);
                const rowClass = [
                  'fm-aeat-row',
                  row.total ? 'fm-aeat-row--total' : '',
                  row.labelKey ? 'fm-aeat-row--labeled' : '',
                ].filter(Boolean).join(' ');
                const key = row.cells?.[0] ?? row.labelKey ?? i;

                const rowContent = (
                  <>
                    <span className="fm-aeat-row__label">
                      {row.labelKey ? t(row.labelKey) : ''}
                      {row.formula && <span className="fm-aeat-row__formula">{row.formula}</span>}
                    </span>
                    {Array.from({ length: rowCols }, (_, ci) => renderRowCell(row, section, ci))}
                  </>
                );

                if (row.rowColHeaders) {
                  return (
                    <React.Fragment key={`row-${key}`}>
                      <div className="fm-aeat-col-headers">
                        <span className="fm-aeat-col-headers__label" />
                        {row.rowColHeaders.map((k) => (
                          <span key={k} className="fm-aeat-col-headers__cell">{t(k)}</span>
                        ))}
                      </div>
                      <div className={rowClass}>{rowContent}</div>
                    </React.Fragment>
                  );
                }

                return <div key={key} className={rowClass}>{rowContent}</div>;
              };

              return items.map((item) =>
                item.isBracket
                  ? <div key={`bracket-${item.rows[0][0].cells?.[0] ?? item.rows[0][1]}`} className="fm-aeat-group-bracket">{item.rows.map(([r, i]) => renderRow(r, i))}</div>
                  : renderRow(item.row, item.i)
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

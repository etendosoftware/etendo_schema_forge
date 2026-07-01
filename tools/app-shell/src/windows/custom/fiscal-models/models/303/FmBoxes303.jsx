import React, { useState } from 'react';
import { useUI } from '@/i18n';
import { Checkbox } from '@/components/ui/checkbox';
import { TrendingUp, TrendingDown, Pencil } from 'lucide-react';
import { getLayout303 } from './fm303Layouts.js';
import { formatAmount, formatPercent } from '../../fiscalModelsUtils.js';

const SECTION_ICON = {
  iva_devengado: <TrendingUp
    size={20}
    strokeWidth={1.75}
    style={{ color: '#121217' }}
    data-testid="TrendingUp__49d327" />,
  iva_deducible: <TrendingDown
    size={20}
    strokeWidth={1.75}
    style={{ color: '#121217' }}
    data-testid="TrendingDown__49d327" />,
};

function formatCell(val, colType) {
  return colType === 'percent' ? formatPercent(val) : formatAmount(val);
}

const COMPACT_SECTIONS = new Set(['iva_devengado', 'iva_deducible', 'resultado', 'info_adicional', 'resultado_final']);
const TITLED_SECTIONS  = new Set(['iva_devengado', 'iva_deducible']);


export default function FmBoxes303({ boxes, year, period, sectionIds, identification, onIdentChange, onBoxChange }) {
  const ui = useUI();
  const t = ui;
  const layout = getLayout303(year, period);
  const [editingCell, setEditingCell] = useState(null);
  const [pendingValues, setPendingValues] = useState({});

  const valueMap = {};
  if (Array.isArray(boxes)) {
    boxes.forEach(b => { valueMap[b.num] = b.value; });
  } else if (boxes && typeof boxes === 'object') {
    Object.assign(valueMap, boxes);
  }

  const sections = sectionIds
    ? layout.sections.filter(s => sectionIds.includes(s.id))
    : layout.sections;

  const renderCellInput = (boxNum, val) => (
    <input
      type="number"
      step="any"
      className="fm-aeat-cell__input"
      value={pendingValues[boxNum] ?? (val != null ? String(val) : '')}
      onChange={e => setPendingValues(prev => ({ ...prev, [boxNum]: e.target.value }))}
      onBlur={() => { onBoxChange?.(boxNum, pendingValues[boxNum]); setEditingCell(null); }}
      onKeyDown={e => { if (e.key === 'Enter') { onBoxChange?.(boxNum, pendingValues[boxNum]); setEditingCell(null); e.target.blur(); } if (e.key === 'Escape') setEditingCell(null); }}
      autoFocus
    />
  );

  const renderIdentSelectField = (f, compact = false) => (
    <div key={f.id} className="fm-aeat-ident-inline-field">
      <span className="fm-aeat-ident-inline-field__label">
        {t(f.labelKey)}{f.required && <span className="fm-aeat-required-mark" aria-hidden="true">*</span>}
      </span>
      <select
        className={`fm-aeat-ident-inline-field__select${compact ? ' fm-aeat-ident-inline-field__select--compact' : ''}`}
        value={identification?.[f.id] ?? ''}
        onChange={e => onIdentChange?.(f.id, e.target.value)}
      >
        <option value="">{t('fm.ident.decl.placeholder')}</option>
        {f.options?.map(opt => (
          <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
        ))}
      </select>
    </div>
  );

  const matchesSvw = (svw) => {
    const val = identification?.[svw.field];
    return svw.in ? svw.in.includes(val) : val === svw.equals;
  };

  // editableWhen: single condition object or array of conditions (all must match)
  const resolveEditable = (item) => {
    if (item.editable) return true;
    if (!item.editableWhen) return false;
    const conds = Array.isArray(item.editableWhen) ? item.editableWhen : [item.editableWhen];
    return conds.every(c => matchesSvw(c));
  };

  const renderDerivedCell = (dv, ci) => {
    const raw = valueMap[dv.box] ?? null;
    const absRaw = dv.abs ? Math.abs(raw) : raw;
    let display = raw != null ? absRaw : null;
    if (display != null && dv.subtractBox != null) display = display - (valueMap[dv.subtractBox] ?? 0);
    if (display != null && dv.clampMin != null) display = Math.max(dv.clampMin, display);
    return (
      <div key={ci} className="fm-aeat-cell">
        <span className="fm-aeat-cell__value">{display != null && display !== 0 ? formatCell(display, 'amount') : ''}</span>
      </div>
    );
  };

  const renderBoxCell = (row, section, ci, boxNum) => {
    const isCellEditable = row.editable || row.editableCells?.includes(boxNum);
    const isFixed = !isCellEditable && row.fixedValues != null &&
      Object.prototype.hasOwnProperty.call(row.fixedValues, boxNum);
    const val = isFixed
      ? row.fixedValues[boxNum]
      : (valueMap[boxNum] ?? row.defaultValues?.[boxNum] ?? null);
    const colType = row.cellTypes?.[ci] ?? section.colTypes?.[ci] ?? 'amount';
    const unit = row.cellUnits?.[ci];
    const isCellEditing = isCellEditable && editingCell === boxNum;
    return (
      <div key={ci} className={`fm-aeat-cell${isFixed ? ' fm-aeat-cell--fixed' : ''}${isCellEditable ? ' fm-aeat-cell--editable' : ''}`}>
        <span className="fm-aeat-cell__num">{String(boxNum).padStart(2, '0')}</span>
        {isCellEditing ? renderCellInput(boxNum, val) : (
          <>
            <span className="fm-aeat-cell__value">{val != null ? formatCell(val, colType) : ''}</span>
            {unit && <span className="fm-aeat-cell__unit">{unit}</span>}
            {isCellEditable && (
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
    if (boxNum === null) {
      if (row.derivedValue) return renderDerivedCell(row.derivedValue, ci);
      return row.total ? null : <div key={ci} className="fm-aeat-cell fm-aeat-cell--empty" />;
    }
    return renderBoxCell(row, section, ci, boxNum);
  };

  return (
    <div className="fm-aeat-table">
      {sections.map((section) => {

        // ── Identificación + meta sections (sin_actividad, rectificativa) ──
        if (section.sectionType === 'identificacion') {
          const visibleFields = section.fields.filter(f => {
            if (!f.visibleWhen) return true;
            const val = identification?.[f.visibleWhen.field];
            if (f.visibleWhen.in) return f.visibleWhen.in.includes(val);
            return val === f.visibleWhen.equals;
          });

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
                        <div className="fm-aeat-ident-field__value" style={{ color: '#9096AD' }}>
                          {identification?.[f.id] ?? ''}
                        </div>
                      </div>
                    ))}
                  </div>
                  {inlineFields.map(f => {
                    if (f.type === 'checkbox') {
                      return (
                        <div key={f.id} className="fm-aeat-ident-cb">
                          <Checkbox
                            checked={identification?.[f.id] ?? false}
                            onChange={() => onIdentChange?.(f.id, !(identification?.[f.id] ?? false))}
                            data-testid="Checkbox__49d327" />
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
                        <Checkbox
                          checked={identification?.[f.id] ?? false}
                          onChange={handleChange}
                          data-testid="Checkbox__49d327" />
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
                                      {isCellEditable && (
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

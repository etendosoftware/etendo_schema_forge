import React from 'react';
import { useUI } from '@/i18n';
import { getLayout303 } from './fm303Layouts.js';
import { formatAmount } from '../../fiscalModelsUtils.js';

export default function FmBoxes303({ boxes, year, period, sectionIds }) {
  const ui = useUI();
  const t = ui;
  const layout = getLayout303(year, period);

  // Normalize boxes to { [boxNum]: value } regardless of input format
  const valueMap = {};
  if (Array.isArray(boxes)) {
    boxes.forEach(b => { valueMap[b.num] = b.value; });
  } else if (boxes && typeof boxes === 'object') {
    Object.assign(valueMap, boxes);
  }

  const sections = sectionIds
    ? layout.sections.filter(s => sectionIds.includes(s.id))
    : layout.sections;

  return (
    <div className="fm-aeat-table">
      {sections.map((section, si) => {
        const cols = section.colHeaderKeys?.length || 1;
        return (
          <div key={si} className="fm-aeat-section">
            <div className="fm-aeat-section__title">{t(section.titleKey)}</div>

            {cols > 0 && section.colHeaderKeys?.length > 0 && (
              <div className="fm-aeat-col-headers">
                <span className="fm-aeat-col-headers__label" />
                {section.colHeaderKeys.map((k, ci) => (
                  <span key={ci} className="fm-aeat-col-headers__cell">{t(k)}</span>
                ))}
              </div>
            )}

            {section.rows.map((row, ri) => (
              <div key={ri} className={`fm-aeat-row${row.total ? ' fm-aeat-row--total' : ''}`}>
                <span className="fm-aeat-row__label">
                  {row.labelKey ? t(row.labelKey) : ''}
                  {row.formula && (
                    <span className="fm-aeat-row__formula">{row.formula}</span>
                  )}
                </span>
                {Array.from({ length: cols }, (_, ci) => {
                  const boxNum = row.cells?.[ci] ?? null;
                  if (boxNum === null) {
                    return <div key={ci} className="fm-aeat-cell fm-aeat-cell--empty" />;
                  }
                  const isFixed = row.fixedValues != null && Object.prototype.hasOwnProperty.call(row.fixedValues, boxNum);
                  const val = isFixed ? row.fixedValues[boxNum] : (valueMap[boxNum] ?? null);
                  return (
                    <div key={ci} className={`fm-aeat-cell${isFixed ? ' fm-aeat-cell--fixed' : ''}`}>
                      <span className="fm-aeat-cell__num">{String(boxNum).padStart(2, '0')}</span>
                      <span className="fm-aeat-cell__value">
                        {val != null ? formatAmount(val) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

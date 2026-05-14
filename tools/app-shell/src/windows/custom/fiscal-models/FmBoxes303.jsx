import React from 'react';
import { useUI } from '@/i18n';
import { formatAmount } from './fiscalModelsUtils.js';

const DEFAULT_BOX_DEFS = [
  { num: 1,  group: 'bases' },
  { num: 2,  group: 'cuotas' },
  { num: 3,  group: 'bases' },
  { num: 4,  group: 'cuotas' },
  { num: 5,  group: 'bases' },
  { num: 6,  group: 'cuotas' },
  { num: 28, group: 'totals', highlight: true },
  { num: 48, group: 'deducciones' },
  { num: 64, group: 'deducciones', highlight: true },
  { num: 69, group: 'resultado', highlight: true },
  { num: 71, group: 'resultado', highlight: true },
];

export default function FmBoxes303({ boxes }) {
  const ui = useUI();
  const t = ui;
  const defaultBoxes = DEFAULT_BOX_DEFS.map(b => ({ ...b, label: t(`fm.box.${b.num}`) }));
  const resolved = (boxes ?? defaultBoxes).map(box => ({
    ...box,
    value: box.value ?? null,
  }));

  return (
    <div className="fm-aeat-grid">
      {resolved.map(box => (
        <div key={box.num} className={`fm-aeat-box${box.highlight ? ' fm-aeat-box--highlight' : ''}`}>
          <div className="fm-aeat-box__num">{t('fm.box.prefix')} {box.num}</div>
          <div className="fm-aeat-box__label">{box.label}</div>
          <div className="fm-aeat-box__value">
            {box.value != null ? formatAmount(box.value) : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

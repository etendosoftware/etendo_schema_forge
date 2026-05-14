import React from 'react';
import { formatAmount } from './fiscalModelsUtils.js';

const DEFAULT_BOXES = [
  { num: 1,  label: 'Operaciones sujetas tipo 21%',       group: 'bases' },
  { num: 2,  label: 'Cuota tipo 21%',                      group: 'cuotas' },
  { num: 3,  label: 'Operaciones sujetas tipo 10%',        group: 'bases' },
  { num: 4,  label: 'Cuota tipo 10%',                      group: 'cuotas' },
  { num: 5,  label: 'Operaciones sujetas tipo 4%',         group: 'bases' },
  { num: 6,  label: 'Cuota tipo 4%',                       group: 'cuotas' },
  { num: 28, label: 'Total cuota devengada',               group: 'totals', highlight: true },
  { num: 48, label: 'Cuota a deducir (adq. interiores)',   group: 'deducciones' },
  { num: 64, label: 'Total a deducir',                     group: 'deducciones', highlight: true },
  { num: 69, label: 'Diferencia (cuota neta)',             group: 'resultado', highlight: true },
  { num: 71, label: 'Resultado de la declaración',        group: 'resultado', highlight: true },
];

export default function FmBoxes303({ boxes }) {
  const resolved = (boxes ?? DEFAULT_BOXES).map(box => ({
    ...box,
    value: box.value ?? null,
  }));

  return (
    <div className="fm-aeat-grid">
      {resolved.map(box => (
        <div key={box.num} className={`fm-aeat-box${box.highlight ? ' fm-aeat-box--highlight' : ''}`}>
          <div className="fm-aeat-box__num">Casilla {box.num}</div>
          <div className="fm-aeat-box__label">{box.label}</div>
          <div className="fm-aeat-box__value">
            {box.value != null ? formatAmount(box.value) : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

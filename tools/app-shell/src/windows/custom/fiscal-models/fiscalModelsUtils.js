export const STATUSES = [
  'omitido', 'pendiente', 'borrador', 'listo',
  'presentado', 'presentadoOtra', 'presentadoAcuse',
];

export const STATUS_LABEL = {
  omitido:         'Omitido',
  pendiente:       'Pendiente',
  borrador:        'Borrador',
  listo:           'Listo',
  presentado:      'Presentado',
  presentadoOtra:  'Pres. otra plataforma',
  presentadoAcuse: 'Presentado con acuse',
};

export const STATUS_COLOR = {
  omitido:         'grey',
  pendiente:       'orange',
  borrador:        'blue',
  listo:           'green',
  presentado:      'teal',
  presentadoOtra:  'violet',
  presentadoAcuse: 'emerald',
};

export const STATUS_ICON = {
  omitido:         '⊘',
  pendiente:       '●',
  borrador:        '✎',
  listo:           '✓',
  presentado:      '▶',
  presentadoOtra:  '↗',
  presentadoAcuse: '★',
};

export const STATUS_ORDER = [...STATUSES];

export function formatPeriod(period) {
  if (!period) return '—';
  if (/^T\d$/.test(period)) return period;
  if (/^\d{2}$/.test(period)) return `${parseInt(period, 10)}M`;
  return period;
}

export function formatAmount(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function fmtDecl(decl) {
  return `${decl.model} ${decl.year} ${formatPeriod(decl.period)}`;
}

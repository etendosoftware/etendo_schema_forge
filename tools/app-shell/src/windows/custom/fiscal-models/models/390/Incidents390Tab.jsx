// Modelo 390 — the "Incidencias" tab (ETP-5716): the declaration's incidents split into
// Bloqueantes and Advertencias, each with its translated text and its action ("Ir a la casilla",
// "Ver facturas", "Editar en Organización", "Ver facturas de venta/compra"). The incidents come
// from the backend (incidents390.js); this component only lays them out.
import React from 'react';
import { ChevronRight, CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { FmEmptyState } from '../../FmDetailChrome.jsx';
import { isAeatIncident } from './submission390.js';
import { groupIncidents390, incidentActions390, incidentText390 } from './incidents390.js';

function ActionButtons({ item, handlers, t }) {
  const actions = incidentActions390(item).filter((a) => {
    if (a.kind === 'box') return Boolean(handlers.onGoToBox);
    if (a.kind === 'sources') return Boolean(handlers.onViewInvoices);
    return Boolean(handlers.onNavigate);
  });
  if (actions.length === 0) return null;
  const run = (a) => {
    if (a.kind === 'box') handlers.onGoToBox(a.box);
    else if (a.kind === 'sources') handlers.onViewInvoices(a.box);
    else handlers.onNavigate(a.path);
  };
  return (
    <span className="fm-390-incident__actions">
      {actions.map(a => (
        <button
          key={a.id}
          type="button"
          className="fm-link-btn fm-390-incident__action"
          onClick={() => run(a)}
          data-testid={`Incidents390Tab__action_${a.id}`}
        >
          {t(a.labelKey, { box: a.box })}
          <ChevronRight size={13} strokeWidth={2} aria-hidden="true" data-testid="ChevronRight__incident390" />
        </button>
      ))}
    </span>
  );
}

function Group({ kind, items, handlers, t }) {
  if (items.length === 0) return null;
  const blocking = kind === 'blocking';
  const Icon = blocking ? OctagonAlert : TriangleAlert;
  return (
    <section className={`fm-390-incidents__group fm-390-incidents__group--${kind}`} data-testid={`Incidents390Tab__${kind}`}>
      <h3 className="fm-390-incidents__title">
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" data-testid={`Icon__incidents390_${kind}`} />
        {t(blocking ? 'fm.m390.incidents.blocking_title' : 'fm.m390.incidents.warnings_title')}
        <span className="fm-390-incidents__count">{items.length}</span>
      </h3>
      <p className="fm-390-incidents__sub">
        {t(blocking ? 'fm.incidents.block_sub' : 'fm.incidents.warn_sub')}
      </p>
      <ul className="fm-390-incidents__list">
        {items.map((item, i) => (
          <li key={`${item.origin}-${i}`} className="fm-390-incident" data-testid={`Incidents390Tab__item_${item.origin}`}>
            <span className="fm-390-incident__text">
              {isAeatIncident(item) && <span className="fm-390-incident__origin">{item.origin}</span>}
              {incidentText390(item, t)}
            </span>
            <ActionButtons item={item} handlers={handlers} t={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * @param {object}   props.incidents        `{ blocking, warning, items }` of the declaration
 * @param {Function} [props.onGoToBox]      (box) => void — "Ir a la casilla"
 * @param {Function} [props.onViewInvoices] (box) => void — "Ver facturas" (Facturas tab filtered)
 * @param {Function} [props.onNavigate]     (path) => void — Organization / invoice lists
 */
export default function Incidents390Tab({ incidents, onGoToBox, onViewInvoices, onNavigate, t }) {
  const { blocking, warnings } = groupIncidents390(incidents?.items);
  if (blocking.length === 0 && warnings.length === 0) {
    return (
      <FmEmptyState
        icon={<CircleCheck size={28} strokeWidth={1.5} data-testid="CircleCheck__incidents390" />}
        title={t('fm.incidents.empty')}
        sub={t('fm.incidents.empty_sub')}
        data-testid="Incidents390Tab__empty" />
    );
  }
  const handlers = { onGoToBox, onViewInvoices, onNavigate };
  return (
    <div className="fm-390-incidents" data-testid="Incidents390Tab">
      <Group kind="blocking" items={blocking} handlers={handlers} t={t} />
      <Group kind="warnings" items={warnings} handlers={handlers} t={t} />
    </div>
  );
}

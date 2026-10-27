// Modelo 390 — the "Incidencias" tab (ETP-5716). The shared Incidencias table of every model
// (`IncidentsTab`, FmTabContent.jsx: severity banner, Severidad · Origen · Mensaje · Acción,
// blocking first) fed with the 390's own resolvers: the translated text of each incident, its
// origin and its actions ("Ir a la casilla", "Ver facturas", "Editar en Organización", "Ver
// facturas de venta/compra"). The incidents come from the backend (incidents390.js).
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { IncidentsTab } from '../../FmTabContent.jsx';
import {
  incidentActions390, incidentOrigin390, incidentText390, normalizeIncidents390,
} from './incidents390.js';

function availableActions(item, handlers) {
  return incidentActions390(item).filter((a) => {
    if (a.kind === 'box') return Boolean(handlers.onGoToBox);
    if (a.kind === 'sources') return Boolean(handlers.onViewInvoices);
    if (a.kind === 'settlements') return Boolean(handlers.onViewSettlements);
    return Boolean(handlers.onNavigate);
  });
}

function ActionButtons({ actions, handlers, t }) {
  const run = (a) => {
    if (a.kind === 'box') handlers.onGoToBox(a.box);
    else if (a.kind === 'sources') handlers.onViewInvoices(a.box);
    else if (a.kind === 'settlements') handlers.onViewSettlements();
    else handlers.onNavigate(a.path);
  };
  return (
    <span className="fm-390-incident__actions">
      {actions.map(a => (
        <button
          key={a.id}
          type="button"
          className="fm-incident-action"
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

/**
 * @param {object}   props.incidents        `{ blocking, warning, items }` of the declaration
 * @param {Function} [props.onGoToBox]      (box) => void — "Ir a la casilla"
 * @param {Function} [props.onViewInvoices] (box) => void — "Ver facturas" (Facturas tab filtered)
 * @param {Function} [props.onViewSettlements] () => void — "Ver detalle por trimestre" (the year's 303s)
 * @param {Function} [props.onNavigate]     (path) => void — Organization / invoice lists
 */
export default function Incidents390Tab({ incidents, onGoToBox, onViewInvoices, onViewSettlements, onNavigate, t }) {
  const normalized = normalizeIncidents390(incidents);
  const handlers = { onGoToBox, onViewInvoices, onViewSettlements, onNavigate };
  const renderAction = (item) => {
    const actions = availableActions(item, handlers);
    return actions.length > 0 ? <ActionButtons
      actions={actions}
      handlers={handlers}
      t={t}
      data-testid="ActionButtons__383a9b" /> : null;
  };
  return (
    <div className="fm-390-incidents" data-testid="Incidents390Tab">
      <IncidentsTab
        decl={{ incidents: normalized }}
        blocking={normalized.blocking}
        warning={normalized.warning}
        t={t}
        getMessage={(item) => incidentText390(item, t)}
        getOrigin={(item) => incidentOrigin390(item, t)}
        renderAction={renderAction}
        data-testid="IncidentsTab__383a9b" />
    </div>
  );
}

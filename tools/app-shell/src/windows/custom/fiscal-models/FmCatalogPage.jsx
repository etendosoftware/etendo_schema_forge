import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI, useLocaleSwitch } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { TriangleAlert, X } from 'lucide-react';
import { ConfigDrawer } from './FmOverlays.jsx';
import { showIaeActivityReminder } from './fiscalModelsUtils.js';
import { listModels, getModel } from './modelRegistry.js';
import useOrgSiiStatus, { isSiiJoinedDuringYear } from './useOrgSiiStatus.js';
import { filterAvailableModels } from './catalogAvailability.js';

// The catalog lists every registered model (id, periodicities, default state, lock, badge
// variant) — see modelRegistry.js.
const CATALOG = listModels();
const ANY_SII_WARNING = CATALOG.some(m => m.siiWarningOnActivate);

// ETP-5716 — inline, non-blocking confirmation under a card whose model asks for it
// (`siiWarningOnActivate`) when the organization is in the SII: "Cancelar" leaves it off,
// "Activar" activates it. Amber (warning role), inside the card list so it needs no extra layer.
// When the organization joined the SII after 1 January of the current year (`sinceLabel`), it was
// not in the SII for the whole year: the text says "en el SII desde <fecha>" instead of implying
// an exemption for the year.
function SiiActivationWarning({ sinceLabel, onCancel, onConfirm, t }) {
  return (
    <div className="fm-banner fm-banner--warning fm-catalog-sii-warning" role="alertdialog" aria-live="polite" data-testid="FmCatalogPage__siiWarning">
      <div className="fm-catalog-sii-warning__msg">
        <TriangleAlert size={16} strokeWidth={1.75} className="fm-catalog-sii-warning__icon" data-testid="TriangleAlert__fmCatalogSii" />
        <span>
          <strong>{sinceLabel ? t('fm.catalog.sii_warning_since_title', { date: sinceLabel }) : t('fm.catalog.sii_warning_title')}</strong>
          {' '}
          {sinceLabel ? t('fm.catalog.sii_warning_since_body', { date: sinceLabel }) : t('fm.catalog.sii_warning_body')}
        </span>
      </div>
      <div className="fm-catalog-sii-warning__actions">
        <button type="button" className="fm-btn fm-btn--cancel-pill" onClick={onCancel} data-testid="FmCatalogPage__siiCancel">
          {t('fm.action.cancel')}
        </button>
        <button type="button" className="fm-btn fm-btn--save-pill fm-btn--save-pill--active" onClick={onConfirm} data-testid="FmCatalogPage__siiConfirm">
          {t('fm.catalog.activate')}
        </button>
      </div>
    </div>
  );
}

// Toggle switch component
function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative', width: 40, height: 22,
        borderRadius: 11, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: checked ? 'hsl(var(--foreground))' : 'hsl(var(--text-disabled))',
        transition: 'background .15s', padding: 0, flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: checked ? 20 : 2,
        width: 18, height: 18,
        borderRadius: '50%', background: 'hsl(var(--card))',
        transition: 'left .15s',
        boxShadow: '0 1px 2px hsl(var(--foreground) / .2)',
      }} />
    </button>
  );
}

/**
 * Whether the drawer's selection differs from the one it opened with. Values are compared as
 * booleans, so an absent model and an explicit `false` are the same (toggling a model on and back
 * off is no change). Exported for tests.
 */
export function catalogSelectionChanged(before = {}, after = {}) {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...ids].some(id => Boolean(before[id]) !== Boolean(after[id]));
}

export default function FmCatalogPage({ onBack, onSave, activeModels, unavailableModels, token, apiBaseUrl }) {
  const t = useUI();
  // ETP-5716 — models the backend marks unavailable (catalogAvailability.js) are not offered.
  const catalog = filterAvailableModels(CATALOG, unavailableModels);
  const { locale } = useLocaleSwitch();
  const navigate = useNavigate();
  const [initialActive] = useState(
    () => activeModels ?? Object.fromEntries(catalog.map(m => [m.id, m.defaultActive]))
  );
  const [active, setActive] = useState(initialActive);
  const [configModel, setConfigModel] = useState(null);
  // ETP-5716 — the model awaiting the SII confirmation (see SiiActivationWarning), or null, and
  // the formatted SII date when the organization joined during the current year.
  const [siiPendingId, setSiiPendingId] = useState(null);
  const [siiSinceLabel, setSiiSinceLabel] = useState(null);
  const getSiiStatus = useOrgSiiStatus({ apiBaseUrl, enabled: ANY_SII_WARNING });

  // Closing saves only a real change: opening and closing the drawer never rewrites the catalog.
  const handleClose = () => {
    if (catalogSelectionChanged(initialActive, active)) onSave?.(active);
    onBack?.();
  };

  // ETP-5187 (adjacent scope) — Modelo 303 needs a default IAE activity configured for its
  // year-end declaration (see `showIaeActivityReminder`'s own doc comment in
  // `fiscalModelsUtils.js`). Only fires on the inactive → active transition of a model whose
  // registry entry asks for it (`iaeReminderOnActivate`: 303 only) — never on deactivation.
  const applyToggle = (id) => setActive(prev => {
    const next = { ...prev, [id]: !prev[id] };
    if (getModel(id)?.iaeReminderOnActivate && !prev[id] && next[id]) showIaeActivityReminder(t, navigate);
    return next;
  });
  // ETP-5716 — activating a `siiWarningOnActivate` model for an organization in the SII asks
  // first (SiiActivationWarning). Deactivating, or an organization outside the SII (or an SII
  // status that cannot be read), toggles right away.
  const toggleModel = async (id) => {
    if (!getModel(id)?.siiWarningOnActivate || active[id]) {
      applyToggle(id);
      return;
    }
    const status = await getSiiStatus();
    if (!status?.active) {
      applyToggle(id);
      return;
    }
    const joinedThisYear = isSiiJoinedDuringYear(status.since, new Date().getFullYear());
    setSiiSinceLabel(joinedThisYear ? formatCalendarDate(status.since, locale || 'es-ES') : null);
    setSiiPendingId(id);
  };
  const lockedIds = new Set(catalog.filter(m => m.locked).map(m => m.id));
  const activeCount = Object.entries(active).filter(([id, v]) => v && !lockedIds.has(id)).length;

  const modelSortKey = (m) => {
    if (active[m.id] && !m.locked) return 0;
    if (m.locked) return 2;
    return 1;
  };
  const sortedCatalog = [...catalog].sort((a, b) =>
    modelSortKey(a) - modelSortKey(b) || parseInt(a.id, 10) - parseInt(b.id, 10)
  );

  return (
    <div className="fm-catalog-overlay" onClick={handleClose}>
      <div className="fm-catalog-drawer" onClick={e => e.stopPropagation()}>
        <div className="fm-page">
          {/* Header */}
          <div className="fm-catalog-header">
            <div className="fm-catalog-header__titles">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="fm-catalog-header__title">{t('fm.catalog.title')}</div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '4px 8px', borderRadius: 8,
                  background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border-control))',
                  fontSize: 12, color: 'hsl(var(--muted-foreground))', fontWeight: 400, lineHeight: '16px',
                }}>
                  {catalog.length}
                </span>
              </div>
              <div className="fm-catalog-header__sub">
                • {activeCount} {t('fm.catalog.active_count') ?? 'modelos activos'}
              </div>
            </div>
            <button
              className="fm-catalog-header__back"
              onClick={handleClose}
              aria-label={t('fm.action.close') ?? 'Cerrar'}
              style={{ marginLeft: 'auto' }}
            >
              <X size={16} strokeWidth={1.75} data-testid="X__4ee693" />
            </button>
          </div>
          {/* List */}
          <div className="fm-catalog-body" style={{ padding: '8px 12px' }}>
            {sortedCatalog.map(model => {
              const isActive = active[model.id];
              const isLocked = model.locked;
              const badgeVariant = model.badgeVariant ?? 'muted';
              return (
                <div
                  key={model.id}
                  className={`fm-catalog-card${isActive && !isLocked ? ' fm-catalog-card--active' : ''}${isLocked ? ' fm-catalog-card--locked' : ''}${siiPendingId === model.id ? ' fm-catalog-card--attention' : ''}`}
                >
                  <span className={`fm-catalog-card__badge fm-catalog-card__badge--${badgeVariant}`}>
                    {model.id}
                  </span>
                  <div className="fm-catalog-card__body">
                    <div className="fm-catalog-card__name">{t(`fm.catalog.${model.id}.name`)}</div>
                    <div className="fm-catalog-card__desc">{t(`fm.catalog.${model.id}.desc`)}</div>
                    <div className="fm-catalog-card__meta">
                      {(model.periodicities ?? []).map(p => (
                        <span key={p} className="fm-catalog-card__pill">
                          {t(`fm.catalog.periodicity.${p}`)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {siiPendingId === model.id && (
                    <SiiActivationWarning
                      t={t}
                      sinceLabel={siiSinceLabel}
                      onCancel={() => setSiiPendingId(null)}
                      onConfirm={() => { setSiiPendingId(null); applyToggle(model.id); }}
                      data-testid="SiiActivationWarning__4ee693" />
                  )}
                  <div className="fm-catalog-card__actions" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {isLocked ? (
                      <span style={{ fontSize: 13, color: 'hsl(var(--text-disabled))', fontWeight: 400, whiteSpace: 'nowrap' }}>
                        {t('fm.catalog.coming_soon') ?? 'Próximamente'}
                      </span>
                    ) : (
                      <ToggleSwitch
                        checked={!!isActive}
                        onChange={() => toggleModel(model.id)}
                        data-testid="ToggleSwitch__4ee693" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {configModel && (
            <ConfigDrawer
              model={configModel}
              onClose={() => setConfigModel(null)}
              token={token}
              apiBaseUrl={apiBaseUrl}
              data-testid="ConfigDrawer__4ee693" />
          )}
        </div>
      </div>
    </div>
  );
}

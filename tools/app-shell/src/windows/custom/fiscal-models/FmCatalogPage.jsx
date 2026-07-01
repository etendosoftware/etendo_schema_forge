import React, { useState } from 'react';
import { useUI } from '@/i18n';
import { X } from 'lucide-react';
import { ConfigDrawer } from './FmOverlays.jsx';

const CATALOG = [
  { id: '303', cat: 'iva',  periodicity: 'quarterly', defaultActive: true,  locked: false },
  { id: '349', cat: 'iva',  periodicity: 'monthly',   defaultActive: true,  locked: false },
  { id: '115', cat: 'ret',  periodicity: 'quarterly', defaultActive: false, locked: true  },
  { id: '111', cat: 'ret',  periodicity: 'quarterly', defaultActive: false, locked: true  },
  { id: '190', cat: 'ret',  periodicity: 'annual',    defaultActive: false, locked: true  },
  { id: '180', cat: 'ret',  periodicity: 'annual',    defaultActive: false, locked: true  },
];

// Only 303 and 349 support per-model configuration
const CONFIGURABLE = new Set(['303', '349']);

// Badge variant per model id
const BADGE_VARIANT = { '303': '303', '349': '349' };

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
        background: checked ? '#0f172a' : '#d1d5db',
        transition: 'background .15s', padding: 0, flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: checked ? 20 : 2,
        width: 18, height: 18,
        borderRadius: '50%', background: '#fff',
        transition: 'left .15s',
        boxShadow: '0 1px 2px rgba(0,0,0,.2)',
      }} />
    </button>
  );
}

export default function FmCatalogPage({ onBack, onSave, activeModels, token, apiBaseUrl }) {
  const t = useUI();
  const [active, setActive] = useState(
    () => activeModels ?? Object.fromEntries(CATALOG.map(m => [m.id, m.defaultActive]))
  );
  const [configModel, setConfigModel] = useState(null);

  const toggleModel = (id) => setActive(prev => ({ ...prev, [id]: !prev[id] }));
  const lockedIds = new Set(CATALOG.filter(m => m.locked).map(m => m.id));
  const activeCount = Object.entries(active).filter(([id, v]) => v && !lockedIds.has(id)).length;

  const modelSortKey = (m) => {
    if (active[m.id] && !m.locked) return 0;
    if (m.locked) return 2;
    return 1;
  };
  const sortedCatalog = [...CATALOG].sort((a, b) =>
    modelSortKey(a) - modelSortKey(b) || parseInt(a.id, 10) - parseInt(b.id, 10)
  );

  return (
    <div className="fm-page">
      {/* Header */}
      <div className="fm-catalog-header">
        <div className="fm-catalog-header__titles">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="fm-catalog-header__title">{t('fm.catalog.title')}</div>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '4px 8px', borderRadius: 8,
              background: '#F5F7F9', border: '1px solid #D1D4DB',
              fontSize: 12, color: '#3F3F50', fontWeight: 400, lineHeight: '16px',
            }}>
              {CATALOG.length}
            </span>
          </div>
          <div className="fm-catalog-header__sub">
            • {activeCount} {t('fm.catalog.active_count') ?? 'modelos activos'}
          </div>
        </div>
        <button
          className="fm-catalog-header__back"
          onClick={() => { onSave?.(active); onBack?.(); }}
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
          const badgeVariant = BADGE_VARIANT[model.id] ?? 'muted';
          return (
            <div
              key={model.id}
              className={`fm-catalog-card${isActive && !isLocked ? ' fm-catalog-card--active' : ''}${isLocked ? ' fm-catalog-card--locked' : ''}`}
            >
              <span className={`fm-catalog-card__badge fm-catalog-card__badge--${badgeVariant}`}>
                {model.id}
              </span>
              <div className="fm-catalog-card__body">
                <div className="fm-catalog-card__name">{t(`fm.catalog.${model.id}.name`)}</div>
                <div className="fm-catalog-card__desc">{t(`fm.catalog.${model.id}.desc`)}</div>
                <div className="fm-catalog-card__meta">
                  <span className="fm-catalog-card__pill">
                    {t(`fm.catalog.periodicity.${model.periodicity}`)}
                  </span>
                </div>
              </div>
              <div className="fm-catalog-card__actions" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {isLocked ? (
                  <span style={{ fontSize: 13, color: '#828FA3', fontWeight: 400, whiteSpace: 'nowrap' }}>
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
  );
}

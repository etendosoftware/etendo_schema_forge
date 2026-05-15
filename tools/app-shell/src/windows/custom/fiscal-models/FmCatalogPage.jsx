import React, { useState } from 'react';
import { useUI } from '@/i18n';
import { ArrowLeft, Settings2, Lock } from 'lucide-react';
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

export default function FmCatalogPage({ onBack, onSave, activeModels, token, apiBaseUrl }) {
  const t = useUI();
  const [active, setActive] = useState(
    () => activeModels ?? Object.fromEntries(CATALOG.map(m => [m.id, m.defaultActive]))
  );
  const [configModel, setConfigModel] = useState(null);

  const toggleModel = (id) => setActive(prev => ({ ...prev, [id]: !prev[id] }));
  const lockedIds = new Set(CATALOG.filter(m => m.locked).map(m => m.id));
  const activeCount = Object.entries(active).filter(([id, v]) => v && !lockedIds.has(id)).length;

  return (
    <div className="fm-page">
      {/* Header */}
      <div className="fm-catalog-header">
        <button
          className="fm-catalog-header__back"
          onClick={onBack}
          aria-label={t('fm.action.back')}
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <div className="fm-catalog-header__titles">
          <div className="fm-catalog-header__title">{t('fm.catalog.title')}</div>
          <div className="fm-catalog-header__sub">{activeCount} {t('fm.catalog.active_count')}</div>
        </div>
        <button
          className="fm-toolbar__btn fm-toolbar__btn--primary"
          onClick={() => onSave?.(active)}
        >
          {t('fm.action.save')}
        </button>
      </div>

      {/* Description bar */}
      <div className="fm-catalog-desc">{t('fm.catalog.sub')}</div>

      {/* Card grid */}
      <div className="fm-catalog-body">
        {['iva', 'ret'].map(cat => (
          <div key={cat} className="fm-catalog-group">
            <div className="fm-catalog-group__label">{t(`fm.catalog.cat.${cat}`)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {CATALOG.filter(m => m.cat === cat).map(model => {
                const isActive = active[model.id];
                const isLocked = model.locked;
                return (
                  <div
                    key={model.id}
                    className={`fm-catalog-card${isLocked ? ' fm-catalog-card--locked' : isActive ? (cat === 'ret' ? ' fm-catalog-card--active-ret' : ' fm-catalog-card--active') : ''}`}
                  >
                    <span className={`fm-catalog-card__badge fm-catalog-card__badge--${cat}`}>
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
                    <div className="fm-catalog-card__actions">
                      {isLocked ? (
                        <span className="fm-catalog-card__locked-badge">
                          <Lock size={10} strokeWidth={2} />
                          {t('fm.catalog.coming_soon')}
                        </span>
                      ) : (
                        <>
                          <button
                            className={`fm-catalog-toggle ${isActive ? 'fm-catalog-toggle--active' : 'fm-catalog-toggle--inactive'}`}
                            onClick={() => toggleModel(model.id)}
                          >
                            {isActive ? t('fm.catalog.deactivate') : t('fm.catalog.activate')}
                          </button>
                          {isActive && CONFIGURABLE.has(model.id) && (
                            <button
                              className="fm-catalog-config-btn"
                              title={t('fm.config.title')}
                              aria-label={t('fm.config.title')}
                              onClick={() => setConfigModel(model.id)}
                            >
                              <Settings2 size={14} strokeWidth={1.75} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {configModel && (
        <ConfigDrawer model={configModel} onClose={() => setConfigModel(null)} token={token} apiBaseUrl={apiBaseUrl} />
      )}
    </div>
  );
}

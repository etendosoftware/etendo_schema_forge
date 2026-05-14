import React, { useState } from 'react';
import { useUI } from '@/i18n';
import { ConfigDrawer } from './FmOverlays.jsx';

const CATALOG = [
  { id: '303', cat: 'iva',  periodicity: 'quarterly', defaultActive: true  },
  { id: '349', cat: 'iva',  periodicity: 'monthly',   defaultActive: true  },
  { id: '115', cat: 'ret',  periodicity: 'quarterly', defaultActive: false },
  { id: '111', cat: 'ret',  periodicity: 'quarterly', defaultActive: false },
  { id: '190', cat: 'ret',  periodicity: 'annual',    defaultActive: false },
  { id: '180', cat: 'ret',  periodicity: 'annual',    defaultActive: false },
];

const CAT_COLOR = { iva: '#eff6ff', ret: '#fdf4ff' };
const CAT_TEXT  = { iva: '#1d4ed8', ret: '#7c3aed' };

// Only 303 and 349 support per-model configuration
const CONFIGURABLE = new Set(['303', '349']);

export default function FmCatalogPage({ onBack, onSave }) {
  const ui = useUI();
  const t = ui;
  const [active, setActive] = useState(
    () => Object.fromEntries(CATALOG.map(m => [m.id, m.defaultActive]))
  );
  const [configModel, setConfigModel] = useState(null);

  const toggleModel = (id) => setActive(prev => ({ ...prev, [id]: !prev[id] }));
  const activeCount = Object.values(active).filter(Boolean).length;

  return (
    <div className="fm-page">
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}
          onClick={onBack}
          aria-label={t('fm.action.back')}
        >
          ←
        </button>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{t('fm.catalog.title')}</span>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            {activeCount} {t('fm.catalog.active_count')}
          </div>
        </div>
        <button
          style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px', borderRadius: 4, border: 'none', cursor: 'pointer', background: '#111827', color: '#fff', fontWeight: 600 }}
          onClick={() => onSave?.(active)}
        >
          {t('fm.action.save')}
        </button>
      </div>

      <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>
        {t('fm.catalog.sub')}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {['iva', 'ret'].map(cat => (
          <div key={cat} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              {t(`fm.catalog.cat.${cat}`)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {CATALOG.filter(m => m.cat === cat).map(model => {
                const isActive = active[model.id];
                return (
                  <div key={model.id} style={{ border: `1px solid ${isActive ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: 8, padding: '12px 14px', background: isActive ? '#f0f9ff' : '#fff', display: 'flex', alignItems: 'flex-start', gap: 12, transition: 'all .15s' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: CAT_COLOR[cat], color: CAT_TEXT[cat], fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                      {model.id}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{t(`fm.catalog.${model.id}.name`)}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{t(`fm.catalog.${model.id}.desc`)}</div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#f3f4f6', color: '#4b5563' }}>
                          {t(`fm.catalog.periodicity.${model.periodicity}`)}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, alignItems: 'flex-end' }}>
                      <button
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid', cursor: 'pointer', fontWeight: 500, borderColor: isActive ? '#ef4444' : '#22c55e', background: isActive ? '#fef2f2' : '#f0fdf4', color: isActive ? '#dc2626' : '#15803d' }}
                        onClick={() => toggleModel(model.id)}
                      >
                        {isActive ? t('fm.catalog.deactivate') : t('fm.catalog.activate')}
                      </button>
                      {isActive && CONFIGURABLE.has(model.id) && (
                        <button
                          title={t('fm.config.title')}
                          aria-label={t('fm.config.title')}
                          style={{ fontSize: 14, padding: '2px 7px', borderRadius: 4, border: '1px solid #e5e7eb', cursor: 'pointer', background: '#f9fafb', color: '#6b7280', lineHeight: 1.4 }}
                          onClick={() => setConfigModel(model.id)}
                        >
                          ⚙
                        </button>
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
        <ConfigDrawer model={configModel} onClose={() => setConfigModel(null)} />
      )}
    </div>
  );
}

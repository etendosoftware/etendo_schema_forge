import { useState } from 'react';
import { useUI } from '@/i18n';
import { useDraggable } from './useDraggable.js';

const PROFILES = [
  { key: 'sii',        labelKey: 'fmDebug.profile.sii' },
  { key: 'sii-navarra',labelKey: 'fmDebug.profile.siiNavarra' },
  { key: 'sii+tbai',   labelKey: 'fmDebug.profile.siiTbai' },
  { key: 'tbai',       labelKey: 'fmDebug.profile.tbai' },
  { key: 'verifactu',  labelKey: 'fmDebug.profile.verifactu' },
];

const CERT_EXPIRY_OPTIONS = [
  { key: null, labelKey: 'fmDebug.certExpiry.none' },
  { key: 45,   labelKey: 'fmDebug.certExpiry.warn' },
  { key: 20,   labelKey: 'fmDebug.certExpiry.crit' },
];

const panelStyle = {
  position: 'fixed',
  top: 56,
  right: 16,
  zIndex: 9999,
  background: '#1a1a2e',
  color: '#e0e0ff',
  borderRadius: 10,
  padding: '10px 14px',
  minWidth: 220,
  boxShadow: '0 4px 24px rgba(0,0,0,.45)',
  fontSize: 12,
  fontFamily: 'var(--font-mono, monospace)',
};

export default function FiscalMonitorDebugPanel({ activeProfile, onProfileChange, mockData, onMockDataChange, mockCertDays, onSetCertDays }) {
  const ui = useUI();
  const [collapsed, setCollapsed] = useState(false);
  const { panelRef, posStyle, handleMouseDown } = useDraggable();

  return (
    <div ref={panelRef} style={{ ...panelStyle, ...posStyle }}>
      <div
        onMouseDown={handleMouseDown}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : 8, cursor: 'grab', userSelect: 'none' }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#a0a0cc', textTransform: 'uppercase' }}>
          {ui('fmDebug.title')}
        </span>
        <button
          onClick={() => setCollapsed(c => !c)}
          onMouseDown={e => e.stopPropagation()}
          style={{ background: 'none', border: 'none', color: '#a0a0cc', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
        >
          {collapsed ? '▾' : '▴'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div style={{ fontSize: 10, color: '#a0a0cc', marginBottom: 6 }}>{ui('fmDebug.profileOverride')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PROFILES.map(({ key, labelKey }) => (
              <button
                key={key}
                onClick={() => onProfileChange(activeProfile === key ? null : key)}
                style={{
                  background: activeProfile === key ? '#5423E7' : '#2d2d4a',
                  border: '1px solid ' + (activeProfile === key ? '#7a55ff' : '#3d3d5c'),
                  borderRadius: 6,
                  color: '#e0e0ff',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  textAlign: 'left',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  transition: 'background .1s',
                }}
              >
                {activeProfile === key ? '✓ ' : '  '}{ui(labelKey)}
              </button>
            ))}
          </div>
          {activeProfile && (
            <div style={{ marginTop: 8, fontSize: 10, color: '#7a7aaa', lineHeight: 1.4 }}>
              {ui('fmDebug.showingDesignFor', { profile: activeProfile })}
            </div>
          )}
          {!activeProfile && (
            <div style={{ marginTop: 8, fontSize: 10, color: '#7a7aaa' }}>
              {ui('fmDebug.noOverride')}
            </div>
          )}

          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #2d2d4a' }}>
            <div style={{ fontSize: 10, color: '#a0a0cc', marginBottom: 6 }}>{ui('fmDebug.section.certExpiry')}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {CERT_EXPIRY_OPTIONS.map(opt => {
                const active = mockCertDays === opt.key;
                return (
                  <button
                    key={String(opt.key)}
                    onClick={() => onSetCertDays?.(opt.key)}
                    style={{
                      background: active ? '#1a3a2a' : '#2d2d4a',
                      border: '1px solid ' + (active ? '#2a7a4a' : '#3d3d5c'),
                      borderRadius: 6, color: active ? '#b3ffd6' : '#e0e0ff',
                      cursor: 'pointer', padding: '3px 8px', fontSize: 11,
                      fontFamily: 'inherit',
                    }}
                  >
                    {active ? '✓ ' : ''}{ui(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #2d2d4a' }}>
            <div style={{ fontSize: 10, color: '#a0a0cc', marginBottom: 6 }}>{ui('fmDebug.section.data')}</div>
            <button
              onClick={() => onMockDataChange(!mockData)}
              style={{
                width: '100%',
                background: mockData ? '#1a3a1a' : '#2d2d4a',
                border: '1px solid ' + (mockData ? '#2a5c2a' : '#3d3d5c'),
                borderRadius: 6,
                color: mockData ? '#b3ffb3' : '#e0e0ff',
                cursor: 'pointer',
                padding: '4px 10px',
                textAlign: 'left',
                fontSize: 12,
                fontFamily: 'inherit',
                transition: 'background .1s',
              }}
            >
              {mockData ? '✓ ' : '  '}{ui('fmDebug.mockData')}
            </button>
            {mockData && (
              <div style={{ marginTop: 5, fontSize: 10, color: '#7a7aaa', lineHeight: 1.4 }}>
                {ui('fmDebug.mockDataHint')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

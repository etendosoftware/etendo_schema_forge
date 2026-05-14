import React, { useState, useCallback } from 'react';
import FmListPage from './FmListPage';
import FmModel303Page from './models/303/FmModel303Page';
import FmModel349Page from './models/349/FmModel349Page';
import FmDebugPanel from './FmDebugPanel.jsx';
import { useDebugMode } from '../fiscal-monitor/useDebugMode.js';

export default function FiscalModelsPage() {
  const [view, setView] = useState({ type: 'list' });
  const debugMode = useDebugMode();

  const handleSelect = useCallback((decl) => {
    setView({ type: decl.model, decl });
  }, []);

  const handleBack = useCallback(() => {
    setView({ type: 'list' });
  }, []);

  let content;
  if (view.type === '303') {
    content = (
      <FmModel303Page
        decl={view.decl}
        onBack={handleBack}
        onStatusChange={(id, newStatus) => {
          setView(v => v.type === '303' ? { ...v, decl: { ...v.decl, status: newStatus } } : v);
        }}
      />
    );
  } else if (view.type === '349') {
    content = (
      <FmModel349Page
        decl={view.decl}
        onBack={handleBack}
        onStatusChange={(id, newStatus) => {
          setView(v => v.type === '349' ? { ...v, decl: { ...v.decl, status: newStatus } } : v);
        }}
      />
    );
  } else {
    content = <FmListPage onSelect={handleSelect} />;
  }

  return (
    <>
      {content}
      {debugMode && <FmDebugPanel view={view} setView={setView} />}
    </>
  );
}

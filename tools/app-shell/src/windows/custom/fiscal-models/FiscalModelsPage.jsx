import React, { useState, useCallback } from 'react';
import FmListPage from './FmListPage';
import FmModel303Page from './FmModel303Page';
import FmModel349Page from './FmModel349Page';
import FmCatalogPage from './FmCatalogPage';
import { NewDeclModal } from './FmOverlays.jsx';

export default function FiscalModelsPage() {
  const [view, setView] = useState({ type: 'list' });
  const [showNewDecl, setShowNewDecl] = useState(false);

  const handleSelect = useCallback((decl) => {
    setView({ type: decl.model, decl });
  }, []);

  const handleBack = useCallback(() => {
    setView({ type: 'list' });
  }, []);

  if (view.type === '303') {
    return (
      <FmModel303Page
        decl={view.decl}
        onBack={handleBack}
        onStatusChange={(id, newStatus) => {
          setView(v => v.type === '303' ? { ...v, decl: { ...v.decl, status: newStatus } } : v);
        }}
      />
    );
  }

  if (view.type === '349') {
    return (
      <FmModel349Page
        decl={view.decl}
        onBack={handleBack}
        onStatusChange={(id, newStatus) => {
          setView(v => v.type === '349' ? { ...v, decl: { ...v.decl, status: newStatus } } : v);
        }}
      />
    );
  }

  if (view.type === 'catalog') {
    return (
      <FmCatalogPage
        onBack={handleBack}
        onSave={() => handleBack()}
      />
    );
  }

  return (
    <>
      <FmListPage onSelect={handleSelect} onOpenCatalog={() => setView({ type: 'catalog' })} />
      {showNewDecl && <NewDeclModal onConfirm={() => {}} onClose={() => setShowNewDecl(false)} />}
    </>
  );
}

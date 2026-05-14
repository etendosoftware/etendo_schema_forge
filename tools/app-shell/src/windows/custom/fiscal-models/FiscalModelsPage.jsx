import React, { useState } from 'react';
import FmListPage from './FmListPage';
import FmModel303Page from './FmModel303Page';
import FmModel349Page from './FmModel349Page';

export default function FiscalModelsPage() {
  const [view, setView] = useState({ type: 'list' });
  if (view.type === '303') return <FmModel303Page decl={view.decl} onBack={() => setView({ type: 'list' })} />;
  if (view.type === '349') return <FmModel349Page decl={view.decl} onBack={() => setView({ type: 'list' })} />;
  return <FmListPage onSelect={(decl) => setView({ type: decl.model, decl })} />;
}

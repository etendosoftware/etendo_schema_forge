import { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import TabBar from './TabBar.jsx';
import GeneralTab from './GeneralTab.jsx';
import DefaultsTab from './DefaultsTab.jsx';
import DimensionsTab from './DimensionsTab.jsx';
import DocumentsTab from './DocumentsTab.jsx';
import { useGeneralLedgerConfig } from './useGeneralLedgerConfig.js';
import { DEFAULTS_GROUPS } from './mockCatalogs.js';

const REQUIRED_GENERAL = ['name', 'currency'];
const REQUIRED_DEFAULTS = DEFAULTS_GROUPS.flatMap((g) => g.fields.filter((f) => f.required).map((f) => f.key));

/**
 * General Ledger Configuration (AD window 125, "Configuración contable").
 * layoutType: custom — fiscal-config pattern. 4 tabs: General · Valores por
 * defecto · Dimensiones · Documentos.
 *
 * Backend is greenfield (no NEO spec yet); data comes from mockCatalogs and the
 * save handler is a Phase 3 stub (see useGeneralLedgerConfig.save()).
 */
export default function GeneralLedgerConfigPage({ apiBaseUrl }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const {
    general, defaults, dimensions, documents, orgInfo, meta,
    catalogs,
    setGeneralField, setDefaultField, setDimensionField,
    isDirty, save, loading,
  } = useGeneralLedgerConfig(apiBaseUrl);

  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [generalErrors, setGeneralErrors] = useState({});
  const [defaultsErrors, setDefaultsErrors] = useState({});

  useSetPageMeta({
    title: ui('glc.title'),
    breadcrumb: `${ui('glc.breadcrumbRoot')} / ${ui('glc.title')}`,
  });

  function validate() {
    const gErr = {};
    for (const k of REQUIRED_GENERAL) {
      if (!general[k]) gErr[k] = ui('glc.validation.required');
    }
    const dErr = {};
    for (const k of REQUIRED_DEFAULTS) {
      if (!defaults[k]) dErr[k] = ui('glc.validation.required');
    }
    setGeneralErrors(gErr);
    setDefaultsErrors(dErr);
    return { ok: Object.keys(gErr).length === 0 && Object.keys(dErr).length === 0, gErr, dErr };
  }

  async function handleSave() {
    const { ok, gErr, dErr } = validate();
    if (!ok) {
      // Jump to the first tab that has an error so the user sees it.
      if (Object.keys(gErr).length > 0) setActiveTab(0);
      else if (Object.keys(dErr).length > 0) setActiveTab(1);
      return;
    }
    setSaving(true);
    try {
      await save();
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const tabs = useMemo(() => ([
    { label: ui('glc.tab.general') },
    { label: ui('glc.tab.defaults') },
    { label: ui('glc.tab.dimensions') },
    { label: ui('glc.tab.documents'), badge: documents.length },
  ]), [ui, documents.length]);

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      {/* Tab row: tabs left, dirty-state save button right */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-[#E8EAEF] pr-6">
        <TabBar
          tabs={tabs}
          active={activeTab}
          onChange={setActiveTab}
          data-testid="TabBar__79cd86" />
        <Button
          onClick={handleSave}
          disabled={!selectedOrg?.id || !isDirty || saving || loading}
          className={savedOk ? 'bg-green-600 hover:bg-green-700 border-green-600' : ''}
          data-testid="glc-save"
        >
          <Check size={14} className="mr-1.5" data-testid="Check__79cd86" />
          {ui('saveChanges')}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-6 py-2">
          {!selectedOrg?.id && (
            <div className="rounded-xl border border-dashed border-[#E8D6A8] bg-[#FFFCF5] px-4 py-3 text-sm text-[#7A7E8A] mb-4" data-testid="glc-org-required-note">
              {ui('glc.validation.organizationRequired')}
            </div>
          )}
          {activeTab === 0 && (
            <GeneralTab
              general={general}
              orgInfo={orgInfo}
              currencyOptions={catalogs.currencies}
              setGeneralField={setGeneralField}
              errors={generalErrors}
              data-testid="GeneralTab__79cd86" />
          )}
          {activeTab === 1 && (
            <DefaultsTab
              defaults={defaults}
              accountOptions={catalogs.accounts}
              setDefaultField={setDefaultField}
              errors={defaultsErrors}
              data-testid="DefaultsTab__79cd86" />
          )}
          {activeTab === 2 && (
            <DimensionsTab
              dimensions={dimensions}
              setDimensionField={setDimensionField}
              data-testid="DimensionsTab__79cd86" />
          )}
          {activeTab === 3 && (
            <DocumentsTab
              documents={documents}
              documentsBacked={Boolean(meta.documentsBacked)}
              documentsNote={meta.documentsNote}
              data-testid="DocumentsTab__79cd86" />
          )}
        </div>
      </div>
    </div>
  );
}

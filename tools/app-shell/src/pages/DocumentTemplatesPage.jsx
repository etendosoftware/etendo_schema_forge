import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useUI, useMenuLabel } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { NEO_BASE } from '@/lib/neoWebhookClient.js';
import { COMMERCIAL_DOC_TYPES, LISTING_DOC_TYPES, listDocTemplateConfigs } from '@/lib/docTemplateConfigApi.js';
import DocumentTemplatePreview from '@/windows/custom/shared/DocumentTemplatePreview.jsx';
import ListingTemplatePreview from '@/windows/custom/shared/ListingTemplatePreview.jsx';
import PrintableSettingsSection from './PrintableSettingsSection.jsx';

/**
 * ETP-5988 — Settings → Printable documents. Two independent sections: the design of the commercial
 * documents (invoice, order, purchase order, quotation) and the design of the printed lists. Each
 * has its own options, preview and Save. Reached only with the `doc-template-selection` flag on and
 * an administrator capability; saving is authorized again by the backend, whose refusal is shown
 * here, not hidden.
 */
export default function DocumentTemplatesPage() {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const apiFetch = useApiFetch(NEO_BASE);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('documents');

  useSetPageMeta({
    title: ui('documentTemplatesTitle'),
    breadcrumb: `${tMenu('Settings')} / ${ui('documentTemplatesTitle')}`,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConfigs(await listDocTemplateConfigs(apiFetch));
    } catch (error) {
      toast.error(ui('documentTemplatesLoadFailed'), { description: error.message });
    } finally {
      setLoading(false);
    }
  }, [apiFetch, ui]);

  useEffect(() => { load(); }, [load]);

  const tabButton = (key, label) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
      data-testid={`DocumentTemplatesPage__tab-${key}`}
    >
      {label}
    </button>
  );

  // Both sections stay mounted: switching tab must not lose a draft that is not saved yet.
  return (
    <div className="h-full overflow-y-auto space-y-4 p-6" data-testid="DocumentTemplatesPage">
      <p className="text-sm text-muted-foreground">{ui('documentTemplatesDescription')}</p>
      <div role="tablist" className="flex gap-1 border-b">
        {tabButton('documents', ui('documentTemplatesDocumentsTitle'))}
        {tabButton('listings', ui('documentTemplatesListingsTitle'))}
      </div>
      <div hidden={tab !== 'documents'}>
        <PrintableSettingsSection
          id="DocumentTemplatesPage-documents"
          title={ui('documentTemplatesDocumentsTitle')}
          description={ui('documentTemplatesDocumentsDescription')}
          docTypes={COMMERCIAL_DOC_TYPES}
          configs={configs}
          withLogo
          withFooter
          Preview={DocumentTemplatePreview}
          apiFetch={apiFetch}
          onReload={load}
          loading={loading}
          data-testid="PrintableSettingsSection__b63f58" />
      </div>
      <div hidden={tab !== 'listings'}>
        <PrintableSettingsSection
          id="DocumentTemplatesPage-listings"
          title={ui('documentTemplatesListingsTitle')}
          description={ui('documentTemplatesListingsDescription')}
          docTypes={LISTING_DOC_TYPES}
          configs={configs}
          withLogo
          withShowLogo
          stripesOptIn
          Preview={ListingTemplatePreview}
          apiFetch={apiFetch}
          onReload={load}
          loading={loading}
          data-testid="PrintableSettingsSection__b63f58" />
      </div>
    </div>
  );
}

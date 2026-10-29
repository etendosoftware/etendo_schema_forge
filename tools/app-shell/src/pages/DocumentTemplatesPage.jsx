import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useUI, useMenuLabel } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { NEO_BASE } from '@/lib/neoWebhookClient.js';
import {
  COMMERCIAL_DOC_TYPES, DEFAULT_VARIANT, VARIANTS,
  currentVariant, listDocTemplateConfigs, saveDocTemplateVariant,
} from '@/lib/docTemplateConfigApi.js';
import DocumentTemplatePreview from '@/windows/custom/shared/DocumentTemplatePreview.jsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const VARIANT_LABEL_KEYS = {
  classic: 'documentTemplatesClassic',
  compact: 'documentTemplatesCompact',
  modern: 'documentTemplatesModern',
};

/**
 * ETP-5988 — Settings → Printable documents. One selector: the printed template of the commercial
 * documents (invoice, order, purchase order, quotation) of the organization. Reached only with the
 * `doc-template-selection` flag on and an administrator capability; saving is authorized again by
 * the backend, whose refusal is shown here, not hidden.
 */
export default function DocumentTemplatesPage() {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const apiFetch = useApiFetch(NEO_BASE);
  const [saved, setSaved] = useState(DEFAULT_VARIANT);
  const [selected, setSelected] = useState(DEFAULT_VARIANT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useSetPageMeta({
    title: ui('documentTemplatesTitle'),
    breadcrumb: `${tMenu('Settings')} / ${ui('documentTemplatesTitle')}`,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const variant = currentVariant(await listDocTemplateConfigs(apiFetch));
      setSaved(variant);
      setSelected(variant);
    } catch (error) {
      toast.error(ui('documentTemplatesLoadFailed'), { description: error.message });
    } finally {
      setLoading(false);
    }
  }, [apiFetch, ui]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const results = await Promise.allSettled(
      COMMERCIAL_DOC_TYPES.map((docType) => saveDocTemplateVariant(apiFetch, docType, selected)));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) {
      // Some documents may have been saved and others not: show the server's state, not ours.
      toast.error(ui('documentTemplatesSaveFailed'), { description: failed.reason?.message });
      await load();
    } else {
      setSaved(selected);
      toast.success(ui('documentTemplatesSaved'));
    }
    setSaving(false);
  };

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6" data-testid="DocumentTemplatesPage">
      <p className="text-sm text-muted-foreground">{ui('documentTemplatesDescription')}</p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card data-testid="DocumentTemplatesPage__card" className="self-start">
        <CardContent className="flex flex-col gap-4 p-6">
          <Label htmlFor="document-template-variant">{ui('documentTemplatesLabel')}</Label>
          <Select value={selected} onValueChange={setSelected} disabled={loading || saving}>
            <SelectTrigger id="document-template-variant" data-testid="DocumentTemplatesPage__select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VARIANTS.map((variant) => (
                <SelectItem key={variant} value={variant} data-testid={`DocumentTemplatesPage__option-${variant}`}>
                  {ui(VARIANT_LABEL_KEYS[variant])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={save}
            disabled={loading || saving || selected === saved}
            data-testid="DocumentTemplatesPage__save"
          >
            {ui('documentTemplatesSave')}
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2" data-testid="DocumentTemplatesPage__preview">
        <p className="text-sm font-medium">{ui('documentTemplatesPreviewTitle')}</p>
        <p className="text-xs text-muted-foreground">{ui('documentTemplatesPreviewHint')}</p>
        <DocumentTemplatePreview variant={selected} />
      </div>
      </div>
    </div>
  );
}

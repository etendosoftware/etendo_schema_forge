import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import {
  DEFAULT_SETTINGS, FONTS, FONT_SIZES, ROW_STRIPES, VARIANTS, currentSettings, saveDocTemplateSettings,
} from '@/lib/docTemplateConfigApi.js';
import { isHexColor } from '@/windows/custom/shared/printableStyle.js';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const VARIANT_LABEL_KEYS = {
  classic: 'documentTemplatesClassic',
  compact: 'documentTemplatesCompact',
  modern: 'documentTemplatesModern',
};
const FONT_LABEL_KEYS = { sans: 'documentTemplatesFontSans', serif: 'documentTemplatesFontSerif', mono: 'documentTemplatesFontMono' };
const FONT_SIZE_LABEL_KEYS = { small: 'documentTemplatesSizeSmall', normal: 'documentTemplatesSizeNormal', large: 'documentTemplatesSizeLarge' };
const STRIPES_LABEL_KEYS = { on: 'documentTemplatesStripesOn', off: 'documentTemplatesStripesOff' };

// A short palette: enough to pick a brand color in one click, plus the native picker for any other.
const PALETTE = ['#2F5BEA', '#0F766E', '#B91C1C', '#C2410C', '#6D28D9', '#111827'];
const UNSET = 'default';
const MAX_LOGO_CHARS = 512 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FOOTER = 500;

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/** A select whose first option is "the design's own" (null). */
function ChoiceSelect({ id, value, onChange, options, labelKeys, unsetLabel, disabled, testId }) {
  const ui = useUI();
  return (
    <Select value={value ?? UNSET} onValueChange={(v) => onChange(v === UNSET ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} data-testid={testId}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>{unsetLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>{ui(labelKeys[option])}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * ETP-5988 — One section of Settings → Printable documents: the design, the common options and a
 * live preview of one kind of printable (the commercial documents, or the list print). Each section
 * keeps its own draft and saves on its own: saving one never touches the other.
 *
 * @param {object} props
 * @param {string} props.id            prefix of the field ids and test ids
 * @param {string} props.title
 * @param {string} props.description
 * @param {string[]} props.docTypes    the document types this section saves together
 * @param {Array} props.configs        the organization's saved configurations
 * @param {boolean} [props.withLogo]   offer a logo upload
 * @param {boolean} [props.withFooter] offer the footer text (documents only)
 * @param {boolean} [props.stripesOptIn] alternating rows are off unless chosen (the list print)
 * @param {boolean} [props.withShowLogo] offer "show the company logo" (the list print only)
 * @param {Function} props.Preview     preview component, receives `settings`
 * @param {Function} props.apiFetch
 * @param {Function} props.onReload    called after a partial failure to show the server's state
 * @param {boolean} props.loading
 */
export default function PrintableSettingsSection({
  id, title, description, docTypes, configs, withLogo = false, withFooter = false, withShowLogo = false, stripesOptIn = false, Preview, apiFetch, onReload, loading,
}) {
  const ui = useUI();
  const [saved, setSaved] = useState(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const settings = currentSettings(configs, docTypes);
    setSaved(settings);
    setDraft(settings);
  }, [configs, docTypes]);

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const busy = loading || saving;

  const save = async () => {
    setSaving(true);
    const results = await Promise.allSettled(
      docTypes.map((docType) => saveDocTemplateSettings(apiFetch, docType, draft, { withLogo, withFooter })));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) {
      // Some types may have been saved and others not: show the server's state, not ours.
      toast.error(ui('documentTemplatesSaveFailed'), { description: failed.reason?.message });
      await onReload();
    } else {
      setSaved(draft);
      toast.success(ui('documentTemplatesSaved'));
    }
    setSaving(false);
  };

  const pickLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error(ui('documentTemplatesLogoType'));
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      if (dataUrl.length > MAX_LOGO_CHARS) {
        toast.error(ui('documentTemplatesLogoTooBig'));
        return;
      }
      set('logo')(dataUrl);
    } catch (error) {
      toast.error(ui('documentTemplatesLogoType'), { description: error.message });
    }
  };

  const color = isHexColor(draft.color) ? draft.color : null;

  return (
    <section className="space-y-3" data-testid={`${id}__section`}>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="self-start">
          <CardContent className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-variant`}>{ui('documentTemplatesLabel')}</Label>
              <Select value={draft.variant} onValueChange={set('variant')} disabled={busy}>
                <SelectTrigger id={`${id}-variant`} data-testid={`${id}__variant`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VARIANTS.map((variant) => (
                    <SelectItem key={variant} value={variant} data-testid={`${id}__variant-${variant}`}>
                      {ui(VARIANT_LABEL_KEYS[variant])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{ui('documentTemplatesColor')}</Label>
              <div className="flex flex-wrap items-center gap-2" data-testid={`${id}__colors`}>
                <button
                  type="button"
                  className={`h-7 rounded-md border px-2 text-xs ${color ? '' : 'ring-2 ring-primary'}`}
                  onClick={() => set('color')(null)}
                  disabled={busy}
                  aria-pressed={!color}
                  data-testid={`${id}__color-default`}
                >
                  {ui('documentTemplatesColorDefault')}
                </button>
                {PALETTE.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={swatch}
                    aria-pressed={color === swatch}
                    className={`h-7 w-7 rounded-full border ${color === swatch ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    style={{ backgroundColor: swatch }}
                    onClick={() => set('color')(swatch)}
                    disabled={busy}
                    data-testid={`${id}__color-${swatch.slice(1)}`}
                  />
                ))}
                <input
                  type="color"
                  aria-label={ui('documentTemplatesColorCustom')}
                  title={ui('documentTemplatesColorCustom')}
                  className="h-7 w-9 cursor-pointer rounded-md border bg-transparent p-0"
                  value={color ?? '#2F5BEA'}
                  onChange={(e) => set('color')(e.target.value.toUpperCase())}
                  disabled={busy}
                  data-testid={`${id}__color-custom`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-font`}>{ui('documentTemplatesFont')}</Label>
              <ChoiceSelect id={`${id}-font`} testId={`${id}__font`} value={draft.font} onChange={set('font')}
                options={FONTS} labelKeys={FONT_LABEL_KEYS} unsetLabel={ui('documentTemplatesDesignDefault')} disabled={busy} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-size`}>{ui('documentTemplatesFontSize')}</Label>
              <ChoiceSelect id={`${id}-size`} testId={`${id}__size`} value={draft.fontSize} onChange={set('fontSize')}
                options={FONT_SIZES} labelKeys={FONT_SIZE_LABEL_KEYS} unsetLabel={ui('documentTemplatesDesignDefault')} disabled={busy} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-stripes`}>{ui('documentTemplatesStripes')}</Label>
              <ChoiceSelect id={`${id}-stripes`} testId={`${id}__stripes`}
                value={stripesOptIn && draft.rowStripes !== 'on' ? null : draft.rowStripes}
                onChange={set('rowStripes')}
                options={stripesOptIn ? ['on'] : ROW_STRIPES} labelKeys={STRIPES_LABEL_KEYS}
                unsetLabel={ui(stripesOptIn ? 'documentTemplatesStripesOff' : 'documentTemplatesDesignDefault')} disabled={busy} />
            </div>

            {withShowLogo && (
              <label className="flex items-start gap-2 text-sm" htmlFor={`${id}-show-logo`}>
                <input
                  id={`${id}-show-logo`}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={draft.showLogo === 'on'}
                  onChange={(e) => set('showLogo')(e.target.checked ? 'on' : null)}
                  disabled={busy}
                  data-testid={`${id}__show-logo`}
                />
                <span>
                  {ui('documentTemplatesShowLogo')}
                  <span className="block text-xs text-muted-foreground">{ui('documentTemplatesShowLogoHint')}</span>
                </span>
              </label>
            )}

            {withLogo && (
                <div className="flex flex-col gap-2">
                  <Label>{ui('documentTemplatesLogo')}</Label>
                  <div className="flex items-center gap-3">
                    {draft.logo && (
                      <img src={draft.logo} alt="" className="h-10 max-w-[8rem] rounded border object-contain" data-testid={`${id}__logo-image`} />
                    )}
                    <input ref={fileRef} type="file" accept={LOGO_TYPES.join(',')} className="hidden" onChange={pickLogo} data-testid={`${id}__logo-input`} />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy} data-testid={`${id}__logo-upload`}>
                      {ui('documentTemplatesLogoUpload')}
                    </Button>
                    {draft.logo && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => set('logo')(null)} disabled={busy} data-testid={`${id}__logo-remove`}>
                        {ui('documentTemplatesLogoRemove')}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{ui(withShowLogo ? 'documentTemplatesLogoHintList' : 'documentTemplatesLogoHint')}</p>
                </div>
            )}

            {withFooter && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-footer`}>{ui('documentTemplatesFooter')}</Label>
                  <textarea
                    id={`${id}-footer`}
                    className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    maxLength={MAX_FOOTER}
                    value={draft.footerText ?? ''}
                    onChange={(e) => set('footerText')(e.target.value === '' ? null : e.target.value)}
                    disabled={busy}
                    data-testid={`${id}__footer`}
                  />
                  <p className="text-xs text-muted-foreground">{ui('documentTemplatesFooterHint')}</p>
                </div>
            )}

            <Button onClick={save} disabled={busy || !dirty} data-testid={`${id}__save`}>
              {ui('documentTemplatesSave')}
            </Button>
          </CardContent>
        </Card>
        <div className="space-y-2" data-testid={`${id}__preview`}>
          <p className="text-sm font-medium">{ui('documentTemplatesPreviewTitle')}</p>
          <p className="text-xs text-muted-foreground">{ui('documentTemplatesPreviewHint')}</p>
          <Preview settings={draft} />
        </div>
      </div>
    </section>
  );
}

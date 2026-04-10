import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Mail, MessageCircle, FileText, ChevronUp, ExternalLink } from 'lucide-react';

const ICONS = { Mail, MessageCircle, FileText };

export default function SendOrderPanel({
  visible,
  supplier,
  grandTotal,
  lines,
  sendMethod,
  onSendMethodChange,
  onConfirm,
  onBack,
  methods,
}) {
  const ui = useUI();

  // Build WhatsApp message preview
  const whatsappPreview = supplier ? buildWhatsAppMessage(supplier, lines, grandTotal, ui) : '';
  const whatsappLink = supplier
    ? `https://wa.me/${supplier.phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(whatsappPreview)}`
    : '#';

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out"
      style={{
        maxHeight: visible ? '400px' : '0px',
        opacity: visible ? 1 : 0,
      }}
    >
      <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{ui('qpoSendOrder')}</span>
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronUp className="h-3 w-3" />
            {ui('qpoBackToCart')}
          </button>
        </div>

        {/* Send method toggle */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            {ui('qpoSendMethod')}
          </label>
          <div className="flex gap-2">
            {methods.map(m => {
              const Icon = ICONS[m.icon] || Mail;
              const isActive = sendMethod === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onSendMethodChange(m.id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-white text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {ui(m.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Method-specific content */}
        {sendMethod === 'email' && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground block">
              {ui('qpoEmailTo')}
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{supplier?.email || '—'}</span>
            </div>
            <p className="text-xs text-muted-foreground">{ui('qpoEmailTemplateHint')}</p>
          </div>
        )}

        {sendMethod === 'whatsapp' && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground block">
              {ui('qpoMessagePreview')}
            </label>
            <div className="rounded-lg border border-border bg-white p-3 text-xs text-muted-foreground whitespace-pre-line max-h-28 overflow-auto font-mono">
              {whatsappPreview}
            </div>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              <ExternalLink className="h-3 w-3" />
              {ui('qpoOpenWhatsApp')}
            </a>
          </div>
        )}

        {sendMethod === 'pdf' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{ui('qpoPDFHint')}</p>
          </div>
        )}

        {/* Confirm */}
        <Button className="w-full" onClick={onConfirm} disabled={!supplier}>
          {sendMethod === 'email' && ui('qpoSendEmail')}
          {sendMethod === 'whatsapp' && ui('qpoSendWhatsApp')}
          {sendMethod === 'pdf' && ui('qpoGeneratePDF')}
        </Button>
      </div>
    </div>
  );
}

function buildWhatsAppMessage(supplier, lines, total, ui) {
  let msg = `${ui('qpoWspGreeting')} ${supplier.name},\n\n`;
  msg += `${ui('qpoWspIntro')}\n\n`;
  for (const line of lines) {
    msg += `- ${line.product.name} x${line.qty} (${(line.qty * line.unitPrice).toFixed(2)} €)\n`;
  }
  msg += `\n${ui('qpoTotal')}: ${total.toFixed(2)} €\n\n`;
  msg += ui('qpoWspClosing');
  return msg;
}

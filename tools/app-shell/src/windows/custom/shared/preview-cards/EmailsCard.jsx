import { useUI } from '@/i18n';

function SectionCard({ title, titleRight, children }) {
  return (
    <div className="mx-4 mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
        {titleRight}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden px-4 py-2">
        {children}
      </div>
    </div>
  );
}

/**
 * EmailsCard — email history list + Send button link.
 *
 * Props:
 *   onSend   function — called when user clicks the "Send email" link
 */
export default function EmailsCard({ onSend }) {
  const ui = useUI();

  return (
    <SectionCard
      title={ui('previewCardEmails')}
      titleRight={
        <button
          onClick={onSend}
          className="text-xs font-medium text-gray-900 underline decoration-gray-600 hover:decoration-gray-900 transition-colors"
        >
          {ui('previewCardSendEmail')}
        </button>
      }
      data-testid="SectionCard__d50c04">
      <p className="text-xs text-gray-400 py-2 text-center">{ui('previewCardNoEmailHistory')}</p>
    </SectionCard>
  );
}

import { Button } from '@/components/ui/button.jsx';
import { useUI } from '@/i18n';
import FollowUpDocumentModal from './FollowUpDocumentModal.jsx';
import { useFollowUpDocuments } from './useFollowUpDocuments.js';

/**
 * ETP-5576 — topbar entry point of the generic follow-up flow ("Gestionar envío",
 * "Gestionar recepción", …). Meant for a detail view's `topbarRight` slot (primary
 * document-flow actions), so it receives that slot's props (`data`, `apiBaseUrl`,
 * `onRefresh`, `windowReadOnly`).
 *
 * - The button renders only while the backend annotation offers a configured follow-up
 *   (`data.followUp.available`), and never for a read-only window.
 * - The modal is ALWAYS mounted through the hook, independently of the button: it is also
 *   opened by a draftMode `afterProcess` prompt right after Confirm, and it must survive the
 *   record re-read that follows a creation (which empties `available`).
 * - After a creation it calls `onRefresh` (re-reads the record: the button disappears and
 *   the related documents pick up the new document) and dispatches
 *   `<spec>:document-created`.
 *
 * @param {object} props
 * @param {object|null} props.data        source record (topbar slot prop)
 * @param {string} props.apiBaseUrl       spec-scoped NEO base (topbar slot prop)
 * @param {string} props.spec             source spec, e.g. 'sales-invoice'
 * @param {string} [props.entity='header']
 * @param {Object<string, object>} props.options per-key config, see FollowUpDocumentModal
 * @param {object} [props.summary]        summary config, see FollowUpDocumentModal
 * @param {string} [props.titleKey]       modal title when several follow-ups are offered
 * @param {string} [props.questionKey]    question above the option(s), see FollowUpDocumentModal
 * @param {string} [props.buttonLabelKey] button label when several follow-ups are offered
 * @param {() => void} [props.onRefresh]  re-read the source record (topbar slot prop)
 * @param {boolean} [props.windowReadOnly]
 */
export default function FollowUpDocumentButton({
  data, apiBaseUrl, spec, entity = 'header', options, summary, titleKey, questionKey, buttonLabelKey,
  onRefresh, windowReadOnly = false,
}) {
  const ui = useUI();
  const { entries, session, open, close, create } = useFollowUpDocuments({
    apiBaseUrl, spec, entity, record: data, options, onCreated: () => onRefresh?.(),
  });

  const showButton = !windowReadOnly && entries.length > 0;
  const single = entries.length === 1 ? options[entries[0].key] : null;
  const label = (single?.buttonLabelKey && ui(single.buttonLabelKey))
    || (buttonLabelKey && ui(buttonLabelKey))
    || ui('followUpManageButton');

  return (
    <>
      {showButton && (
        <Button
          type="button"
          size="default"
          data-testid="follow-up-document-button"
          data-follow-up-keys={entries.map(e => e.key).join(',')}
          onClick={() => open()}
        >
          {label}
        </Button>
      )}
      <FollowUpDocumentModal
        session={session}
        options={options}
        summary={summary}
        titleKey={titleKey}
        questionKey={questionKey}
        onClose={close}
        onCreate={create}
        data-testid="FollowUpDocumentModal__e212d2" />
    </>
  );
}

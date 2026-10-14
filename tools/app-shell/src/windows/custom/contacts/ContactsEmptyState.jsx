import { useCallback } from 'react';
import { GraduationCap, Plus, Sparkles } from 'lucide-react';
import { ImportDropzone } from '@etendosoftware/app-shell-core/components/import/ImportDropzone.jsx';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button.jsx';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { useCopilotOptional } from '@/components/CopilotContext.jsx';
import { useLaunchWalkthrough } from '@/lib/walkthrough/useLaunchWalkthrough.js';

/** The guided tutorial the "Ver guía" link launches (`walkthrough/flows/create-contact.json`). */
const CREATE_CONTACT_FLOW_ID = 'create-contact';

/** Telemetry `source` of a tutorial started from here (the topbar launcher reports `'launcher'`). */
const WALKTHROUGH_SOURCE = 'contacts_empty_state';

/**
 * Full-area "start here" state of the Contacts list, shown INSTEAD of the grid when the user
 * has no contacts at all (ListView's `emptyListContext`, see `ContactsTable`). A filtered or
 * subset-empty list never gets here. From top to bottom (Figma):
 *
 *  - a drop zone: dropping or picking a file opens the window's own import dialog with that
 *    file already loaded (`context.onImport(file)` → ImportDialog `initialFile`);
 *  - title + subtitle;
 *  - "Pídeselo a Copilot" (opens — never toggles closed — the Copilot panel) and
 *    "Nuevo contacto" (the list's own New action, `context.onCreate`);
 *  - a banner whose "Ver guía" link starts the `create-contact` guided tutorial exactly as the
 *    topbar "Tutoriales guiados" menu does.
 *
 * Every entry point renders only when it can work: no import → no drop zone, read-only window →
 * no New button, no Copilot provider → no Copilot button, no tutorial → no banner.
 *
 * @param {{ context: { onCreate?: () => void, onImport?: (file?: File) => void, importFormats?: string[] } }} props
 */
export default function ContactsEmptyState({ context }) {
  const ui = useUI();
  const copilot = useCopilotOptional();
  const { canLaunch, launch } = useLaunchWalkthrough(WALKTHROUGH_SOURCE);
  const { onCreate, onImport, importFormats } = context ?? {};

  const handleViewGuide = useCallback(() => launch(CREATE_CONTACT_FLOW_ID), [launch]);

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-10"
      data-testid="contacts-empty-state"
    >
      {onImport && (
        <div className="w-full" data-testid="contacts-empty-state-dropzone">
          <ImportDropzone
            formats={importFormats}
            onFileSelected={onImport}
            labels={{ dropHere: ui('attachmentsDropHere'), dropHint: ui('importDropHintFormats') }}
            data-testid="ImportDropzone__contactsEmpty" />
        </div>
      )}

      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-xl font-semibold leading-7 text-foreground">{ui('contactsEmptyTitle')}</h2>
        <p className="text-sm text-muted-foreground">{ui('contactsEmptySubtitle')}</p>
      </div>

      {(copilot || onCreate) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {copilot && (
            <Button
              type="button"
              variant="outline"
              onClick={copilot.open}
              className="gap-1.5"
              data-testid="contacts-empty-state-copilot"
            >
              <Sparkles className="h-4 w-4" data-testid="Sparkles__contactsEmpty" />
              {ui('askCopilot')}
            </Button>
          )}
          {onCreate && (
            <Button
              type="button"
              onClick={onCreate}
              className="gap-1.5"
              data-testid="contacts-empty-state-new"
            >
              <Plus className="h-4 w-4" data-testid="Plus__contactsEmpty" />
              {ui('newContact')}
            </Button>
          )}
        </div>
      )}

      {canLaunch(CREATE_CONTACT_FLOW_ID) && (
        <InfoBanner
          icon={GraduationCap}
          dismissible={false}
          className="w-full"
          data-testid="contacts-empty-state-guide"
        >
          {ui('contactsEmptyGuideBanner')}{' '}
          <button
            type="button"
            onClick={handleViewGuide}
            className="font-semibold underline underline-offset-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            data-testid="contacts-empty-state-view-guide"
          >
            {ui('viewGuide')}
          </button>
        </InfoBanner>
      )}
    </div>
  );
}

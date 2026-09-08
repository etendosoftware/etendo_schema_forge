import React from 'react';
import { FileQuestion, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { useUI } from '@/i18n';

/**
 * ETP-5034 — full-pane state for a detail route whose record could not be loaded.
 *
 * Before this existed, `useEntity.fetchById` swallowed both outcomes and the detail route rendered
 * a blank form that is visually indistinguishable from the creation form, so a user following a
 * dead link believed they were editing a record while actually being one Save away from creating
 * a junk one — and a permissions problem looked like an empty record.
 *
 * The copy says "record", never "document": every window goes through `DetailView`, including
 * plain master data (product, warehouse, tax, price-list, business-partner) where "document" would
 * simply be wrong.
 *
 * Only TWO variants exist on purpose. NEO answers a GET by id for a non-existent record, a record
 * the role/organization cannot see, and a malformed id with the exact same HTTP 200 +
 * `{"response":{"data":[],"status":0}}` — there is no 403 and no 404 in `NeoCrudHandler`'s read
 * path to tell them apart (the MCP layer synthesizes its own 404 from this very shape;
 * see `McpToolRouterSupport.buildNotFoundError`, IMP-5). Inventing a distinct "no permissions"
 * screen would therefore be a guess shown to the user as a fact, so `notFound` states both
 * possibilities in one message. `error` is the genuinely different case: the request itself failed.
 *
 * @param {object} props component props
 * @param {'notFound'|'error'} [props.variant] which message to render (defaults to 'notFound')
 * @param {Function} props.onBack invoked by the primary action; should navigate to the list
 * @param {string} [props['data-testid']] root test id; defaults to the stable `record-unavailable`
 *   selector every consumer can rely on. Declared explicitly rather than spread from rest props so
 *   a caller's value actually reaches the DOM (it previously did not).
 * @returns {JSX.Element} the error pane
 */
export default function RecordUnavailable({
  variant = 'notFound',
  onBack,
  'data-testid': testId = 'record-unavailable',
}) {
  const ui = useUI();
  const isTransportError = variant === 'error';
  const Icon = isTransportError ? WifiOff : FileQuestion;

  return (
    <div
      className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-8 text-center"
      data-testid={testId}
      data-variant={variant}
    >
      <Icon className="h-10 w-10 text-muted-foreground" aria-hidden="true" data-testid="record-unavailable-icon" />
      <h2 className="text-base font-semibold text-foreground">
        {isTransportError ? ui('recordLoadFailedTitle') : ui('recordNotFoundTitle')}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {isTransportError ? ui('recordLoadFailedBody') : ui('recordNotFoundBody')}
      </p>
      {onBack && (
        <Button className="mt-2" onClick={onBack} data-testid="record-unavailable-back">
          {ui('backToList')}
        </Button>
      )}
    </div>
  );
}

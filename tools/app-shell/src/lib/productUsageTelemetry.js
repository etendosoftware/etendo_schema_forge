import { track } from '@/lib/observability.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from '@/lib/observability/events.js';

const PRODUCT_USAGE_CATEGORY = 'product_usage';

function send(eventDefinition, properties = {}) {
  const event = buildObservabilityEvent(eventDefinition, {
    category: PRODUCT_USAGE_CATEGORY,
    ...properties,
  });

  if (!event.name) return;
  Promise.resolve(track(event.name, event.properties)).catch(() => {});
}

export function trackWindowOpened(properties = {}) {
  send(OBSERVABILITY_EVENTS.WINDOW_OPENED, {
    source: 'contract_ui',
    ...properties,
  });
}

export function trackSearchPerformed(properties = {}) {
  send(OBSERVABILITY_EVENTS.SEARCH_PERFORMED, {
    source: 'list_filter',
    type: 'filter',
    attempt: 1,
    ...properties,
  });
}

export function trackSearchResultSelected(properties = {}) {
  send(OBSERVABILITY_EVENTS.SEARCH_RESULT_SELECTED, {
    source: 'table',
    type: 'filter',
    ...properties,
  });
}

export function trackRecordCreated(properties = {}) {
  send(OBSERVABILITY_EVENTS.RECORD_CREATED, {
    source: 'detail_view',
    operation: 'create',
    value: 1,
    ...properties,
  });
}

export function trackRecordUpdated(properties = {}) {
  send(OBSERVABILITY_EVENTS.RECORD_UPDATED, {
    source: 'detail_view',
    operation: 'update',
    value: 1,
    ...properties,
  });
}

export function trackDocumentCompleted(properties = {}) {
  send(OBSERVABILITY_EVENTS.DOCUMENT_COMPLETED, {
    source: 'detail_view',
    operation: 'complete',
    value: 1,
    ...properties,
  });
}

export function isCompletionProcess(process = {}) {
  const tokens = [
    process?.columnName,
    process?.name,
    process?.key,
    process?.label,
  ].filter(Boolean).map(value => String(value).toLowerCase());

  return tokens.some(value => (
    value === 'docaction'
    || value.includes('complete')
    || value.includes('confirm')
  ));
}

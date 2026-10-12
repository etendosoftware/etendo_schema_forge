// ETP-5576 — generic follow-up documents flow (see followUpDocuments.js for the contract).
export { default as FollowUpDocumentButton } from './FollowUpDocumentButton.jsx';
export { default as FollowUpDocumentModal } from './FollowUpDocumentModal.jsx';
export { useFollowUpDocuments } from './useFollowUpDocuments.js';
export {
  FOLLOW_UP_PROMPT_EVENT,
  FOLLOW_UP_PROMPT_TTL_MS,
  FOLLOW_UP_ERROR_KEYS,
  buildFollowUpActionUrl,
  consumeFollowUpPrompt,
  createFollowUpAfterProcess,
  followUpErrorMessage,
  hasPendingFollowUp,
  readConfiguredFollowUpEntries,
  readCreatedDocument,
  readFollowUpEntries,
  requestFollowUpPrompt,
} from './followUpDocuments.js';

// ETP-4315 / ETP-5588 — the record's "main" Attachment (C_File) is bound to the table of the
// window's primary entity, read from its generated contract (backendContract.window.primaryEntity),
// the same metadata the backend's signed download link reads. No window is listed anywhere.
// Plain module (no Vite APIs) so Node tooling such as cli/test/stress can use it too.
export function attachmentTableOf(contract) {
  const backend = (contract?.default ?? contract)?.backendContract;
  const primaryEntity = backend?.window?.primaryEntity;
  return (primaryEntity && backend?.entities?.[primaryEntity]?.tableName) || null;
}

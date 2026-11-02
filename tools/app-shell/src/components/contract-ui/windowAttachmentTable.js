import { attachmentTableOf } from './attachmentTable.js';

// Vite-only (import.meta.glob): loaded lazily by documentEmailSend.js when the caller did not pass
// the table, so the email helpers stay importable from plain Node.
const windowContractLoaders = Object.entries(import.meta.glob('@generated/*/contract.json'));

export async function resolveAttachmentTable(specName) {
  const entry = windowContractLoaders.find(([path]) => path.split('/').at(-2) === specName);
  if (!entry) return null;
  return attachmentTableOf(await entry[1]());
}

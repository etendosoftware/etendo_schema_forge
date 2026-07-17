import { sendDocumentEmail } from '../../../../tools/app-shell/src/components/contract-ui/documentEmailSend.js';

export async function run({
  workers,
  documentId,
  windowName,
  baseUrl,
  token,
  pdfBlob,
  timeoutMs,
  workerContext
}) {
  const promises = [];

  for (let i = 0; i < workers; i++) {
    const workerPromise = (async () => {
      const startTime = Date.now();
      const ctx = {
        workerIndex: i,
        documentId,
        previewCacheStatus: null,
        previewCacheError: null,
        sendEmailStatus: null,
        sendEmailBody: null,
        sendEmailError: null,
      };

      try {
        await workerContext.run(ctx, async () => {
          await sendDocumentEmail({
            apiBaseUrl: `${baseUrl}/sws/neo/dummy`, // resolves to `${baseUrl}/sws/neo`
            token,
            documentId,
            windowName,
            pdfBlob,
          });
        });
        const latency = Date.now() - startTime;
        return {
          workerIndex: i,
          success: true,
          latency,
          ctx,
        };
      } catch (error) {
        const latency = Date.now() - startTime;
        return {
          workerIndex: i,
          success: false,
          error,
          latency,
          ctx,
        };
      }
    })();
    promises.push(workerPromise);
  }

  const results = await Promise.allSettled(promises);
  return results.map(r => r.value);
}

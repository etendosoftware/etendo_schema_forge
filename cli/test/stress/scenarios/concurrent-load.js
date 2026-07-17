import { sendDocumentEmail } from '../../../../tools/app-shell/src/components/contract-ui/documentEmailSend.js';

export async function run({
  workers,
  documentIds,
  windowName,
  baseUrl,
  token,
  pdfBlob,
  delayMs,
  timeoutMs,
  workerContext
}) {
  const promises = [];

  if (documentIds.length < workers) {
    console.warn(
      `[concurrent-load] Warning: ${documentIds.length} document IDs for ${workers} workers — IDs will cycle. Use --count ${workers} or provide ${workers} distinct IDs for a valid load test.`
    );
  }

  for (let i = 0; i < workers; i++) {
    const delay = i * delayMs;
    const documentId = documentIds[i % documentIds.length];

    const workerPromise = (async () => {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

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

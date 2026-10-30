type HttpAdapterLike = {
  get(path: string, handler: (req: unknown, res: { setHeader(name: string, value: string): unknown; json(body: unknown): unknown }) => unknown): unknown;
};

/**
 * Serves the generated OpenAPI document on both public paths. The document is
 * deployment content that changes with each regeneration, so `no-cache` makes
 * clients (Scalar included) revalidate with the ETag Express already sends
 * instead of keeping an older contract, without giving up conditional requests.
 */
export function registerOpenApiRoutes(adapter: HttpAdapterLike, document: unknown): void {
  const serve = (_req: unknown, res: { setHeader(name: string, value: string): unknown; json(body: unknown): unknown }) => {
    res.setHeader('Cache-Control', 'no-cache');
    return res.json(document);
  };
  adapter.get('/api/v1/openapi.json', serve);
  adapter.get('/api/openapi.json', serve);
}

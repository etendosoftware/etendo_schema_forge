import {
  BadGatewayException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  PUBLIC_API_SCHEMA,
  PublicApiKeyGuard,
  filterOutboundRecord,
  type PublicApiSchema,
} from '@etendosoftware/api-gateway-core';

@Controller()
@UseGuards(PublicApiKeyGuard)
export class PublicApiController {
  constructor(
    @Inject(PUBLIC_API_SCHEMA) private readonly schema: PublicApiSchema,
    // @Optional(): neither param has a registered provider (they're plain
    // string/function values, not DI tokens) — without it Nest tries to
    // resolve them anyway and throws, since a JS default parameter value only
    // applies when the argument is `undefined`, not merely absent (ETP-5345).
    @Optional() private readonly neoBaseUrl: string = process.env.NEO_BASE_URL ?? 'http://localhost:8080/etendo',
    @Optional() private readonly fetchImpl: typeof fetch = fetch
  ) {}

  @Get(':entityName')
  async list(@Param('entityName') entityName: string, @Req() req: { neoJwt: string }) {
    const entity = this.schema.entities[entityName];
    if (!entity) throw new NotFoundException(`Unknown public entity: ${entityName}`);
    const response = await this.fetchImpl(`${this.neoBaseUrl}/sws/neo/${entity.specName}/${entityName}`, {
      headers: { Authorization: `Bearer ${req.neoJwt}` },
    });
    if (!response.ok) {
      // NeoServlet's error envelope is { error: { message, status } }, not
      // { response: { data } } — assuming the success shape here throws on
      // undefined, and NestJS turns that into an opaque 500 that hides
      // NeoServlet's real (possibly entirely correct) answer (ETP-5345).
      const errorBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = errorBody?.error?.message ?? `NeoServlet request failed with status ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(message);
      }
      throw new BadGatewayException(message);
    }
    const json = (await response.json()) as { response: { data: Record<string, unknown>[] } };
    return json.response.data.map((record) => filterOutboundRecord(entity, record));
  }
}

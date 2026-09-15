import { Controller, Get, Inject, NotFoundException, Optional, Param, Req, UseGuards } from '@nestjs/common';
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
    const json = (await response.json()) as { response: { data: Record<string, unknown>[] } };
    return json.response.data.map((record) => filterOutboundRecord(entity, record));
  }
}

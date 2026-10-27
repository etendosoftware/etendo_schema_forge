import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { rateLimitConfig } from './public-api/public-api-throttler.guard.ts';
import { PublicApiController } from './public-api/public-api.controller.ts';
import { schemaProvider } from './schema/schema.provider.ts';
import { TokenExchangeService, CachedTokenExchangeService, PublicApiKeyGuard } from '@etendosoftware/api-gateway-core';

@Module({
  imports: [ThrottlerModule.forRoot([rateLimitConfig()])],
  controllers: [PublicApiController],
  providers: [
    schemaProvider,
    { provide: TokenExchangeService, useFactory: () => new TokenExchangeService(process.env.NEO_BASE_URL ?? 'http://localhost:8080/etendo') },
    { provide: CachedTokenExchangeService, useFactory: (t: TokenExchangeService) => new CachedTokenExchangeService(t), inject: [TokenExchangeService] },
    { provide: PublicApiKeyGuard, useFactory: (c: CachedTokenExchangeService) => new PublicApiKeyGuard(c), inject: [CachedTokenExchangeService] },
  ],
})
export class AppModule {}

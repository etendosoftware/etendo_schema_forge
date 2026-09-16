import { readFileSync } from 'node:fs';
import type { PublicApiSchema } from '@etendosoftware/api-gateway-core';
import { PUBLIC_API_SCHEMA } from '@etendosoftware/api-gateway-core';

export const schemaProvider = {
  provide: PUBLIC_API_SCHEMA,
  useFactory: (): PublicApiSchema => {
    const path = process.env.PUBLIC_API_SCHEMA_PATH ?? '../public-api/base.v1.json';
    return JSON.parse(readFileSync(path, 'utf-8'));
  },
};

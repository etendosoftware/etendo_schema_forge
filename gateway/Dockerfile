FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY gateway/package.json ./package.json
COPY gateway/tsconfig.json ./tsconfig.json
COPY gateway/src ./src
COPY .schema_forge_core/packages/api-gateway-core /tmp/api-gateway-core
RUN npm install --include=dev --prefix /tmp/api-gateway-core \
  && npm install --include=dev --no-save --prefix /tmp/api-gateway-core @types/node \
  && npm run build --prefix /tmp/api-gateway-core \
  && cd /tmp/api-gateway-core \
  && npm pack --pack-destination /tmp
RUN npm install --omit=dev /tmp/etendosoftware-api-gateway-core-0.1.0.tgz
RUN npm install --no-save @nestjs/cli typescript
RUN npm run build

FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV GATEWAY_PORT=4300
ENV PUBLIC_API_SCHEMA_PATH=/app/public-api/base.v1.json
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY public-api ./public-api
COPY gateway/public ./public

EXPOSE 4300
USER node
CMD ["node", "dist/main.js"]

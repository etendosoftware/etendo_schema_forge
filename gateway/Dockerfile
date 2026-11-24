FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY gateway/package.json ./package.json
COPY gateway/tsconfig.json ./tsconfig.json
COPY gateway/src ./src
# The token is a BuildKit secret and never becomes an image layer.
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true \
    npm install --include=dev --no-audit --no-fund
RUN npm run build && npm prune --omit=dev

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

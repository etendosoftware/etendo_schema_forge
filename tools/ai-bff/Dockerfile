FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV BFF_PORT=3400
EXPOSE 3400

CMD ["node", "src/server.js"]

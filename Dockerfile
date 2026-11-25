# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS test-base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Runs the test suite inside the container environment (Node 22 / Debian bookworm).
FROM test-base AS test
COPY app.js ai.js config.js ./
COPY test ./test
RUN npm test

# `docker build --target coverage -o coverage-container .` copies the report out.
FROM scratch AS coverage
COPY --from=test /app/coverage /

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json app.js ai.js config.js ./
RUN mkdir -p /app/public && chown node:node /app/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "require('net').connect(3000,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"]
CMD ["node", "app.js"]

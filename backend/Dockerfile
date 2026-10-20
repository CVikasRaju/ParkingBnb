# syntax=docker/dockerfile:1
#
# Targets:
#   runtime  (default) — the API
#   worker             — the overstay sweep, meant to run as ONE replica
#   migrate            — one-shot `node db/migrate.ts` runner for deploys
#
# The migrate target never ships to production traffic; it exists because the
# runner is TypeScript and needs `tsx`, which the runtime image (built with
# `--omit=dev`) does not have.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
COPY db ./db
RUN npm run build

# Migrations: keeps the compiler + tsx from the build stage on purpose.
FROM build AS migrate
CMD ["npx", "tsx", "db/migrate.ts"]

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db

# Never run the API as root: a compromised process should not own the image.
# (`node` is the unprivileged user the official image already ships.)
USER node

EXPOSE 8080

# Liveness only — /health/ready touches Postgres and Redis, and a healthcheck
# that flaps on a slow query would restart healthy containers.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health/live').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]

# Same code, different entrypoint: run exactly one of these.
FROM runtime AS worker
CMD ["node", "dist/workers/overstayWorker.js"]

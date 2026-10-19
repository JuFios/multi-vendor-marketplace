# syntax=docker/dockerfile:1.7
# Build context: repository root.

FROM node:24-alpine AS base
WORKDIR /repo

# Install dependencies from the lockfile only, so this layer is reused until a dependency changes.
# Lifecycle scripts are skipped (the Prisma client is generated after the sources are copied);
# the Prisma engines are fetched explicitly.
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --workspace apps/api --include-workspace-root \
    && npm rebuild @prisma/engines

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN npm run prisma:generate -w apps/api && npm run build -w apps/api

# One-shot job: applies migrations and seeds. Needs the Prisma CLI and tsx
# (dev dependencies), so it keeps the full build tree.
FROM build AS migrate
USER node
WORKDIR /repo/apps/api
CMD ["sh", "-c", "npm run db:deploy && npm run db:seed"]

FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --workspace apps/api

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
# The same layout as in the repository: npm may place a dependency in the workspace's own
# node_modules instead of the root one.
COPY --from=prod-deps --chown=node:node /repo/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /repo/apps/api/ ./
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD ["sh", "-c", "wget -qO- http://127.0.0.1:${PORT:-3000}/api/health || exit 1"]
CMD ["node", "dist/main.js"]

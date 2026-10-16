# syntax=docker/dockerfile:1.7
# Build context: repository root.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Keep in sync with `packageManager` in package.json.
ARG PNPM_VERSION=10.26.1
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /repo

# Resolve and download dependencies from the lockfile only, so this layer is
# reused until a dependency changes.
FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch

FROM fetch AS build
COPY package.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter api... --filter @marketplace/shared...
RUN pnpm --filter @marketplace/shared build \
    && pnpm --filter api prisma:generate \
    && pnpm --filter api build

# One-shot job: applies migrations and seeds. Needs the Prisma CLI and tsx
# (dev dependencies), so it keeps the full build tree.
FROM build AS migrate
USER node
WORKDIR /repo/apps/api
CMD ["sh", "-c", "pnpm db:deploy && pnpm db:seed"]

FROM build AS prune
RUN pnpm --filter api deploy --prod --legacy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune --chown=node:node /out/package.json ./package.json
COPY --from=prune --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1
CMD ["node", "dist/main.js"]

# syntax=docker/dockerfile:1.7
# Build context: repository root.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Keep in sync with `packageManager` in package.json.
ARG PNPM_VERSION=10.26.1
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /repo

FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch

FROM fetch AS build
COPY package.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter web... --filter @marketplace/shared...
RUN pnpm --filter @marketplace/shared build && pnpm --filter web build

FROM nginx:alpine AS runtime
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

# syntax=docker/dockerfile:1.7
# Build context: repository root.

FROM node:24-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --workspace apps/web --include-workspace-root

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginx:alpine AS runtime
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD ["sh", "-c", "wget -qO- http://127.0.0.1/ >/dev/null || exit 1"]

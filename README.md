# Multi-Vendor Marketplace

A multi-vendor marketplace with real-time inventory.

This README is a placeholder; the full documentation is added later.

## Requirements

- Node.js 24+
- pnpm 10+
- Docker with Compose v2

## Run the whole stack in Docker

```bash
docker compose up --build
```

No `.env` file is needed; every variable has a default. Once all services are healthy:

| What                                         | Where                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Web (nginx, proxies `/api` and `/socket.io`) | http://localhost:8080                                                    |
| API liveness / readiness                     | http://localhost:3000/api/health, http://localhost:3000/api/health/ready |
| Meilisearch                                  | http://localhost:7700/health                                             |

The one-shot `migrate` service applies Prisma migrations and the seed before `api` and `worker` start.

## Local development

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis meilisearch
pnpm --filter api db:migrate
pnpm --filter api dev          # HTTP API on http://localhost:3000/api/health
pnpm --filter api dev:worker   # background worker
pnpm --filter web dev          # web app on http://localhost:5173
```

### Configuration profiles

Configuration is validated at startup; a missing or malformed variable stops the process with a list of the offending names. Files are read from the repository root, highest priority first: `.env.<NODE_ENV>.local`, `.env.<NODE_ENV>`, `.env`. Variables already set in the process environment win over all files.

- `.env.example` documents the development profile (copy it to `.env`).
- `.env.test` is the committed test profile: database `marketplace_test`, Redis database 1, Meilisearch index prefix `test_`. Jest sets `NODE_ENV=test`, so it is picked up automatically.

The `marketplace_test` database is created by `infra/postgres/init/01-create-test-db.sql` the first time the Postgres volume is initialised. On an existing volume create it once by hand:

```bash
docker compose exec postgres createdb -U marketplace marketplace_test
```

### Database commands

```bash
pnpm --filter api db:migrate   # create and apply a migration in development
pnpm --filter api db:deploy    # apply existing migrations
pnpm --filter api db:reset     # drop, re-apply and re-seed
pnpm --filter api db:seed
pnpm --filter api db:studio
```

## Checks

```bash
docker compose up -d postgres redis meilisearch   # required by the e2e tests
pnpm lint && pnpm typecheck && pnpm test && pnpm --filter api test:e2e && pnpm build
```

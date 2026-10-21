# Multi-Vendor Marketplace

A multi-vendor marketplace with real-time inventory.

This README is a placeholder; the full documentation is added later.

## Requirements

- Node.js 24+
- npm 11+
- Docker with Compose

## Quick start

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis meilisearch
npm run db:migrate -w apps/api   # apply migrations
npm run dev -w apps/api          # HTTP API on http://localhost:3000/api/health
npm run dev:worker -w apps/api   # background worker
npm run dev -w apps/web          # web app on http://localhost:5173
```

The whole stack, including the web app on http://localhost:8080, starts without any
configuration:

```bash
docker compose up --build
```

## Configuration

Variables are validated at start-up; a missing or invalid one stops the process. Files are read
from the repository root, highest priority first: `.env.<NODE_ENV>.local`, `.env.<NODE_ENV>`,
`.env`. Values already present in the process environment always win. `.env.example` documents
every variable (development profile); `.env.test` is the test profile used by the e2e tests and CI.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e -w apps/api && npm run build
```

## Known limitations

- `outbox_events`, `processed_events` and `idempotency_keys` are append-only: nothing prunes
  them, so they grow with traffic. A long-running deployment needs a retention job.

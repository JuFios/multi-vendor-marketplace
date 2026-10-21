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

## Load test

Two [k6](https://k6.io) scenarios run against the full compose stack, followed by a check of the
invariants in the database. Full details, environment and the analysis are in
[`load/REPORT.md`](load/REPORT.md).

```bash
npm run load:up        # starts the stack with the load profile (higher rate limits, see below)
npm run load:seed      # buyers, an auction and a limited-stock product
npm run load:bids      # 50 -> 200 VUs bidding on one auction, about 3 minutes
npm run load:checkout  # 500 buyers check out a product with a stock of 100
npm run load:verify    # invariants and metrics after the runs
```

The load profile (`docker-compose.load.yml`) lifts the rate limits and the access-token lifetime
only; production keeps the strict limits from `.env.example`. Results of one run on an Apple M1
laptop (Docker Desktop VM with 8 CPUs and 8 GB; k6 and the stack on the same machine):

| Scenario                | Load                 | Throughput                            | Latency                                | Unexpected errors | Business outcome                                 |
| ----------------------- | -------------------- | ------------------------------------- | -------------------------------------- | ----------------- | ------------------------------------------------ |
| Bids on one auction     | 50 -> 200 VUs, 3 min | 631 bid requests/s                    | p50 120 ms, p95 207 ms, p99 245 ms     | 0                 | 2 581 bids accepted, 111 194 rejected as too low |
| Checkout, limited stock | 500 VUs at once      | 182 checkout requests/s (2.7 s burst) | p50 557 ms, p95 1 307 ms, p99 1 318 ms | 0                 | exactly 100 orders, 400 refused for stock        |

After the runs all invariants held: no negative stock, no oversold unit, no lost bid update, ledger
sums equal payouts, and nothing dead-lettered. During the bid run the `bid_optimistic_retries_total`
metric counted 51 194 retries of the optimistic lock. The report also covers a finding and what to
improve.

## Known limitations

- `outbox_events`, `processed_events` and `idempotency_keys` are append-only: nothing prunes
  them, so they grow with traffic. A long-running deployment needs a retention job.

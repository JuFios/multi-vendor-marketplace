# Load test report

Two scenarios against the full docker-compose stack, driven by k6. Every figure below comes from the
runs described here; the raw k6 summaries and the verification output are written to
`load/results/` (git-ignored) when you repeat them (see "How to reproduce").

## Environment

| Item           | Value                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Host           | Apple M1 (8 cores), 16 GB RAM, macOS 15.1                                                                                   |
| Docker         | Docker Desktop 29.1, VM with 8 CPUs and 8 GB RAM                                                                            |
| Stack          | `docker-compose.yml` + `docker-compose.load.yml`: api, worker, web, PostgreSQL 17, Redis 7, Meilisearch 1.55                |
| Load generator | `grafana/k6:2.3.0` in a container on the same Docker network, hitting the api directly (`http://api:3000`), bypassing nginx |
| Data           | Fresh database (`down -v`), demo seed, then `load/seed-load.ts`                                                             |

The load generator and the stack share one machine, so both compete for the same CPUs: absolute numbers
are lower than a dedicated load generator on separate hardware would show.

### Load profile

The default rate limits (100 requests per minute per address, 10 bids per 10 s per user, 5 logins
per minute) would throttle a single load generator, which looks like one very busy client. The
`docker-compose.load.yml` profile raises every `THROTTLE_*` limit to 1 000 000 and extends the
access-token lifetime to one hour, nothing else. Production keeps the strict limits from `.env.example`.
The rate limits themselves are covered by the e2e tests, not by this run.

## Scenario 1: many bidders on one auction (`load/bids.js`)

- 500 buyers exist; each VU is one of them. One auction: start price 100.00, step 1.00, ending 10 minutes after the seed.
- Ramping VUs: 50 → 200 over 1 minute, then 200 held for 2 minutes (3 minutes in total).
- Each iteration: read the auction snapshot (`GET /api/auctions/:id`), then bid exactly the advertised
  `minNextBidCents` (`POST /api/auctions/:id/bids` with a fresh `Idempotency-Key`), then pause 50–200 ms.
- All VUs read the same snapshot, so almost every bid collides with a bid that was accepted a moment earlier. This
  is deliberately the worst case for the optimistic lock.
- `409` and `422` are expected business answers; only other responses count as failures.

| Metric                                                   | Result                               |
| -------------------------------------------------------- | ------------------------------------ |
| Duration                                                 | 180.2 s                              |
| Total HTTP requests                                      | 227 550 (1 262 req/s)                |
| Bid requests                                             | 113 775 (**631 req/s**)              |
| Bid latency p50 / p95 / p99 / max                        | 119.6 / **206.7** / 244.8 / 594.3 ms |
| Snapshot latency p50 / p95 / p99 / max                   | 29.0 / 46.1 / 60.4 / 369.3 ms        |
| Unexpected responses                                     | **0** (0.00%)                        |
| Bids accepted (201)                                      | 2 581 (14.3 per second)              |
| Bids rejected, too low (422)                             | 111 194                              |
| Bid conflicts surfaced to clients (409)                  | 0                                    |
| Optimistic-lock retries (`bid_optimistic_retries_total`) | 51 194                               |

Thresholds (`p95 < 300 ms` for bids and snapshots, unexpected responses `< 1%`, no unexpected bid
responses) all passed.

How to read it:

- 97.7% of the bids were `BID_TOO_LOW`: by the time a VU's bid reached the server another VU had already
  moved the price. That is the expected result of the scenario, not a fault.
- The optimistic lock was hit 51 194 times (about 0.45 retries per bid) and the three allowed attempts
  always sufficed: no client saw `BID_CONFLICT`.
- An earlier, otherwise identical run (same stack, before the final clean run) gave p95 206.7 ms vs 220.5 ms and
  2 414 accepted bids vs 2 581, so the two runs differ by about 7% on these figures. Both were single runs.

## Scenario 2: many buyers, limited stock (`load/checkout.js`)

- 500 buyers, each in its own VU, all released at the same moment (one iteration per VU).
- A published fixed-price product with a stock of 100. Each buyer adds one unit to the cart, then checks out
  (`POST /api/orders/checkout` with a fresh `Idempotency-Key`).
- `409` is the expected answer once the stock is gone. The threshold requires **exactly 100** successful checkouts.

| Metric                                                          | Result                                     |
| --------------------------------------------------------------- | ------------------------------------------ |
| Duration                                                        | 2.7 s                                      |
| Checkout requests                                               | 500 (182 req/s over the burst)             |
| Checkout latency p50 / p95 / p99 / max                          | 556.8 / **1 307.3** / 1 317.5 / 1 319.4 ms |
| Add-to-cart latency p50 / p95 / p99 / max                       | 1 171.5 / 2 330.6 / 2 354.0 / 2 371.4 ms   |
| Unexpected responses                                            | **0** (0.00%)                              |
| Checkouts succeeded (201)                                       | **100**                                    |
| Checkouts refused, out of stock (409)                           | 400                                        |
| of which refused by the pre-check (`CART_ITEMS_UNAVAILABLE`)    | 391                                        |
| of which lost the atomic stock decrement (`INSUFFICIENT_STOCK`) | 9                                          |

The scenario is a single burst of under three seconds: the request rate describes the burst, not sustained throughput.
Because 500 requests arrive at once, the latencies mostly reflect how long they wait their turn, not the cost of
one checkout.

## Invariants after the runs (`load/verify.ts`)

All 20 checks passed (database state read directly, after waiting for the outbox and payments to drain, which
took 168 ms in the first verification after the runs):

- No product has negative stock; the limited-stock product ended at 0 with 100 units in orders and exactly 100 seller orders.
- One order per buyer (no buyer was charged twice); order totals equal the sum of their seller orders.
- Commission (round half up) and payout are consistent on every seller order; the ledger of every seller order
  sums to its payout; every payment was captured.
- Auction: the stored bid count and version equal the number of stored bids; all accepted amounts are distinct,
  the first reaches the start price, every raise is at least the step; bids ordered by time are ordered by
  amount (no lost update); the stored leader is the highest bid; there is exactly one `auction.bid_placed` event per bid.
- The counts k6 observed (2 581 accepted bids, 100 successful checkouts) equal the rows in the database.
- No queue job was dead-lettered and none was left waiting (worker metrics).

Metrics read from the api's `/metrics` after the runs: `bids_placed_total` 2 581, `bids_rejected_total{reason="BID_TOO_LOW"}`
111 194, `bid_optimistic_retries_total` 51 194, `orders_created_total` 100, `checkout_failures_total`
`CART_ITEMS_UNAVAILABLE` 391 and `INSUFFICIENT_STOCK` 9. The worker reports `outbox_pending_events` 0 and
`outbox_publish_failures_total` 0.

### Finding: search index updates retry under a hot lot

The worker's `queue_jobs_failed_total` shows 981 failed attempts in the `search-sync` queue (960 for
`auction.bid_placed`, 21 for `product.stock_changed`). The logged reason is "products kept changing while the search
index was being updated": the consumer writes the product to the index, reads it again and repeats the write when
it changed in the meantime, and a lot receiving about 14 bids per second keeps changing; after a few
repetitions the attempt fails and the queue retries the job. Every failed attempt was retried with backoff and every event completed
(`queue_jobs_completed_total` for `search-sync` equals the 2 581 bids and 100 stock changes), so the index caught up,
nothing was dead-lettered and `queue_waiting_jobs` is 0 for every queue. Under this load the search index
lags behind the auction instead of failing; the retries are wasted work.

## Conclusions

- Under 200 concurrent bidders on one lot the api sustained about 630 bid requests per second at a p95 of about
  207 ms with no unexpected errors, and the auction state stayed consistent: no lost updates, no accepted bid below the
  required minimum.
- With 500 buyers racing for 100 units, exactly 100 orders were created; the stock never went negative and nothing
  was oversold.
- The latency of the checkout burst (p95 1.3 s, add-to-cart p95 2.3 s) is far above the bid latency. These requests
  wait for each other; I did not profile where, so the cause is not established.

## What to improve

- Profile the checkout burst (connection pool size, time spent waiting on the product row lock) before tuning anything.
- Run the load generator on separate hardware and capture CPU and memory of every container during the run; this
  report records neither, because the only sample taken was after the load had stopped.
- Repeat each scenario several times and report the spread instead of single runs.
- Add a soak run (tens of minutes) and a scenario that mixes browsing, bidding and checkout.
- Reduce the retries of the `search-sync` consumer for a product that changes continuously (for example by
  coalescing the index updates of one product), since 981 failed attempts were needed for 2 681 events.

## How to reproduce

```bash
npm run load:up        # builds and starts the stack with the load profile
npm run load:seed      # buyers, auction and limited-stock product -> load/.tokens.json
npm run load:bids      # about 3 minutes
npm run load:checkout  # a few seconds
npm run load:verify    # invariants and metrics -> load/results/verify.json
```

Defaults match the compose ports (api on 3000, PostgreSQL on 5432). To run beside a development stack, give the
load stack its own project name and ports, and point the host-side steps at them:

```bash
export COMPOSE_PROJECT_NAME=marketplace-load POSTGRES_PORT=55432 REDIS_PORT=56379 \
  MEILI_PORT=57700 API_PORT=53000 WORKER_METRICS_PORT=59100 WEB_PORT=58080
export API_URL=http://localhost:53000 WORKER_METRICS_URL=http://localhost:59100/metrics \
  DATABASE_URL=postgresql://marketplace:marketplace@localhost:55432/marketplace
```

Tear the stack down with `docker compose -f docker-compose.yml -f docker-compose.load.yml down -v`. This deletes the
volumes of the selected project, so keep the separate project name when other data lives in the default one.
Tunables: `LOAD_BUYERS`, `LOAD_STOCK`, `LOAD_AUCTION_MINUTES` (seed) and `START_VUS`, `MAX_VUS`, `RAMP`, `HOLD`,
`CHECKOUT_VUS` (k6 scripts: pass them to the container, for example
`docker compose -f docker-compose.yml -f docker-compose.load.yml run --rm -e MAX_VUS=100 k6 run /load/bids.js`).
The worker metrics are read from `WORKER_METRICS_URL` (default `http://localhost:9100/metrics`).

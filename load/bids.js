// Many bidders race for one auction: every VU reads the snapshot and bids the minimum next bid,
// so most bids collide with another accepted bid. Run through the compose profile, see README.
import { sleep } from 'k6';
import http from 'k6/http';
import { Counter } from 'k6/metrics';

import {
  API_URL,
  authHeaders,
  buyerOfThisVu,
  errorCode,
  fixture,
  textReport,
  uuid,
} from './lib/common.js';

const START_VUS = Number(__ENV.START_VUS || 50);
const MAX_VUS = Number(__ENV.MAX_VUS || 200);
const RAMP = __ENV.RAMP || '1m';
const HOLD = __ENV.HOLD || '2m';

const bidsAccepted = new Counter('bids_accepted');
const bidsTooLow = new Counter('bids_rejected_too_low');
const bidsConflict = new Counter('bids_conflict');
const bidsAuctionOver = new Counter('bids_rejected_auction_over');
const unexpectedBidResponses = new Counter('bids_unexpected');

export const options = {
  scenarios: {
    bidders: {
      executor: 'ramping-vus',
      startVUs: START_VUS,
      stages: [
        { duration: RAMP, target: MAX_VUS },
        { duration: HOLD, target: MAX_VUS },
      ],
      gracefulRampDown: '10s',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    // 409 (lost the race) and 422 (outbid or too low) are business outcomes, not failures: the
    // response callbacks below only count anything else as failed.
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:place_bid}': ['p(95)<300'],
    'http_req_duration{name:get_auction}': ['p(95)<300'],
    'http_reqs{name:place_bid}': ['count>0'],
    bids_accepted: ['count>0'],
    bids_unexpected: ['count==0'],
  },
};

export function setup() {
  return { auctionId: fixture.auction.id };
}

const snapshotStatuses = http.expectedStatuses(200);
const bidStatuses = http.expectedStatuses(201, 409, 422);

export default function ({ auctionId }) {
  const buyer = buyerOfThisVu();

  const snapshot = http.get(`${API_URL}/api/auctions/${auctionId}`, {
    tags: { name: 'get_auction' },
    responseCallback: snapshotStatuses,
  });
  if (snapshot.status !== 200) {
    sleep(1);
    return;
  }
  const { status, minNextBidCents } = snapshot.json();
  if (status !== 'ACTIVE' || minNextBidCents === null) {
    bidsAuctionOver.add(1);
    sleep(1);
    return;
  }

  const response = http.post(
    `${API_URL}/api/auctions/${auctionId}/bids`,
    JSON.stringify({ amountCents: minNextBidCents }),
    {
      headers: authHeaders(buyer.token, { 'Idempotency-Key': uuid() }),
      tags: { name: 'place_bid' },
      responseCallback: bidStatuses,
    },
  );

  if (response.status === 201) {
    bidsAccepted.add(1);
  } else if (response.status === 409 && errorCode(response) === 'BID_CONFLICT') {
    bidsConflict.add(1);
  } else if (response.status === 422 && errorCode(response) === 'BID_TOO_LOW') {
    bidsTooLow.add(1);
  } else if (response.status === 422 && errorCode(response) === 'AUCTION_ENDED') {
    bidsAuctionOver.add(1);
  } else {
    unexpectedBidResponses.add(1);
    console.error(
      `unexpected bid response ${response.status}: ${String(response.body).slice(0, 200)}`,
    );
  }

  sleep(0.05 + Math.random() * 0.15);
}

export function handleSummary(data) {
  const report = textReport(
    'bids: many bidders on one auction',
    data,
    [
      ['place bid', 'http_req_duration{name:place_bid}'],
      ['auction snapshot', 'http_req_duration{name:get_auction}'],
    ],
    [
      ['bids accepted (201)', 'bids_accepted'],
      ['bids too low (422)', 'bids_rejected_too_low'],
      ['bid conflicts (409)', 'bids_conflict'],
      ['auction already over (422)', 'bids_rejected_auction_over'],
      ['unexpected bid responses', 'bids_unexpected'],
    ],
  );
  return {
    stdout: report,
    '/load/results/bids-summary.json': JSON.stringify(data, null, 2),
  };
}

// Shared by the k6 scripts. k6 runs these files itself (not Node), so imports are k6 modules.
import { SharedArray } from 'k6/data';

// The compose profile mounts ./load at /load and puts k6 on the stack's network.
export const API_URL = (__ENV.API_URL || 'http://api:3000').replace(/\/$/, '');

const FIXTURE_FILE = __ENV.TOKENS_FILE || '/load/.tokens.json';

// One shared copy for all VUs: 500 VMs would otherwise each parse their own.
const fixtureHolder = new SharedArray('fixture', () => [JSON.parse(open(FIXTURE_FILE))]);

export const fixture = fixtureHolder[0];

/** Every VU is a buyer of its own; extra VUs wrap around when there are fewer buyers. */
export function buyerOfThisVu() {
  return fixture.buyers[(__VU - 1) % fixture.buyers.length];
}

export function authHeaders(token, extra = {}) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

// Idempotency-Key must be a UUID; the bytes only have to be unique, not secret.
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

/** The machine-readable code of an API error response, or undefined. */
export function errorCode(response) {
  try {
    return response.json('error.code');
  } catch {
    return undefined;
  }
}

function metricLine(metric, label, formatValue) {
  return metric ? `  ${label.padEnd(34)} ${formatValue(metric.values)}` : undefined;
}

const ms = (value) => `${value.toFixed(1)} ms`;

/** Compact end-of-test text; the full numbers go to the JSON file written next to it. */
export function textReport(title, data, submetrics, counters) {
  const lines = [`\n${title}`, ''];
  const seconds = data.state.testRunDurationMs / 1000;
  lines.push(`  duration                           ${seconds.toFixed(1)} s`);
  for (const [label, name] of submetrics) {
    const metric = data.metrics[name];
    const throughput = data.metrics[name.replace('http_req_duration', 'http_reqs')];
    if (metric) {
      const { med, 'p(95)': p95, 'p(99)': p99, max } = metric.values;
      const rate = throughput ? `, ${throughput.values.rate.toFixed(1)} req/s` : '';
      lines.push(
        `  ${label.padEnd(34)} p50 ${ms(med)}  p95 ${ms(p95)}  p99 ${ms(p99)}  max ${ms(max)}${rate}`,
      );
    }
  }
  for (const [label, name] of counters) {
    // k6 omits a counter nobody incremented.
    const count = data.metrics[name]?.values.count ?? 0;
    lines.push(`  ${label.padEnd(34)} ${count}`);
  }
  const failed = data.metrics.http_req_failed;
  lines.push(
    metricLine(
      failed,
      'unexpected responses (rate)',
      (values) => `${(values.rate * 100).toFixed(2)}%`,
    ),
  );
  return `${lines.filter((line) => line !== undefined).join('\n')}\n\n`;
}

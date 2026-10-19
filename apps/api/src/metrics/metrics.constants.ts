export const HTTP_REQUESTS_TOTAL = 'http_requests_total';
export const HTTP_REQUEST_DURATION_SECONDS = 'http_request_duration_seconds';
export const APP_ERRORS_TOTAL = 'app_errors_total';

export const HTTP_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/** Prometheus scrape path; deliberately outside the `/api` prefix and the public API surface. */
export const METRICS_PATH = 'metrics';

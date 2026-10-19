export const HTTP_REQUESTS_TOTAL = 'http_requests_total';
export const HTTP_REQUEST_DURATION_SECONDS = 'http_request_duration_seconds';
export const APP_ERRORS_TOTAL = 'app_errors_total';

export const OUTBOX_PENDING_EVENTS = 'outbox_pending_events';
export const OUTBOX_PUBLISH_LAG_SECONDS = 'outbox_publish_lag_seconds';
export const OUTBOX_PUBLISH_FAILURES_TOTAL = 'outbox_publish_failures_total';
export const QUEUE_JOB_DURATION_SECONDS = 'queue_job_duration_seconds';
export const QUEUE_JOBS_COMPLETED_TOTAL = 'queue_jobs_completed_total';
export const QUEUE_JOBS_FAILED_TOTAL = 'queue_jobs_failed_total';
export const QUEUE_DEAD_LETTER_TOTAL = 'queue_dead_letter_total';
export const QUEUE_WAITING_JOBS = 'queue_waiting_jobs';
export const SEARCH_DEGRADED_TOTAL = 'search_degraded_total';
export const CACHE_HITS_TOTAL = 'cache_hits_total';
export const CACHE_MISSES_TOTAL = 'cache_misses_total';

export const OUTBOX_LAG_BUCKETS_SECONDS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 60];
export const QUEUE_JOB_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

export const HTTP_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/** Prometheus scrape path; deliberately outside the `/api` prefix and the public API surface. */
export const METRICS_PATH = 'metrics';

/** `default` guards every route; the others apply only where `@RateLimit(name)` opts in. */
export const THROTTLER = {
  DEFAULT: 'default',
  LOGIN: 'login',
  REGISTER: 'register',
  REFRESH: 'refresh',
  BID: 'bid',
} as const;

export type OptInThrottlerName = Exclude<(typeof THROTTLER)[keyof typeof THROTTLER], 'default'>;

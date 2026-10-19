/** `default` guards every route; the others apply only where `@RateLimit(name)` opts in. */
export const THROTTLER = {
  DEFAULT: 'default',
  LOGIN: 'login',
  /** Same budget as `login`, counted per target account instead of per client address. */
  LOGIN_EMAIL: 'loginEmail',
  REGISTER: 'register',
  REFRESH: 'refresh',
  BID: 'bid',
} as const;

export type OptInThrottlerName = Exclude<(typeof THROTTLER)[keyof typeof THROTTLER], 'default'>;

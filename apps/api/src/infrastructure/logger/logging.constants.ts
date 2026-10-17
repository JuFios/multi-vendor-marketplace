/** Optional destination for log lines; tests inject an in-memory stream. */
export const LOG_STREAM = Symbol('LOG_STREAM');

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'refreshToken',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.refreshToken',
  '*.token',
];

export const REDACT_CENSOR = '[Redacted]';

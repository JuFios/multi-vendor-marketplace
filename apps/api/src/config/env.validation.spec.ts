import { InvalidEnvironmentError, NodeEnv, validate } from './env.validation';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  MEILI_HOST: 'http://localhost:7700',
  MEILI_MASTER_KEY: 'a-sufficiently-long-key',
  JWT_ACCESS_SECRET: 'a-jwt-secret-of-at-least-32-characters',
};

describe('validate', () => {
  it('applies defaults and coerces numeric values', () => {
    expect(validate(validEnv)).toMatchObject({
      NODE_ENV: NodeEnv.Development,
      PORT: 3000,
      LOG_LEVEL: 'info',
      MEILI_INDEX_PREFIX: '',
    });
    expect(validate({ ...validEnv, PORT: '4010' }).PORT).toBe(4010);
  });

  it('defaults the analytics time zone and rejects an unknown one', () => {
    expect(validate(validEnv).ANALYTICS_TIMEZONE).toBe('Europe/Kyiv');
    expect(
      validate({ ...validEnv, ANALYTICS_TIMEZONE: 'America/New_York' }).ANALYTICS_TIMEZONE,
    ).toBe('America/New_York');
    expect(() => validate({ ...validEnv, ANALYTICS_TIMEZONE: 'Mars/Olympus' })).toThrow(
      'ANALYTICS_TIMEZONE',
    );
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'MEILI_HOST', 'MEILI_MASTER_KEY', 'JWT_ACCESS_SECRET'])(
    'fails fast when %s is missing',
    (name) => {
      const rest: Record<string, string> = { ...validEnv };
      delete rest[name];

      expect(() => validate(rest)).toThrow(InvalidEnvironmentError);
      expect(() => validate(rest)).toThrow(`${name}: is required`);
    },
  );

  it('reports every problem at once', () => {
    try {
      validate({ PORT: 'not-a-port' });
      throw new Error('expected validate to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvironmentError);
      expect((error as InvalidEnvironmentError).issues).toHaveLength(6);
    }
  });

  it('defaults the housekeeping settings and keeps the inbox longer than the failed jobs', () => {
    expect(validate(validEnv)).toMatchObject({
      HOUSEKEEPING_INTERVAL_MS: 600_000,
      HOUSEKEEPING_BATCH_SIZE: 5000,
      OUTBOX_RETENTION_DAYS: 7,
      PROCESSED_EVENTS_RETENTION_DAYS: 14,
    });
    expect(validate({ ...validEnv, PROCESSED_EVENTS_RETENTION_DAYS: '8' })).toMatchObject({
      PROCESSED_EVENTS_RETENTION_DAYS: 8,
    });
    expect(() => validate({ ...validEnv, PROCESSED_EVENTS_RETENTION_DAYS: '7' })).toThrow(
      'PROCESSED_EVENTS_RETENTION_DAYS',
    );
    expect(() => validate({ ...validEnv, HOUSEKEEPING_BATCH_SIZE: '0' })).toThrow(
      'HOUSEKEEPING_BATCH_SIZE',
    );
  });

  it('rejects an unknown profile and an out-of-range port', () => {
    expect(() => validate({ ...validEnv, NODE_ENV: 'staging' })).toThrow('NODE_ENV');
    expect(() => validate({ ...validEnv, PORT: '70000' })).toThrow('PORT');
    expect(() => validate({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow('LOG_LEVEL');
  });

  it('rejects a connection string with the wrong protocol', () => {
    expect(() => validate({ ...validEnv, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      'DATABASE_URL',
    );
    expect(() => validate({ ...validEnv, REDIS_URL: 'http://localhost' })).toThrow('REDIS_URL');
  });

  it('rejects a short Meilisearch master key and an invalid index prefix', () => {
    expect(() => validate({ ...validEnv, MEILI_MASTER_KEY: 'short' })).toThrow('MEILI_MASTER_KEY');
    expect(() => validate({ ...validEnv, MEILI_INDEX_PREFIX: 'bad-prefix!' })).toThrow(
      'MEILI_INDEX_PREFIX',
    );
  });

  it('does not leak secret values in the error message', () => {
    try {
      validate({ ...validEnv, MEILI_MASTER_KEY: 'short-secret' });
      throw new Error('expected validate to throw');
    } catch (error) {
      expect((error as Error).message).not.toContain('short-secret');
    }
  });

  it('treats empty optional variables as not configured', () => {
    const env = validate({ ...validEnv, COOKIE_SECURE: '', GOOGLE_CLIENT_ID: '' });

    expect(env.COOKIE_SECURE).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('requires the Google secret and callback once the client id is set', () => {
    expect(() => validate({ ...validEnv, GOOGLE_CLIENT_ID: 'client-id' })).toThrow(
      'GOOGLE_CLIENT_SECRET',
    );
    expect(() =>
      validate({
        ...validEnv,
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
      }),
    ).not.toThrow();
  });

  it('rejects a short JWT secret and a bad COOKIE_SECURE', () => {
    expect(() => validate({ ...validEnv, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
      'JWT_ACCESS_SECRET',
    );
    expect(() => validate({ ...validEnv, COOKIE_SECURE: 'maybe' })).toThrow('COOKIE_SECURE');
  });
});

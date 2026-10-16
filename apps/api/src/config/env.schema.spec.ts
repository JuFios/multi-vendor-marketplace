import { InvalidEnvironmentError, parseEnv } from './env.schema';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  MEILI_HOST: 'http://localhost:7700',
  MEILI_MASTER_KEY: 'a-sufficiently-long-key',
};

describe('parseEnv', () => {
  it('applies defaults and coerces numeric values', () => {
    const env = parseEnv({ ...validEnv, PORT: '4010' });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4010,
      MEILI_INDEX_PREFIX: '',
    });
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'MEILI_HOST', 'MEILI_MASTER_KEY'])(
    'fails fast when %s is missing',
    (name) => {
      const rest: Record<string, string> = { ...validEnv };
      delete rest[name];

      expect(() => parseEnv(rest)).toThrow(InvalidEnvironmentError);
      expect(() => parseEnv(rest)).toThrow(`${name}: is required`);
    },
  );

  it('reports every problem at once', () => {
    try {
      parseEnv({ PORT: 'not-a-port' });
      throw new Error('expected parseEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvironmentError);
      expect((error as InvalidEnvironmentError).issues).toHaveLength(5);
    }
  });

  it('rejects a connection string with the wrong protocol', () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      'DATABASE_URL',
    );
  });

  it('rejects a short Meilisearch master key', () => {
    expect(() => parseEnv({ ...validEnv, MEILI_MASTER_KEY: 'short' })).toThrow('MEILI_MASTER_KEY');
  });

  it('does not leak secret values in the error message', () => {
    try {
      parseEnv({ ...validEnv, MEILI_MASTER_KEY: 'short-secret' });
      throw new Error('expected parseEnv to throw');
    } catch (error) {
      expect((error as Error).message).not.toContain('short-secret');
    }
  });
});

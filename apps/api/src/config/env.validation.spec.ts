import { InvalidEnvironmentError, NodeEnv, validate } from './env.validation';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  MEILI_HOST: 'http://localhost:7700',
  MEILI_MASTER_KEY: 'a-sufficiently-long-key',
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

  it.each(['DATABASE_URL', 'REDIS_URL', 'MEILI_HOST', 'MEILI_MASTER_KEY'])(
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
      expect((error as InvalidEnvironmentError).issues).toHaveLength(5);
    }
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
});

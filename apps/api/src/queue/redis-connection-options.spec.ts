import { redisConnectionOptions } from './redis-connection-options';

describe('redisConnectionOptions', () => {
  it('reads host, port and database from the url', () => {
    expect(redisConnectionOptions('redis://localhost:6380/2')).toEqual({
      host: 'localhost',
      port: 6380,
      db: 2,
      maxRetriesPerRequest: null,
    });
  });

  it('defaults the port and omits database 0', () => {
    expect(redisConnectionOptions('redis://cache/0')).toEqual({
      host: 'cache',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it('carries credentials and tls', () => {
    expect(redisConnectionOptions('rediss://user:p%40ss@cache:6379')).toMatchObject({
      username: 'user',
      password: 'p@ss',
      tls: {},
    });
  });
});

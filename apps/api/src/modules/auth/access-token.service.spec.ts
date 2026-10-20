import type { ConfigType } from '@nestjs/config';
import { JwtService, type JwtModuleOptions } from '@nestjs/jwt';

import type { authConfig } from '../../config/auth.config';

import { ACCESS_TOKEN_ALGORITHM } from './access-claims';
import { AccessTokenService } from './access-token.service';

const SECRET = 'unit-test-secret-of-at-least-32-characters';
const USER_ID = '6f1d3c1e-0b0a-4c55-9d0b-0b6f6a1b2c3d';

const jwtOptions: JwtModuleOptions = {
  secret: SECRET,
  signOptions: { algorithm: ACCESS_TOKEN_ALGORITHM, expiresIn: 900 },
  verifyOptions: { algorithms: [ACCESS_TOKEN_ALGORITHM] },
};

describe('AccessTokenService', () => {
  const jwt = new JwtService(jwtOptions);
  const config = { accessTtlSec: 900 } as ConfigType<typeof authConfig>;
  const service = new AccessTokenService(jwt, config);

  it('signs the subject, roles and seller id with the configured secret', async () => {
    const { token, expiresInSec } = await service.issue({
      sub: USER_ID,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: 'seller-1',
    });

    expect(expiresInSec).toBe(900);
    expect(await jwt.verifyAsync(token)).toMatchObject({
      sub: USER_ID,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: 'seller-1',
    });
  });

  it('leaves sellerId out when the user has no store', async () => {
    const { token } = await service.issue({ sub: USER_ID, roles: ['CUSTOMER'] });

    expect(jwt.decode<Record<string, unknown>>(token)).not.toHaveProperty('sellerId');
  });

  it('uses the pinned algorithm and expires after the configured lifetime', async () => {
    const { token } = await service.issue({ sub: USER_ID, roles: ['CUSTOMER'] });

    const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as {
      alg: string;
    };
    const { iat, exp } = jwt.decode<{ iat: number; exp: number }>(token);
    expect(header.alg).toBe('HS256');
    expect(exp - iat).toBe(900);
  });
});

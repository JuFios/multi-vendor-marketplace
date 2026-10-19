import { SetMetadata } from '@nestjs/common';

import type { OptInThrottlerName } from './throttler-names';

const RATE_LIMIT_METADATA_PREFIX = 'marketplace:rate-limit:';

export const rateLimitMetadataKey = (name: OptInThrottlerName): string =>
  `${RATE_LIMIT_METADATA_PREFIX}${name}`;

/** Opts a route (or controller) into a named throttler configured from the environment. */
export const RateLimit = (name: OptInThrottlerName): MethodDecorator & ClassDecorator =>
  SetMetadata(rateLimitMetadataKey(name), true);

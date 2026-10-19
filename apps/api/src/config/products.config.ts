import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const productsConfig = registerAs('products', () => ({
  premoderation: loadEnv().PRODUCT_PREMODERATION,
}));

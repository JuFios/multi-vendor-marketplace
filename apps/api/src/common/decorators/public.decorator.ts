import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'marketplace:public';

/** Exempts a route (or controller) from the global `JwtAuthGuard`. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

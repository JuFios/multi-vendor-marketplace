import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

/** Routes every Nest `Logger` call, including the framework's own, through pino. */
export function useAppLogger(app: INestApplicationContext): void {
  app.useLogger(app.get(Logger));
}

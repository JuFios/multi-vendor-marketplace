import { Module } from '@nestjs/common';
import { LoggerModule, type Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';

import { APP_CONFIG, type AppConfig } from '../../config/app-config';

import { buildPinoHttpOptions } from './logger-options';
import { LOG_STREAM } from './logging.constants';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      providers: [{ provide: LOG_STREAM, useValue: undefined }],
      inject: [APP_CONFIG, LOG_STREAM],
      useFactory: (config: AppConfig, stream: DestinationStream | undefined): Params => {
        const options = buildPinoHttpOptions({
          level: config.logging.level,
          prettyPrint: config.env === 'development' && stream === undefined,
        });
        return { pinoHttp: stream === undefined ? options : [options, stream] };
      },
    }),
  ],
})
export class LoggingModule {}

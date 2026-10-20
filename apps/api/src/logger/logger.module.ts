import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule, type Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';

import { appConfig } from '../config/app.config';
import { NodeEnv } from '../config/env.validation';

import { LOG_STREAM } from './logger.constants';
import { buildPinoHttpOptions } from './logger.options';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      providers: [{ provide: LOG_STREAM, useValue: undefined }],
      inject: [appConfig.KEY, LOG_STREAM],
      useFactory: (
        config: ConfigType<typeof appConfig>,
        stream: DestinationStream | undefined,
      ): Params => {
        const options = buildPinoHttpOptions({
          level: config.logLevel,
          prettyPrint: config.env === NodeEnv.Development && stream === undefined,
        });
        return { pinoHttp: stream === undefined ? options : [options, stream] };
      },
    }),
  ],
})
export class LoggerModule {}

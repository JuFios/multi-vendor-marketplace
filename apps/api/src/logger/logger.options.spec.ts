import { Writable } from 'node:stream';

import { ClsServiceManager } from 'nestjs-cls';
import pino from 'pino';

import '../common/cls/cls-store';

import { buildPinoHttpOptions } from './logger.options';

function createCapture(): { lines: () => Record<string, unknown>[]; stream: Writable } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

function createLogger(stream: Writable): pino.Logger {
  const { level, redact, mixin } = buildPinoHttpOptions({ level: 'info', prettyPrint: false });
  return pino({ level, redact, mixin } as pino.LoggerOptions, stream);
}

describe('logger options', () => {
  it('redacts credentials in any log object', () => {
    const capture = createCapture();

    createLogger(capture.stream).info({
      password: 'hunter2',
      refreshToken: 'rt',
      session: { token: 'abc' },
      req: { headers: { authorization: 'Bearer x', cookie: 'rt=1' } },
    });

    const [line] = capture.lines();
    expect(JSON.stringify(line)).not.toMatch(/hunter2|Bearer x|rt=1|abc/);
    expect(line).toMatchObject({ password: '[Redacted]', refreshToken: '[Redacted]' });
  });

  it('adds correlationId and userId from the CLS context only', () => {
    const capture = createCapture();
    const logger = createLogger(capture.stream);
    const cls = ClsServiceManager.getClsService();

    logger.info('outside');
    cls.run(() => {
      cls.set('correlationId', 'abc-1');
      cls.set('userId', 'user-1');
      logger.info('inside');
    });

    const [outside, inside] = capture.lines();
    expect(outside).not.toHaveProperty('correlationId');
    expect(inside).toMatchObject({ correlationId: 'abc-1', userId: 'user-1' });
  });
});

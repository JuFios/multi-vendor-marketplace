import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { WorkerModule } from '../../src/worker.module';

describe('worker process (e2e)', () => {
  let context: INestApplicationContext | undefined;

  afterAll(async () => {
    await context?.close();
  });

  it('starts on its own, without the HTTP application next to it', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    context = await moduleRef.createNestApplication().init();

    expect(context).toBeDefined();
  });
});

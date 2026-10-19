import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IsString, MaxLength } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';

import { IsMoneyCents, SanitizeText } from '../src/common/decorators';
import { PaginationQueryDto } from '../src/common/dto';
import { ParseUuidPipe } from '../src/common/pipes';

import { createTestApp } from './utils/test-app';

class CreateItemDto {
  @SanitizeText()
  @IsString()
  @MaxLength(50)
  title!: string;

  @IsMoneyCents()
  priceCents!: number;
}

@Controller('items')
class ItemsController {
  @Post()
  create(@Body() dto: CreateItemDto): CreateItemDto {
    return dto;
  }

  @Get()
  list(@Query() query: PaginationQueryDto): PaginationQueryDto {
    return query;
  }

  @Get(':id')
  one(@Param('id', ParseUuidPipe) id: string): { id: string } {
    return { id };
  }
}

@Module({ controllers: [ItemsController] })
class ItemsModule {}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; messages: string[] }[];
    correlationId: string;
  };
}

describe('Request validation (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([], { imports: [ItemsModule], worker: false });
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (body: unknown) =>
    request(app.getHttpServer() as App)
      .post('/api/items')
      .send(body as object);

  it('accepts a valid body', async () => {
    const response = await post({ title: 'Lamp', priceCents: 1999 }).expect(201);

    expect(response.body).toEqual({ title: 'Lamp', priceCents: 1999 });
  });

  it('answers an invalid body with VALIDATION_FAILED, the failing fields and a correlation id', async () => {
    const response = await post({ title: 5, priceCents: 10.5 })
      .set('X-Request-Id', 'val-1')
      .expect(400);

    const { error } = response.body as ErrorBody;
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.correlationId).toBe('val-1');
    expect(error.details?.map((issue) => issue.field).sort()).toEqual(['priceCents', 'title']);
  });

  it('rejects properties that are not part of the DTO', async () => {
    const response = await post({ title: 'Lamp', priceCents: 100, role: 'admin' }).expect(400);

    expect((response.body as ErrorBody).error.details).toEqual([
      { field: 'role', messages: ['property role should not exist'] },
    ]);
  });

  it.each([0, -1, 100_000_001, '100'])('rejects priceCents %p', async (priceCents) => {
    await post({ title: 'Lamp', priceCents }).expect(400);
  });

  it('strips markup from sanitized text before it reaches the handler', async () => {
    const response = await post({
      title: '<script>alert(1)</script><b>Lamp</b>',
      priceCents: 100,
    }).expect(201);

    expect((response.body as CreateItemDto).title).toBe('Lamp');
  });

  it('applies pagination defaults and converts query strings', async () => {
    const defaults = await request(app.getHttpServer() as App)
      .get('/api/items')
      .expect(200);
    const custom = await request(app.getHttpServer() as App)
      .get('/api/items?page=2&limit=5')
      .expect(200);

    expect(defaults.body).toEqual({ page: 1, limit: 20 });
    expect(custom.body).toEqual({ page: 2, limit: 5 });
  });

  it.each(['page=0', 'limit=101', 'limit=abc', 'sort=price'])(
    'rejects the pagination query %s',
    async (query) => {
      const response = await request(app.getHttpServer() as App)
        .get(`/api/items?${query}`)
        .expect(400);

      expect((response.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    },
  );

  it('validates UUID route params', async () => {
    const id = '0b0e3f0e-4d1f-4f6e-9c1a-2f4a7d9e8c10';

    await request(app.getHttpServer() as App)
      .get(`/api/items/${id}`)
      .expect(200, { id });
    const response = await request(app.getHttpServer() as App)
      .get('/api/items/not-a-uuid')
      .expect(400);

    expect((response.body as ErrorBody).error.details).toEqual([
      { field: 'id', messages: ['id must be a UUID'] },
    ]);
  });
});

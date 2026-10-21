import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import SwaggerParser from '@apidevtools/swagger-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';

import { createTestApp } from '../utils/test-app';

describe('OpenAPI documentation (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a valid OpenAPI document at /api/docs-json', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/docs-json')
      .expect(200);

    const document = response.body as Parameters<typeof SwaggerParser.validate>[0];
    await expect(SwaggerParser.validate(structuredClone(document))).resolves.toBeDefined();
    expect(document).toMatchObject({ openapi: expect.stringMatching(/^3\./) as string });
  });

  it('documents the health probes with the shared error schema', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/docs-json')
      .expect(200);

    const document = response.body as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    };
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/api/health', '/api/health/ready']),
    );
    expect(document.paths['/api/health/ready']?.get?.responses['503']).toMatchObject({
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/ErrorResponseDto' } },
      },
    });
  });

  it('declares bearer and refresh-cookie authentication', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/docs-json')
      .expect(200);

    expect(response.body).toMatchObject({
      components: {
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          'refresh-cookie': { type: 'apiKey', in: 'cookie', name: 'rt' },
        },
      },
    });
  });

  it('keeps the metrics endpoint out of the public documentation', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/docs-json')
      .expect(200);

    expect(Object.keys((response.body as { paths: object }).paths)).not.toContain('/metrics');
  });

  it('serves Swagger UI at /api/docs', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/docs')
      .redirects(1)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('swagger-ui');
  });

  describe('completeness', () => {
    interface Operation {
      summary?: string;
      description?: string;
      parameters?: { name: string; description?: string; schema?: { description?: string } }[];
      requestBody?: { content?: Record<string, { example?: unknown; examples?: unknown }> };
      responses: Record<string, unknown>;
    }

    const operations = async (): Promise<[string, Operation][]> => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/docs-json')
        .expect(200);
      const paths = (response.body as { paths: Record<string, Record<string, Operation>> }).paths;
      return Object.entries(paths).flatMap(([path, methods]) =>
        Object.entries(methods).map(([method, operation]): [string, Operation] => [
          `${method.toUpperCase()} ${path}`,
          operation,
        ]),
      );
    };

    it('describes every operation and every parameter', async () => {
      const missing: string[] = [];
      for (const [name, operation] of await operations()) {
        if (!operation.summary || !operation.description) {
          missing.push(`${name}: summary or description`);
        }
        for (const parameter of operation.parameters ?? []) {
          if (!parameter.description && !parameter.schema?.description) {
            missing.push(`${name}: parameter ${parameter.name}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });

    it('documents an error response and an example body for every operation that has one', async () => {
      const missing: string[] = [];
      for (const [name, operation] of await operations()) {
        if (!Object.keys(operation.responses).some((code) => /^[45]/.test(code))) {
          missing.push(`${name}: no error response`);
        }
        const json = operation.requestBody?.content?.['application/json'];
        if (json && json.example === undefined && json.examples === undefined) {
          missing.push(`${name}: no request example`);
        }
      }
      expect(missing).toEqual([]);
    });

    it('matches the committed docs/api/openapi.json', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/docs-json')
        .expect(200);
      const committed = JSON.parse(
        readFileSync(join(__dirname, '../../../../docs/api/openapi.json'), 'utf8'),
      ) as unknown;

      expect(response.body).toEqual(committed);
    });
  });
});

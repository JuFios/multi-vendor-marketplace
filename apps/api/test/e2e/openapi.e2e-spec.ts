import SwaggerParser from '@apidevtools/swagger-parser';
import request from 'supertest';

import { createTestApp, type TestApp } from '../helpers/test-app';

describe('OpenAPI documentation (e2e)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a valid OpenAPI document at /api/docs-json', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    const document = response.body as Parameters<typeof SwaggerParser.validate>[0];
    await expect(SwaggerParser.validate(structuredClone(document))).resolves.toBeDefined();
    expect(document).toMatchObject({ openapi: expect.stringMatching(/^3\./) as string });
  });

  it('documents the health probes with the shared error schema', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

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
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

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
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    expect(Object.keys((response.body as { paths: object }).paths)).not.toContain('/metrics');
  });

  it('serves Swagger UI at /api/docs', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs').redirects(1).expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('swagger-ui');
  });
});

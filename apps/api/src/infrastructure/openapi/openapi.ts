import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { ErrorBodyDto, ErrorResponseDto } from './error-response.dto';

export const OPENAPI_UI_PATH = 'api/docs';
export const OPENAPI_JSON_PATH = 'api/docs-json';
export const BEARER_AUTH = 'bearer';
export const REFRESH_COOKIE_AUTH = 'refresh-cookie';

const REFRESH_COOKIE_NAME = 'rt';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Marketplace API')
    .setDescription(
      'Multi-vendor marketplace with real-time inventory. Every error response uses the ' +
        '`ErrorResponseDto` shape and carries the request correlation id.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, BEARER_AUTH)
    .addCookieAuth(
      REFRESH_COOKIE_NAME,
      { type: 'apiKey', in: 'cookie', name: REFRESH_COOKIE_NAME },
      REFRESH_COOKIE_AUTH,
    )
    .build();
  return SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto, ErrorBodyDto],
  });
}

/** Serves Swagger UI and the raw document; paths are given in full because they bypass the global prefix. */
export function mountOpenApi(app: INestApplication): void {
  SwaggerModule.setup(OPENAPI_UI_PATH, app, createOpenApiDocument(app), {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    customSiteTitle: 'Marketplace API',
  });
}

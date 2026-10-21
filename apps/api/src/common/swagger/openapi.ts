import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { ErrorBodyDto, ErrorResponseDto } from './error-response.dto';
import { OPERATION_DOCS, PARAMETER_DOCS } from './operation-docs';

export const OPENAPI_UI_PATH = 'api/docs';
export const OPENAPI_JSON_PATH = 'api/docs-json';
export const BEARER_AUTH = 'bearer';
export const REFRESH_COOKIE_AUTH = 'refresh-cookie';

export const REFRESH_COOKIE_NAME = 'rt';

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
  return enrichOpenApiDocument(
    SwaggerModule.createDocument(app, config, { extraModels: [ErrorResponseDto, ErrorBodyDto] }),
  );
}

interface OperationObject {
  description?: string;
  parameters?: { name: string; description?: string; schema?: { description?: string } }[];
  requestBody?: { content?: Record<string, { example?: unknown; examples?: unknown }> };
}

/**
 * Adds what the controller decorators leave out: a description and a request example per
 * operation, and a description for each parameter. Text that a controller already wrote wins.
 */
export function enrichOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods as Record<string, OperationObject>)) {
      const doc = OPERATION_DOCS[`${method.toUpperCase()} ${path}`];
      if (doc && operation.description === undefined) {
        operation.description = doc.description;
      }
      const json = operation.requestBody?.content?.['application/json'];
      if (doc?.requestExample !== undefined && json && json.example === undefined) {
        json.example = doc.requestExample;
      }
      for (const parameter of operation.parameters ?? []) {
        const text = PARAMETER_DOCS[parameter.name];
        if (
          text &&
          parameter.description === undefined &&
          parameter.schema?.description === undefined
        ) {
          parameter.description = text;
        }
      }
    }
  }
  return document;
}

/** Serves Swagger UI and the raw document; paths are given in full because they bypass the global prefix. */
export function mountOpenApi(app: INestApplication): void {
  SwaggerModule.setup(OPENAPI_UI_PATH, app, createOpenApiDocument(app), {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    customSiteTitle: 'Marketplace API',
  });
}

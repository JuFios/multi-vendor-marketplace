import { Transform, type TransformFnParams } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

/**
 * Drops every tag (and the content of script/style), leaving plain text. Angle brackets that
 * remain are escaped as entities, so the result never contains markup; `&amp;` is restored
 * because it cannot form a tag and escaping it would mangle ordinary names like "Tom & Jerry".
 */
export function sanitizeText(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).replaceAll('&amp;', '&');
}

/** Sanitizes string values during DTO transformation; other types are left for the validators. */
export function SanitizeText(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? sanitizeText(value) : value,
  );
}

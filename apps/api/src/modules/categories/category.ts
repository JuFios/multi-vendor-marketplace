export const CATEGORY_NAME_MAX_LENGTH = 100;
export const CATEGORY_SLUG_MAX_LENGTH = 100;

/** Lower-case words joined by single hyphens: safe in a URL without encoding. */
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Deep enough for any real catalog; also bounds the walk that guards against cycles. */
export const CATEGORY_MAX_DEPTH = 8;

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
}

export interface NewCategory {
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
}

export interface CategoryChanges {
  readonly name?: string;
  readonly slug?: string;
  readonly parentId?: string | null;
}

/**
 * Whether making `parentId` the parent of `categoryId` would put the category below itself.
 * `parentOf` returns the parent of any category (null at a root), or undefined for an unknown id.
 */
export function createsCycle(
  categoryId: string,
  parentId: string,
  parentOf: (id: string) => string | null | undefined,
): boolean {
  let current: string | null | undefined = parentId;
  for (let depth = 0; current != null && depth <= CATEGORY_MAX_DEPTH * 4; depth += 1) {
    if (current === categoryId) {
      return true;
    }
    current = parentOf(current);
  }
  return false;
}

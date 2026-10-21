import type { Category } from './admin-api';

export interface TreeRow {
  category: Category;
  depth: number;
}

export function flattenTree(categories: readonly Category[]): TreeRow[] {
  const children = new Map<string | null, Category[]>();
  for (const category of categories) {
    const key = category.parentId ?? null;
    children.set(key, [...(children.get(key) ?? []), category]);
  }
  const rows: TreeRow[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const category of children.get(parent) ?? []) {
      rows.push({ category, depth });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

import type { CatalogItem } from '../../search';

export interface NamedFacet {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

export interface ValueFacet<TValue> {
  readonly value: TValue;
  readonly count: number;
}

/** One catalog answer, with facet ids resolved to names. */
export interface CatalogPage {
  readonly items: readonly CatalogItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly facets: {
    readonly categories: readonly NamedFacet[];
    readonly sellers: readonly NamedFacet[];
    readonly types: readonly ValueFacet<string>[];
    readonly inStock: readonly ValueFacet<boolean>[];
  };
  readonly priceRange: { readonly min: number; readonly max: number } | null;
  /** True when the SQL fallback answered because the search index could not. */
  readonly degraded: boolean;
}

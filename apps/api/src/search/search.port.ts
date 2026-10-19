import type { CatalogDocument, CatalogQuery, CatalogResult } from './catalog';

export const SEARCH_PORT = Symbol('SEARCH_PORT');

/**
 * The product search index. Request handlers only call `search`; the index is written by the
 * `search-sync` consumer and the reindex command, never in the request that changed a product.
 */
export interface SearchPort {
  /** Creates the index with its settings if needed; safe to call repeatedly. */
  ensureIndex(): Promise<void>;
  search(query: CatalogQuery): Promise<CatalogResult>;
  upsert(documents: readonly CatalogDocument[]): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
  /** Drops every document, for a full rebuild. */
  clear(): Promise<void>;
  countDocuments(): Promise<number>;
}

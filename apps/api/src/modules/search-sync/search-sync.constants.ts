export const CATALOG_NAMESPACE_KEY = 'cache:catalog:ns';
/** Set while a coalesced bump of the namespace is scheduled by some worker. */
export const CATALOG_BUMP_PENDING_KEY = 'cache:catalog:ns:bump-pending';

/** Products read from the database per step when the whole index is rebuilt. */
export const REINDEX_BATCH_SIZE = 500;

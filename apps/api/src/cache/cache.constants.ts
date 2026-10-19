/** A cache call that takes longer is treated as a failure, so an unreachable Redis never stalls a request. */
export const CACHE_OPERATION_TIMEOUT_MS = 500;

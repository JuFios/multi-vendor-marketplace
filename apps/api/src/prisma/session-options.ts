/**
 * The timestamp columns hold UTC without a zone, so every connection pins its session to UTC:
 * otherwise `now()` compared with or stored into them would shift by the server's own offset.
 */
export const DATABASE_SESSION_OPTIONS = '-c timezone=UTC';

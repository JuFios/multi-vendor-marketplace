export const ROLES = ['CUSTOMER', 'SELLER', 'ADMIN'] as const;

export type UserRole = (typeof ROLES)[number];

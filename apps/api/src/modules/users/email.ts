/** Emails are stored and compared lower-cased, so `A@x.com` and `a@x.com` are one account. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

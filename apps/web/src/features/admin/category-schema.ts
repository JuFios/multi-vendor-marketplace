import { z } from 'zod';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A URL-safe slug from a display name; empty when the name has no latin letters or digits. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 100);
}

export const categorySchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(100),
    slug: z
      .string()
      .trim()
      .max(100)
      .refine(
        (value) => value === '' || SLUG_PATTERN.test(value),
        'Use lowercase letters, digits and dashes',
      ),
    parentId: z.string(),
  })
  .superRefine((value, context) => {
    if (value.slug === '' && slugify(value.name) === '') {
      context.addIssue({ code: 'custom', path: ['slug'], message: 'Enter a slug for this name' });
    }
  });

export type CategoryValues = z.infer<typeof categorySchema>;

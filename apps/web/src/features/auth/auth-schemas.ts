import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').max(254),
  password: z.string().min(1, 'Enter your password').max(128),
});

const newPassword = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a digit');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  email: z.email('Enter a valid email').max(254),
  password: newPassword,
});

/** `currentPassword` is only asked for, and checked, when the account already has a password. */
export const passwordSchema = z.object({
  currentPassword: z.string().max(128),
  newPassword,
});

export const applicationSchema = z.object({
  storeName: z.string().trim().min(2, 'At least 2 characters').max(100),
  description: z.string().trim().max(2000),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type PasswordValues = z.infer<typeof passwordSchema>;
export type ApplicationValues = z.infer<typeof applicationSchema>;

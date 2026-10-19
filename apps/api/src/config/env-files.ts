import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';

// Only the root of an npm workspaces repository holds a lockfile next to the apps.
const REPO_ROOT_MARKER = 'package-lock.json';

/** Walks up from `start` to the repository root; undefined outside a checkout (e.g. in a container). */
export function findRepoRoot(start: string = process.cwd()): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, REPO_ROOT_MARKER))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/** Highest priority first: `.env.<profile>.local`, `.env.<profile>`, `.env`. */
export function resolveEnvFilePaths(
  nodeEnv: string = process.env.NODE_ENV ?? 'development',
  start: string = process.cwd(),
): string[] {
  const root = findRepoRoot(start);
  if (!root) {
    return [];
  }
  return [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`, '.env'].map((name) => join(root, name));
}

/**
 * Loads the env files into `process.env` for tools that run outside Nest (the Prisma CLI). Files
 * are read highest priority first and dotenv never overwrites a value that is already set, so the
 * process environment wins over every file.
 */
export function loadEnvFiles(
  nodeEnv: string = process.env.NODE_ENV ?? 'development',
  start: string = process.cwd(),
): void {
  loadDotenv({ path: resolveEnvFilePaths(nodeEnv, start), quiet: true });
}

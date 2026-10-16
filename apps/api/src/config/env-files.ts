import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

/** Walks up from `start` to the monorepo root; undefined outside a checkout (e.g. in a container). */
export function findRepoRoot(start: string = process.cwd()): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, WORKSPACE_MARKER))) {
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

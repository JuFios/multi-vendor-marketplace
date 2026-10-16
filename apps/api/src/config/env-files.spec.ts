import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findRepoRoot, resolveEnvFilePaths } from './env-files';

describe('env files', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'env-files-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    mkdirSync(join(root, 'apps', 'api'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds the repository root from a nested directory', () => {
    expect(findRepoRoot(join(root, 'apps', 'api'))).toBe(root);
  });

  it('orders files from the highest to the lowest priority', () => {
    expect(resolveEnvFilePaths('test', join(root, 'apps', 'api'))).toEqual([
      join(root, '.env.test.local'),
      join(root, '.env.test'),
      join(root, '.env'),
    ]);
  });

  it('returns no files outside a checkout', () => {
    expect(resolveEnvFilePaths('production', tmpdir())).toEqual([]);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findRepoRoot, loadEnvFiles, resolveEnvFilePaths } from './env-files';

describe('env files', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'env-files-'));
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
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

  describe('loadEnvFiles', () => {
    const names = [
      'ENV_FILES_FROM_LOCAL',
      'ENV_FILES_FROM_PROFILE',
      'ENV_FILES_FROM_BASE',
      'ENV_FILES_SET',
    ];

    afterEach(() => {
      for (const name of names) {
        delete process.env[name];
      }
    });

    it('lets a higher-priority file win and never overrides the process environment', () => {
      writeFileSync(
        join(root, '.env.test.local'),
        'ENV_FILES_FROM_LOCAL=local\nENV_FILES_SET=local\n',
      );
      writeFileSync(
        join(root, '.env.test'),
        'ENV_FILES_FROM_LOCAL=profile\nENV_FILES_FROM_PROFILE=profile\nENV_FILES_SET=profile\n',
      );
      writeFileSync(
        join(root, '.env'),
        'ENV_FILES_FROM_PROFILE=base\nENV_FILES_FROM_BASE=base\nENV_FILES_SET=base\n',
      );
      process.env.ENV_FILES_SET = 'process';

      loadEnvFiles('test', join(root, 'apps', 'api'));

      expect(process.env.ENV_FILES_FROM_LOCAL).toBe('local');
      expect(process.env.ENV_FILES_FROM_PROFILE).toBe('profile');
      expect(process.env.ENV_FILES_FROM_BASE).toBe('base');
      expect(process.env.ENV_FILES_SET).toBe('process');
    });

    it('does nothing when no file exists', () => {
      expect(() => loadEnvFiles('test', join(root, 'apps', 'api'))).not.toThrow();
    });
  });
});

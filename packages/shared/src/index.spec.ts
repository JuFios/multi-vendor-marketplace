import { describe, expect, it } from 'vitest';

import { APP_NAME } from './index';

describe('shared package', () => {
  it('exposes the application name', () => {
    expect(APP_NAME).toBe('multi-vendor-marketplace');
  });
});

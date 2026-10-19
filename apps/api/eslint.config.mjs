import { defineConfig } from 'eslint/config';
import importX, { createNodeResolver } from 'eslint-plugin-import-x';

import { baseConfig } from '../../eslint.base.mjs';

// Business modules (`src/modules/<name>`); the names come from the specification.
const BUSINESS_MODULES = [
  'auth',
  'users',
  'sellers',
  'categories',
  'products',
  'search-sync',
  'cart',
  'orders',
  'bidding',
  'payments-ledger',
  'analytics',
  'notifications',
  'reviews',
  'disputes',
];

// Shared and infrastructure code that business modules depend on, never the other way round.
const TECHNICAL_DIRECTORIES = [
  'adapters',
  'common',
  'config',
  'prisma',
  'redis',
  'queue',
  'outbox',
  'idempotency',
  'cache',
  'search',
  'logger',
  'metrics',
  'health',
];

// Fixed dependency directions: the reverse direction goes through domain events only.
const FORBIDDEN_MODULE_IMPORTS = [
  ['bidding', 'products'],
  ['payments-ledger', 'orders'],
];

const moduleDir = (name) => `./src/modules/${name}`;

// A module reaches another one only through the providers that module exports (plus its DTOs
// and types), so repositories and queue processors of other modules are off limits.
const crossModuleZones = BUSINESS_MODULES.flatMap((module) =>
  BUSINESS_MODULES.filter((other) => other !== module).map((other) => ({
    target: `${moduleDir(module)}/**/*`,
    from: `${moduleDir(other)}/**/*.{repository,processor}.ts`,
    message: `Module "${module}" must not import internals of module "${other}"; use its exported providers.`,
  })),
);

const restrictedZones = [
  ...TECHNICAL_DIRECTORIES.map((directory) => ({
    target: `./src/${directory}/**/*`,
    from: './src/modules',
    message: 'Technical code must not import business modules.',
  })),
  ...crossModuleZones,
  ...FORBIDDEN_MODULE_IMPORTS.map(([module, other]) => ({
    target: `${moduleDir(module)}/**/*`,
    from: `${moduleDir(other)}/**/*`,
    message: `Module "${module}" must not import module "${other}"; the dependency goes the other way.`,
  })),
];

// Files that hold pure domain logic (states, calculations, rules) stay free of frameworks and
// infrastructure clients. Nest building blocks and DTOs are excluded.
const NEST_BUILDING_BLOCKS = [
  '**/*.{module,controller,service,repository,processor,guard,strategy,interceptor,filter,pipe,decorator,gateway,dto}.ts',
  '**/*.spec.ts',
  '**/{dto,guards,decorators,strategies,mappers}/**',
];

const INFRASTRUCTURE_PACKAGES = [
  '@nestjs/*',
  '@prisma/*',
  '**/generated/prisma/**',
  'bullmq',
  'ioredis',
  'meilisearch',
  'socket.io',
  '@socket.io/*',
];

export default defineConfig(
  baseConfig,
  {
    plugins: { 'import-x': importX },
    // Without the TypeScript resolver and parser the import-x rules below cannot follow imports
    // and would silently check nothing.
    settings: {
      'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
      'import-x/resolver-next': [
        createNodeResolver({ extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'] }),
      ],
    },
    rules: {
      'import-x/no-cycle': 'error',
      'import-x/no-restricted-paths': [
        'error',
        { basePath: import.meta.dirname, zones: restrictedZones },
      ],
    },
  },
  {
    files: ['src/modules/**/*.ts'],
    ignores: NEST_BUILDING_BLOCKS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: INFRASTRUCTURE_PACKAGES,
              message: 'Pure domain logic must not depend on frameworks or infrastructure clients.',
            },
          ],
        },
      ],
    },
  },
);

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make module boundaries meaningless.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'module-public-api-only',
      severity: 'error',
      comment: 'A module may import another module only through its index.ts (the public API).',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'domain/ holds pure functions and types: no framework, ORM, queue, cache, search or socket imports.',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: {
        path: [
          '^src/infrastructure/',
          '(^|/)node_modules/@nestjs/',
          '(^|/)node_modules/@prisma/',
          '(^|/)node_modules/bullmq/',
          '(^|/)node_modules/ioredis/',
          '(^|/)node_modules/meilisearch/',
          '(^|/)node_modules/socket\\.io',
          '(^|/)node_modules/@socket\\.io/',
        ],
      },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.spec\\.ts$', '^src/generated/'] },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['main', 'types'],
    },
  },
};

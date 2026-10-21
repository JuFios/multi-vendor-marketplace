/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'src/.*\\.spec\\.ts$',
  setupFilesAfterEnv: ['<rootDir>/test/setup-unit.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: false }],
  },
  // CI exports CI=true; locally coverage stays off for faster runs.
  collectCoverage: process.env.CI === 'true',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/worker.ts',
    '!src/**/*.spec.ts',
    '!src/generated/**',
  ],
  coverageDirectory: './coverage',
};

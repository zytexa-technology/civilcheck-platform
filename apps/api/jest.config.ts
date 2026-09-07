import type { Config } from 'jest'

// NodeNext + ESM project (see tsconfig.json), so ts-jest runs in its ESM
// preset. Source imports use explicit ".js" extensions (NodeNext requires it
// even for .ts files) — moduleNameMapper strips them back so ts-jest can
// resolve the .ts sources directly.
const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: './tsconfig.test.json' }],
  },
  testMatch: ['**/tests/**/*.test.ts'],
  setupFiles: ['dotenv/config'],
  testTimeout: 20000,
  // Sequential — the suite shares one Neon dev DB (see roadmap.md Day 7) and
  // several tests mutate global-ish rows (seller strikeCount, badge), so
  // parallel workers would race each other.
  maxWorkers: 1,
}

export default config

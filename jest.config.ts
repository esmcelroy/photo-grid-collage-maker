import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // lucide-react is ESM-only; mock all icons used by shadcn components
    'lucide-react/dist/esm/icons/(.*)': '<rootDir>/src/__tests__/__mocks__/lucide-icon.tsx',
    // libheif-js uses WASM which can't run in jsdom
    'libheif-js': '<rootDir>/src/__tests__/__mocks__/libheif-js.ts',
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  // Only match *.test.ts / *.test.tsx — excludes setup files and Playwright .spec.ts
  testMatch: [
    '**/*.test.ts',
    '**/*.test.tsx',
  ],
  // Belt-and-suspenders: keep e2e/, server/, and node_modules out of Jest
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/', '<rootDir>/server/'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/App.tsx',          // Integration component — covered by Playwright E2E tests
    '!src/ErrorFallback.tsx', // Uses import.meta.env (Vite-only API); not testable in Jest
    '!src/lib/db.ts',        // Dexie/IndexedDB layer — covered by Playwright E2E tests
    '!src/lib/heic-utils.ts', // WASM-dependent — canvas/libheif mocked in tests
    '!src/components/ui/**',
    '!src/vite-end.d.ts',
    '!src/index.css',
    '!src/main.css',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        jsx: 'react-jsx',
        // Override bundler-mode settings that ts-jest doesn't support
        moduleResolution: 'bundler',
        allowImportingTsExtensions: false,
      },
    }],
  },
}

export default config

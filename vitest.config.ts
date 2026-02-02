import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['node_modules', 'build', 'e2e/**'],
    environment: 'node',
    globals: true,
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'build', 'tests'],
    },
    testTimeout: 10000,
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@shared': '/src/shared',
      '@plugin': '/src/plugin',
      '@ui': '/src/ui',
    },
  },
});

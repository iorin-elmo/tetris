import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/server/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 20000,
  },
});

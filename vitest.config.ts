import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@server': path.resolve(__dirname, 'src/server'),
    },
  },
  test: {
    passWithNoTests: true,
    setupFiles: ['src/server/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/server/**', 'src/shared/**'],
      exclude: ['src/server/vite-dev.ts', 'src/server/index.ts', 'src/server/test/**'],
      thresholds: {
        lines: 95,
        branches: 85,
        functions: 95,
        statements: 95,
      },
    },
  },
});

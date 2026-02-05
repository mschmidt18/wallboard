import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@server': path.resolve(__dirname),
    },
  },
  test: {
    passWithNoTests: true,
    setupFiles: [path.resolve(__dirname, 'test/setup.ts')],
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*.ts', 'src/shared/**/*.ts'],
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

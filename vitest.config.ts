import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: [
      'apps/**/*.test.ts',
      'packages/**/*.test.ts',
      'modules/**/*.test.ts',
      'tests/**/*.test.mjs',
      'tools/**/*.test.mjs'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.int.test.ts',
      'tests/architecture/fixtures/**'
    ],
    testTimeout: 30_000
  }
});

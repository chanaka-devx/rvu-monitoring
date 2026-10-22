import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: ['apps/**/*.int.test.ts', 'packages/**/*.int.test.ts', 'modules/**/*.int.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/architecture/fixtures/**'],
    testTimeout: 60_000
  }
});

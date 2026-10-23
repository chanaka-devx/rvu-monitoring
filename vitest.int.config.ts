import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Ryuk defaults are enabled. If the Windows WSL2 tcp DOCKER_HOST cannot
// start Ryuk, export TESTCONTAINERS_RYUK_DISABLED=true here (config only)
// and record it in ADR 0010.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: ['**/*.int.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/architecture/fixtures/**'],
    globalSetup: 'packages/testing/src/postgres/global-setup.ts',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000
  }
});

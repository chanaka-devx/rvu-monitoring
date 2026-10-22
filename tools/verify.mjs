import { spawnSync } from 'node:child_process';

const steps = ['typecheck', 'lint', 'arch', 'test', 'test:int'];
const isWindows = process.platform === 'win32';

for (const step of steps) {
  console.log(`\n>>> pnpm ${step}`);

  const result = spawnSync(isWindows ? 'pnpm.cmd' : 'pnpm', ['run', step], {
    stdio: 'inherit',
    shell: isWindows,
    env: process.env
  });

  if (result.error || result.status !== 0) {
    console.error(`\nverify: "${step}" failed.`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nverify: all checks passed.');

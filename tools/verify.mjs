import { spawnSync } from 'node:child_process';

const steps = ['typecheck', 'lint', 'arch', 'test', 'test:int'];
const fast = process.argv.slice(2).includes('--fast');
const selected = fast ? steps.filter((step) => step !== 'test:int') : steps;
const isWindows = process.platform === 'win32';

if (fast) {
  console.log('verify:fast — running without test:int.');
}

for (const step of selected) {
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

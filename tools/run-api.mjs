import path from 'node:path';
import { spawn } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const child = spawn(process.execPath, [
  `--env-file-if-exists=${path.join(root, '.env')}`, '--import', 'tsx',
  path.join(root, 'apps', 'api', 'src', 'main.ts')
], { cwd: root, env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, 'apps', 'api', 'tsconfig.json') }, stdio: 'inherit' });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
child.on('error', () => { console.error('Unable to start API'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

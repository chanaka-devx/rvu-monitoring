import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supportedCommands = new Set(['up', 'down', 'ps', 'check']);

function readEnvFile() {
  const envPath = path.join(repoRoot, '.env');

  if (!fs.existsSync(envPath)) {
    return {};
  }

  try {
    const { parseEnv } = process.getBuiltinModule('node:util');
    return parseEnv(fs.readFileSync(envPath, 'utf8'));
  } catch {
    return {};
  }
}

function getEnvironment() {
  return {
    ...readEnvFile(),
    ...process.env
  };
}

function getDatabasePort(env) {
  const rawPort = env.DB_PORT ?? '5432';
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`DB_PORT must be an integer between 1 and 65535 (received "${rawPort}").`);
  }

  return port;
}

function runCompose(args) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'wsl.exe' : 'docker';
  const commandArgs = isWindows ? ['docker', 'compose', ...args] : ['compose', ...args];

  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
  });

  if (result.error) {
    console.error(
      isWindows
        ? 'Could not run wsl.exe. Install WSL2 with Ubuntu, or make sure wsl.exe is on PATH.'
        : 'Could not run docker. Install Docker Engine and the Compose plugin.'
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function checkDatabase(env) {
  const port = getDatabasePort(env);
  const host = 'localhost';

  const socket = net.createConnection({ host, port });

  const fail = (reason) => {
    console.error(`Database is not reachable at ${host}:${port}: ${reason}`);
    console.error('Start it with "pnpm db:up" and inspect it with "pnpm db:ps".');
    process.exitCode = 1;
  };

  socket.setTimeout(5_000);

  socket.once('connect', () => {
    console.log(`Database is reachable at ${host}:${port}.`);
    socket.end();
  });

  socket.once('timeout', () => {
    socket.destroy();
    fail('connection timed out');
  });

  socket.once('error', (error) => {
    fail(error.message);
  });
}

function main() {
  const command = process.argv[2];

  if (!supportedCommands.has(command)) {
    console.error('Usage: node tools/db.mjs <up|down|ps|check>');
    process.exit(1);
  }

  const env = getEnvironment();

  if (command === 'check') {
    checkDatabase(env);
    return;
  }

  getDatabasePort(env);

  if (command === 'up') {
    runCompose(['up', '-d', '--wait']);
    return;
  }

  if (command === 'down') {
    runCompose(['down']);
    return;
  }

  runCompose(['ps']);
}

main();

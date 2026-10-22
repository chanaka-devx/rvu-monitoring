import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedDockerHosts = new Set([
  'tcp://localhost:2375',
  'tcp://127.0.0.1:2375'
]);

function parseNodeMajor(version) {
  const normalized = version.trim().replace(/^v/, '');
  return Number.parseInt(normalized.split('.')[0] ?? '', 10);
}

function normalizeCommandResult(result) {
  return {
    ok: !result.error && result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    error: result.error
  };
}

export function evaluateDoctor({
  platform = process.platform,
  nodeVersion = process.version,
  repoPath = repoRoot,
  env = process.env,
  commands
}) {
  const failures = [];
  const warnings = [];
  const checks = [];

  const nodeMajor = parseNodeMajor(nodeVersion);
  if (nodeMajor !== 22) {
    failures.push({
      code: 'node-version',
      message: `Node.js 22 is required (found ${nodeVersion}). Install Node 22 and run "nvm use 22" or use the version in .nvmrc.`
    });
  } else {
    checks.push(`Node.js ${nodeVersion}`);
  }

  const pnpm = commands.pnpmVersion();
  if (!pnpm.ok) {
    failures.push({
      code: 'pnpm-missing',
      message:
        'pnpm is not available. Install it with "npm install -g pnpm@10.34.7" and reopen the terminal.'
    });
  } else {
    checks.push(`pnpm ${pnpm.stdout}`);
  }

  if (repoPath.toLowerCase().includes('onedrive')) {
    failures.push({
      code: 'onedrive-path',
      message: `The repository path contains "OneDrive" (${repoPath}). Move the repository to a short local path such as C:\\dev\\rvu-monitoring.`
    });
  } else {
    checks.push('repository is outside OneDrive');
  }

  const isWindows = platform === 'win32';
  let dockerChecksAvailable = true;

  if (isWindows) {
    const wsl = commands.wslVersion();
    if (!wsl.ok) {
      dockerChecksAvailable = false;
      failures.push({
        code: 'wsl-missing',
        message:
          'wsl.exe is not available. Install WSL2 with Ubuntu ("wsl --install -d Ubuntu") and reopen the terminal.'
      });
    } else {
      checks.push('wsl.exe is available');
    }
  }

  if (dockerChecksAvailable) {
    const dockerInfo = commands.dockerInfo();
    if (!dockerInfo.ok) {
      failures.push({
        code: 'docker-info',
        message: isWindows
          ? 'Docker Engine is not reachable through WSL. Start Docker inside Ubuntu and verify with "wsl docker info".'
          : 'Docker Engine is not reachable. Start Docker and verify with "docker info".'
      });
    } else {
      checks.push('Docker Engine is reachable');
    }

    const operatingSystem = commands.dockerOperatingSystem();
    if (
      operatingSystem.ok &&
      operatingSystem.stdout.toLowerCase().includes('docker desktop')
    ) {
      failures.push({
        code: 'docker-desktop',
        message:
          'Docker Desktop must not be used. Docker Engine must run inside WSL2 Ubuntu; remove Docker Desktop from the WSL docker context.'
      });
    } else if (operatingSystem.ok) {
      checks.push(`Docker operating system: ${operatingSystem.stdout}`);
    }

    const compose = commands.dockerComposeVersion();
    if (!compose.ok) {
      failures.push({
        code: 'docker-compose',
        message: isWindows
          ? 'The Docker Compose plugin is not available in WSL. Install it inside Ubuntu and verify with "wsl docker compose version".'
          : 'The Docker Compose plugin is not available. Verify with "docker compose version".'
      });
    } else {
      checks.push(`Docker Compose ${compose.stdout.replace(/^Docker Compose version\s+/, '')}`);
    }
  }

  if (isWindows && !allowedDockerHosts.has(env.DOCKER_HOST ?? '')) {
    warnings.push({
      code: 'docker-host',
      message:
        'DOCKER_HOST is not set to tcp://localhost:2375. It is required from phase P2 for Testcontainers integration tests.'
    });
  }

  return {
    ok: failures.length === 0,
    checks,
    failures,
    warnings
  };
}

function runCommand(command, args) {
  return normalizeCommandResult(
    spawnSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    })
  );
}

function createSystemCommands(platform) {
  const isWindows = platform === 'win32';
  const docker = (args) =>
    isWindows ? runCommand('wsl.exe', ['docker', ...args]) : runCommand('docker', args);

  return {
    pnpmVersion: () => runCommand('pnpm', ['--version']),
    wslVersion: () => runCommand('wsl.exe', ['--version']),
    dockerInfo: () => docker(['info']),
    dockerOperatingSystem: () => docker(['info', '--format', '{{.OperatingSystem}}']),
    dockerComposeVersion: () => docker(['compose', 'version'])
  };
}

export function formatDoctorResult(result) {
  const lines = [];

  for (const check of result.checks) {
    lines.push(`PASS ${check}`);
  }

  for (const warning of result.warnings) {
    lines.push(`WARN ${warning.message}`);
  }

  for (const failure of result.failures) {
    lines.push(`FAIL ${failure.message}`);
  }

  lines.push(
    result.ok
      ? 'Environment check found no blocking issues.'
      : 'Environment check found blocking issues.'
  );
  return lines.join('\n');
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }

  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  const result = evaluateDoctor({
    commands: createSystemCommands(process.platform)
  });

  console.log(formatDoctorResult(result));
  process.exit(result.ok ? 0 : 1);
}

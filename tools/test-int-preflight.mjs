import net from 'node:net';
import { spawnSync } from 'node:child_process';

const TIMEOUT_MS = 2000;

const WINDOWS_SETUP_HINT =
  'Set DOCKER_HOST=tcp://localhost:2375 for this shell ' +
  '(see docs/adr/0004-dev-environment.md: Docker Engine lives inside WSL2).';

const WINDOWS_UNREACHABLE_HINT =
  'Cannot reach the Docker Engine through DOCKER_HOST. WSL2 Docker may be idle. ' +
  "Run 'wsl docker ps' to wake it up, and make sure the WSL daemon publishes " +
  'its TCP endpoint on port 2375.';

function connectTcp(dockerHost, timeoutMsMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(dockerHost);
    } catch {
      reject(new Error(`invalid DOCKER_HOST: ${dockerHost}`));
      return;
    }

    const host = parsed.hostname === '' ? 'localhost' : parsed.hostname;
    const port = Number(parsed.port) || 2375;
    const socket = net.connect({ host, port });

    let settled = false;
    const finish = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      } else {
        resolve();
      }
    };

    socket.setTimeout(timeoutMsMs);
    socket.once('connect', () => finish());
    socket.once('timeout', () => finish(new Error(`timeout after ${timeoutMsMs}ms`)));
    socket.once('error', (error) => finish(error));
  });
}

function defaultDockerInfo() {
  const result = spawnSync('docker', ['info'], { encoding: 'utf8' });
  return { ok: Boolean(result.status === 0), stderr: result.stderr ?? '' };
}

export async function preflight({
  platform = process.platform,
  env = process.env,
  connect = connectTcp,
  dockerInfo = defaultDockerInfo,
  timeoutMs = TIMEOUT_MS
} = {}) {
  if (platform === 'win32') {
    if (!env.DOCKER_HOST) {
      return { ok: false, message: `test:int requires DOCKER_HOST on Windows. ${WINDOWS_SETUP_HINT}` };
    }

    try {
      await connect(env.DOCKER_HOST, timeoutMs);
    } catch (error) {
      return { ok: false, message: `${WINDOWS_UNREACHABLE_HINT} (reason: ${error.message})` };
    }
    return { ok: true };
  }

  if (!env.DOCKER_HOST) {
    const { ok } = dockerInfo();
    if (!ok) {
      return {
        ok: false,
        message: 'test:int needs Docker but "docker info" failed. Is Docker installed and running?'
      };
    }
    return { ok: true };
  }

  try {
    await connect(env.DOCKER_HOST, timeoutMs);
  } catch (error) {
    return {
      ok: false,
      message: `Cannot reach Docker at ${env.DOCKER_HOST}. Is the Docker endpoint up? (reason: ${error.message})`
    };
  }
  return { ok: true };
}

import { describe, expect, it } from 'vitest';
import { preflight } from './test-int-preflight.mjs';

function connectFail() {
  return async () => {
    throw new Error('ECONNREFUSED');
  };
}

function connectOk() {
  return async (host, port) => {
    return { host, port };
  };
}

describe('test:int preflight', () => {
  it('fails on win32 when DOCKER_HOST is missing, with the actionable message', async () => {
    const decision = await preflight({
      platform: 'win32',
      env: {},
      connect: connectOk(),
      dockerInfo: () => ({ ok: true })
    });

    expect(decision.ok).toBe(false);
    expect(decision.message).toContain('DOCKER_HOST=tcp://localhost:2375');
    expect(decision.message).toContain('docs/adr/0004');
  });

  it('fails on win32 when the TCP endpoint is unreachable, suggesting wsl docker ps', async () => {
    const decision = await preflight({
      platform: 'win32',
      env: { DOCKER_HOST: 'tcp://localhost:2375' },
      connect: connectFail(),
      dockerInfo: () => ({ ok: true })
    });

    expect(decision.ok).toBe(false);
    expect(decision.message).toContain('wsl docker ps');
  });

  it('passes on win32 when DOCKER_HOST is set and reachable', async () => {
    const decision = await preflight({
      platform: 'win32',
      env: { DOCKER_HOST: 'tcp://localhost:2375' },
      connect: connectOk(),
      dockerInfo: () => {
        throw new Error('must not run docker info on win32');
      }
    });

    expect(decision.ok).toBe(true);
  });

  it('runs docker info on non-Windows when DOCKER_HOST is unset, failing if unreachable', async () => {
    const failing = await preflight({
      platform: 'linux',
      env: {},
      connect: connectOk(),
      dockerInfo: () => ({ ok: false })
    });
    expect(failing.ok).toBe(false);

    const passing = await preflight({
      platform: 'linux',
      env: {},
      connect: connectOk(),
      dockerInfo: () => ({ ok: true })
    });
    expect(passing.ok).toBe(true);
  });

  it('passes on non-Windows when DOCKER_HOST is set and reachable', async () => {
    const decision = await preflight({
      platform: 'linux',
      env: { DOCKER_HOST: 'tcp://localhost:2375' },
      connect: connectOk(),
      dockerInfo: () => {
        throw new Error('must not run docker info');
      }
    });

    expect(decision.ok).toBe(true);
  });

  it('rejects connections beyond the timeout window', async () => {
    let observedTimeout;
    const decision = await preflight({
      platform: 'win32',
      env: { DOCKER_HOST: 'tcp://localhost:2375' },
      connect: async (_dockerHost, timeoutMs) => {
        observedTimeout = timeoutMs;
        throw new Error('timeout');
      },
      dockerInfo: () => ({ ok: true })
    });

    expect(decision.ok).toBe(false);
    expect(observedTimeout).toBe(2000);
    expect(decision.message).toContain('wsl docker ps');
  });
});

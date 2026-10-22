import { describe, expect, it } from 'vitest';
import { evaluateDoctor, formatDoctorResult } from './doctor.mjs';

function commandResult(stdout = '') {
  return { ok: true, stdout, stderr: '' };
}

function failedCommand(stderr = 'command failed') {
  return { ok: false, stdout: '', stderr };
}

function createCommands(overrides = {}) {
  return {
    pnpmVersion: () => commandResult('10.34.7'),
    wslVersion: () => commandResult('WSL version: 2.3.26.0'),
    dockerInfo: () => commandResult('Server Version: 27.0.0'),
    dockerOperatingSystem: () => commandResult('Ubuntu 24.04.1 LTS'),
    dockerComposeVersion: () => commandResult('Docker Compose version v2.40.3'),
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  return {
    platform: 'win32',
    nodeVersion: 'v22.18.0',
    repoPath: 'C:/dev/rvu-monitoring',
    env: { DOCKER_HOST: 'tcp://localhost:2375' },
    commands: createCommands(),
    ...overrides
  };
}

describe('environment check', () => {
  it('passes on a healthy Windows environment', () => {
    const result = evaluateDoctor(baseOptions());

    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails when Node is not major 22', () => {
    const result = evaluateDoctor(baseOptions({ nodeVersion: 'v20.11.0' }));

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain('node-version');
  });

  it('fails when pnpm is missing', () => {
    const result = evaluateDoctor(
      baseOptions({
        commands: createCommands({ pnpmVersion: () => failedCommand() })
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain('pnpm-missing');
  });

  it('fails when the repository is inside OneDrive', () => {
    const result = evaluateDoctor(
      baseOptions({ repoPath: 'C:/Users/HP/OneDrive/Documents/rvu-monitoring' })
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain('onedrive-path');
  });

  it('fails when wsl.exe is missing', () => {
    const result = evaluateDoctor(
      baseOptions({
        commands: createCommands({ wslVersion: () => failedCommand() })
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain('wsl-missing');
  });

  it('fails when Docker is not reachable through WSL', () => {
    const result = evaluateDoctor(
      baseOptions({
        commands: createCommands({ dockerInfo: () => failedCommand() })
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain('docker-info');
  });

  it('fails when the Docker operating system is Docker Desktop', () => {
    const result = evaluateDoctor(
      baseOptions({
        commands: createCommands({
          dockerOperatingSystem: () => commandResult('Docker Desktop')
        })
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain('docker-desktop');
  });

  it('fails when the Docker Compose plugin is missing', () => {
    const result = evaluateDoctor(
      baseOptions({
        commands: createCommands({ dockerComposeVersion: () => failedCommand() })
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain('docker-compose');
  });

  it('warns when DOCKER_HOST is missing or invalid on Windows', () => {
    const missing = evaluateDoctor(baseOptions({ env: {} }));
    const invalid = evaluateDoctor(baseOptions({ env: { DOCKER_HOST: 'tcp://localhost:9999' } }));

    expect(missing.ok).toBe(true);
    expect(missing.warnings.map((warning) => warning.code)).toContain('docker-host');
    expect(invalid.ok).toBe(true);
    expect(invalid.warnings.map((warning) => warning.code)).toContain('docker-host');
  });

  it('accepts tcp://127.0.0.1:2375 as DOCKER_HOST', () => {
    const result = evaluateDoctor(
      baseOptions({ env: { DOCKER_HOST: 'tcp://127.0.0.1:2375' } })
    );

    expect(result.warnings).toEqual([]);
  });

  it('runs Docker checks without wsl.exe on Linux', () => {
    const result = evaluateDoctor(
      baseOptions({
        platform: 'linux',
        repoPath: '/home/dev/rvu-monitoring',
        env: {},
        commands: createCommands({
          wslVersion: () => {
            throw new Error('wsl.exe must not be called on Linux');
          }
        })
      })
    );

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('formats pass, warn and fail lines', () => {
    const result = evaluateDoctor(
      baseOptions({
        nodeVersion: 'v20.0.0',
        env: {},
        commands: createCommands({ pnpmVersion: () => failedCommand() })
      })
    );
    const output = formatDoctorResult(result);

    expect(output).toContain('FAIL');
    expect(output).toContain('WARN');
    expect(output).toContain('Environment check found blocking issues.');
  });
});

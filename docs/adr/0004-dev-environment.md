# ADR 0004: Development environment

- Status: Accepted
- Date: 2026-10-22
- Owners: RVU Monitoring team
- Phase: P00

## Context

The developer works on Windows with Node.js, pnpm, git and the editor on the
host. Docker Desktop is not used. Docker Engine runs only inside WSL2 Ubuntu.
CI runs on both `ubuntu-latest` and `windows-latest`.

Bind mounts from Windows into WSL containers are slow and have permission and
line-ending failure modes. Scripts written in bash or PowerShell would not run in
both CI environments.

## Decision

- The repository lives on a short local Windows path outside OneDrive.
- Docker Engine runs inside WSL2 Ubuntu only. Docker Desktop is rejected by
  `tools/doctor.mjs`.
- Windows reaches Docker in two ways:
  1. `wsl docker compose ...` for Compose commands, executed with the repository
     root as the current directory. `wsl.exe` maps the Windows working directory
     into Ubuntu.
  2. `DOCKER_HOST=tcp://localhost:2375` for libraries that need the Docker API,
     such as Testcontainers from phase P2.
- Containers publish ports to `localhost`; Windows connects to
  `localhost:${DB_PORT}`.
- Compose files use named volumes only. Repo folders are never bind-mounted.
- All repository automation is cross-platform Node.js under `tools/`. No bash,
  PowerShell-only syntax or hard-coded path separators.
- Files are LF via `.gitattributes` and `.editorconfig`.
- CI runs a Windows/Linux matrix and never runs Docker or `doctor`.

## Consequences

### Positive

- The same commands work in PowerShell, cmd.exe, bash and CI.
- No dependency on Docker Desktop or WSL bind-mount performance.
- File endings are stable across operating systems.
- The environment check gives actionable WSL/Docker diagnostics.

### Negative

- Developers must install and configure WSL2 Ubuntu and Docker Engine inside it.
- `wsl.exe` must be on PATH on Windows.
- Compose commands are slower than a native Linux host.
- Testcontainers integration tests require `DOCKER_HOST` to be exported in the
  developer shell from P2 onwards.
- The P0 rule that apps may not import modules/packages conflicts with the usual
  composition-root role of `apps/api`; see the P00 handoff.

### Follow-up

- Verify the `DOCKER_HOST` TCP endpoint is enabled in the WSL Docker daemon.
- Revisit the app-to-module import rule when composition-root wiring is added.

## Alternatives considered

- Docker Desktop on Windows. Rejected by project policy and detected by doctor.
- Native Windows Postgres. Rejected because it diverges from CI and container
  reproducibility.
- Bash scripts. Rejected because they do not run on the Windows CI runner and
  the developer host without an extra shell.

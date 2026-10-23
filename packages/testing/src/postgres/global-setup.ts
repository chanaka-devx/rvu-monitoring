import type { GlobalSetupContext } from 'vitest/node';
import { startPostgresContainer, type PostgresContainerHandle } from './container';
import './provided-context';

let container: PostgresContainerHandle | undefined;

export async function setup({ provide }: GlobalSetupContext): Promise<void> {
  container = await startPostgresContainer();
  provide('postgresAdminUrl', container.adminUrl);
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop();
    container = undefined;
  }
}

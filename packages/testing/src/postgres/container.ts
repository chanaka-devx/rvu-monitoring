import { POSTGRES_IMAGE } from './image';

export interface PostgresContainerHandle {
  adminUrl: string;
  stop(): Promise<void>;
}

export async function startPostgresContainer(): Promise<PostgresContainerHandle> {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');

  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withEnvironment({
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      POSTGRES_DB: 'postgres'
    })
    .start();

  return {
    adminUrl: container.getConnectionUri(),
    stop: async () => {
      await container.stop({ timeout: 10_000 });
    }
  };
}

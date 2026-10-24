import { afterAll, beforeAll, inject } from 'vitest';
import { createTestDatabase, type TestDatabase } from './test-database';

export function useTestDatabase(): { url: string } {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(inject('postgresAdminUrl'));
  });

  afterAll(async () => {
    await database?.drop();
    database = undefined;
  });

  return {
    get url(): string {
      if (!database) {
        throw new Error('Test database is not ready yet; query it inside a test.');
      }
      return database.url;
    }
  };
}

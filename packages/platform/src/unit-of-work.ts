import { AsyncLocalStorage } from 'node:async_hooks';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { CurrentTenant, PracticeId, UnitOfWork } from '@rvu/shared-kernel';
import { currentContext } from './execution-context';

export class AsyncLocalStorageCurrentTenant implements CurrentTenant {
  requirePracticeId(): PracticeId {
    const id = currentContext().practiceId;
    if (!id) throw new Error('A tenant context is required');
    return id;
  }
}

export class PgUnitOfWork<DB> implements UnitOfWork {
  private readonly storage = new AsyncLocalStorage<{ transaction: Transaction<DB>; practiceId: PracticeId | undefined }>();
  constructor(private readonly db: Kysely<DB>) {}
  getExecutor(): Kysely<DB> { return this.storage.getStore()?.transaction ?? this.db; }
  isActive(): boolean { return this.storage.getStore() !== undefined; }
  async run<T>(work: () => Promise<T>): Promise<T> {
    const existing = this.storage.getStore();
    if (existing) {
      if (existing.practiceId !== currentContext().practiceId) throw new Error('Cannot change tenant inside a Unit of Work');
      return work();
    }
    return this.db.transaction().execute(async (transaction) => {
      await sql`select set_config('app.practice_id', ${currentContext().practiceId ?? ''}, true)`.execute(transaction);
      return this.storage.run({ transaction, practiceId: currentContext().practiceId }, work);
    });
  }
}

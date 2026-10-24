import { AsyncLocalStorage } from 'node:async_hooks';
import type { PracticeId } from '@rvu/shared-kernel';

export interface ExecutionContext {
  readonly correlationId?: string;
  readonly practiceId?: PracticeId;
  readonly actorId?: string;
}

const storage = new AsyncLocalStorage<Readonly<ExecutionContext>>();
const empty = Object.freeze({});

export function currentContext(): Readonly<ExecutionContext> {
  return storage.getStore() ?? empty;
}

export function runWithContext<T>(context: ExecutionContext, work: () => T): T {
  return storage.run(Object.freeze({ ...currentContext(), ...context }), work);
}

import type { Result } from '@rvu/shared-kernel';

function renderError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const domainError = error as { code: string; message: string };
    return `${domainError.code}: ${domainError.message}`;
  }
  return String(error);
}

export function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`expected ok result but got error: ${renderError(result.error)}`);
  }
  return result.value;
}

export function expectErr<T, E>(result: Result<T, E>): E {
  if (result.ok) {
    throw new Error(`expected error result but got ok: ${String(result.value)}`);
  }
  return result.error;
}

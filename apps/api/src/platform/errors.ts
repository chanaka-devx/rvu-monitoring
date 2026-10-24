import { HttpException } from '@nestjs/common';

export function statusForKind(kind: string): number {
  return ({ validation: 422, not_found: 404, conflict: 409, forbidden: 403,
    unauthenticated: 401, unexpected: 500 } as Record<string, number>)[kind] ?? 500;
}
export function problemFor(error: unknown, correlationId?: string) {
  const domain = error && typeof error === 'object' && 'kind' in error && 'code' in error && 'message' in error
    ? error as { kind: string; code: string; message: string; details?: unknown } : undefined;
  const status = domain ? statusForKind(domain.kind) : error instanceof HttpException ? error.getStatus() : 500;
  return { type: 'about:blank', title: status >= 500 ? 'Internal Server Error' : 'Request failed', status,
    code: status >= 500 ? 'unexpected' : domain?.code ?? `http/${status}`,
    detail: status >= 500 ? 'An unexpected error occurred' : domain?.message ?? (error instanceof HttpException ? error.message : 'Request failed'),
    correlationId,
    ...(domain?.kind === 'validation' && domain.details ? { errors: domain.details } : {}) };
}

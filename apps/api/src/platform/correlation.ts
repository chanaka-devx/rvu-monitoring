import { UuidV7Generator } from '@rvu/shared-kernel';
import { runWithContext } from '@rvu/platform';

export function validCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(value);
}
export class CorrelationIdMiddleware {
  use(req: { headers: Record<string, unknown> }, res: { setHeader(name: string, value: string): void }, next: () => void): void {
    const incoming = req.headers['x-correlation-id'];
    const correlationId = validCorrelationId(incoming) ? incoming : new UuidV7Generator().next();
    res.setHeader('X-Correlation-Id', correlationId);
    runWithContext({ correlationId }, next);
  }
}

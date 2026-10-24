import pino, { type DestinationStream } from 'pino';
import { currentContext } from './execution-context';

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) return { type: value.name, message: value.message, stack: value.stack };
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, seen));
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/^(body|payload|query|querystring|url|originalurl)$/i.test(key)) continue;
    result[key] = /^(authorization|cookie|password|token)$/i.test(key) ? '[Redacted]' : sanitize(entry, seen);
  }
  return result;
}
export function createLogger(config: { logLevel: string }, stream?: DestinationStream) {
  return pino({ level: config.logLevel,
    mixin: () => ({ ...currentContext() }),
    formatters: { log: (record) => sanitize(record) as Record<string, unknown> }
  }, stream);
}

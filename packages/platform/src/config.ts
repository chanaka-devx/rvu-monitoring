import { z } from 'zod';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface PlatformConfig {
  databaseUrl: string;
  appDatabaseUrl: string;
  dbPoolMax: number;
  dbStatementTimeoutMs: number;
  logLevel: LogLevel;
  outboxPollIntervalMs: number;
  outboxBatchSize: number;
  outboxMaxAttempts: number;
  outboxBackoffBaseMs: number;
  outboxBackoffMaxMs: number;
}

export const postgresUrl = z
  .string()
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'must be a postgres:// or postgresql:// URL'
  })
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.username !== '' && url.hostname !== '';
      } catch {
        return false;
      }
    },
    { message: 'must be a valid URL with a user name and host' }
  );

const schema = z
  .object({
    DATABASE_URL: postgresUrl,
    APP_DATABASE_URL: postgresUrl,
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(50),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
    OUTBOX_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(1000),
    OUTBOX_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(60000)
  });

export class PlatformConfigError extends Error {
  constructor(issues: string[]) {
    super(`Platform configuration is invalid\n  -${issues.join('\n  -')}`);
    this.name = 'PlatformConfigError';
  }
}

export function loadPlatformConfig(env: Record<string, string | undefined>): PlatformConfig {
  const parsed = schema.safeParse(env);

  if (parsed.success) {
    return {
      databaseUrl: parsed.data.DATABASE_URL,
      appDatabaseUrl: parsed.data.APP_DATABASE_URL,
      dbPoolMax: parsed.data.DB_POOL_MAX,
      dbStatementTimeoutMs: parsed.data.DB_STATEMENT_TIMEOUT_MS,
      logLevel: parsed.data.LOG_LEVEL,
      outboxPollIntervalMs: parsed.data.OUTBOX_POLL_INTERVAL_MS,
      outboxBatchSize: parsed.data.OUTBOX_BATCH_SIZE,
      outboxMaxAttempts: parsed.data.OUTBOX_MAX_ATTEMPTS,
      outboxBackoffBaseMs: parsed.data.OUTBOX_BACKOFF_BASE_MS,
      outboxBackoffMaxMs: parsed.data.OUTBOX_BACKOFF_MAX_MS
    };
  }

  const issues = parsed.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return ` ${path}: ${issue.message}`;
  });

  throw new PlatformConfigError(issues.map((issue) => issue.trimStart()));
}

export function redactUrl(url: string): string {
  return url.replace(/:\/\/([^:/@]+):([^@]+)@/, '://$1:***@');
}

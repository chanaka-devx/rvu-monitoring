import { Global, Module, Inject, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { SystemClock } from '@rvu/shared-kernel';
import { loadPlatformConfig, createPool, createDb, PgUnitOfWork, AsyncLocalStorageCurrentTenant,
  PgOutboxPublisher, EventBus, OutboxDispatcher, JobRunner, createLogger } from '@rvu/platform';

export const PLATFORM = Symbol('PLATFORM');
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
export const CURRENT_TENANT = Symbol('CURRENT_TENANT');
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
export const PLATFORM_CONFIG = Symbol('PLATFORM_CONFIG');
export const APP_POOL = Symbol('APP_POOL');
export const LOGGER = Symbol('LOGGER');
export interface Platform {
  config: ReturnType<typeof loadPlatformConfig>;
  logger: ReturnType<typeof createLogger>;
  pool: ReturnType<typeof createPool>;
  db: ReturnType<typeof createDb<Record<string, never>>>;
  uow: PgUnitOfWork<Record<string, never>>;
  eventBus: EventBus;
  outbox: OutboxDispatcher<Record<string, never>>;
  jobs: JobRunner;
  currentTenant: AsyncLocalStorageCurrentTenant;
  publisher: PgOutboxPublisher<Record<string, never>>;
}
export function createPlatform(): Platform {
  const config = loadPlatformConfig(process.env);
  const logger = createLogger(config);
  const pool = createPool(config.appDatabaseUrl, { max: config.dbPoolMax,
    statementTimeoutMs: config.dbStatementTimeoutMs });
  const db = createDb<Record<string, never>>(pool);
  const uow = new PgUnitOfWork(db);
  const eventBus = new EventBus();
  const outbox = new OutboxDispatcher(pool, uow, eventBus, new SystemClock(), {
    pollIntervalMs: config.outboxPollIntervalMs, batchSize: config.outboxBatchSize,
    maxAttempts: config.outboxMaxAttempts, backoffBaseMs: config.outboxBackoffBaseMs,
    backoffMaxMs: config.outboxBackoffMaxMs
  }, (err) => logger.error({ err }, 'Outbox polling failed'));
  const jobs = new JobRunner(config.appDatabaseUrl, (err) => logger.error({ err }, 'Job worker failed'));
  return { config, logger, pool, db, uow, eventBus, outbox, jobs,
    currentTenant: new AsyncLocalStorageCurrentTenant(), publisher: new PgOutboxPublisher(uow) };
}

class PlatformLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(PLATFORM) private readonly platform: Platform) {}
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.platform.jobs.start();
      if (process.env.OUTBOX_DISPATCHER !== 'off') this.platform.outbox.start();
    } catch (error) { await this.onApplicationShutdown(); throw error; }
  }
  async onApplicationShutdown(): Promise<void> {
    try { await this.platform.outbox.stop(); }
    finally { try { await this.platform.jobs.stop(); } finally { await this.platform.db.destroy(); } }
  }
}
@Global()
@Module({ providers: [{ provide: PLATFORM, useFactory: createPlatform }, PlatformLifecycle,
  ...([
    [UNIT_OF_WORK, 'uow'], [CURRENT_TENANT, 'currentTenant'], [EVENT_PUBLISHER, 'publisher'],
    [PLATFORM_CONFIG, 'config'], [APP_POOL, 'pool'], [LOGGER, 'logger'],
    [EventBus, 'eventBus'], [OutboxDispatcher, 'outbox'], [JobRunner, 'jobs']
  ] as const).map(([provide, key]) => ({ provide, inject: [PLATFORM], useFactory: (platform: Platform) => platform[key] }))
], exports: [PLATFORM, UNIT_OF_WORK, CURRENT_TENANT, EVENT_PUBLISHER, PLATFORM_CONFIG, APP_POOL, LOGGER, EventBus, OutboxDispatcher, JobRunner] })
export class PlatformModule {}

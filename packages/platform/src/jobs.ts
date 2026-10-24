import { PgBoss } from 'pg-boss';
import type { ExecutionContext } from './execution-context';
import { currentContext, runWithContext } from './execution-context';

interface Envelope { context: ExecutionContext; data: unknown }
export class JobRunner {
  private readonly boss: PgBoss;
  constructor(url: string, onError: (error: Error) => void = () => {}) {
    this.boss = new PgBoss({ connectionString: url, schema: 'pgboss', migrate: false,
      createSchema: false, supervise: false, schedule: false });
    this.boss.on('error', onError);
  }
  async start(): Promise<void> { await this.boss.start(); }
  async stop(): Promise<void> { await this.boss.stop({ graceful: true }); }
  async enqueue(name: string, data: object, options: { singletonKey?: string; startAfter?: Date } = {}): Promise<string | null> {
    return this.boss.send(name, { data, context: { ...currentContext() } }, options);
  }
  async register(name: string, handler: (data: unknown) => Promise<void>): Promise<void> {
    await this.boss.work<Envelope>(name, async (jobs) => {
      for (const job of jobs) await runWithContext(job.data.context, () => handler(job.data.data));
    });
  }
}

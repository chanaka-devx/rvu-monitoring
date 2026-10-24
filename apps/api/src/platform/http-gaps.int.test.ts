import 'reflect-metadata';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, Param, type INestApplication } from '@nestjs/common';
import { errorOf, type ErrorKind } from '@rvu/shared-kernel';
import { useTestDatabase } from '@rvu/testing';
import { createLogger, createPool } from '@rvu/platform';
import request from 'supertest';
import { HealthController } from '../health/health.controller';
import { CorrelationIdMiddleware } from './correlation';
import { ProblemFilter, ReadyController } from './http';
import { PLATFORM, type Platform } from './platform.module';

const uuidV7 = /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
@Controller('gap-errors')
class GapErrorController {
  @Get(':kind')
  fail(@Param('kind') kind: ErrorKind | 'unknown'): never {
    if (kind === 'unknown') {
      const error = new Error('PRIVATE_MESSAGE_SENTINEL');
      error.stack = 'PRIVATE_STACK_SENTINEL';
      throw error;
    }
    throw errorOf(kind, 'gap/error', 'DOMAIN_MESSAGE_SENTINEL', { field: 'invalid' });
  }
}
const database = useTestDatabase();
let app: INestApplication;
let pool: ReturnType<typeof createPool>;
let closed = false;
let logs = '';
beforeAll(async () => {
  pool = createPool(database.url);
  const sink = new Writable({ write(chunk, _encoding, done) { logs += chunk.toString(); done(); } });
  const platform = { pool, logger: createLogger({ logLevel: 'error' }, sink) } as Platform;
  const module = await Test.createTestingModule({ controllers: [HealthController, ReadyController, GapErrorController],
    providers: [{ provide: PLATFORM, useValue: platform }] }).compile();
  app = module.createNestApplication();
  const middleware = new CorrelationIdMiddleware();
  app.use(middleware.use.bind(middleware));
  app.useGlobalFilters(new ProblemFilter(platform));
  await app.init();
});
afterAll(async () => { await app?.close(); if (pool && !closed) await pool.end(); });

it('echoes valid correlation and generates a full UUIDv7 for invalid and absent headers', async () => {
  const valid = await request(app.getHttpServer()).get('/api/v1/health/ready').set('X-Correlation-Id', 'valid-correlation_123');
  expect(valid.status).toBe(200);
  expect(valid.body).toEqual({ status: 'ok' });
  expect(valid.headers['x-correlation-id']).toBe('valid-correlation_123');
  const generated: string[] = [];
  for (const incoming of ['bad value', undefined]) {
    const query = request(app.getHttpServer()).get('/api/v1/health/ready');
    if (incoming !== undefined) query.set('X-Correlation-Id', incoming);
    const response = await query;
    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toMatch(uuidV7);
    generated.push(response.headers['x-correlation-id']);
  }
  expect(new Set(generated).size).toBe(2);
});

it('maps every DomainError kind to correlated problem+json with validation errors', async () => {
  const statuses: Record<ErrorKind, number> = { validation: 422, not_found: 404, conflict: 409,
    forbidden: 403, unauthenticated: 401, unexpected: 500 };
  for (const [kind, status] of Object.entries(statuses)) {
    const correlationId = `case-${kind}-correlation`;
    const response = await request(app.getHttpServer()).get(`/gap-errors/${kind}`).set('X-Correlation-Id', correlationId);
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json(?:;|$)/);
    expect(response.headers['x-correlation-id']).toBe(correlationId);
    expect(response.body).toMatchObject({ type: 'about:blank', status, correlationId });
    if (kind === 'validation') expect(response.body.errors).toEqual({ field: 'invalid' });
    if (kind === 'unexpected') {
      expect(response.text).not.toContain('DOMAIN_MESSAGE_SENTINEL');
      expect(response.body).not.toHaveProperty('message');
      expect(response.body).not.toHaveProperty('stack');
    }
  }
});

it('conceals unknown error messages and stacks while logging the stack', async () => {
  const response = await request(app.getHttpServer()).get('/gap-errors/unknown');
  expect(response.status).toBe(500);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.body.correlationId).toMatch(uuidV7);
  expect(response.body.correlationId).toBe(response.headers['x-correlation-id']);
  expect(response.body).not.toHaveProperty('message');
  expect(response.body).not.toHaveProperty('stack');
  expect(response.text).not.toContain('PRIVATE_MESSAGE_SENTINEL');
  expect(response.text).not.toContain('PRIVATE_STACK_SENTINEL');
  expect(logs).toContain('PRIVATE_STACK_SENTINEL');
});

it('returns correlated 503 problem+json after closing the app pool', async () => {
  await pool.end();
  closed = true;
  const response = await request(app.getHttpServer()).get('/api/v1/health/ready');
  expect(response.status).toBe(503);
  expect(response.headers['content-type']).toMatch(/^application\/problem\+json(?:;|$)/);
  expect(response.body).toMatchObject({ type: 'about:blank', status: 503, correlationId: response.headers['x-correlation-id'] });
  expect(response.body.correlationId).toMatch(uuidV7);
});

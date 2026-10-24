import 'reflect-metadata';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, Param, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { useTestDatabase } from '@rvu/testing';
import { createPool, createLogger } from '@rvu/platform';
import { ReadyController, ProblemFilter } from './http';
import { PLATFORM, type Platform } from './platform.module';
import { CorrelationIdMiddleware } from './correlation';
import { HealthController } from '../health/health.controller';

@Controller('test')
class ErrorController {
  @Get(':kind')
  fail(@Param('kind') kind: string): never {
    if (kind === 'unknown') throw new Error('private-secret');
    throw { kind, code: 'test/error', message: 'safe detail', details: { field: 'invalid' } };
  }
}
const database = useTestDatabase();
let app: INestApplication;
let pool: ReturnType<typeof createPool>;
beforeAll(async () => {
  pool = createPool(database.url);
  const platform = { pool, logger: createLogger({ logLevel: 'error' }) } as Platform;
  const module = await Test.createTestingModule({ controllers: [HealthController, ReadyController, ErrorController],
    providers: [{ provide: PLATFORM, useValue: platform }] }).compile();
  app = module.createNestApplication();
  const correlation = new CorrelationIdMiddleware();
  app.use(correlation.use.bind(correlation));
  app.useGlobalFilters(new ProblemFilter(platform));
  await app.init();
});
afterAll(async () => { await app?.close(); if (pool && !pool.ended) await pool.end(); });

it('returns readiness, echoes valid correlation and generates a UUID for invalid input', async () => {
  const response = await request(app.getHttpServer()).get('/api/v1/health/ready').set('X-Correlation-Id', 'correlation_123');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(response.headers['x-correlation-id']).toBe('correlation_123');
  const generated = await request(app.getHttpServer()).get('/api/v1/health/ready').set('X-Correlation-Id', 'bad');
  expect(generated.headers['x-correlation-id']).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-7/);
});
it('maps every error kind to problem+json and conceals unknown errors', async () => {
  for (const [kind, status] of Object.entries({ validation: 422, not_found: 404, conflict: 409,
    forbidden: 403, unauthenticated: 401, unexpected: 500, unknown: 500 })) {
    const response = await request(app.getHttpServer()).get(`/test/${kind}`);
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ type: 'about:blank', status });
    expect(JSON.stringify(response.body)).not.toContain('private-secret');
    if (kind === 'validation') expect(response.body.errors).toEqual({ field: 'invalid' });
  }
});
it('returns 503 after the pool closes', async () => {
  await pool.end();
  const response = await request(app.getHttpServer()).get('/api/v1/health/ready');
  expect(response.status).toBe(503);
});

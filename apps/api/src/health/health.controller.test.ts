import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports liveness', () => {
    expect(new HealthController().live()).toEqual({ status: 'ok' });
  });

  it('reports readiness', () => {
    expect(new HealthController().ready()).toEqual({ status: 'ready' });
  });
});

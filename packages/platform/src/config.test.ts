import { describe, expect, it } from 'vitest';
import { loadPlatformConfig, redactUrl, PlatformConfigError } from './config';

const secret = 'postgres://superuser:s3cr3t@localhost:5432/rvu_monitoring';
const secretApp = 'postgres://rvu_app:hunter2@localhost:5432/rvu_monitoring';

function validExtra(): Record<string, string> {
  return {
    DATABASE_URL: secret,
    APP_DATABASE_URL: secretApp
  };
}

describe('loadPlatformConfig', () => {
  it('parses valid config with defaults', () => {
    const config = loadPlatformConfig(validExtra());

    expect(config.databaseUrl).toBe(secret);
    expect(config.appDatabaseUrl).toBe(secretApp);
    expect(config.dbPoolMax).toBe(10);
    expect(config.dbStatementTimeoutMs).toBe(30000);
    expect(config.logLevel).toBe('info');
  });

  it('accepts explicit pool/statement timeout/log level', () => {
    const config = loadPlatformConfig({
      ...validExtra(),
      DB_POOL_MAX: '4',
      DB_STATEMENT_TIMEOUT_MS: '5000',
      LOG_LEVEL: 'debug'
    });

    expect(config.dbPoolMax).toBe(4);
    expect(config.dbStatementTimeoutMs).toBe(5000);
    expect(config.logLevel).toBe('debug');
  });

  it('collects every problem into one error', () => {
    expect(() =>
      loadPlatformConfig({
        DATABASE_URL: 'not-a-url',
        APP_DATABASE_URL: 'also-not-ok',
        DB_POOL_MAX: 'zero',
        DB_STATEMENT_TIMEOUT_MS: '-5',
        LOG_LEVEL: 'loud'
      })
    ).toThrowError(/DATABASE_URL.*APP_DATABASE_URL.*DB_POOL_MAX.*DB_STATEMENT_TIMEOUT_MS.*LOG_LEVEL/s);
  });

  it('never prints secret values in the error', () => {
    let message = '';
    try {
      loadPlatformConfig({ APP_DATABASE_URL: 'postgres://rvu_app:hunter2@localhost/db' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('postgres://');
  });

  it('throws PlatformConfigError', () => {
    expect(() => loadPlatformConfig({})).toThrowError(PlatformConfigError);
  });
});

describe('redactUrl', () => {
  it('masks the password but keeps the rest', () => {
    expect(redactUrl('postgres://rvu_app:hunter2@localhost:5432/rvu_monitoring')).toBe(
      'postgres://rvu_app:***@localhost:5432/rvu_monitoring'
    );
  });

  it('keeps urls without passwords unchanged', () => {
    expect(redactUrl('postgres://localhost/rvu_monitoring')).toBe(
      'postgres://localhost/rvu_monitoring'
    );
  });
});

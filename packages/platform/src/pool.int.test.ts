import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '@rvu/testing';
import { createPool } from './pool';

describe('createPool (integration)', () => {
  const database = useTestDatabase();

  it('returns strings for numeric(12,4), date and bigint; Date for timestamptz', async () => {
    const pool = createPool(database.url, { max: 1, applicationName: 'rvu-test' });

    try {
      const result = await pool.query(
        "SELECT 1234.5678::numeric(12,4) AS n, '2024-03-01'::date AS d, 9007199254740993::int8 AS i, now()::timestamptz AS ts"
      );
      const row = result.rows[0];
      expect(row && row.n).toBe('1234.5678');
      expect(row && row.d).toBe('2024-03-01');
      expect(row && row.i).toBe('9007199254740993');
      expect(row && row.ts).toBeInstanceOf(Date);
    } finally {
      await pool.end();
    }
  });

  it('applies the application name and statement timeout', async () => {
    const pool = createPool(database.url, { max: 1, statementTimeoutMs: 12300, applicationName: 'rvu-int' });

    try {
      const timeout = await pool.query('SHOW statement_timeout');
      expect(timeout.rows[0] && timeout.rows[0].statement_timeout).toBe('12300ms');

      const applicationName = await pool.query('SHOW application_name');
      expect(applicationName.rows[0] && applicationName.rows[0].application_name).toBe('rvu-int');
    } finally {
      await pool.end();
    }
  });
});

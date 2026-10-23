import pg from 'pg';

export interface CreatePoolOptions {
  max?: number;
  statementTimeoutMs?: number;
  applicationName?: string;
}

const OIDS = {
  numeric: 1700,
  int8: 20,
  date: 1082
} as const;

function poolTypes() {
  return {
    getTypeParser(typeId?: number, format?: string) {
      if (
        format !== 'binary' &&
        (typeId === OIDS.numeric || typeId === OIDS.int8 || typeId === OIDS.date)
      ) {
        return (raw: string) => raw;
      }

      return pg.types.getTypeParser(typeId ?? 0, format === 'binary' ? 'binary' : 'text');
    }
  };
}

export function createPool(
  url: string,
  options: CreatePoolOptions = {}
): pg.Pool {
  const statementTimeoutMs = options.statementTimeoutMs ?? 30_000;

  return new pg.Pool({
    connectionString: url,
    types: poolTypes(),
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'rvu-api',
    options: `-c statement_timeout=${statementTimeoutMs}`
  });
}

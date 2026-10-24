import './postgres/provided-context';

export { POSTGRES_IMAGE } from './postgres/image';
export { startPostgresContainer, type PostgresContainerHandle } from './postgres/container';
export {
  buildTestDatabaseName,
  buildTestDatabaseUrl,
  createTestDatabase,
  isSafeIdentifier,
  type TestDatabase
} from './postgres/test-database';
export { useTestDatabase } from './postgres/use-test-database';
export { appDatabaseUrl } from './postgres/app-database-url';

export { FixedClock } from './fixed-clock';
export { SequentialIdGenerator } from './sequential-id-generator';
export { createRandom, type Random } from './seeded-random';
export { expectOk, expectErr } from './result-helpers';
export { decimalArb, localDateArb, dateRangeArb } from './arbitraries';
export {
  briefScenario,
  lines as briefLines,
  resolutions as briefResolutions,
  expected as briefExpected,
  type BriefScenario,
  type BriefResolution,
  type BriefExpected
} from './brief-scenario';
export {
  toLocalDate,
  type SyntheticDateInput,
  type SyntheticProvider,
  type SyntheticRvuEntry,
  type SyntheticServiceLine
} from './synthetic/types';
export {
  aProvider,
  aServiceLine,
  anRvuEntry
} from './synthetic/builders';
export { generateDataset, type DatasetOptions, type SyntheticDataset } from './synthetic/dataset';
export { SERVICE_LINE_CSV_COLUMNS, toCsv } from './synthetic/csv';

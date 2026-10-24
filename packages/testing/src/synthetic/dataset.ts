import { createRandom, type Random } from '../seeded-random';
import { aProvider, anRvuEntry } from './builders';
import { toLocalDate, type SyntheticDateInput, type SyntheticProvider, type SyntheticRvuEntry, type SyntheticServiceLine } from './types';

export interface DatasetOptions {
  readonly seed: number;
  readonly providers: number;
  readonly days: number;
  readonly linesPerDay: number;
  readonly startDate?: SyntheticDateInput | undefined;
}

export interface SyntheticDataset {
  readonly providers: SyntheticProvider[];
  readonly rvuEntries: SyntheticRvuEntry[];
  readonly lines: SyntheticServiceLine[];
}

const DEFAULT_DATASET_START = '2026-01-01';
const PLACE_OF_SERVICE_OPTIONS = ['11', '22', '02'] as const;
const MODIFIER_OPTIONS = ['25', '59', 'XS', 'LT', 'RT', '76'] as const;
const CODE_COUNT = 99;
const MAX_MODIFIERS = 4;
const MAX_POST_LAG_DAYS = 2;

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function nextCode(random: Random): string {
  return `Z${pad(random.int(1, CODE_COUNT), 4)}`;
}

function nextWorkRvuString(random: Random): string {
  const tenths = random.int(5, 240);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

function nextStatus(random: Random): SyntheticServiceLine['status'] {
  if (random.chance(0.85)) {
    return 'final';
  }
  return random.chance(0.5) ? 'pending' : 'voided';
}

function nextModifiers(random: Random): string[] {
  const modifiers: string[] = [];
  if (random.chance(0.25)) {
    modifiers.push(random.pick(MODIFIER_OPTIONS));
  }
  if (random.chance(0.1) && modifiers.length < MAX_MODIFIERS) {
    modifiers.push(random.pick(MODIFIER_OPTIONS));
  }
  return modifiers;
}

function nextLine(
  random: Random,
  context: {
    readonly provider: SyntheticProvider;
    readonly code: string;
    readonly serviceDate: SyntheticServiceLine['serviceDate'];
    readonly day: number;
    readonly slot: number;
  }
): SyntheticServiceLine {
  const { provider, code, serviceDate } = context;
  const marker = `d${pad(context.day, 4)}-s${pad(context.slot, 4)}`;
  return {
    sourceSystem: 'synthetic-emr',
    sourceLineId: `line-${marker}`,
    encounterRef: `enc-${marker}`,
    versionRef: '1',
    serviceDate,
    code,
    modifiers: nextModifiers(random),
    units: random.int(1, 3),
    placeOfService: random.pick(PLACE_OF_SERVICE_OPTIONS),
    renderingProviderId: provider.providerId,
    locationId: 'loc-0001',
    status: nextStatus(random),
    postedDate: serviceDate.addDays(random.int(0, MAX_POST_LAG_DAYS))
  };
}

export function generateDataset(options: DatasetOptions): SyntheticDataset {
  const random = createRandom(options.seed);
  const startDate = toLocalDate(options.startDate ?? DEFAULT_DATASET_START);
  const providers = Array.from({ length: options.providers }, (_unused, index: number) =>
    aProvider({ providerId: `provider-${pad(index + 1, 4)}` })
  );

  if (providers.length === 0) {
    throw new Error('generateDataset requires at least one provider');
  }

  const lines: SyntheticServiceLine[] = [];
  const codeToRvu = new Map<string, SyntheticRvuEntry>();

  for (let day = 0; day < options.days; day += 1) {
    const serviceDate = startDate.addDays(day);
    for (let slot = 0; slot < options.linesPerDay; slot += 1) {
      const code = nextCode(random);
      if (!codeToRvu.has(code)) {
        codeToRvu.set(
          code,
          anRvuEntry({ code, workRvuString: nextWorkRvuString(random), effectiveStart: startDate })
        );
      }
      lines.push(nextLine(random, { provider: providers[random.int(0, providers.length - 1)] as SyntheticProvider, code, serviceDate, day, slot }));
    }
  }

  return { providers, rvuEntries: [...codeToRvu.values()], lines };
}

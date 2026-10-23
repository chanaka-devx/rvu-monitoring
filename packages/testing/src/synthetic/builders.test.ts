import { DecimalValue } from '@rvu/shared-kernel';
import { expectOk } from '../result-helpers';
import { aProvider, aServiceLine, anRvuEntry } from './builders';
import { describe, expect, it } from 'vitest';
import type { SyntheticProvider, SyntheticRvuEntry, SyntheticServiceLine } from './types';

describe('builders', () => {
  it('aProvider is deterministic without overrides', () => {
    expect(aProvider()).toEqual(aProvider());
  });

  it('anRvuEntry is deterministic without overrides', () => {
    expect(anRvuEntry()).toEqual(anRvuEntry());
  });

  it('aServiceLine is deterministic without overrides', () => {
    expect(aServiceLine()).toEqual(aServiceLine());
  });

  it('string and number field overrides win over defaults', () => {
    const provider: SyntheticProvider = aProvider({ providerId: 'override-1' });
    expect(provider.providerId).toBe('override-1');

    const entry: SyntheticRvuEntry = anRvuEntry({ code: 'Z0042', workRvuString: '1.25' });
    expect(entry.code).toBe('Z0042');
    expect(
      entry.workRvu.equals(expectOk(DecimalValue.parse('1.25')))
    ).toBe(true);

    const line: SyntheticServiceLine = aServiceLine({ sourceLineId: 'line-override', units: 7 });
    expect(line.sourceLineId).toBe('line-override');
    expect(line.units).toBe(7);
  });

  it('date overrides are accepted as date parts or date strings', () => {
    const byParts = aServiceLine({ serviceDate: { year: 2026, month: 3, day: 2 } });
    expect(byParts.serviceDate.toString()).toBe('2026-03-02');

    const byString = aServiceLine({ serviceDate: '2026-04-05' });
    expect(byString.serviceDate.toString()).toBe('2026-04-05');
  });

  it('clears optional fields with undefined', () => {
    const withoutVersion = aServiceLine({ versionRef: undefined });
    expect('versionRef' in withoutVersion).toBe(false);
  });
});

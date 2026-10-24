import { describe, expect, it } from 'vitest';
import { aServiceLine } from './builders';
import type { SyntheticServiceLine } from './types';

const SERVICE_LINE_FIELD_ALLOWLIST = [
  'encounterRef',
  'code',
  'locationId',
  'modifiers',
  'placeOfService',
  'postedDate',
  'renderingProviderId',
  'serviceDate',
  'sourceLineId',
  'sourceSystem',
  'status',
  'units',
  'versionRef'
].sort();

const PATIENT_FIELD_TERMS = ['name', 'dob', 'birth', 'mrn', 'address', 'phone', 'insurance', 'patient'];

describe('SyntheticServiceLine', () => {
  it('has exactly the allowlisted fields on a default builder instance', () => {
    const line: SyntheticServiceLine = aServiceLine();
    expect(Object.keys(line).sort()).toEqual(SERVICE_LINE_FIELD_ALLOWLIST);
  });

  it('keeps the exact key set when every field is overridden', () => {
    const line: SyntheticServiceLine = aServiceLine({
      sourceSystem: 'other',
      sourceLineId: 'other-1',
      encounterRef: 'enc-other',
      versionRef: 'v2',
      code: 'Z0001',
      modifiers: ['26'],
      units: 2,
      placeOfService: '02',
      renderingProviderId: 'src-1',
      locationId: 'loc-1',
      status: 'voided',
      postedDate: { year: 2026, month: 2, day: 1 }
    });
    expect(Object.keys(line).sort()).toEqual(SERVICE_LINE_FIELD_ALLOWLIST);
  });

  it('exposes no field whose name could hold patient data', () => {
    const line: SyntheticServiceLine = aServiceLine();
    for (const key of Object.keys(line)) {
      const lower = key.toLowerCase();
      for (const term of PATIENT_FIELD_TERMS) {
        expect(lower).not.toContain(term);
      }
    }
  });

  it('constrains modifiers to at most 4 entries', () => {
    const line: SyntheticServiceLine = aServiceLine();
    expect(line.modifiers.length).toBeLessThanOrEqual(4);
  });
});

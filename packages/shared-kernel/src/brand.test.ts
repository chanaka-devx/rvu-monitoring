import { describe, expect, it } from 'vitest';
import { isUuid, type PracticeId, type Uuid } from './brand';

describe('isUuid', () => {
  it.each([
    '01906d0e-8e3f-7000-8000-000000000000',
    '841d3b32-19e4-4b0a-8f4e-1c2d3e4f5a6b',
    'ec9d8f92-77a1-4a95-b44e-5b7ac5d3f8ba'
  ])('accepts %s', (value) => {
    expect(isUuid(value)).toBe(true);
  });

  it.each([
    '',
    'not-a-uuid',
    '01906d0e8e3f70008000000000000000',
    '01906d0e-8e3f-7000-8000-00000000000z',
    '01906d0e-8e3f-8000-c000-000000000000',
    'urn:uuid:841d3b32-19e4-4b0a-8f4e-1c2d3e4f5a6b'
  ])('rejects %s', (value) => {
    expect(isUuid(value)).toBe(false);
  });

  it('rejects uppercase input', () => {
    expect(isUuid('841D3B32-19E4-4B0A-8F4E-1C2D3E4F5A6B')).toBe(false);
  });
});

describe('branded uuid types', () => {
  it('exposes Uuid and PracticeId as string brands', () => {
    const raw = '01906d0e-8e3f-7000-8000-000000000000';
    const id: Uuid = raw as Uuid;
    const practiceId: PracticeId = id as PracticeId;
    expect(practiceId as string).toBe(raw);
  });
});

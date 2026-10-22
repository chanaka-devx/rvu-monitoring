import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  normalizePageRequest,
  type Page,
  type PageRequest
} from './pagination';

describe('pagination constants', () => {
  it('uses 50 as the default and 200 as the ceiling', () => {
    expect(DEFAULT_PAGE_LIMIT).toBe(50);
    expect(MAX_PAGE_LIMIT).toBe(200);
  });
});

describe('normalizePageRequest', () => {
  it('fills in the default limit when absent', () => {
    expect(normalizePageRequest({})).toEqual({ limit: DEFAULT_PAGE_LIMIT });
    expect(normalizePageRequest({ cursor: 'abc' })).toEqual({ cursor: 'abc', limit: DEFAULT_PAGE_LIMIT });
  });

  it('keeps a valid limit', () => {
    expect(normalizePageRequest({ limit: 10 })).toEqual({ limit: 10 });
    expect(normalizePageRequest({ cursor: 'c', limit: 1 })).toEqual({ cursor: 'c', limit: 1 });
  });

  it('clamps the limit to the maximum', () => {
    expect(normalizePageRequest({ limit: 500 })).toEqual({ limit: MAX_PAGE_LIMIT });
  });

  it('falls back to the default for an invalid limit', () => {
    expect(normalizePageRequest({ limit: 0 })).toEqual({ limit: DEFAULT_PAGE_LIMIT });
    expect(normalizePageRequest({ limit: -5 })).toEqual({ limit: DEFAULT_PAGE_LIMIT });
    expect(normalizePageRequest({ limit: 1.5 })).toEqual({ limit: DEFAULT_PAGE_LIMIT });
  });

  it('preserves the cursor untouched', () => {
    const cursor = 'eyJpZCI6IjEyMyJ9';
    const normalized: PageRequest = normalizePageRequest({ cursor, limit: 25 });
    expect(normalized.cursor).toBe(cursor);
  });
});

describe('Page', () => {
  it('carries items and an optional next cursor', () => {
    const page: Page<number> = { items: [1, 2, 3], nextCursor: 'next' };
    expect(page.items).toEqual([1, 2, 3]);
    expect(page.nextCursor).toBe('next');

    const lastPage: Page<number> = { items: [] };
    expect(lastPage.nextCursor).toBeUndefined();
    expect('nextCursor' in lastPage).toBe(false);
  });
});

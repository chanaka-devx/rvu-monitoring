import { describe, expect, it } from 'vitest';
import {
  conflictError,
  type DomainError,
  type ErrorKind,
  notFoundError,
  validationError
} from './errors';

describe('DomainError shape', () => {
  it('carries code, message, kind and optional details', () => {
    const error: DomainError = {
      code: 'test/some-failure',
      message: 'Something failed',
      kind: 'unexpected',
      details: { attempted: 'thing' }
    };
    expect(error.code).toBe('test/some-failure');
    expect(error.message).toBe('Something failed');
    expect(error.kind).toBe('unexpected');
    expect(error.details).toEqual({ attempted: 'thing' });
  });

  it('works without details', () => {
    const error: DomainError = { code: 'test/plain', message: 'Plain', kind: 'conflict' };
    expect(error.details).toBeUndefined();
  });
});

describe('ErrorKind', () => {
  it('covers all six kinds', () => {
    const kinds: ErrorKind[] = [
      'validation',
      'not_found',
      'conflict',
      'forbidden',
      'unauthenticated',
      'unexpected'
    ];
    expect(new Set(kinds).size).toBe(6);
  });
});

describe('validationError', () => {
  it('builds a validation error with details', () => {
    const error = validationError('test/invalid', 'Invalid input', { field: 'code' });
    expect(error.kind).toBe('validation');
    expect(error.code).toBe('test/invalid');
    expect(error.message).toBe('Invalid input');
    expect(error.details).toEqual({ field: 'code' });
  });

  it('omits details when not given', () => {
    const error = validationError('test/invalid', 'Invalid input');
    expect(error.details).toBeUndefined();
  });
});

describe('notFoundError', () => {
  it('builds a not_found error', () => {
    const error = notFoundError('test/missing', 'No such entity', { id: 'abc' });
    expect(error.kind).toBe('not_found');
    expect(error.code).toBe('test/missing');
    expect(error.details).toEqual({ id: 'abc' });
  });
});

describe('conflictError', () => {
  it('builds a conflict error', () => {
    const error = conflictError('test/clash', 'Conflicting state');
    expect(error.kind).toBe('conflict');
    expect(error.code).toBe('test/clash');
    expect(error.details).toBeUndefined();
  });
});

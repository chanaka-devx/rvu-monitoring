import { expect, it } from 'vitest';
import { statusForKind, problemFor } from './errors';

it('maps every domain error kind and hides unknown errors', () => {
  expect(['validation', 'not_found', 'conflict', 'forbidden', 'unauthenticated', 'unexpected'].map(statusForKind))
    .toEqual([422, 404, 409, 403, 401, 500]);
  expect(JSON.stringify(problemFor(new Error('private-secret'), 'correlation'))).not.toContain('private-secret');
});

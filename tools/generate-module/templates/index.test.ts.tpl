import { describe, expect, it } from 'vitest';
import { applicationMarker, interfaceMarker } from './public-api';

describe('__NAME__ module', () => {
  it('exposes its domain marker through the public api', () => {
    expect(applicationMarker()).toEqual({ module: '__NAME__' });
  });

  it('wires the interface layer to the application layer', () => {
    expect(interfaceMarker).toBe('__NAME__');
  });
});

import { expect, it } from 'vitest';
import { CorrelationIdMiddleware, validCorrelationId } from './correlation';
import { currentContext } from '@rvu/platform';

it('accepts only bounded safe correlation ids, echoes them and generates UUIDv7 otherwise', () => {
  for (const value of ['short', 'bad value', 'x'.repeat(65), ['duplicate']]) expect(validCorrelationId(value)).toBe(false);
  for (const incoming of ['safe-id_123', 'bad']) {
    let echoed = '';
    new CorrelationIdMiddleware().use({ headers: { 'x-correlation-id': incoming } },
      { setHeader(_name, value) { echoed = value; } }, () => { expect(currentContext().correlationId).toBe(echoed); });
    if (incoming === 'bad') expect(echoed).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-7/);
    else expect(echoed).toBe(incoming);
  }
});

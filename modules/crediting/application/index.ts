import type { CreditingDomainMarker } from '../domain';

export function applicationMarker(): CreditingDomainMarker {
  return { module: 'crediting' };
}

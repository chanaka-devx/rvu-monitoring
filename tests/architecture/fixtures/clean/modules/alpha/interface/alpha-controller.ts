import { contractMarker } from '../../../packages/contracts/src/index';
import { alphaService } from '../application/alpha-service';

export const alphaController = `${alphaService}:${contractMarker}`;

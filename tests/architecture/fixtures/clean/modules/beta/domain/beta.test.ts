import { testingMarker } from '@rvu/testing';
import { it } from 'vitest';
import { beta } from './beta';

export const betaTestMarker = `${testingMarker}:${beta}:${typeof it}`;

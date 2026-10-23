import fc from 'fast-check';
import { kernel } from '../../shared-kernel/src/index';

export const testingMarker = `${kernel}:testing:${fc !== undefined}`;

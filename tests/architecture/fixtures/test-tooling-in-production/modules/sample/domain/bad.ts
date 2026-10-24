import fc from 'fast-check';
import { somePackage } from 'testcontainers';
import { otherPackage } from '@testcontainers/mysql';
import { it } from 'vitest';

export const productionUsesTestTooling = [it, fc, somePackage, otherPackage];

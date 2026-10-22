import { v7 as uuidV7 } from 'uuid';
import type { Uuid } from './brand';

export interface IdGenerator {
  next(): Uuid;
}

export class UuidV7Generator implements IdGenerator {
  next(): Uuid {
    return uuidV7() as Uuid;
  }
}

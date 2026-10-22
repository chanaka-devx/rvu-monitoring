import { describe, expect, it } from 'vitest';
import { Entity } from './entity';

class Document extends Entity<number> {}

class Invoice extends Entity<number> {}

describe('Entity', () => {
  it('exposes its id', () => {
    expect(new Document(1).id).toBe(1);
  });

  it('equals another entity with the same id', () => {
    expect(new Document(1).equals(new Document(1))).toBe(true);
  });

  it('does not equal an entity with a different id', () => {
    expect(new Document(1).equals(new Document(2))).toBe(false);
  });

  it('does not equal an entity of another type', () => {
    expect(new Document(1).equals(new Invoice(1))).toBe(false);
  });

  it('equals itself', () => {
    const document = new Document(1);
    expect(document.equals(document)).toBe(true);
  });
});

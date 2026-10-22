export abstract class Entity<Id> {
  private readonly identifier: Id;

  protected constructor(id: Id) {
    this.identifier = id;
  }

  get id(): Id {
    return this.identifier;
  }

  equals(other: Entity<unknown>): boolean {
    return this.constructor === other.constructor && Object.is(this.id, other.id);
  }
}

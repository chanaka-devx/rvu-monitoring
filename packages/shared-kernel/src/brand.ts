const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type Uuid = Brand<string, 'Uuid'>;

export type PracticeId = Brand<Uuid, 'PracticeId'>;

export function isUuid(value: string): value is Uuid {
  return UUID_PATTERN.test(value);
}

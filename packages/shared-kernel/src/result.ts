export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

export function map<T, U, E>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> {
  return result.ok ? ok(transform(result.value)) : result;
}

export function mapErr<T, E, F>(result: Result<T, E>, transform: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(transform(result.error));
}

export function andThen<T, U, E, F>(
  result: Result<T, E>,
  transform: (value: T) => Result<U, F>
): Result<U, E | F> {
  return result.ok ? transform(result.value) : result;
}

export function match<T, E, R>(
  result: Result<T, E>,
  onOk: (value: T) => R,
  onErr: (error: E) => R
): R {
  return result.ok ? onOk(result.value) : onErr(result.error);
}

export function combine<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (result.ok) {
      values.push(result.value);
    } else {
      return result;
    }
  }
  return ok(values);
}

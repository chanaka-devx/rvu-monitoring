import type { JsonValue } from './domain-event';

export type ErrorKind =
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'forbidden'
  | 'unauthenticated'
  | 'unexpected';

export type ErrorDetails = Readonly<Record<string, JsonValue>>;

export interface DomainError {
  readonly code: string;
  readonly message: string;
  readonly kind: ErrorKind;
  readonly details?: ErrorDetails;
}

export function errorOf(kind: ErrorKind, code: string, message: string, details?: ErrorDetails): DomainError {
  return details === undefined ? { code, message, kind } : { code, message, kind, details };
}

export function validationError(code: string, message: string, details?: ErrorDetails): DomainError {
  return errorOf('validation', code, message, details);
}

export function notFoundError(code: string, message: string, details?: ErrorDetails): DomainError {
  return errorOf('not_found', code, message, details);
}

export function conflictError(code: string, message: string, details?: ErrorDetails): DomainError {
  return errorOf('conflict', code, message, details);
}

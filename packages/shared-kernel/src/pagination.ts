export interface PageRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface Page<Item> {
  readonly items: readonly Item[];
  readonly nextCursor?: string;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export function normalizePageRequest(request: PageRequest): PageRequest {
  const limit =
    request.limit === undefined || !isUsableLimit(request.limit)
      ? DEFAULT_PAGE_LIMIT
      : Math.min(request.limit, MAX_PAGE_LIMIT);
  return request.cursor === undefined ? { limit } : { cursor: request.cursor, limit };
}

function isUsableLimit(limit: number): boolean {
  return Number.isInteger(limit) && limit >= 1;
}

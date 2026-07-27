export type InboxQueryParams = {
  category?: string;
  search?: string;
  read?: 'true' | 'false';
  archived?: 'true' | 'false';
  cursor?: string;
  limit?: number;
};

/**
 * Builds a URL query string for GET /notifications/inbox.
 * Omits undefined/empty filters; encodes search text; includes cursor only when present.
 * Returns the raw query (no leading `?`); empty string when nothing to send.
 */
export function buildInboxQueryString(params: InboxQueryParams): string {
  const values = new URLSearchParams();

  if (params.category) values.set('category', params.category);
  if (params.search != null && params.search !== '') values.set('search', params.search);
  if (params.read != null) values.set('read', params.read);
  if (params.archived != null) values.set('archived', params.archived);
  if (params.cursor) values.set('cursor', params.cursor);
  if (params.limit != null) values.set('limit', String(params.limit));

  return values.toString();
}

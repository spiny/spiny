import type { SQLiteDatabase } from 'expo-sqlite';

import { parseTopics } from '@/domain/markdown';
import type { DocumentSummary } from '../types';

/** Escape LIKE wildcards in user input so they match literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

interface SearchRow {
  id: string;
  title: string;
  topics_json: string;
  updated_at: string;
}

/**
 * Search the active catalog index (technical/storage.md search requirements):
 * scoped by catalog_id, matches title/topics/excerpt, excludes deleted docs,
 * returns id/title/topics/last-edited timestamp. Multi-term queries are ANDed.
 */
export async function searchDocuments(
  db: SQLiteDatabase,
  catalogId: string,
  query: string,
  limit = 50
): Promise<DocumentSummary[]> {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return [];

  const clause = terms
    .map(
      () =>
        `(lower(ci.searchable_title || ' ' || ci.searchable_topics || ' ' || ci.searchable_excerpt) LIKE ? ESCAPE '\\')`
    )
    .join(' AND ');
  const params: (string | number)[] = [catalogId, ...terms.map((t) => `%${escapeLike(t)}%`), limit];

  const rows = await db.getAllAsync<SearchRow>(
    `SELECT d.id AS id, d.title AS title, d.topics_json AS topics_json, d.updated_at AS updated_at
       FROM catalog_indexes ci
       JOIN documents d ON d.id = ci.document_id
      WHERE ci.catalog_id = ?
        AND d.deleted_at IS NULL
        AND ${clause}
      ORDER BY d.updated_at DESC
      LIMIT ?`,
    ...params
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    topics: parseTopics(r.topics_json),
    updatedAt: r.updated_at,
  }));
}

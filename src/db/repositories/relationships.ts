import type { SQLiteDatabase } from 'expo-sqlite';

import { parseTopics } from '@/domain/markdown';
import { nowIso } from '@/domain/time';
import type { DocumentSummary, RelatedDocument } from '../types';

/**
 * Rebuild outgoing `link` relationships for a source document from its parsed
 * link target ids. Only targets that exist (active, same catalog, not self)
 * become rows (technical/editor.md: links resolve only to existing documents).
 * Runs inside the caller's transaction.
 */
export async function rebuildRelationshipsForSource(
  db: SQLiteDatabase,
  catalogId: string,
  sourceDocumentId: string,
  targetIds: string[]
): Promise<void> {
  await db.runAsync(
    `DELETE FROM document_relationships
      WHERE catalog_id = ? AND source_document_id = ? AND relationship_type = 'link'`,
    catalogId,
    sourceDocumentId
  );

  const ts = nowIso();
  const seen = new Set<string>();
  for (const targetId of targetIds) {
    if (!targetId || targetId === sourceDocumentId || seen.has(targetId)) continue;
    seen.add(targetId);
    const exists = await db.getFirstAsync<{ one: number }>(
      'SELECT 1 AS one FROM documents WHERE id = ? AND catalog_id = ? AND deleted_at IS NULL',
      targetId,
      catalogId
    );
    if (!exists) continue;
    await db.runAsync(
      `INSERT OR IGNORE INTO document_relationships
         (catalog_id, source_document_id, target_document_id, relationship_type, relationship_source, created_at, updated_at)
       VALUES (?, ?, ?, 'link', 'markdown_link', ?, ?)`,
      catalogId,
      sourceDocumentId,
      targetId,
      ts,
      ts
    );
  }
}

/** Remove all relationships referencing a document (used when it is deleted/moved). */
export async function removeRelationshipsForDocument(
  db: SQLiteDatabase,
  documentId: string
): Promise<void> {
  await db.runAsync(
    'DELETE FROM document_relationships WHERE source_document_id = ? OR target_document_id = ?',
    documentId,
    documentId
  );
}

interface RelRow {
  id: string;
  title: string;
  topics_json: string;
  updated_at: string;
}

/**
 * Relationship graph for a document: outgoing links plus backlinks, excluding
 * deleted documents (technical/storage.md relationship graph requirements).
 */
export async function getRelationships(
  db: SQLiteDatabase,
  catalogId: string,
  documentId: string
): Promise<RelatedDocument[]> {
  const outgoing = await db.getAllAsync<RelRow>(
    `SELECT d.id AS id, d.title AS title, d.topics_json AS topics_json, d.updated_at AS updated_at
       FROM document_relationships r
       JOIN documents d ON d.id = r.target_document_id
      WHERE r.catalog_id = ? AND r.source_document_id = ? AND d.deleted_at IS NULL
      ORDER BY d.updated_at DESC`,
    catalogId,
    documentId
  );
  const incoming = await db.getAllAsync<RelRow>(
    `SELECT d.id AS id, d.title AS title, d.topics_json AS topics_json, d.updated_at AS updated_at
       FROM document_relationships r
       JOIN documents d ON d.id = r.source_document_id
      WHERE r.catalog_id = ? AND r.target_document_id = ? AND d.deleted_at IS NULL
      ORDER BY d.updated_at DESC`,
    catalogId,
    documentId
  );

  const result: RelatedDocument[] = [];
  const pushed = new Set<string>();
  for (const r of outgoing) {
    result.push({
      id: r.id,
      title: r.title,
      topics: parseTopics(r.topics_json),
      updatedAt: r.updated_at,
      direction: 'outgoing',
    });
    pushed.add(r.id);
  }
  for (const r of incoming) {
    if (pushed.has(r.id)) continue; // a doc both linked and linking shows once as outgoing
    result.push({
      id: r.id,
      title: r.title,
      topics: parseTopics(r.topics_json),
      updatedAt: r.updated_at,
      direction: 'incoming',
    });
  }
  return result;
}

/**
 * All distinct documents that participate in any relationship in the catalog.
 * Used to populate the mind map with unvisited relationships even when no
 * navigation event exists yet (UC-12 relationship populating).
 */
export async function listRelatedDocumentsInCatalog(
  db: SQLiteDatabase,
  catalogId: string
): Promise<DocumentSummary[]> {
  const rows = await db.getAllAsync<RelRow>(
    `SELECT DISTINCT d.id AS id, d.title AS title, d.topics_json AS topics_json, d.updated_at AS updated_at
       FROM documents d
      WHERE d.catalog_id = ? AND d.deleted_at IS NULL
        AND d.id IN (
          SELECT source_document_id FROM document_relationships WHERE catalog_id = ?
          UNION
          SELECT target_document_id FROM document_relationships WHERE catalog_id = ?
        )
      ORDER BY d.updated_at DESC`,
    catalogId,
    catalogId,
    catalogId
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    topics: parseTopics(r.topics_json),
    updatedAt: r.updated_at,
  }));
}

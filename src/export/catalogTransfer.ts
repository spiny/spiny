/**
 * Catalog export/import orchestration (issue #2).
 *
 * Device IO that ties the pure archive logic (`catalogArchive.ts`) to SQLite, the
 * Storage Access Framework, and the document picker. Screens call the two
 * high-level functions here and stay thin.
 *
 * Import path note: `expo-file-system`'s legacy SAF/string APIs live at
 * `expo-file-system/legacy` in SDK 56.
 */
import * as DocumentPicker from 'expo-document-picker';
import {
  EncodingType,
  StorageAccessFramework,
  cacheDirectory,
  documentDirectory,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { Catalogs, Documents, Relationships, type DocumentRelationshipRow } from '@/db';
import { nowIso } from '@/domain/time';
import {
  buildCatalogArchive,
  parseCatalogArchive,
  planArchiveImport,
  type ArchiveRelationship,
} from './catalogArchive';

const ZIP_MIME_TYPE = 'application/zip';

export type CatalogTransferErrorCode = 'catalog_not_found' | 'permission_denied' | 'no_storage';

export class CatalogTransferError extends Error {
  readonly code: CatalogTransferErrorCode;
  constructor(code: CatalogTransferErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CatalogTransferError';
    this.code = code;
  }
}

function relationshipRowToArchive(row: DocumentRelationshipRow): ArchiveRelationship {
  return {
    catalogId: row.catalog_id,
    sourceDocumentId: row.source_document_id,
    targetDocumentId: row.target_document_id,
    relationshipType: row.relationship_type,
    relationshipSource: row.relationship_source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Build a filesystem-safe base name (without extension) from the catalog title. */
export function archiveBaseName(title: string, now: Date = new Date()): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const date = now.toISOString().slice(0, 10);
  return `spiny-catalog-${slug || 'export'}-${date}`;
}

export interface ExportArchiveResult {
  /** File name including the `.zip` extension. */
  fileName: string;
  /** Where the archive was written. */
  location: 'saf' | 'app_directory';
  /** Full URI of the written file. */
  uri: string;
}

/**
 * Export a catalog to a ZIP archive and ask the user where to save it.
 *
 * Android uses the Storage Access Framework so the user picks a real directory.
 * Other platforms (iOS / web), where SAF is unavailable, fall back to the app's
 * document directory and the caller surfaces the path.
 */
export async function exportCatalogArchive(
  db: SQLiteDatabase,
  catalogId: string
): Promise<ExportArchiveResult> {
  const catalog = await Catalogs.getCatalog(db, catalogId);
  if (!catalog) throw new CatalogTransferError('catalog_not_found');

  const allDocs = await Documents.listAllDocumentsForCatalog(db, catalogId);
  const activeDocs = allDocs.filter((d) => !d.deletedAt);
  const relationships = (await Relationships.listRelationshipsForCatalog(db, catalogId)).map(
    relationshipRowToArchive
  );

  const base64 = await buildCatalogArchive({ catalog, documents: activeDocs, relationships });
  const baseName = archiveBaseName(catalog.title);
  const fileName = `${baseName}.zip`;

  if (Platform.OS === 'android') {
    const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) throw new CatalogTransferError('permission_denied');
    // createFileAsync takes the name WITHOUT the extension; it derives the
    // extension from the MIME type and returns a SAF content URI.
    const fileUri = await StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      baseName,
      ZIP_MIME_TYPE
    );
    await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
    return { fileName, location: 'saf', uri: fileUri };
  }

  const dir = documentDirectory ?? cacheDirectory;
  if (!dir) throw new CatalogTransferError('no_storage');
  const fileUri = `${dir}${fileName}`;
  await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
  return { fileName, location: 'app_directory', uri: fileUri };
}

export type ImportArchiveResult =
  | { status: 'canceled' }
  | {
      status: 'imported';
      catalogId: string;
      title: string;
      documentCount: number;
      /** Number of documents whose id collided locally and was remapped. */
      remappedCount: number;
    };

/**
 * Pick a catalog archive and import it into a brand-new local catalog.
 *
 * Documents keep their original ids when possible (so `spiny://document/{id}`
 * links and relationships stay valid); colliding ids are remapped. Relationships
 * are rebuilt from the Markdown bodies — first as each document is inserted, then
 * once more after all inserts so links to later-inserted documents resolve.
 */
export async function importCatalogArchive(db: SQLiteDatabase): Promise<ImportArchiveResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ZIP_MIME_TYPE,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || picked.assets.length === 0) return { status: 'canceled' };

  const base64 = await readAsStringAsync(picked.assets[0].uri, {
    encoding: EncodingType.Base64,
  });
  const parsed = await parseCatalogArchive(base64);

  // Detect id collisions against ALL existing rows (the PRIMARY KEY is global).
  const existingIds = await Documents.filterExistingDocumentIds(
    db,
    parsed.documents.map((d) => d.documentId)
  );
  const plan = planArchiveImport(parsed, existingIds);

  // Always create a new catalog; never overwrite an existing one.
  const catalog = await Catalogs.createCatalog(db, {
    title: parsed.catalog.title,
    description: parsed.catalog.description,
  });

  const syncedAt = nowIso();
  for (const doc of plan.documents) {
    await Documents.applyRemoteDocument(
      db,
      {
        id: doc.id,
        catalogId: catalog.id,
        title: doc.title,
        topics: doc.topics,
        body: doc.body,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        deletedAt: null,
        remoteProviderKey: null,
        remoteUpdatedAt: doc.updatedAt,
      },
      syncedAt
    );
  }

  await Documents.rebuildCatalogRelationships(db, catalog.id);

  return {
    status: 'imported',
    catalogId: catalog.id,
    title: catalog.title,
    documentCount: plan.documents.length,
    remappedCount: plan.remappedCount,
  };
}

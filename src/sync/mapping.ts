import type { Catalog, DocumentModel } from '@/db/types';
import { extractLinkedDocumentIds } from '@/domain/markdown';
import type { CatalogManifest, ManifestDocumentEntry, RemoteDocument } from './types';

export function documentToRemote(doc: DocumentModel): RemoteDocument {
  return {
    schema: 'spiny.document.v1',
    catalogId: doc.catalogId,
    documentId: doc.id,
    title: doc.title,
    topics: doc.topics,
    bodyMarkdown: doc.bodyMarkdown,
    linkedDocumentIds: extractLinkedDocumentIds(doc.bodyMarkdown),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
    remoteKey: doc.remoteProviderKey,
  };
}

export function buildCatalogManifest(
  catalog: Catalog,
  documents: DocumentModel[]
): CatalogManifest {
  return {
    schema: 'spiny.catalog.v1',
    catalogId: catalog.id,
    title: catalog.title,
    description: catalog.description,
    updatedAt: catalog.updatedAt,
    documents: documents.map<ManifestDocumentEntry>((d) => ({
      documentId: d.id,
      title: d.title,
      topics: d.topics,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      deletedAt: d.deletedAt,
      linkedDocumentIds: extractLinkedDocumentIds(d.bodyMarkdown),
    })),
  };
}

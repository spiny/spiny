/**
 * Markdown-derived domain helpers.
 *
 * Spiny document links use the app URI shape `spiny://document/{documentId}`
 * (technical/editor.md). Relationships are rebuilt from the Markdown body on
 * autosave (technical/storage.md), so link extraction must be deterministic.
 */

export const DOCUMENT_URI_SCHEME = 'spiny';
export const DOCUMENT_URI_PREFIX = 'spiny://document/';

/** Build a canonical document link target. */
export function buildDocumentUri(documentId: string): string {
  return `${DOCUMENT_URI_PREFIX}${documentId}`;
}

/** Return the document id encoded in a `spiny://document/{id}` URI, or null. */
export function parseDocumentUri(uri: string): string | null {
  if (!uri.startsWith(DOCUMENT_URI_PREFIX)) return null;
  const id = uri.slice(DOCUMENT_URI_PREFIX.length).trim();
  if (!id) return null;
  // Strip any trailing fragment/query just in case.
  return id.split(/[?#\s)]/)[0] || null;
}

// Matches both inline-link targets `](spiny://document/ID)` and bare URIs.
const DOC_URI_GLOBAL = /spiny:\/\/document\/([A-Za-z0-9._~%-]+)/g;

/**
 * Extract the unique set of linked document ids referenced in a Markdown body.
 * Used to rebuild `document_relationships` rows on autosave.
 */
export function extractLinkedDocumentIds(markdown: string): string[] {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  DOC_URI_GLOBAL.lastIndex = 0;
  while ((match = DOC_URI_GLOBAL.exec(markdown)) !== null) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Derive a short, plain-text excerpt from Markdown for the catalog index.
 * Strips the most common Markdown syntax without attempting full rendering.
 */
export function deriveExcerpt(markdown: string, maxLength = 240): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^[\s>*+-]+/gm, ' ') // list/quote markers
    .replace(/[*_~]/g, '') // emphasis markers
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Parse the stored `topics_json` array, tolerating malformed input. */
export function parseTopics(topicsJson: string | null | undefined): string[] {
  if (!topicsJson) return [];
  try {
    const parsed = JSON.parse(topicsJson);
    if (Array.isArray(parsed)) {
      return parsed.map((t) => String(t).trim()).filter((t) => t.length > 0);
    }
  } catch {
    // fall through
  }
  return [];
}

/** Serialize a topics array to canonical JSON for storage. */
export function serializeTopics(topics: string[]): string {
  return JSON.stringify(topics.map((t) => t.trim()).filter((t) => t.length > 0));
}

/**
 * Parse a free-text topics field (comma or whitespace separated) into a
 * normalized, de-duplicated list. Used by the editor topics input.
 */
export function parseTopicsInput(input: string): string[] {
  const parts = input
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/** Build the space-joined searchable topics string for the catalog index. */
export function topicsToSearchable(topics: string[]): string {
  return topics.join(' ');
}

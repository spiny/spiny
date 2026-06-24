/**
 * Pure helpers powering the Markdown helper toolbar (technical/editor.md).
 * Each function takes the current text and selection and returns the new text
 * with an updated selection, then relies on the normal autosave path.
 */

export interface Selection {
  start: number;
  end: number;
}

export interface EditResult {
  text: string;
  selection: Selection;
}

function normalize(text: string, selection: Selection): Selection {
  const max = text.length;
  const start = Math.max(0, Math.min(selection.start, max));
  const end = Math.max(start, Math.min(selection.end, max));
  return { start, end };
}

/** Wrap the selection (or a placeholder) with an inline marker (`**`, `*`). */
export function applyWrap(
  text: string,
  selection: Selection,
  marker: string,
  placeholder: string
): EditResult {
  const sel = normalize(text, selection);
  const before = text.slice(0, sel.start);
  const selected = text.slice(sel.start, sel.end);
  const after = text.slice(sel.end);
  const content = selected.length > 0 ? selected : placeholder;
  const newText = `${before}${marker}${content}${marker}${after}`;
  const start = sel.start + marker.length;
  const end = start + content.length;
  return { text: newText, selection: { start, end } };
}

/** Set the heading level on the current line(s), replacing any existing level. */
export function applyHeading(text: string, selection: Selection, level: number): EditResult {
  const sel = normalize(text, selection);
  const prefix = `${'#'.repeat(level)} `;
  const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
  let lineEnd = text.indexOf('\n', sel.end);
  if (lineEnd === -1) lineEnd = text.length;
  const segment = text.slice(lineStart, lineEnd);
  const newSegment = segment
    .split('\n')
    .map((line) => prefix + line.replace(/^#{1,6}\s+/, ''))
    .join('\n');
  const newText = text.slice(0, lineStart) + newSegment + text.slice(lineEnd);
  const delta = newText.length - text.length;
  return { text: newText, selection: { start: sel.start + prefix.length, end: sel.end + delta } };
}

/** Insert a horizontal rule on its own line. */
export function insertHorizontalRule(text: string, selection: Selection): EditResult {
  const sel = normalize(text, selection);
  const before = text.slice(0, sel.start);
  const after = text.slice(sel.end);
  const needNlBefore = before.length > 0 && !before.endsWith('\n');
  const needNlAfter = after.length > 0 && !after.startsWith('\n');
  const insert = `${needNlBefore ? '\n' : ''}---\n${needNlAfter ? '' : ''}`;
  const newText = before + insert + after;
  const pos = (before + insert).length;
  return { text: newText, selection: { start: pos, end: pos } };
}

/** Insert an inline link, using the selection as link text when present. */
export function insertLink(
  text: string,
  selection: Selection,
  linkText: string,
  target: string
): EditResult {
  const sel = normalize(text, selection);
  const before = text.slice(0, sel.start);
  const selected = text.slice(sel.start, sel.end);
  const after = text.slice(sel.end);
  const label = selected.length > 0 ? selected : linkText;
  const md = `[${label}](${target})`;
  const newText = before + md + after;
  const pos = before.length + md.length;
  return { text: newText, selection: { start: pos, end: pos } };
}

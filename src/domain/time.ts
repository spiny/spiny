/**
 * Timestamp helpers. All persisted timestamps are ISO-8601 UTC strings so they
 * sort lexicographically and drive latest-wins sync (technical/sync.md).
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Compare two ISO timestamps. Returns > 0 when `a` is newer than `b`,
 * < 0 when older, 0 when equal. `null`/`undefined` is treated as oldest.
 */
export function compareIso(a: string | null | undefined, b: string | null | undefined): number {
  const ta = a ? Date.parse(a) : -Infinity;
  const tb = b ? Date.parse(b) : -Infinity;
  if (ta === tb) return 0;
  return ta > tb ? 1 : -1;
}

export function isNewerOrEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return compareIso(a, b) >= 0;
}

/** Human-friendly relative time for list rows (locale-agnostic, short). */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo`;
  const year = Math.floor(day / 365);
  return `${year}y`;
}

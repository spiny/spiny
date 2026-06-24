/**
 * Byte-length helpers for the document body limit.
 *
 * Storage/editor requirement: `body_markdown` is capped at 64 KB measured by
 * UTF-8 encoded byte length, not character count. The UI warns near the limit
 * and truncation on save is acceptable with a visible warning.
 */

export const MAX_BODY_BYTES = 64 * 1024; // 65536
export const BODY_WARN_BYTES = Math.floor(MAX_BODY_BYTES * 0.9); // warn at 90%

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/** UTF-8 byte length of a string. */
export function byteLength(value: string): number {
  if (encoder) return encoder.encode(value).length;
  // Fallback manual UTF-8 byte count (should not be needed on RN/Hermes).
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++; // surrogate pair
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Truncate a string so its UTF-8 byte length does not exceed `maxBytes`.
 * Never splits a multi-byte character.
 */
export function truncateToBytes(value: string, maxBytes: number = MAX_BODY_BYTES): string {
  if (byteLength(value) <= maxBytes) return value;
  // Binary search the longest safe character prefix.
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (byteLength(value.slice(0, mid)) <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return value.slice(0, lo);
}

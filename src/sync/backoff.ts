/**
 * Retry policy (technical/sync.md): exponential backoff 30s, 2m, 5m, 15m, then
 * permanent failure after four consecutive failures for the same document.
 */

export const RETRY_BACKOFF_MS = [30_000, 120_000, 300_000, 900_000] as const;
export const MAX_RETRIES = RETRY_BACKOFF_MS.length; // 4

/** Delay before the next attempt given the number of prior failures. */
export function backoffDelay(priorFailures: number): number {
  const idx = Math.min(priorFailures, RETRY_BACKOFF_MS.length - 1);
  return RETRY_BACKOFF_MS[idx];
}

export interface RetryState {
  failures: number;
  nextAttemptAt: number; // epoch ms
}

export function nextRetryState(prior: RetryState | undefined, now: number): RetryState {
  const failures = (prior?.failures ?? 0) + 1;
  return { failures, nextAttemptAt: now + backoffDelay(failures - 1) };
}

export function isPermanentFailure(state: RetryState | undefined): boolean {
  return (state?.failures ?? 0) >= MAX_RETRIES;
}

export function isRetryReady(state: RetryState | undefined, now: number): boolean {
  if (!state) return true;
  return now >= state.nextAttemptAt;
}

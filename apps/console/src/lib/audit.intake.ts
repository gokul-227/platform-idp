import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret check for the internal audit receivers.
 *
 * Constant time, so the comparison itself says nothing about how much of a
 * guess was right. `timingSafeEqual` throws on a length mismatch, which would
 * leak the length, so the lengths are compared first and a mismatch is
 * compared against the expected value to keep the work constant either way.
 */
export function secretMatches(
  presented: string | null,
  expected: string
): boolean {
  if (!presented) {
    return false;
  }
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

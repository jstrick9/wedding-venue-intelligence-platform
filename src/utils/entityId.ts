let monotonicSequence = 0;

function normalizePrefix(prefix: string): string {
  return prefix.trim().replace(/[^a-z0-9_-]/gi, '') || 'entity';
}

function randomSegment(): string | null {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return null;
}

/**
 * Generate an opaque entity ID and verify it against the caller's current
 * collection. A monotonic component guarantees same-millisecond uniqueness even
 * when Web Crypto is unavailable or a test double returns repeated entropy.
 */
export function createEntityId(prefix: string, existingIds: Iterable<string> = []): string {
  const normalizedPrefix = normalizePrefix(prefix);
  const existing = new Set(existingIds);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    monotonicSequence = (monotonicSequence + 1) % Number.MAX_SAFE_INTEGER;
    const random = randomSegment();
    const suffix = random
      ? `${random}-${monotonicSequence.toString(36)}`
      : `${Date.now().toString(36)}-${monotonicSequence.toString(36)}`;
    const id = `${normalizedPrefix}-${suffix}`;
    if (!existing.has(id)) return id;
  }

  // The loop can only exhaust under a hostile/repeating crypto stub plus a
  // matching existing set. Continue deterministically until a free ID exists.
  let id = '';
  do {
    monotonicSequence = (monotonicSequence + 1) % Number.MAX_SAFE_INTEGER;
    id = `${normalizedPrefix}-${Date.now().toString(36)}-${monotonicSequence.toString(36)}`;
  } while (existing.has(id));
  return id;
}

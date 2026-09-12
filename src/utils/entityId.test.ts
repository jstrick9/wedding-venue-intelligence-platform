import { describe, expect, it, vi } from 'vitest';
import { createEntityId } from './entityId';

describe('createEntityId', () => {
  it('creates distinct IDs during same-millisecond creation bursts', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const ids = Array.from({ length: 100 }, () => createEntityId('table'));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('table-'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('checks the current collection before returning an ID', () => {
    const first = createEntityId('fixture');
    const second = createEntityId('fixture', [first]);
    expect(second).not.toBe(first);
  });

  it('normalizes unsafe or empty prefixes', () => {
    expect(createEntityId(' ceremony row! ')).toMatch(/^ceremonyrow-/);
    expect(createEntityId('   ')).toMatch(/^entity-/);
  });
});

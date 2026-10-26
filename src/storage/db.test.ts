import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './db';

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('uses crypto.randomUUID when it exists', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('still works where crypto.randomUUID is missing (plain http on a LAN address)', () => {
    vi.stubGlobal('crypto', {});
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.length).toBeGreaterThan(10);
  });
});

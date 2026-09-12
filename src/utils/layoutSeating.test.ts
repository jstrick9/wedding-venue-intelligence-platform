import { describe, expect, it } from 'vitest';
import {
  configuredChairCount,
  layoutSeatCount,
  seatingGroupGeometry,
  shouldRenderChairGraphics,
  tableSeatCount,
  usesChairClearance,
} from './layoutSeating';

const spec = {
  id: 'six-foot',
  capacity: 10,
  defaultChairType: 'white-plastic' as const,
};

describe('layout seating source of truth', () => {
  it('uses an explicit placed chair count before legacy or catalog capacity', () => {
    expect(configuredChairCount({ chairCount: 8, customCapacity: 9 }, spec)).toBe(8);
  });

  it('preserves an explicit zero instead of falling through to catalog capacity', () => {
    expect(configuredChairCount({ chairCount: 0, customCapacity: 9 }, spec)).toBe(0);
  });

  it('falls back through legacy custom capacity to catalog capacity', () => {
    expect(configuredChairCount({ customCapacity: 7 }, spec)).toBe(7);
    expect(configuredChairCount({}, spec)).toBe(10);
  });

  it('treats hydrated null or blank fields as absent without weakening explicit numeric zero', () => {
    expect(configuredChairCount({ chairCount: null, customCapacity: 7 } as any, spec)).toBe(7);
    expect(configuredChairCount({ chairCount: '', customCapacity: null } as any, spec)).toBe(10);
    expect(configuredChairCount({ chairCount: 0 }, spec)).toBe(0);
  });

  it('multiplies chair rows only for seating-only catalog types', () => {
    expect(tableSeatCount({ chairCount: 8 }, spec)).toBe(8);
    expect(tableSeatCount(
      { chairCount: 8 },
      { ...spec, isSeatingType: true, seatingRowCount: 4 },
    )).toBe(32);
  });

  it('totals edited ordinary table chair counts across a layout', () => {
    const tables = [
      { specId: 'six-foot', chairCount: 10 },
      { specId: 'six-foot', chairCount: 10 },
      { specId: 'six-foot', chairCount: 10 },
      { specId: 'six-foot', chairCount: 8 },
    ];
    expect(layoutSeatCount(tables, [spec])).toBe(38);
  });

  it('shares curved seating bounds and normalized chair positions with collision geometry', () => {
    const geometry = seatingGroupGeometry(
      6,
      { seatingRowCount: 2, seatingRowSpacing: 3, seatingStyle: 'semicircle-row' },
      { width: 1.5, depth: 1.5 },
    );
    expect(geometry.chairs).toHaveLength(12);
    expect(geometry.rowWidthFt).toBeGreaterThan(6 * 1.5);
    expect(geometry.rowDepthFt).toBeGreaterThan(2 * 1.5);
    expect(Math.min(...geometry.chairs.map((chair) => chair.x))).toBeGreaterThanOrEqual(0);
    expect(Math.min(...geometry.chairs.map((chair) => chair.y))).toBeGreaterThanOrEqual(0);
  });

  it('returns no seating footprint for an explicit zero chairs per row', () => {
    const geometry = seatingGroupGeometry(
      0,
      { seatingRowCount: 4, seatingRowSpacing: 3, seatingStyle: 'straight-row' },
      { width: 1.5, depth: 1.5 },
    );
    expect(geometry.chairs).toEqual([]);
    expect(geometry.rowWidthFt).toBe(0);
    expect(geometry.rowDepthFt).toBe(0);
  });

  it('treats Hide Chairs as visual-only while zero removes graphics and clearance', () => {
    const visuallyHidden = {
      chairCount: 8,
      chairType: 'white-plastic' as const,
      showChairs: false,
    };
    expect(shouldRenderChairGraphics(visuallyHidden, spec)).toBe(false);
    expect(usesChairClearance(visuallyHidden, spec)).toBe(true);

    const standingTable = {
      chairCount: 0,
      chairType: 'white-plastic' as const,
      showChairs: true,
    };
    expect(shouldRenderChairGraphics(standingTable, spec)).toBe(false);
    expect(usesChairClearance(standingTable, spec)).toBe(false);
  });
});

import type { CeremonyChairRow, ChairType, PlacedTable, TableSpec } from '../types';

/**
 * Design Studio seating semantics.
 *
 * `chairCount` is authoritative when it is present, including an explicit zero.
 * `customCapacity` is retained only as a compatibility fallback for historical
 * layouts that pre-date per-table chair counts. The table catalog capacity is the
 * final fallback for an untouched/legacy table.
 */
function nonNegativeWholeNumber(value: unknown): number | null {
  // Missing legacy fields may arrive as null (for example from JSON/database
  // hydration). Only an explicit numeric zero is authoritative; null/blank
  // values must continue through the compatibility fallback chain.
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.floor(numeric));
}

export function configuredChairCount(
  table: Pick<PlacedTable, 'chairCount' | 'customCapacity'>,
  spec?: Pick<TableSpec, 'capacity'> | null,
): number {
  return (
    nonNegativeWholeNumber(table.chairCount)
    ?? nonNegativeWholeNumber(table.customCapacity)
    ?? nonNegativeWholeNumber(spec?.capacity)
    ?? 0
  );
}

export function configuredChairType(
  table: Pick<PlacedTable, 'chairType'>,
  spec?: Pick<TableSpec, 'defaultChairType'> | null,
): ChairType {
  return table.chairType || spec?.defaultChairType || 'white-plastic';
}

/** Total physical seats represented by one placed table/seating object. */
export function tableSeatCount(
  table: Pick<PlacedTable, 'chairCount' | 'customCapacity'>,
  spec?: Pick<TableSpec, 'capacity' | 'isSeatingType' | 'seatingRowCount'> | null,
): number {
  const chairsPerRow = configuredChairCount(table, spec);
  if (!spec?.isSeatingType) return chairsPerRow;
  return chairsPerRow * Math.max(1, nonNegativeWholeNumber(spec.seatingRowCount) || 1);
}

/** Physical chairs represented by legacy ceremony-row data. */
export function ceremonyRowSeatCount(
  rows: Array<Pick<CeremonyChairRow, 'chairCount' | 'chairType'>> = [],
): number {
  return rows.reduce((total, row) => {
    if (row.chairType === 'none') return total;
    return total + (nonNegativeWholeNumber(row.chairCount) ?? 0);
  }, 0);
}

/** Total configured seating represented by placed seating objects and legacy rows. */
export function layoutSeatCount(
  tables: Array<Pick<PlacedTable, 'specId' | 'chairCount' | 'customCapacity'>>,
  specs: Array<Pick<TableSpec, 'id' | 'capacity' | 'isSeatingType' | 'seatingRowCount'>>,
  ceremonyRows: Array<Pick<CeremonyChairRow, 'chairCount' | 'chairType'>> = [],
): number {
  const byId = new Map(specs.map((spec) => [spec.id, spec]));
  return tables.reduce((total, table) => total + tableSeatCount(table, byId.get(table.specId)), 0)
    + ceremonyRowSeatCount(ceremonyRows);
}

export interface SeatingGroupDimensions {
  rowCount: number;
  rowSpacingFt: number;
  chairWidthFt: number;
  chairDepthFt: number;
  chairGapFt: number;
  rowWidthFt: number;
  rowDepthFt: number;
}

export interface SeatingGroupChairPlacement {
  x: number;
  y: number;
  rotation: number;
}

export interface SeatingGroupGeometry extends SeatingGroupDimensions {
  chairs: SeatingGroupChairPlacement[];
}

function rotatedChairBounds(
  chair: SeatingGroupChairPlacement,
  width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const radians = (chair.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerX = chair.x + width / 2;
  const centerY = chair.y + height / 2;
  const points = [
    { x: chair.x, y: chair.y },
    { x: chair.x + width, y: chair.y },
    { x: chair.x + width, y: chair.y + height },
    { x: chair.x, y: chair.y + height },
  ].map((point) => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    return {
      x: centerX + dx * cosine - dy * sine,
      y: centerY + dx * sine + dy * cosine,
    };
  });
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

/** Shared chair-only geometry for canvas, collision, and impact paths. */
export function seatingGroupGeometry(
  chairsPerRow: number,
  spec: Pick<TableSpec, 'seatingRowCount' | 'seatingRowSpacing' | 'seatingStyle'>,
  chair: { width?: number; depth?: number } | null | undefined,
): SeatingGroupGeometry {
  const count = Math.max(0, Math.floor(chairsPerRow));
  const chairWidthFt = Math.max(0.01, Number(chair?.width) || 1.5);
  const chairDepthFt = Math.max(0.01, Number(chair?.depth) || chairWidthFt || 1.5);
  const rowCount = Math.max(1, Math.floor(Number(spec.seatingRowCount) || 1));
  const rowSpacingFt = Math.max(0.5, Number(spec.seatingRowSpacing) || 3);
  const chairGapFt = Math.max(0.2, chairWidthFt * 0.15);
  const metadata = { rowCount, rowSpacingFt, chairWidthFt, chairDepthFt, chairGapFt };
  if (count === 0) return { ...metadata, rowWidthFt: 0, rowDepthFt: 0, chairs: [] };

  const baseWidth = count * chairWidthFt + Math.max(0, count - 1) * chairGapFt;
  const style = spec.seatingStyle || 'straight-row';
  const chairs: SeatingGroupChairPlacement[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const rowY = row * (chairDepthFt + rowSpacingFt);
    if (style === 'curved-row' || style === 'semicircle-row') {
      const span = style === 'semicircle-row' ? Math.PI : Math.PI * 0.75;
      const start = Math.PI / 2 - span / 2;
      const radius = Math.max(baseWidth / 2, 3) + row * rowSpacingFt * 0.6;
      const centerX = baseWidth / 2;
      const centerY = rowY + chairDepthFt;
      for (let index = 0; index < count; index += 1) {
        const ratio = count === 1 ? 0.5 : index / (count - 1);
        const angle = start + ratio * span;
        chairs.push({
          x: centerX + Math.cos(angle) * radius - chairWidthFt / 2,
          y: centerY + Math.sin(angle) * radius - chairDepthFt / 2,
          rotation: (angle * 180) / Math.PI + 90,
        });
      }
      continue;
    }
    for (let index = 0; index < count; index += 1) {
      const curveOffset = style === 'stadium'
        ? Math.abs(index - (count - 1) / 2) * 0.15
        : 0;
      chairs.push({
        x: index * (chairWidthFt + chairGapFt),
        y: rowY + curveOffset,
        rotation: 180,
      });
    }
  }

  const bounds = chairs.map((placed) => rotatedChairBounds(placed, chairWidthFt, chairDepthFt));
  const minX = Math.min(...bounds.map((box) => box.minX));
  const minY = Math.min(...bounds.map((box) => box.minY));
  const maxX = Math.max(...bounds.map((box) => box.maxX));
  const maxY = Math.max(...bounds.map((box) => box.maxY));
  return {
    ...metadata,
    rowWidthFt: maxX - minX,
    rowDepthFt: maxY - minY,
    chairs: chairs.map((placed) => ({ ...placed, x: placed.x - minX, y: placed.y - minY })),
  };
}

/** Shared dimensions for callers that do not need individual chair positions. */
export function seatingGroupDimensions(
  chairsPerRow: number,
  spec: Pick<TableSpec, 'seatingRowCount' | 'seatingRowSpacing' | 'seatingStyle'>,
  chair: { width?: number; depth?: number } | null | undefined,
): SeatingGroupDimensions {
  const { chairs: _chairs, ...dimensions } = seatingGroupGeometry(chairsPerRow, spec, chair);
  return dimensions;
}

/**
 * Graphic visibility is a presentation choice. It does not alter capacity or
 * physical collision clearance for a positive chair count.
 */
export function shouldRenderChairGraphics(
  table: Pick<PlacedTable, 'chairCount' | 'customCapacity' | 'chairType' | 'showChairs'>,
  spec?: Pick<TableSpec, 'capacity' | 'defaultChairType' | 'isSeatingType'> | null,
): boolean {
  if (configuredChairCount(table, spec) === 0) return false;
  if (configuredChairType(table, spec) === 'none') return false;
  return spec?.isSeatingType ? true : table.showChairs !== false;
}

/**
 * Positive configured chairs occupy floor space even when their graphics are
 * hidden. An explicit zero removes both chair graphics and chair clearance.
 */
export function usesChairClearance(
  table: Pick<PlacedTable, 'chairCount' | 'customCapacity' | 'chairType'>,
  spec?: Pick<TableSpec, 'capacity' | 'defaultChairType'> | null,
): boolean {
  return configuredChairCount(table, spec) > 0 && configuredChairType(table, spec) !== 'none';
}

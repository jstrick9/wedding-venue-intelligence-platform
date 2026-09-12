import type {
  DecorArrangement,
  DecorItem,
  FixtureType,
  PlacedFixture,
  PlacedTable,
  Point,
  TableSpec,
} from '../types';
import { getChairSpecs } from '../data/venueData';
import { configuredChairCount, seatingGroupGeometry } from './layoutSeating';
import { rotatePoint, rotatedBoxPolygon } from './venueGeometry';

export interface AppliedDecorFootprint {
  id: string;
  decorItemId: string;
  polygon: Point[];
}

type DecorBase = PlacedTable | PlacedFixture;
type DecorBaseSpec = Pick<TableSpec, 'width' | 'height' | 'capacity' | 'isSeatingType' | 'seatingRowCount' | 'seatingRowSpacing' | 'seatingStyle' | 'defaultChairType'>
  | Pick<FixtureType, 'width' | 'height'>;

/** Match the base center used by the canvas, including chair-only seating groups. */
export function appliedArrangementBaseDimensions(
  base: DecorBase,
  baseSpec: DecorBaseSpec,
): { width: number; height: number } {
  if (base.type !== 'table' || !('isSeatingType' in baseSpec) || !baseSpec.isSeatingType) {
    return { width: baseSpec.width, height: baseSpec.height };
  }
  const chairType = base.chairType || baseSpec.defaultChairType || 'white-plastic';
  const chair = getChairSpecs().find((candidate) => candidate.id === chairType);
  const seating = seatingGroupGeometry(configuredChairCount(base, baseSpec), baseSpec, chair);
  return {
    // The renderer retains a one-foot selectable marker for explicit zero.
    width: Math.max(1, seating.rowWidthFt),
    height: Math.max(1, seating.rowDepthFt),
  };
}

/** Physical applied-design footprints in the base item's local coordinate frame. */
export function appliedArrangementFootprints(
  base: DecorBase,
  baseSpec: DecorBaseSpec,
  arrangement: DecorArrangement,
  decorItems: DecorItem[],
): AppliedDecorFootprint[] {
  const baseDimensions = appliedArrangementBaseDimensions(base, baseSpec);
  const baseCenter = {
    x: base.x + baseDimensions.width / 2,
    y: base.y + baseDimensions.height / 2,
  };
  const baseRotation = Number.isFinite(base.rotation) ? base.rotation : 0;

  return arrangement.items.flatMap((item, index) => {
    const spec = decorItems.find((candidate) => candidate.id === item.decorItemId);
    if (!spec) return [];
    const width = Math.max(
      0.01,
      (spec.width + (spec.widthInches || 0) / 12)
        * Math.abs(Number.isFinite(item.scaleX) ? item.scaleX : 1),
    );
    const height = Math.max(
      0.01,
      (spec.height + (spec.heightInches || 0) / 12)
        * Math.abs(Number.isFinite(item.scaleY) ? item.scaleY : 1),
    );
    // Arrangement x/y are stored in designer inches and represent offsets from
    // the base center. FloorPlanCanvas renders the same conversion (÷ 12).
    const itemCenter = {
      x: baseCenter.x + (Number.isFinite(item.x) ? item.x : 0) / 12,
      y: baseCenter.y + (Number.isFinite(item.y) ? item.y : 0) / 12,
    };
    const itemRotation = Number.isFinite(item.rotation) ? item.rotation : 0;
    const localPolygon = rotatedBoxPolygon(
      {
        x: itemCenter.x - width / 2,
        y: itemCenter.y - height / 2,
        width,
        height,
      },
      itemCenter,
      itemRotation,
    );
    const polygon = baseRotation === 0
      ? localPolygon
      : localPolygon.map((point) => rotatePoint(point, baseCenter, baseRotation));
    return [{
      id: `${base.id}:arrangement:${arrangement.id}:${index}`,
      decorItemId: item.decorItemId,
      polygon,
    }];
  });
}

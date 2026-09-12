import type { CeremonyChairRow, Point } from '../types';
import { rotatePoint, rotatedBoxPolygon } from './venueGeometry';

export interface CeremonyChairPlacement {
  x: number;
  y: number;
  size: number;
  rotation: number;
}

/**
 * Canonical ceremony-row chair positions in venue-local feet. The canvas and
 * geometry-impact review share this path so curved-row units and overall row
 * rotation cannot drift.
 */
export function ceremonyChairPlacements(
  row: CeremonyChairRow,
  chairSize: number,
): CeremonyChairPlacement[] {
  const count = Math.max(0, Math.floor(Number.isFinite(row.chairCount) ? row.chairCount : 0));
  if (count === 0 || row.chairType === 'none') return [];
  const size = Math.max(0.01, Number.isFinite(chairSize) ? chairSize : 1.5);
  const spacing = Math.max(0, Number.isFinite(row.spacing) ? row.spacing : 0);
  const overallRotation = Number.isFinite(row.rotation) ? row.rotation : 0;
  const placements: CeremonyChairPlacement[] = [];

  for (let index = 0; index < count; index += 1) {
    let x: number;
    let y: number;
    let chairRotation: number;

    if (row.rowStyle === 'curved' || row.rowStyle === 'semicircle') {
      const radius = Math.max(0, Number.isFinite(row.curveRadius) ? row.curveRadius! : 20);
      const angleSpan = Math.PI * 0.6;
      const startAngle = Math.PI / 2 - angleSpan / 2;
      const angle = startAngle + (index / Math.max(1, count - 1)) * angleSpan;
      x = row.x + Math.cos(angle) * radius - size / 2;
      y = row.y + Math.sin(angle) * radius - size / 2;
      chairRotation = (angle * 180) / Math.PI - 90 + row.facingDirection;
    } else if (row.rowStyle === 'diagonal-left' || row.rowStyle === 'diagonal-right') {
      const diagonalAngle = ((row.rowStyle === 'diagonal-left' ? -15 : 15) * Math.PI) / 180;
      x = row.x + index * spacing * Math.cos(diagonalAngle) - size / 2;
      y = row.y + index * spacing * Math.sin(diagonalAngle) - size / 2;
      chairRotation = row.facingDirection;
    } else if (row.rowStyle === 'stadium') {
      const halfSpan = Math.max(1, (count - 1) / 2);
      const curve = Math.abs(index - (count - 1) / 2) / halfSpan;
      x = row.x + index * spacing - size / 2;
      y = row.y + curve * 2 - size / 2;
      chairRotation = row.facingDirection;
    } else {
      const totalWidth = (count - 1) * spacing;
      x = row.x - totalWidth / 2 + index * spacing - size / 2;
      y = row.y - size / 2;
      chairRotation = row.facingDirection;
    }

    if (overallRotation !== 0) {
      const center = rotatePoint(
        { x: x + size / 2, y: y + size / 2 },
        { x: row.x, y: row.y },
        overallRotation,
      );
      x = center.x - size / 2;
      y = center.y - size / 2;
      chairRotation += overallRotation;
    }

    placements.push({ x, y, size, rotation: chairRotation });
  }
  return placements;
}

export function ceremonyChairFootprints(
  row: CeremonyChairRow,
  chairSize: number,
): Point[][] {
  return ceremonyChairPlacements(row, chairSize).map((chair) => rotatedBoxPolygon(
    { x: chair.x, y: chair.y, width: chair.size, height: chair.size },
    { x: chair.x + chair.size / 2, y: chair.y + chair.size / 2 },
    chair.rotation,
  ));
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guest-persona / wayfinding: the guest portal's venue maps (the "Venue Map"
 * card and the Wayfinding tab) use the shared `VenueMapCanvas` renderer rather
 * than a hand-rolled SVG. Rendering GuestPortal under jsdom is heavy, so we
 * statically guard that the shared renderer is used and the duplicated SVG
 * map code (routePolyline) is gone — one source of truth for the map.
 */
const PATH = resolve(__dirname, 'GuestPortal.tsx');

describe('GuestPortal uses the shared VenueMapCanvas', () => {
  it('never falls back to a global browser map during a cloud invitation handoff', () => {
    const source = readFileSync(PATH, 'utf8');
    expect(source).toContain('resolveAuthoritativePortalVenueMap(');
    expect(source).toContain('cloudAccountInvite ? null : getVenueMapConfigForPortal()');
    expect(source).not.toContain('remoteVenueMap !== undefined\n    ? remoteVenueMap\n    : getVenueMapConfigForPortal()');
  });

  it('imports and renders VenueMapCanvas for the venue map + wayfinding', () => {
    const source = readFileSync(PATH, 'utf8');
    expect(source).toContain("import { VenueMapCanvas } from './VenueMapCanvas';");
    const uses = (source.match(/<VenueMapCanvas/g) || []).length;
    expect(uses).toBeGreaterThanOrEqual(2); // Venue Map card + Wayfinding tab
    expect(source).toContain('onPointClick={openInMaps}');
    expect(source).toContain('isPointInteractive={hasValidMapGps}');
  });

  it('keeps valid image- or shape-only maps mounted independently of directions', () => {
    const source = readFileSync(PATH, 'utf8');
    expect(source).toContain('hasRenderableVenueMapContent(guestMap)');
    expect(source).toContain('hasRenderableVenueMapContent(venueMap)');
    expect(source).not.toContain('if (guestMap.points.length === 0) return null;');
    expect(source).toMatch(
      /if \(!hasWayfindingPoints\)[\s\S]*?hasDrawableWayfindingMap[\s\S]*?<VenueMapCanvas/,
    );
  });

  it('delivers scoped rain guidance even when there is no drawable map', () => {
    const source = readFileSync(PATH, 'utf8');
    expect(source).toContain('if (!hasDrawableMap && !hasRainGuidance) return null;');
    expect(source).toContain('(hasDrawableWayfindingMap || hasWayfindingRainGuidance)');
    expect(source).toMatch(/hasDrawableMap && \([\s\S]*?<VenueMapCanvas/);
    expect(source).toMatch(/hasDrawableWayfindingMap && \([\s\S]*?<VenueMapCanvas/);
  });

  it('builds turn-by-turn directions with ordered intermediate point guidance', () => {
    const source = readFileSync(PATH, 'utf8');
    expect(source).toContain('buildVenueMapDirectionSteps(scopedMap, path)');
    expect(source).not.toContain('const steps = [`Start at ${from.label}.`]');
  });

  it('withholds generated directions as soon as their map or wedding scope changes', () => {
    const source = readFileSync(PATH, 'utf8');
    expect(source).toContain('venueMapDirectionsContextKey(');
    expect(source).toContain('wayfindingResult?.contextKey === wayfindingContextKey');
    expect(source).toContain('contextKey: wayfindingContextKey');
    expect(source).toContain('currentWayfindingSteps.map');
    expect(source).not.toContain('wayfindingResult.map');
  });

  it('delivers scoped rain-plan guidance in both map and wayfinding views', () => {
    const source = readFileSync(PATH, 'utf8');
    expect(source).toContain("import { VenueMapRainPlanGuidance } from './VenueMapRainPlanGuidance';");
    expect((source.match(/<VenueMapRainPlanGuidance/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('rainContingencies={guestMap.rainContingencies}');
    expect(source).toContain('rainContingencies={venueMap!.rainContingencies}');
  });

  it('quarantines colliding rain plans before expanding a guest venue scope', () => {
    const source = readFileSync(PATH, 'utf8');
    expect(source).toMatch(
      /collisionSafeRainPlans = activeVenueMap[\s\S]*?partitionVenueMapRainContingencyCollisions\(activeVenueMap\)\.map\.rainContingencies[\s\S]*?const backupIds = collisionSafeRainPlans/,
    );
  });

  it('no longer contains the duplicated hand-rolled map SVG / routePolyline', () => {
    const source = readFileSync(PATH, 'utf8');
    expect(source).not.toContain('routePolyline');
    expect(source).not.toContain('const pts = routePolyline');
  });
});

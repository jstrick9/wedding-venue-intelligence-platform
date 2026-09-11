import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Venue-admin persona: the full-venue map designer is its own dedicated module
 * (`#/venuemap`) inside the Layout Studio rather than being buried in Admin.
 * Rendering AuthenticatedApp is too heavy for jsdom (see App.smoke.test.tsx),
 * so we statically guard the route wiring — the module must be reachable via the
 * hash route, exposed as a dedicated `view`, and the designer must actually render.
 */
const APP_PATH = resolve(__dirname, 'AuthenticatedApp.tsx');

describe('AuthenticatedApp full-venue map module route', () => {
  it('defines a dedicated "venuemap" view and hash route', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    // view union includes 'venuemap'
    expect(source).toMatch(/'dashboard' \| 'studio' \| 'admin' \| 'venuemap'/);
    // hash routing handles #/venuemap
    expect(source).toMatch(/#\/venuemap/);
  });

  it('renders the VenueMapDesigner in a dedicated view branch', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    // Imports the designer and the venue-map service helpers
    expect(source).toContain("import { VenueMapDesigner } from './VenueMapDesigner';");
    expect(source).toContain('getVenueMapConfig');
    expect(source).toContain('emptyVenueMapConfig');
    // Dedicated render branch that mounts the designer
    expect(source).toMatch(/view === 'venuemap'/);
    expect(source).toContain('<VenueMapDesigner');
    expect(source).toContain('saveVenueMapConfig');
    // saveVersionedStorage already emits the canonical domain event. A second
    // explicit emit here would race two backend writes for every map publish.
    expect(source).not.toMatch(/saveVenueMapConfig\(next\);\s*emitDataChanged\('venueMapConfigs'\)/);
  });

  it('routes the Studio "Design the full-venue map" shortcut to the module, not Admin', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    // The shortcut no longer sets ADMIN_LAST_TAB / navigates to #/admin
    expect(source).not.toContain("localStorage.setItem(STORAGE_KEYS.ADMIN_LAST_TAB, 'wayfinding')");
    expect(source).toContain("window.location.hash = '#/venuemap';");
  });

  it('uses revision-aware saves and offers explicit conflict resolution', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    expect(source).toContain('baseUpdatedAt={organizationId');
    expect(source).toContain('coordinateVenueMapSave({');
    expect(source).toContain('saveToCloud: entityBackendSync.saveVenueMapToBackend');
    expect(source).toContain('Keep my draft');
    expect(source).toContain('Reload shared map');
    expect(source).toContain('Overwrite shared map');
    expect(source).toContain('cacheVenueMapConfigFromServer');
    expect(source).toContain('onConflictDraftChange={(latestDraft, publicationBlocked) =>');
    expect(source).toContain('localMap: latestDraft');
    expect(source).toContain('overwriteBlocked: publicationBlocked');
    expect(source).toContain('setVenueMapConflict({ ...conflict, overwriteBlocked: true })');
    expect(source).toContain('confirmDisabled={venueMapConflict?.overwriteBlocked ?? true}');
    expect(source).toContain('if (!venueMapConflict || venueMapConflict.overwriteBlocked) return;');
    expect(source).toContain('overwriteBlocked: publicationBlocked');
  });

  it('recomputes and discloses route-coverage gaps for the exact CAS overwrite payload', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    expect(source).toContain('venueMapGuestRouteCoverageIssues(venueMapConflict.localMap, layoutState.venues)');
    expect(source).toContain('The exact retained draft has');
    expect(source).toContain('Overwrite with known gaps');
    expect(source).toContain('Overwriting will not create missing pins or routes, or claim step-free access.');
  });

  it('defaults destructive venue-map decisions to keeping the local draft', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    expect(source).toMatch(
      /title="Discard unsaved map changes\?"[\s\S]{0,500}?cancelLabel="Keep editing"[\s\S]{0,100}?initialFocus="cancel"[\s\S]{0,100}?tone="danger"/,
    );
    expect(source).toMatch(
      /title="Venue map changed elsewhere"[\s\S]{0,3500}?cancelLabel="Keep my draft"[\s\S]{0,600}?initialFocus="cancel"[\s\S]{0,100}?tone="danger"/,
    );
  });

  it('remounts accepted saves from a tenant-scoped in-memory seed if cache storage fails', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    expect(source).toContain('const [venueMapEditorSeed, setVenueMapEditorSeed]');
    expect(source).toContain('venueMapEditorSeed?.organizationId === organizationId');
    expect(source).toContain('setVenueMapEditorSeed({ organizationId, map: next })');
    expect(source).toMatch(
      /saveVenueMapConfig\(venueMapConflict\.localMap[\s\S]*?setVenueMapEditorSeed\(\{[\s\S]*?map: venueMapConflict\.localMap/,
    );
    expect(source).toMatch(
      /cacheVenueMapConfigFromServer\(venueMapConflict\.currentPayload\)[\s\S]*?setVenueMapEditorSeed\(null\)/,
    );
    expect(source).toContain('onLoaded: handleEntitiesLoaded');
  });

  it('hides the map shell header and expands the dedicated print surface', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    expect(source).toContain('spm-venue-map-shell h-screen');
    expect(source).toContain('spm-venue-map-content flex-1');
    expect(source).toMatch(/<header className="[^"]*no-print spm-studio-chrome/);
  });

  it('guards hash/back navigation and browser unload while the map draft is dirty', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    expect(source).toContain("viewRef.current === 'venuemap' && venueMapDirtyRef.current");
    expect(source).toContain("window.history.replaceState(window.history.state, '', '#/venuemap')");
    expect(source).toContain('layoutState.layoutDirty || venueMapDirty');
    expect(source).toContain('pendingVenueMapHash');
  });

  it('does not render a cached venue map before the current tenant is hydrated', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    expect(source).toContain('if (!entityBackendSync.hydrated)');
    expect(source).toContain('entityBackendSync.loadError');
    expect(source).toContain('entityBackendSync.loadFromBackend()');
    expect(source).toContain("detail?.source === 'backend'");
  });
});

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  PlacedTable,
  PlacedFixture,
  PlacedDecor,
  CeremonyChairRow,
  Venue,
  Guest,
  Layout,
  TableSpec,
  FixtureType,
  Guideline,
  LayoutTemplate,
  User,
  DecorItem,
  DecorCategoryDef,
  DecorArrangement,
  DecorPackage,
  defaultAlignmentSettings,
} from '../types';
import {
  defaultVenues,
  defaultTableSpecs,
  defaultFixtureTypes,
  defaultGuidelines,
  defaultLayoutTemplates,
  defaultUsers,
  defaultLinenColors,
  LinenColor,
  defaultChairSpecs,
  defaultWallStyles,
  defaultSpacingSettings,
  defaultIndoorFeatureTemplates,
  defaultOutdoorFeatureTemplates,
  defaultDecorCategories,
  defaultDecorItems,
  loadFromStorage,
  saveToStorage,
} from '../data/venueData';
import {
  getSavedLayoutDocuments,
  setSavedLayoutDocuments,
} from '../utils/collaboration';
import { parseGuestCsv } from '../utils/guestCsv';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { STORAGE_VERSIONS } from '../constants/storageVersions';
import { saveVersionedStorage } from '../utils/storage';
import { emitDataChanged, on, emit } from '../utils/appEvents';
import { createEntityId } from '../utils/entityId';
import { validateLayout } from '../utils/collisionDetection';
import { mergeVenueGeometry, venueGeometrySignature } from '../utils/venueGeometry';
import {
  replaceCatalogReferencesInLayout,
  type CatalogKind,
} from '../utils/catalogReferences';

// Position type
export interface Position {
  x: number;
  y: number;
}

// Validation warning type
export interface ValidationWarning {
  id: string;
  type: 'overlap' | 'capacity' | 'spacing' | 'accessibility';
  message: string;
  itemIds: string[];
}

// Result of a CSV guest import. Type lives in utils/guestCsv.ts and is
// imported + re-exported here for backward-compatible imports.
import type { GuestImportResult } from '../utils/guestCsv';
export type { GuestImportResult };

// Saved layout type (user layouts)
export interface SavedLayout {
  id: string;
  name: string;
  venueId: string;
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  decor: PlacedDecor[];
  ceremonyRows?: CeremonyChairRow[];
  guests: Guest[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// Storage keys
const STORAGE = {
  VENUES: STORAGE_KEYS.VENUES,
  TABLE_SPECS: STORAGE_KEYS.TABLE_SPECS,
  FIXTURE_TYPES: STORAGE_KEYS.FIXTURE_TYPES,
  GUIDELINES: STORAGE_KEYS.GUIDELINES,
  TEMPLATES: STORAGE_KEYS.TEMPLATES,
  USERS: STORAGE_KEYS.USERS,
  SAVED_LAYOUTS: STORAGE_KEYS.SAVED_LAYOUTS,
  CONFIG: STORAGE_KEYS.CONFIG,
  LINEN_COLORS: STORAGE_KEYS.LINEN_COLORS,
  DECOR_ITEMS: STORAGE_KEYS.DECOR_ITEMS,
  DECOR_CATEGORIES: STORAGE_KEYS.DECOR_CATEGORIES,
  DECOR_ARRANGEMENTS: STORAGE_KEYS.DECOR_ARRANGEMENTS,
  DECOR_PACKAGES: STORAGE_KEYS.DECOR_PACKAGES,
};

// Safe fallback venue so the app never crashes when there are no venues configured yet.
const FALLBACK_VENUE: Venue = {
  id: 'setup-venue',
  name: 'New Venue',
  category: 'reception',
  width: 60,
  height: 40,
  capacity: 150,
  color: '#FFFFFF',
  borderColor: '#4A1942',
  borderWidth: 2,
  pattern: 'solid',
  shape: 'rectangle',
  isMaster: true,
  canvasWidth: 100,
  canvasHeight: 80,
  venueX: 20,
  venueY: 20,
  exteriorPadding: { top: 20, right: 20, bottom: 20, left: 20 },
};


function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  const formulaSafe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

// Data access functions
export function getVenues(): Venue[] {
  const venues = loadFromStorage(STORAGE.VENUES, defaultVenues) as Venue[];
  return venues.length > 0 ? venues : [FALLBACK_VENUE];
}

export function setVenues(venues: Venue[]): void {
  saveToStorage(STORAGE.VENUES, venues);
  emitDataChanged('venues');
}

export function getTableSpecs(): TableSpec[] {
  return loadFromStorage(STORAGE.TABLE_SPECS, defaultTableSpecs);
}

export function setTableSpecs(specs: TableSpec[]): void {
  saveToStorage(STORAGE.TABLE_SPECS, specs);
  emitDataChanged('tableSpecs');
}

export function getFixtureTypes(): FixtureType[] {
  return loadFromStorage(STORAGE.FIXTURE_TYPES, defaultFixtureTypes);
}

export function setFixtureTypes(types: FixtureType[]): void {
  saveToStorage(STORAGE.FIXTURE_TYPES, types);
  emitDataChanged('fixtureTypes');
}

export function getGuidelines(): Guideline[] {
  return loadFromStorage(STORAGE.GUIDELINES, defaultGuidelines);
}

export function setGuidelines(guidelines: Guideline[]): void {
  saveToStorage(STORAGE.GUIDELINES, guidelines);
  emitDataChanged('guidelines');
}

export function getTemplates(): LayoutTemplate[] {
  return loadFromStorage(STORAGE.TEMPLATES, defaultLayoutTemplates);
}

export function setTemplates(templates: LayoutTemplate[]): void {
  saveToStorage(STORAGE.TEMPLATES, templates);
  emitDataChanged('templates');
}

export function getUsers(): User[] {
  return loadFromStorage(STORAGE.USERS, defaultUsers);
}

export function setUsers(users: User[]): void {
  saveToStorage(STORAGE.USERS, users);
}

export function getSavedLayouts(): SavedLayout[] {
  return getSavedLayoutDocuments().map(
    ({ revision, lastModifiedBy, lastModifiedByName, ...layout }) => ({
      ...layout,
      decor: Array.isArray(layout.decor) ? layout.decor : [],
    }),
  );
}

export function setSavedLayouts(layouts: SavedLayout[]): void {
  const existingDocs = getSavedLayoutDocuments();

  const nextDocs = layouts.map((layout) => {
    const existing = existingDocs.find((doc) => doc.id === layout.id);

    return {
      ...layout,
      decor: Array.isArray(layout.decor) ? layout.decor : [],
      revision: existing?.revision ?? 1,
      lastModifiedBy: existing?.lastModifiedBy,
      lastModifiedByName: existing?.lastModifiedByName,
    };
  });

  setSavedLayoutDocuments(nextDocs);
}

export function getLinenColors(): LinenColor[] {
  return loadFromStorage(STORAGE.LINEN_COLORS, defaultLinenColors);
}

export function setLinenColors(colors: LinenColor[]): void {
  saveToStorage(STORAGE.LINEN_COLORS, colors);
  emitDataChanged('linenColors');
}

export function getDecorItems(): DecorItem[] {
  const items = loadFromStorage(STORAGE.DECOR_ITEMS, defaultDecorItems) as DecorItem[];
  return Array.isArray(items) ? items : defaultDecorItems;
}

export function setDecorItems(items: DecorItem[]): void {
  saveToStorage(STORAGE.DECOR_ITEMS, items);
  emitDataChanged('decorItems');
}

export function getDecorCategories(): DecorCategoryDef[] {
  return loadFromStorage(STORAGE.DECOR_CATEGORIES, defaultDecorCategories) as DecorCategoryDef[];
}

export function setDecorCategories(categories: DecorCategoryDef[]): void {
  saveToStorage(STORAGE.DECOR_CATEGORIES, categories);
  emitDataChanged('decorCategories');
}

export function getDecorArrangements(): DecorArrangement[] {
  return loadFromStorage(STORAGE.DECOR_ARRANGEMENTS, []) as DecorArrangement[];
}

export function setDecorArrangements(arrangements: DecorArrangement[]): void {
  saveToStorage(STORAGE.DECOR_ARRANGEMENTS, arrangements);
  emitDataChanged('decorArrangements');
}

export function getDecorPackages(): DecorPackage[] {
  return loadFromStorage(STORAGE.DECOR_PACKAGES, []) as DecorPackage[];
}

export function setDecorPackages(packages: DecorPackage[]): void {
  saveToStorage(STORAGE.DECOR_PACKAGES, packages);
  emitDataChanged('decorPackages');
}

export function resetToDefaults(): void {
  // Design/asset domains reset to their factory defaults (venues stay seeded so
  // built-in templates keep working).
  saveToStorage(STORAGE.VENUES, defaultVenues);
  saveToStorage(STORAGE.TABLE_SPECS, defaultTableSpecs);
  saveToStorage(STORAGE.FIXTURE_TYPES, defaultFixtureTypes);
  saveToStorage(STORAGE.GUIDELINES, defaultGuidelines);
  saveToStorage(STORAGE.TEMPLATES, defaultLayoutTemplates);
  saveToStorage(STORAGE.USERS, defaultUsers);
  saveToStorage(STORAGE.LINEN_COLORS, defaultLinenColors);
  saveToStorage(STORAGE.DECOR_ITEMS, []);
  saveToStorage(STORAGE.DECOR_CATEGORIES, []);
  saveToStorage(STORAGE.DECOR_ARRANGEMENTS, []);
  saveToStorage(STORAGE.DECOR_PACKAGES, []);
  saveToStorage(STORAGE_KEYS.CHAIR_SPECS_PRIMARY, defaultChairSpecs);
  saveToStorage(STORAGE_KEYS.WALL_STYLES, defaultWallStyles);
  saveToStorage(STORAGE_KEYS.SPACING_SETTINGS, defaultSpacingSettings);
  saveToStorage(STORAGE_KEYS.ALIGNMENT_SETTINGS, defaultAlignmentSettings);
  saveToStorage(STORAGE_KEYS.INDOOR_FEATURE_TEMPLATES, defaultIndoorFeatureTemplates);
  saveToStorage(STORAGE_KEYS.OUTDOOR_FEATURE_TEMPLATES, defaultOutdoorFeatureTemplates);
  // User-generated data resets to empty so a "reset to defaults" truly clears
  // events, messages, portal, staff, and vendor content.
  // Versioned domains (saved layouts, direct messages, portal config/guests,
  // RSVP) must be reset through the versioned writer so they keep their
  // envelope format — writing raw values would force a legacy-migration
  // self-heal on the next load.
  const rawUserDataKeys = [
    STORAGE_KEYS.EVENT_ROLES,
    STORAGE_KEYS.EVENT_QUESTIONS,
    STORAGE_KEYS.EVENT_ANSWERS,
    STORAGE_KEYS.EVENT_SUBMISSIONS,
    STORAGE_KEYS.STAFF_TASKS,
    STORAGE_KEYS.STAFF_AREAS,
    STORAGE_KEYS.STAFF_SHIFTS,
    STORAGE_KEYS.VENDORS,
    STORAGE_KEYS.VENDOR_PAYMENTS,
    STORAGE_KEYS.TIMELINES,
    STORAGE_KEYS.RBAC_ROLES,
    STORAGE_KEYS.RBAC_GROUPS,
    STORAGE_KEYS.RBAC_AUDIT,
    STORAGE_KEYS.COMMUNICATION_TEMPLATES,
    STORAGE_KEYS.OPERATIONS_SETTINGS,
    STORAGE_KEYS.ORG_INVITES,
  ];
  rawUserDataKeys.forEach((key) => saveToStorage(key, []));
  saveToStorage(STORAGE_KEYS.OPERATIONS_SETTINGS, { checklist: [], zones: [] });
  localStorage.removeItem(STORAGE_KEYS.SECURITY_SETTINGS);
  localStorage.removeItem(STORAGE_KEYS.COUPLE_CHAT_READ);
  localStorage.removeItem(STORAGE_KEYS.COUPLE_SESSION);
  localStorage.removeItem(STORAGE_KEYS.LAYOUT_EDIT_SESSIONS);
  localStorage.removeItem(STORAGE_KEYS.VENDOR_CATEGORIES);

  saveVersionedStorage(STORAGE_KEYS.SAVED_LAYOUTS, STORAGE_VERSIONS.SAVED_LAYOUTS, []);
  saveVersionedStorage(STORAGE_KEYS.DIRECT_MESSAGES, STORAGE_VERSIONS.DIRECT_MESSAGES, []);
  saveVersionedStorage(STORAGE_KEYS.PORTAL_CONFIG, STORAGE_VERSIONS.PORTAL_CONFIG, null);
  saveVersionedStorage(STORAGE_KEYS.PORTAL_GUESTS, STORAGE_VERSIONS.PORTAL_GUESTS, []);
  saveVersionedStorage(STORAGE_KEYS.RSVP_SUBMISSIONS, STORAGE_VERSIONS.RSVP_SUBMISSIONS, []);
  saveVersionedStorage(STORAGE_KEYS.COUPLE_EVENTS, STORAGE_VERSIONS.COUPLE_EVENTS, []);
  saveVersionedStorage(STORAGE_KEYS.COUPLE_ANSWERS, STORAGE_VERSIONS.COUPLE_ANSWERS, []);
  saveVersionedStorage(STORAGE_KEYS.COUPLE_SUBMISSIONS, STORAGE_VERSIONS.COUPLE_SUBMISSIONS, []);
  saveVersionedStorage(STORAGE_KEYS.COUPLE_MESSAGES, STORAGE_VERSIONS.COUPLE_MESSAGES, []);
  saveVersionedStorage(STORAGE_KEYS.COUPLE_GUESTS, STORAGE_VERSIONS.COUPLE_GUESTS, []);
  saveVersionedStorage(STORAGE_KEYS.COUPLE_PORTAL_CONFIGS, STORAGE_VERSIONS.COUPLE_PORTAL_CONFIGS, {});
  saveVersionedStorage(STORAGE_KEYS.COUPLE_CHECKLISTS, STORAGE_VERSIONS.COUPLE_CHECKLISTS, []);
  saveVersionedStorage(STORAGE_KEYS.COUPLE_VENDORS, STORAGE_VERSIONS.COUPLE_VENDORS, []);
  saveVersionedStorage(STORAGE_KEYS.COUPLE_SETUP_TASKS, STORAGE_VERSIONS.COUPLE_SETUP_TASKS, []);
  saveVersionedStorage(STORAGE_KEYS.WEDDING_PACKAGES, STORAGE_VERSIONS.WEDDING_PACKAGES, []);
  saveVersionedStorage(STORAGE_KEYS.PACKAGE_ADDONS, STORAGE_VERSIONS.PACKAGE_ADDONS, []);
  saveVersionedStorage(STORAGE_KEYS.COUPLE_GUEST_EVENTS, STORAGE_VERSIONS.COUPLE_GUEST_EVENTS, []);
  saveVersionedStorage(STORAGE_KEYS.VENUE_CALENDAR_EVENTS, STORAGE_VERSIONS.VENUE_CALENDAR_EVENTS, []);
  saveVersionedStorage(STORAGE_KEYS.VENUE_MAP_CONFIGS, STORAGE_VERSIONS.VENUE_MAP_CONFIGS, null);
  saveVersionedStorage(STORAGE_KEYS.VENUE_RULES, STORAGE_VERSIONS.VENUE_RULES, { rules: [], updatedAt: new Date().toISOString() });
  saveVersionedStorage(STORAGE_KEYS.VENUE_WEATHER, STORAGE_VERSIONS.VENUE_WEATHER, { forecasts: {}, updatedAt: new Date().toISOString() });
  emitDataChanged('all');
}

// Create initial layout
function createInitialLayout(venueId: string): Layout {
  return {
    id: createEntityId('layout'),
    name: 'Untitled Layout',
    venueId,
    tables: [],
    fixtures: [],
    decor: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** A stable content key for every editable working-layout collection. */
function layoutItemIds(layout: Pick<Layout, 'tables' | 'fixtures' | 'decor' | 'ceremonyRows'>): string[] {
  return [
    ...layout.tables.map((item) => item.id),
    ...layout.fixtures.map((item) => item.id),
    ...(layout.decor || []).map((item) => item.id),
    ...(layout.ceremonyRows || []).map((item) => item.id),
  ];
}

function layoutSnapshotKey(layout: Layout): string {
  return JSON.stringify([
    layout.tables,
    layout.fixtures,
    layout.decor,
    layout.ceremonyRows || [],
  ]);
}

// Main hook
export function useLayoutState(initialVenueId: string = 'setup-venue') {
  const [venues, setVenuesState] = useState<Venue[]>(() => getVenues());
  const [currentVenue, setCurrentVenue] = useState<Venue>(() => {
    const allVenues = getVenues();
    return allVenues.find((v) => v.id === initialVenueId) || allVenues[0] || FALLBACK_VENUE;
  });

  const [layout, setLayout] = useState<Layout>(() => {
    const allVenues = getVenues();
    const initialVenue =
      allVenues.find((v) => v.id === initialVenueId) || allVenues[0] || FALLBACK_VENUE;
    return createInitialLayout(initialVenue.id);
  });

  const [guests, setGuests] = useState<Guest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);

  // ── Unsaved-work (dirty) tracking ──────────────────────────────────────────
  // The working layout is in-memory until explicitly saved (named layout or the
  // venue master). We track whether it has drifted from the last clean baseline
  // (initial load / venue switch / save / load-layout / load-template / save-master)
  // so the app shell can warn before navigating away or refreshing.
  const layoutDirtyRef = useRef(false);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const layoutBaselineRef = useRef<string>(layoutSnapshotKey(layout));

  // Recompute dirty whenever the working layout changes.
  useEffect(() => {
    const dirty = layoutSnapshotKey(layout) !== layoutBaselineRef.current;
    layoutDirtyRef.current = dirty;
    setLayoutDirty(dirty);
  }, [layout]);

  // Clear dirty, treating the current layout as the new baseline.
  const markLayoutClean = useCallback(() => {
    layoutBaselineRef.current = layoutSnapshotKey(layout);
    layoutDirtyRef.current = false;
    setLayoutDirty(false);
  }, [layout]);

  // Layout replacements must establish their baseline from the exact incoming
  // payload before React commits state. Calling markLayoutClean immediately after
  // setLayout snapshots the stale previous render and marks the new layout dirty.
  const replaceWithCleanLayout = useCallback((nextLayout: Layout) => {
    layoutBaselineRef.current = layoutSnapshotKey(nextLayout);
    layoutDirtyRef.current = false;
    setLayoutDirty(false);
    setLayout(nextLayout);
  }, []);

  // Keep the layout-health warnings in sync with the current layout + venue.
  // Collision rules are also enforced at placement time (toasts); this provides
  // a persistent summary of any issues that exist in the current layout.
  useEffect(() => {
    const { tableWarnings, fixtureWarnings } = validateLayout(
      layout.tables,
      layout.fixtures,
      currentVenue,
    );

    const next: ValidationWarning[] = [];
    tableWarnings.forEach((message, id) => {
      next.push({ id: `table-${id}`, type: 'spacing', message, itemIds: [id] });
    });
    fixtureWarnings.forEach((message, id) => {
      next.push({ id: `fixture-${id}`, type: 'spacing', message, itemIds: [id] });
    });

    setWarnings(next);
  }, [layout.tables, layout.fixtures, currentVenue]);

  // Track venue change for reset
  const venueChangeCallback = useRef<(() => void) | null>(null);

  // Set venue change callback
  const setOnVenueChange = useCallback((callback: () => void) => {
    venueChangeCallback.current = callback;
  }, []);

  // Listen for data changes from AdminPanel
  useEffect(() => {
    const handleDataChange = (detail: { type: string } | void) => {
      const type = detail?.type;

      if (type === 'venues' || type === 'all' || type === 'backend_hydrated') {
        const allVenues = getVenues();
        setVenuesState(allVenues);

        const updatedVenue = allVenues.find((v) => v.id === currentVenue.id);
        if (updatedVenue) {
          setCurrentVenue(updatedVenue);
        } else {
          setCurrentVenue(allVenues[0] || FALLBACK_VENUE);
        }
      }
    };

    return on('spm_data_changed', handleDataChange);
  }, [currentVenue.id]);

  // Refresh venues from storage
  const refreshVenues = useCallback(() => {
    const allVenues = getVenues();
    setVenuesState(allVenues);

    const updated = allVenues.find((v) => v.id === currentVenue.id);
    if (updated) {
      setCurrentVenue(updated);
    } else {
      setCurrentVenue(allVenues[0] || FALLBACK_VENUE);
    }
  }, [currentVenue.id]);

  // Change venue - ROBUST VERSION: Always works regardless of admin changes
  const changeVenue = useCallback((venueId: string) => {
    try {
      const allVenues = getVenues();
      const venue = allVenues.find((v) => v.id === venueId);

      if (!venue) {
        console.error('Venue not found:', venueId);
        return;
      }

      setVenuesState([...allVenues]);
      setCurrentVenue({ ...venue });

      const masterTables = venue.masterLayout?.tables || [];
      const masterFixtures = venue.masterLayout?.fixtures || [];
      const masterDecor = venue.masterLayout?.decor || [];
      const masterCeremonyRows = venue.masterLayout?.ceremonyRows || [];

      const newLayout: Layout = {
        id: createEntityId('layout'),
        name: 'Untitled Layout',
        venueId,
        // Instance IDs are scoped to this layout document. Preserve them and
        // every parentId relationship while cloning into immutable working state.
        tables: masterTables.map((table) => ({ ...table, guests: [...(table.guests || [])] })),
        fixtures: masterFixtures.map((fixture) => ({ ...fixture, guests: fixture.guests ? [...fixture.guests] : undefined })),
        decor: masterDecor.map((item) => ({ ...item })),
        ceremonyRows: masterCeremonyRows.map((row) => ({ ...row })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      replaceWithCleanLayout(newLayout);
      setSelectedId(null);
      setWarnings([]);
      // The working layout was replaced; clear undo history so Undo can't
      // restore a different venue's layout.
      emit('spm_clear_undo_history');

      if (venueChangeCallback.current) {
        setTimeout(() => {
          try {
            venueChangeCallback.current?.();
          } catch (err) {
            console.error('Error in venue change callback:', err);
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error changing venue:', error);
    }
  }, [replaceWithCleanLayout]);

  // Add table
  const addTable = useCallback(
    (specId: string, position: Position) => {
      const specs = getTableSpecs();
      const spec = specs.find((s) => s.id === specId);
      if (!spec) return;

      const tableCount = layout.tables.filter((t) => t.specId === specId).length;
      const chairType = spec.defaultChairType || 'white-plastic';
      const chairCount = chairType === 'none'
        ? 0
        : Math.max(0, Math.floor(Number(spec.capacity) || 0));
      const newTable: PlacedTable = {
        id: createEntityId('table', layoutItemIds(layout)),
        type: 'table',
        specId,
        x: position.x,
        y: position.y,
        rotation: 0,
        label: `${spec.name.split(' ')[0]} ${tableCount + 1}`,
        guests: [],
        hasLinen: spec.isSeatingType ? false : true,
        linenColor: 'white',
        showChairs: chairCount > 0 && chairType !== 'none' && spec.showChairs !== false,
        chairType,
        chairCount,
        chairLayout: spec.defaultChairLayout || 'all-sides',
      };

      setLayout((prev) => ({
        ...prev,
        tables: [...prev.tables, newTable],
        updatedAt: new Date().toISOString(),
      }));
      setSelectedId(newTable.id);
    },
    [layout],
  );

  // Add fixture
  const addFixture = useCallback(
    (specId: string, position: Position, isExterior?: boolean) => {
      const fixtures = getFixtureTypes();
      const spec = fixtures.find((f) => f.id === specId);
      if (!spec) return;

      const fixtureCount = layout.fixtures.filter((f) => f.specId === specId).length;
      const newFixture: PlacedFixture = {
        id: createEntityId('fixture', layoutItemIds(layout)),
        type: 'fixture',
        specId,
        x: position.x,
        y: position.y,
        rotation: 0,
        label: fixtureCount > 0 ? `${spec.name} ${fixtureCount + 1}` : spec.name,
        isExterior: isExterior || spec.isExterior,
      };

      setLayout((prev) => ({
        ...prev,
        fixtures: [...prev.fixtures, newFixture],
        updatedAt: new Date().toISOString(),
      }));
      setSelectedId(newFixture.id);
    },
    [layout],
  );

  // Update table
  const updateTable = useCallback((id: string, updates: Partial<PlacedTable>) => {
    setLayout((prev) => ({
      ...prev,
      tables: prev.tables.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // Update fixture
  const updateFixture = useCallback((id: string, updates: Partial<PlacedFixture>) => {
    setLayout((prev) => ({
      ...prev,
      fixtures: prev.fixtures.map((f) => (f.id === id ? { ...f, ...updates } : f)),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // Add decor
  const addDecor = useCallback(
    (
      decorItemId: string,
      position: Position,
      parentId?: string,
      parentType: any = 'canvas',
    ) => {
      const items = getDecorItems();
      const spec = items.find((i) => i.id === decorItemId);
      if (!spec) return;

      const newDecor: any = {
        id: createEntityId('decor', layoutItemIds(layout)),
        decorItemId,
        x: position.x,
        y: position.y,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        zIndex: 100 + layout.decor.length,
        parentType,
        parentId,
      };

      setLayout((prev) => ({
        ...prev,
        decor: [...prev.decor, newDecor],
        updatedAt: new Date().toISOString(),
      }));
      setSelectedId(newDecor.id);
    },
    [layout],
  );

  // Update decor
  const updateDecor = useCallback((id: string, updates: Partial<any>) => {
    setLayout((prev) => ({
      ...prev,
      decor: prev.decor.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // Remove item
  const removeItem = useCallback(
    (id: string) => {
      setLayout((prev) => ({
        ...prev,
        tables: prev.tables.filter((t) => t.id !== id),
        fixtures: prev.fixtures.filter((f) => f.id !== id),
        decor: prev.decor.filter((d) => d.id !== id),
        updatedAt: new Date().toISOString(),
      }));

      if (selectedId === id) {
        setSelectedId(null);
      }
    },
    [selectedId],
  );

  // Duplicate item. The shell supplies a collision/inventory-validated position
  // for tables and fixtures; decor uses the same offset when no override is given.
  const duplicateItem = useCallback(
    (id: string, position?: Position) => {
      const existingIds = layoutItemIds(layout);
      const table = layout.tables.find((candidate) => candidate.id === id);
      if (table) {
        const newTable: PlacedTable = {
          ...table,
          id: createEntityId('table', existingIds),
          x: position?.x ?? table.x + 3,
          y: position?.y ?? table.y + 3,
          label: `${table.label} Copy`,
          guests: [],
        };
        setLayout((prev) => ({
          ...prev,
          tables: [...prev.tables, newTable],
          updatedAt: new Date().toISOString(),
        }));
        setSelectedId(newTable.id);
        return;
      }

      const fixture = layout.fixtures.find((candidate) => candidate.id === id);
      if (fixture) {
        const newFixture: PlacedFixture = {
          ...fixture,
          id: createEntityId('fixture', existingIds),
          x: position?.x ?? fixture.x + 3,
          y: position?.y ?? fixture.y + 3,
          label: `${fixture.label} Copy`,
        };
        setLayout((prev) => ({
          ...prev,
          fixtures: [...prev.fixtures, newFixture],
          updatedAt: new Date().toISOString(),
        }));
        setSelectedId(newFixture.id);
        return;
      }

      const decorItem = layout.decor.find((candidate) => candidate.id === id);
      if (decorItem) {
        const newDecor: PlacedDecor = {
          ...decorItem,
          id: createEntityId('decor', existingIds),
          x: position?.x ?? decorItem.x + 3,
          y: position?.y ?? decorItem.y + 3,
        };
        setLayout((prev) => ({
          ...prev,
          decor: [...prev.decor, newDecor],
          updatedAt: new Date().toISOString(),
        }));
        setSelectedId(newDecor.id);
      }
    },
    [layout],
  );

  // Add guest
  const addGuest = useCallback((name: string, group?: string, tableId?: string): string => {
    const newGuest: Guest = {
      id: createEntityId('guest', guests.map((guest) => guest.id)),
      name,
      group,
      tableId,
      rsvpStatus: 'pending',
    };

    setGuests((prev) => [...prev, newGuest]);

    if (tableId) {
      setLayout((prev) => ({
        ...prev,
        tables: prev.tables.map((t) =>
          t.id === tableId ? { ...t, guests: [...t.guests, newGuest.id] } : t,
        ),
        updatedAt: new Date().toISOString(),
      }));
    }

    return newGuest.id;
  }, [guests]);

  // Update guest
  const updateGuest = useCallback((id: string, updates: Partial<Guest>) => {
    setGuests((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));
  }, []);

  // Remove guest
  const removeGuest = useCallback((id: string) => {
    setGuests((prev) => prev.filter((g) => g.id !== id));

    setLayout((prev) => ({
      ...prev,
      tables: prev.tables.map((t) => ({
        ...t,
        guests: t.guests.filter((gId) => gId !== id),
      })),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // Assign guest to table
  const assignGuestToTable = useCallback((guestId: string, tableId: string | null) => {
    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, tableId: tableId || undefined } : g)),
    );

    setLayout((prev) => ({
      ...prev,
      tables: prev.tables.map((t) => {
        if (tableId && t.id === tableId) {
          return { ...t, guests: [...t.guests.filter((id) => id !== guestId), guestId] };
        }

        return { ...t, guests: t.guests.filter((id) => id !== guestId) };
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // Assign guest to lodging room fixture or legacy venue room
  const assignGuestToRoom = useCallback((guestId: string, roomId: string | null) => {
    setGuests((prev) =>
      prev.map((g) =>
        g.id === guestId
          ? { ...g, roomId: roomId || undefined, tableId: undefined }
          : g,
      ),
    );

    setLayout((prev) => ({
      ...prev,
      tables: prev.tables.map((t) => ({
        ...t,
        guests: t.guests.filter((id) => id !== guestId),
      })),
      fixtures: prev.fixtures.map((f) => {
        const spec = getFixtureTypes().find((s) => s.id === f.specId);
        const isRoomFixture =
          spec?.category === 'lodging' && (spec?.lodgingType === 'rooms' || spec?.isRoom);

        if (!isRoomFixture) return f;

        const currentGuests = f.guests || [];

        if (roomId && f.id === roomId) {
          return {
            ...f,
            guests: [...currentGuests.filter((id) => id !== guestId), guestId],
          };
        }

        return {
          ...f,
          guests: currentGuests.filter((id) => id !== guestId),
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // Import guests from CSV (parsing lives in utils/guestCsv.ts for testability)
  const importGuestsFromCSV = useCallback((csvText: string): GuestImportResult => {
    const result = parseGuestCsv(csvText, guests);
    if (result.guests && result.guests.length > 0) {
      setGuests((prev) => [...prev, ...(result.guests as Guest[])]);
    }
    return result;
  }, [guests]);

  // Export guests to CSV
  const exportGuestsToCSV = useCallback(() => {
    const headers = ['Name', 'Group', 'Email', 'Phone', 'Table', 'Dietary Restrictions', 'Accessibility', 'Meal Choice', 'Special Needs', 'RSVP'];
    const rows = guests.map((g) => {
      const table = layout.tables.find((t) => t.guests.includes(g.id));
      return [
        g.name,
        g.group || '',
        g.email || '',
        g.phone || '',
        table?.label || 'Unassigned',
        g.dietaryRestrictions || '',
        g.accessibility ? 'Yes' : 'No',
        g.mealChoice || '',
        g.specialNeeds || '',
        g.rsvpStatus || 'pending',
      ].map(csvEscape).join(',');
    });

    const csv = [headers.map(csvEscape).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guest-list.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [guests, layout.tables]);

  // Clear layout. Confirmation is handled by the caller (the Sidebar's
  // ConfirmDialog), so no native confirm here to avoid a double-prompt.
  const clearLayout = useCallback(() => {
    setLayout((prev) => ({
      ...prev,
      tables: [],
      fixtures: [],
      decor: [],
      ceremonyRows: [],
      updatedAt: new Date().toISOString(),
    }));
    setSelectedId(null);
  }, []);

  // Save layout
  const saveLayout = useCallback(
    (name: string) => {
      const savedLayouts = getSavedLayouts();

      const newLayout: SavedLayout = {
        id: createEntityId('saved', savedLayouts.map((saved) => saved.id)),
        name,
        venueId: currentVenue.id,
        tables: layout.tables,
        fixtures: layout.fixtures,
        decor: layout.decor,
        ceremonyRows: layout.ceremonyRows || [],
        guests,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setSavedLayouts([...savedLayouts, newLayout]);
      markLayoutClean();
      return newLayout.id;
    },
    [currentVenue.id, layout.tables, layout.fixtures, layout.decor, layout.ceremonyRows, guests, markLayoutClean],
  );

  // Save with optional overwrite: if a saved layout with the same name exists,
  // update it in place (instead of always creating a duplicate); otherwise create
  // a new one. Returns the id of the layout that was saved/updated.
  const saveLayoutWithOverwrite = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      const savedLayouts = getSavedLayouts();
      const existing = savedLayouts.find(
        (l) => l.venueId === currentVenue.id
          && l.name.toLowerCase() === trimmed.toLowerCase(),
      );

      if (existing) {
        const updated: SavedLayout = {
          ...existing,
          name: trimmed,
          venueId: currentVenue.id,
          tables: layout.tables,
          fixtures: layout.fixtures,
          decor: layout.decor,
          ceremonyRows: layout.ceremonyRows || [],
          guests,
          updatedAt: new Date().toISOString(),
        };
        setSavedLayouts(
          savedLayouts.map((l) => (l.id === existing.id ? updated : l)),
        );
        markLayoutClean();
        return existing.id;
      }

      const newLayout: SavedLayout = {
        id: createEntityId('saved', savedLayouts.map((saved) => saved.id)),
        name: trimmed,
        venueId: currentVenue.id,
        tables: layout.tables,
        fixtures: layout.fixtures,
        decor: layout.decor,
        ceremonyRows: layout.ceremonyRows || [],
        guests,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSavedLayouts([...savedLayouts, newLayout]);
      markLayoutClean();
      return newLayout.id;
    },
    [currentVenue.id, layout.tables, layout.fixtures, layout.decor, layout.ceremonyRows, guests, markLayoutClean],
  );

  // Load layout
  const loadLayout = useCallback((layoutId: string) => {
    const savedLayouts = getSavedLayouts();
    const savedLayout = savedLayouts.find((l) => l.id === layoutId);

    if (savedLayout) {
      const allVenues = getVenues();
      const venue = allVenues.find((v) => v.id === savedLayout.venueId);

      if (venue) {
        setCurrentVenue(venue);
        setVenuesState(allVenues);
      }

      replaceWithCleanLayout({
        id: createEntityId('layout'),
        name: savedLayout.name,
        venueId: savedLayout.venueId,
        tables: savedLayout.tables.map((table) => ({ ...table, guests: [...(table.guests || [])] })),
        fixtures: savedLayout.fixtures.map((fixture) => ({ ...fixture, guests: fixture.guests ? [...fixture.guests] : undefined })),
        decor: (savedLayout.decor || []).map((item) => ({ ...item })),
        ceremonyRows: (savedLayout.ceremonyRows || []).map((row) => ({ ...row })),
        createdAt: savedLayout.createdAt,
        updatedAt: new Date().toISOString(),
      });
      emit('spm_clear_undo_history');

      setGuests(savedLayout.guests || []);
      setSelectedId(null);

      if (venueChangeCallback.current) {
        setTimeout(() => venueChangeCallback.current?.(), 100);
      }
    }
  }, [replaceWithCleanLayout]);

  // Delete saved layout
  const deleteSavedLayout = useCallback((layoutId: string) => {
    const savedLayouts = getSavedLayouts();
    setSavedLayouts(savedLayouts.filter((l) => l.id !== layoutId));
  }, []);

  // Load template
  const loadTemplate = useCallback((template: LayoutTemplate) => {
    const allVenues = getVenues();
    const venue = allVenues.find((v) => v.id === template.venueId);

    if (venue) {
      setCurrentVenue(venue);
      setVenuesState(allVenues);

      replaceWithCleanLayout({
        id: createEntityId('layout'),
        name: template.name,
        venueId: template.venueId,
        // Keep template-scoped IDs so décor parent links remain intact. Working
        // edits replace objects immutably and cannot mutate the stored template.
        tables: (template.tables || []).map((table) => ({ ...table, guests: [] as string[] })),
        fixtures: (template.fixtures || []).map((fixture) => ({ ...fixture, guests: fixture.guests ? [...fixture.guests] : undefined })),
        decor: ((template as any).decor || []).map((item: PlacedDecor) => ({ ...item })),
        ceremonyRows: (template.ceremonyRows || []).map((row) => ({ ...row })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      emit('spm_clear_undo_history');

      setSelectedId(null);

      if (venueChangeCallback.current) {
        setTimeout(() => venueChangeCallback.current?.(), 100);
      }
    }
  }, [replaceWithCleanLayout]);

  // Save current layout as master layout for venue
  const saveMasterLayout = useCallback(() => {
    const allVenues = getVenues();

    const updatedVenues = allVenues.map((v) => {
      if (v.id === currentVenue.id) {
        return {
          ...v,
          isMaster: true,
          masterLayout: {
            tables: layout.tables,
            fixtures: layout.fixtures,
            decor: layout.decor,
            ceremonyRows: layout.ceremonyRows || [],
            savedAt: new Date().toISOString(),
          },
        };
      }

      return v;
    });

    setVenues(updatedVenues);
    setVenuesState(updatedVenues);

    const updatedVenue = updatedVenues.find((v) => v.id === currentVenue.id);
    if (updatedVenue) {
      setCurrentVenue(updatedVenue);
    }
  }, [currentVenue.id, layout.tables, layout.fixtures, layout.decor, layout.ceremonyRows]);

  // Clear master layout for venue
  const clearMasterLayout = useCallback(() => {
    const allVenues = getVenues();

    const updatedVenues = allVenues.map((v) => {
      if (v.id === currentVenue.id) {
        const { masterLayout, ...rest } = v;
        return rest;
      }

      return v;
    });

    setVenues(updatedVenues);
    setVenuesState(updatedVenues);

    const updatedVenue = updatedVenues.find((v) => v.id === currentVenue.id);
    if (updatedVenue) {
      setCurrentVenue(updatedVenue);
    }
  }, [currentVenue.id]);

  // Persist an explicitly applied Design Studio space/canvas edit through the
  // same venue entity domain used by Admin & System Settings.
  const updateCurrentVenue = useCallback((nextVenue: Venue, expectedGeometrySignature?: string) => {
    if (nextVenue.id !== currentVenue.id) return 'venue-changed' as const;
    const allVenues = getVenues();
    const latestVenue = allVenues.find((venue) => venue.id === currentVenue.id);
    if (!latestVenue) return 'missing' as const;
    if (expectedGeometrySignature
      && venueGeometrySignature(latestVenue) !== expectedGeometrySignature) {
      return 'conflict' as const;
    }

    // Apply only geometry fields onto the latest record so a concurrent name,
    // capacity, branding, or master-layout update is never overwritten by the
    // modal's older full-venue snapshot.
    const mergedVenue = mergeVenueGeometry(latestVenue, nextVenue);
    const updatedVenues = allVenues.map((venue) =>
      venue.id === currentVenue.id ? mergedVenue : venue);
    setVenues(updatedVenues);
    setVenuesState(updatedVenues);
    setCurrentVenue(mergedVenue);
    return 'applied' as const;
  }, [currentVenue.id]);
  
  const replaceWorkingCatalogReferences = useCallback((
    kind: CatalogKind,
    oldId: string,
    replacementId: string,
    options?: { oldTableSpec?: TableSpec; incompatibleArrangementIds?: string[] },
  ) => {
    setLayout((previous) => ({
      ...replaceCatalogReferencesInLayout(previous, kind, oldId, replacementId, {
        oldTableSpec: options?.oldTableSpec,
        tableSpecs: getTableSpecs(),
        incompatibleArrangementIds: new Set(options?.incompatibleArrangementIds || []),
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const applyIdentityRepair = useCallback((
    repaired: { tables: PlacedTable[]; fixtures: PlacedFixture[]; decor: PlacedDecor[]; ceremonyRows?: Layout['ceremonyRows'] },
    repairedGuests: Guest[],
  ) => {
    setLayout((previous) => ({
      ...previous,
      tables: repaired.tables,
      fixtures: repaired.fixtures,
      decor: repaired.decor,
      ceremonyRows: repaired.ceremonyRows || [],
      updatedAt: new Date().toISOString(),
    }));
    setGuests(repairedGuests);
    setSelectedId(null);
  }, []);

  // Update entire layout (for undo/redo)
  const updateLayout = useCallback((updates: { tables?: PlacedTable[]; fixtures?: PlacedFixture[]; decor?: PlacedDecor[]; ceremonyRows?: Layout['ceremonyRows'] }) => {
    setLayout((prev) => ({
      ...prev,
      tables: updates.tables ?? prev.tables,
      fixtures: updates.fixtures ?? prev.fixtures,
      decor: updates.decor ?? prev.decor,
      ceremonyRows: updates.ceremonyRows ?? prev.ceremonyRows,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  return {
    // State
    venues,
    currentVenue,
    layout,
    guests,
    selectedId,
    warnings,
    layoutDirty,

    // Setters
    setSelectedId,
    setOnVenueChange,
    markLayoutClean,

    // Actions
    changeVenue,
    refreshVenues,
    updateCurrentVenue,
    replaceWorkingCatalogReferences,
    updateLayout,
    applyIdentityRepair,
    addTable,
    addFixture,
    addDecor,
    updateTable,
    updateFixture,
    updateDecor,
    removeItem,
    duplicateItem,
    addGuest,
    updateGuest,
    removeGuest,
    assignGuestToTable,
    assignGuestToRoom,
    importGuestsFromCSV,
    exportGuestsToCSV,
    clearLayout,
    saveLayout,
    saveLayoutWithOverwrite,
    loadLayout,
    deleteSavedLayout,
    loadTemplate,
    saveMasterLayout,
    clearMasterLayout,
    getDecorItems,
    setDecorItems,
    getDecorCategories,
    setDecorCategories,
    getDecorArrangements,
    setDecorArrangements,
    getDecorPackages,
    setDecorPackages,
  };
}
import type {
  ChairSpec,
  ChairType,
  DecorArrangement,
  FixtureType,
  PlacedDecor,
  PlacedFixture,
  PlacedTable,
  CeremonyChairRow,
  TableSpec,
} from '../types';
import { configuredChairCount, configuredChairType } from './layoutSeating';

export type CatalogKind = 'table' | 'fixture' | 'chair' | 'decor';

export interface CatalogLayoutSource {
  id: string;
  label: string;
  kind: 'working' | 'master' | 'named' | 'template' | 'couple';
  venueId?: string;
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  decor: PlacedDecor[];
  ceremonyRows: CeremonyChairRow[];
}

export interface CatalogReferenceEntry {
  id: string;
  label: string;
  sourceKind: CatalogLayoutSource['kind'] | 'configuration';
  count: number;
  detail: string;
}

export interface CatalogReferenceSummary {
  kind: CatalogKind;
  definitionId: string;
  entries: CatalogReferenceEntry[];
  totalReferences: number;
  affectedLayouts: number;
}

export interface CatalogReferenceContext {
  sources: CatalogLayoutSource[];
  tableSpecs?: TableSpec[];
  arrangements?: DecorArrangement[];
}

interface StoredCatalogSources {
  currentLayout?: CatalogLayoutData & { venueId: string };
  venues: Array<{
    id: string;
    name: string;
    masterLayout?: CatalogLayoutData;
  }>;
  savedLayouts: Array<CatalogLayoutData & { id: string; name: string; venueId: string }>;
  templates: Array<CatalogLayoutData & { id: string; name: string; venueId: string }>;
  coupleEvents: Array<{
    id: string;
    coupleName: string;
    eventDate?: string;
    spaceLayouts?: Record<string, { layout?: CatalogLayoutData }>;
  }>;
}

/** Build a complete, labelled source list shared by dependency and replacement review. */
export function collectCatalogLayoutSources(input: StoredCatalogSources): CatalogLayoutSource[] {
  const sources: CatalogLayoutSource[] = [];
  const add = (
    id: string,
    label: string,
    kind: CatalogLayoutSource['kind'],
    venueId: string | undefined,
    layout: CatalogLayoutData,
  ) => sources.push({
    id,
    label,
    kind,
    venueId,
    tables: layout.tables || [],
    fixtures: layout.fixtures || [],
    decor: layout.decor || [],
    ceremonyRows: layout.ceremonyRows || [],
  });

  if (input.currentLayout) {
    add('working', 'Current working layout', 'working', input.currentLayout.venueId, input.currentLayout);
  }
  input.venues.forEach((venue) => {
    if (venue.masterLayout) {
      add(`master:${venue.id}`, `Master · ${venue.name}`, 'master', venue.id, venue.masterLayout);
    }
  });
  input.savedLayouts.forEach((layout) =>
    add(`named:${layout.id}`, layout.name, 'named', layout.venueId, layout));
  input.templates.forEach((template) =>
    add(`template:${template.id}`, `Template · ${template.name}`, 'template', template.venueId, template));
  input.coupleEvents.forEach((event) => {
    Object.entries(event.spaceLayouts || {}).forEach(([venueId, record]) => {
      if (!record.layout) return;
      add(
        `couple:${event.id}:${venueId}`,
        `${event.coupleName}${event.eventDate ? ` · ${event.eventDate}` : ''}`,
        'couple',
        venueId,
        record.layout,
      );
    });
  });
  return sources;
}

function sourceReferenceCount(
  kind: CatalogKind,
  definitionId: string,
  source: CatalogLayoutSource,
  tableSpecs: TableSpec[] = [],
): number {
  if (kind === 'table') {
    return source.tables.filter((item) => item.specId === definitionId).length;
  }
  if (kind === 'fixture') {
    return source.fixtures.filter((item) => item.specId === definitionId).length;
  }
  if (kind === 'chair') {
    const specsById = new Map(tableSpecs.map((spec) => [spec.id, spec]));
    return source.tables.filter((item) =>
      configuredChairType(item, specsById.get(item.specId)) === definitionId).length
      + source.ceremonyRows.filter((item) => item.chairType === definitionId).length;
  }
  return source.decor.filter((item) => item.decorItemId === definitionId).length;
}

/** Find every known layout/configuration reference before archive or replacement. */
export function summarizeCatalogReferences(
  kind: CatalogKind,
  definitionId: string,
  context: CatalogReferenceContext,
): CatalogReferenceSummary {
  const entries: CatalogReferenceEntry[] = [];
  const tableSpecs = context.tableSpecs || [];
  const arrangements = context.arrangements || [];
  context.sources.forEach((source) => {
    const count = sourceReferenceCount(kind, definitionId, source, tableSpecs);
    if (count === 0) return;
    entries.push({
      id: source.id,
      label: source.label,
      sourceKind: source.kind,
      count,
      detail: `${count} placed ${kind}${count === 1 ? '' : ' references'}`,
    });
  });

  if (kind === 'chair') {
    tableSpecs.forEach((spec) => {
      const defaultReference = spec.defaultChairType === definitionId ? 1 : 0;
      const allowedReference = spec.allowedChairTypes?.includes(definitionId as ChairType) ? 1 : 0;
      const count = defaultReference + allowedReference;
      if (count === 0) return;
      entries.push({
        id: `table-config:${spec.id}`,
        label: `Table catalog · ${spec.name}`,
        sourceKind: 'configuration',
        count,
        detail: [defaultReference ? 'default chair' : '', allowedReference ? 'allowed chair' : '']
          .filter(Boolean)
          .join(' and '),
      });
    });
  }

  if (kind === 'table' || kind === 'fixture') {
    arrangements.forEach((arrangement) => {
      if (arrangement.baseSpecId !== definitionId) return;
      entries.push({
        id: `arrangement-base:${arrangement.id}`,
        label: `Décor design · ${arrangement.name}`,
        sourceKind: 'configuration',
        count: 1,
        detail: 'base catalog definition',
      });
    });
  }

  if (kind === 'decor') {
    arrangements.forEach((arrangement) => {
      const count = arrangement.items.filter((item) => item.decorItemId === definitionId).length;
      if (count === 0) return;
      entries.push({
        id: `arrangement-items:${arrangement.id}`,
        label: `Décor design · ${arrangement.name}`,
        sourceKind: 'configuration',
        count,
        detail: `${count} design item${count === 1 ? '' : 's'}`,
      });
    });
  }

  return {
    kind,
    definitionId,
    entries,
    totalReferences: entries.reduce((total, entry) => total + entry.count, 0),
    affectedLayouts: entries.filter((entry) => entry.sourceKind !== 'configuration').length,
  };
}

export interface CatalogLayoutData {
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  decor?: PlacedDecor[];
  ceremonyRows?: CeremonyChairRow[];
}

export interface ReplaceCatalogReferencesOptions {
  oldTableSpec?: TableSpec;
  tableSpecs?: TableSpec[];
  incompatibleArrangementIds?: ReadonlySet<string>;
}

/**
 * Replace references while preserving placed-instance identity, coordinates,
 * rotation, labels, and all unrelated metadata. A legacy table whose seat count
 * came only from its old catalog has that fallback materialized first, so the
 * replacement cannot silently change configured seating.
 */
export function replaceCatalogReferencesInLayout<T extends CatalogLayoutData>(
  layout: T,
  kind: CatalogKind,
  oldId: string,
  replacementId: string,
  options: ReplaceCatalogReferencesOptions = {},
): T {
  const incompatible = options.incompatibleArrangementIds || new Set<string>();
  const tables = layout.tables.map((table) => {
    let next = table;
    if (kind === 'table' && table.specId === oldId) {
      const hasExplicitCapacity = table.chairCount !== null && table.chairCount !== undefined
        || table.customCapacity !== null && table.customCapacity !== undefined;
      next = {
        ...table,
        specId: replacementId,
        ...(!hasExplicitCapacity
          ? { chairCount: configuredChairCount(table, options.oldTableSpec) }
          : {}),
        ...(table.chairType === null || table.chairType === undefined
          ? { chairType: configuredChairType(table, options.oldTableSpec) }
          : {}),
        ...(table.chairLayout === null || table.chairLayout === undefined
          ? { chairLayout: options.oldTableSpec?.defaultChairLayout || 'all-sides' }
          : {}),
        ...(table.showChairs === null || table.showChairs === undefined
          ? { showChairs: options.oldTableSpec?.showChairs !== false }
          : {}),
      };
    }
    if (kind === 'chair') {
      const tableSpec = options.tableSpecs?.find((spec) => spec.id === table.specId);
      if (configuredChairType(table, tableSpec) === oldId) {
        next = { ...next, chairType: replacementId as ChairType };
      }
    }
    if (next.appliedArrangementId && incompatible.has(next.appliedArrangementId)) {
      next = { ...next, appliedArrangementId: undefined };
    }
    return next;
  });

  const fixtures = layout.fixtures.map((fixture) => {
    let next = kind === 'fixture' && fixture.specId === oldId
      ? { ...fixture, specId: replacementId }
      : fixture;
    if (next.appliedArrangementId && incompatible.has(next.appliedArrangementId)) {
      next = { ...next, appliedArrangementId: undefined };
    }
    return next;
  });

  return {
    ...layout,
    tables,
    fixtures,
    ...(Object.prototype.hasOwnProperty.call(layout, 'decor')
      ? {
          decor: (layout.decor || []).map((item) => kind === 'decor' && item.decorItemId === oldId
            ? { ...item, decorItemId: replacementId }
            : item),
        }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(layout, 'ceremonyRows')
      ? {
          ceremonyRows: (layout.ceremonyRows || []).map((row) => kind === 'chair' && row.chairType === oldId
            ? { ...row, chairType: replacementId as ChairType }
            : row),
        }
      : {}),
  };
}

/** Update non-layout catalog/configuration references during replacement. */
export function replaceCatalogConfigurationReferences(
  kind: CatalogKind,
  oldId: string,
  replacementId: string,
  tableSpecs: TableSpec[],
  arrangements: DecorArrangement[],
): { tableSpecs: TableSpec[]; arrangements: DecorArrangement[] } {
  return {
    tableSpecs: kind === 'chair'
      ? tableSpecs.map((spec) => ({
          ...spec,
          defaultChairType: spec.defaultChairType === oldId
            ? replacementId as ChairType
            : spec.defaultChairType,
          allowedChairTypes: spec.allowedChairTypes?.map((id) => id === oldId
            ? replacementId as ChairType
            : id).filter((id, index, values) => values.indexOf(id) === index),
        }))
      : tableSpecs,
    arrangements: arrangements.map((arrangement) => ({
      ...arrangement,
      baseSpecId: (kind === 'table' || kind === 'fixture') && arrangement.baseSpecId === oldId
        ? replacementId
        : arrangement.baseSpecId,
      items: kind === 'decor'
        ? arrangement.items.map((item) => item.decorItemId === oldId
            ? { ...item, decorItemId: replacementId }
            : item)
        : arrangement.items,
    })),
  };
}

export type CatalogDefinition = TableSpec | FixtureType | ChairSpec | import('../types').DecorItem;

/** Hard incompatibilities that cannot be made safe through impact acknowledgement. */
export function catalogReplacementCompatibilityIssue(
  kind: CatalogKind,
  source: CatalogDefinition,
  replacement: CatalogDefinition,
): string | null {
  if (kind === 'table') {
    const from = source as TableSpec;
    const to = replacement as TableSpec;
    if (!!from.isSeatingType !== !!to.isSeatingType) {
      return 'A table and a chair-only seating group cannot replace one another.';
    }
    if (from.isSeatingType
      && Math.max(1, from.seatingRowCount || 1) !== Math.max(1, to.seatingRowCount || 1)) {
      return 'Chair-only seating replacements must use the same row count so total configured seating does not change.';
    }
  }
  if (kind === 'fixture') {
    const from = source as FixtureType;
    const to = replacement as FixtureType;
    const fromExterior = !!from.isExterior || from.category === 'exterior';
    const toExterior = !!to.isExterior || to.category === 'exterior';
    if (fromExterior !== toExterior) {
      return 'Interior and exterior fixtures use different coordinate boundaries and cannot replace one another.';
    }
    if (!!from.isRoom !== !!to.isRoom) {
      return 'Lodging rooms and ordinary fixtures cannot replace one another.';
    }
  }
  if (kind === 'chair' && (source.id === 'none' || replacement.id === 'none')) {
    return 'The reserved No Chairs definition cannot replace, or be replaced by, physical seating.';
  }
  return null;
}

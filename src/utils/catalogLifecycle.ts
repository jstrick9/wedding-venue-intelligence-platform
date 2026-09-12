import type { DecorArrangement, TableSpec } from '../types';
import {
  getDecorArrangements,
  getSavedLayouts,
  getTableSpecs,
  getTemplates,
  getVenues,
  setDecorArrangements,
  setSavedLayouts,
  setTableSpecs,
  setTemplates,
  setVenues,
} from '../hooks/useLayoutState';
import { getCoupleEvents, updateCoupleEvent } from '../services/couples/coupleService';
import {
  replaceCatalogConfigurationReferences,
  replaceCatalogReferencesInLayout,
  type CatalogKind,
} from './catalogReferences';

export interface ApplyCatalogReplacementOptions {
  oldTableSpec?: TableSpec;
  incompatibleArrangementIds?: string[];
}

export interface AppliedCatalogReplacement {
  incompatibleArrangementIds: string[];
  persistentLayoutsUpdated: number;
  configurationsUpdated: number;
}

function changed(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

/**
 * Apply one reviewed replacement across every persisted layout domain. The
 * source catalog definition is deliberately not deleted here: it remains an
 * archived recovery record until a subsequent dependency scan reaches zero.
 */
export function applyCatalogReplacementToStoredData(
  kind: CatalogKind,
  oldId: string,
  replacementId: string,
  options: ApplyCatalogReplacementOptions = {},
): AppliedCatalogReplacement {
  const arrangements = getDecorArrangements();
  const inferredIncompatible = (kind === 'table' || kind === 'fixture')
    ? arrangements
        .filter((arrangement) => arrangement.baseSpecId === oldId)
        .map((arrangement) => arrangement.id)
    : [];
  const incompatibleArrangementIds = options.incompatibleArrangementIds
    || inferredIncompatible;
  const tableSpecs = getTableSpecs();
  const replacementOptions = {
    oldTableSpec: options.oldTableSpec,
    tableSpecs,
    incompatibleArrangementIds: new Set(incompatibleArrangementIds),
  };
  let persistentLayoutsUpdated = 0;
  let configurationsUpdated = 0;

  const venues = getVenues();
  const nextVenues = venues.map((venue) => {
    if (!venue.masterLayout) return venue;
    const nextMaster = replaceCatalogReferencesInLayout(
      venue.masterLayout,
      kind,
      oldId,
      replacementId,
      replacementOptions,
    );
    if (!changed(venue.masterLayout, nextMaster)) return venue;
    persistentLayoutsUpdated += 1;
    return { ...venue, masterLayout: nextMaster };
  });

  const savedLayouts = getSavedLayouts();
  const nextSavedLayouts = savedLayouts.map((layout) => {
    const next = replaceCatalogReferencesInLayout(
      layout,
      kind,
      oldId,
      replacementId,
      replacementOptions,
    );
    if (changed(layout, next)) persistentLayoutsUpdated += 1;
    return next;
  });

  const templates = getTemplates();
  const nextTemplates = templates.map((template) => {
    const next = replaceCatalogReferencesInLayout(
      template,
      kind,
      oldId,
      replacementId,
      replacementOptions,
    );
    if (changed(template, next)) persistentLayoutsUpdated += 1;
    return next;
  });

  const couplePatches = getCoupleEvents().map((event) => {
    let eventChanged = false;
    const spaceLayouts = Object.fromEntries(Object.entries(event.spaceLayouts || {}).map(
      ([venueId, record]) => {
        if (!record.layout) return [venueId, record];
        const nextLayout = replaceCatalogReferencesInLayout(
          record.layout,
          kind,
          oldId,
          replacementId,
          replacementOptions,
        );
        if (changed(record.layout, nextLayout)) {
          eventChanged = true;
          persistentLayoutsUpdated += 1;
        }
        return [venueId, eventChanged && changed(record.layout, nextLayout)
          ? { ...record, layout: { ...nextLayout, updatedAt: new Date().toISOString() } }
          : record];
      },
    ));
    return eventChanged ? { eventId: event.id, spaceLayouts } : null;
  }).filter((patch): patch is { eventId: string; spaceLayouts: NonNullable<ReturnType<typeof getCoupleEvents>[number]['spaceLayouts']> } => !!patch);

  const configurationResult = replaceCatalogConfigurationReferences(
    kind,
    oldId,
    replacementId,
    tableSpecs,
    arrangements,
  );
  if (changed(tableSpecs, configurationResult.tableSpecs)) configurationsUpdated += 1;
  if (changed(arrangements, configurationResult.arrangements)) configurationsUpdated += 1;

  // Calculate first, then persist each domain. Local storage writes are
  // synchronous; retaining the archived source makes an interrupted operation
  // recoverable rather than leaving broken references.
  if (changed(venues, nextVenues)) setVenues(nextVenues);
  if (changed(savedLayouts, nextSavedLayouts)) setSavedLayouts(nextSavedLayouts);
  if (changed(templates, nextTemplates)) setTemplates(nextTemplates);
  couplePatches.forEach((patch) => updateCoupleEvent(patch.eventId, {
    spaceLayouts: patch.spaceLayouts,
  }));
  if (changed(tableSpecs, configurationResult.tableSpecs)) {
    setTableSpecs(configurationResult.tableSpecs);
  }
  if (changed(arrangements, configurationResult.arrangements)) {
    setDecorArrangements(configurationResult.arrangements as DecorArrangement[]);
  }

  return {
    incompatibleArrangementIds,
    persistentLayoutsUpdated,
    configurationsUpdated,
  };
}

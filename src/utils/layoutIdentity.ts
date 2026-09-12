import type {
  CeremonyChairRow,
  Guest,
  Layout,
  PlacedDecor,
  PlacedFixture,
  PlacedTable,
} from '../types';
import { createEntityId } from './entityId';

export type LayoutEntityKind = 'table' | 'fixture' | 'decor' | 'ceremony-row';

export interface LayoutIdentityRecord {
  key: string;
  kind: LayoutEntityKind;
  index: number;
  originalId: string;
  repairedId: string;
  label: string;
  x: number;
  y: number;
  changed: boolean;
}

export interface LayoutIdentityGroup {
  id: string;
  records: LayoutIdentityRecord[];
}

export interface LayoutIdentityReferenceChoice {
  key: string;
  ownerLabel: string;
  description: string;
  candidates: LayoutIdentityRecord[];
}

export interface LayoutIdentityReview {
  signature: string;
  records: LayoutIdentityRecord[];
  groups: LayoutIdentityGroup[];
  ambiguousReferences: LayoutIdentityReferenceChoice[];
  changedEntityCount: number;
}

type LayoutEntities = Pick<Layout, 'tables' | 'fixtures' | 'decor' | 'ceremonyRows'>;

function sourceRecords(layout: LayoutEntities): Array<{
  kind: LayoutEntityKind;
  index: number;
  id: string;
  label: string;
  x: number;
  y: number;
}> {
  return [
    ...layout.tables.map((item, index) => ({
      kind: 'table' as const,
      index,
      id: item.id,
      label: item.label || `Table ${index + 1}`,
      x: item.x,
      y: item.y,
    })),
    ...layout.fixtures.map((item, index) => ({
      kind: 'fixture' as const,
      index,
      id: item.id,
      label: item.label || `Venue item ${index + 1}`,
      x: item.x,
      y: item.y,
    })),
    ...(layout.decor || []).map((item, index) => ({
      kind: 'decor' as const,
      index,
      id: item.id,
      label: item.notes || `Décor item ${index + 1}`,
      x: item.x,
      y: item.y,
    })),
    ...(layout.ceremonyRows || []).map((item, index) => ({
      kind: 'ceremony-row' as const,
      index,
      id: item.id,
      label: item.label || `Ceremony row ${index + 1}`,
      x: item.x,
      y: item.y,
    })),
  ];
}

export function layoutIdentitySignature(layout: LayoutEntities, guests: Guest[] = []): string {
  return JSON.stringify({
    tables: layout.tables.map((item) => [item.id, item.guests || []]),
    fixtures: layout.fixtures.map((item) => [item.id, item.guests || []]),
    decor: (layout.decor || []).map((item) => [item.id, item.parentType, item.parentId || null]),
    ceremonyRows: (layout.ceremonyRows || []).map((item) => item.id),
    guests: guests.map((guest) => [guest.id, guest.tableId || null, guest.roomId || null]),
  });
}

function referenceCandidates(
  records: LayoutIdentityRecord[],
  id: string | undefined,
  kind: LayoutEntityKind,
): LayoutIdentityRecord[] {
  if (!id) return [];
  return records.filter((record) => record.kind === kind && record.originalId === id);
}

export function buildLayoutIdentityReview(
  layout: LayoutEntities,
  guests: Guest[] = [],
): LayoutIdentityReview | null {
  const sources = sourceRecords(layout);
  const counts = new Map<string, number>();
  sources.forEach((record) => {
    if (record.id) counts.set(record.id, (counts.get(record.id) || 0) + 1);
  });
  const invalid = sources.filter((record) => !record.id || (counts.get(record.id) || 0) > 1);
  if (invalid.length === 0) return null;

  const usedIds = new Set(sources.map((record) => record.id).filter(Boolean));
  const seen = new Set<string>();
  const records = sources.map((record): LayoutIdentityRecord => {
    const keep = Boolean(record.id) && !seen.has(record.id);
    if (record.id) seen.add(record.id);
    const repairedId = keep
      ? record.id
      : createEntityId(record.kind, usedIds);
    usedIds.add(repairedId);
    return {
      key: `${record.kind}:${record.index}`,
      kind: record.kind,
      index: record.index,
      originalId: record.id,
      repairedId,
      label: record.label,
      x: record.x,
      y: record.y,
      changed: repairedId !== record.id,
    };
  });

  const groupsById = new Map<string, LayoutIdentityRecord[]>();
  records.forEach((record) => {
    if (!record.originalId || (counts.get(record.originalId) || 0) < 2) return;
    const group = groupsById.get(record.originalId) || [];
    group.push(record);
    groupsById.set(record.originalId, group);
  });
  const groups = [...groupsById].map(([id, groupRecords]) => ({ id, records: groupRecords }));
  const ambiguousReferences: LayoutIdentityReferenceChoice[] = [];

  (layout.decor || []).forEach((item, index) => {
    const parentKind = item.parentType === 'table'
      ? 'table'
      : item.parentType === 'fixture'
        ? 'fixture'
        : item.parentType === 'decor'
          ? 'decor'
          : null;
    if (!parentKind) return;
    const candidates = referenceCandidates(records, item.parentId, parentKind);
    if (candidates.length > 1) {
      ambiguousReferences.push({
        key: `decor:${index}:parentId`,
        ownerLabel: item.notes || `Décor item ${index + 1}`,
        description: `Choose which ${item.parentType} should remain its parent.`,
        candidates,
      });
    }
  });

  guests.forEach((guest, index) => {
    if (guest.tableId) {
      const candidates = referenceCandidates(records, guest.tableId, 'table');
      const membershipMatches = candidates.filter((candidate) =>
        layout.tables[candidate.index]?.guests?.includes(guest.id));
      if (candidates.length > 1 && membershipMatches.length !== 1) {
        ambiguousReferences.push({
          key: `guest:${index}:tableId`,
          ownerLabel: guest.name,
          description: 'Choose the table that should retain this historical guest assignment.',
          candidates,
        });
      }
    }
    if (guest.roomId) {
      const candidates = referenceCandidates(records, guest.roomId, 'fixture');
      const membershipMatches = candidates.filter((candidate) =>
        layout.fixtures[candidate.index]?.guests?.includes(guest.id));
      if (candidates.length > 1 && membershipMatches.length !== 1) {
        ambiguousReferences.push({
          key: `guest:${index}:roomId`,
          ownerLabel: guest.name,
          description: 'Choose the lodging item that should retain this historical guest assignment.',
          candidates,
        });
      }
    }
  });

  return {
    signature: layoutIdentitySignature(layout, guests),
    records,
    groups,
    ambiguousReferences,
    changedEntityCount: records.filter((record) => record.changed).length,
  };
}

function chosenRecord(
  review: LayoutIdentityReview,
  key: string,
  selections: Record<string, string>,
  candidates: LayoutIdentityRecord[],
): LayoutIdentityRecord {
  if (candidates.length === 1) return candidates[0];
  const selectedKey = selections[key];
  const selected = candidates.find((candidate) => candidate.key === selectedKey);
  if (!selected) throw new Error(`Choose a valid target for ${key} before applying the identity repair.`);
  return selected;
}

export function applyLayoutIdentityRepair(
  layout: LayoutEntities,
  guests: Guest[],
  review: LayoutIdentityReview,
  selections: Record<string, string>,
): { layout: LayoutEntities; guests: Guest[] } {
  if (layoutIdentitySignature(layout, guests) !== review.signature) {
    throw new Error('The layout changed after this repair review opened. Reopen the review before applying.');
  }
  review.ambiguousReferences.forEach((reference) => {
    chosenRecord(review, reference.key, selections, reference.candidates);
  });
  const byKey = new Map(review.records.map((record) => [record.key, record]));
  const repairedTables: PlacedTable[] = layout.tables.map((item, index) => ({
    ...item,
    id: byKey.get(`table:${index}`)?.repairedId || item.id,
    guests: [...(item.guests || [])],
  }));
  const repairedFixtures: PlacedFixture[] = layout.fixtures.map((item, index) => ({
    ...item,
    id: byKey.get(`fixture:${index}`)?.repairedId || item.id,
    guests: item.guests ? [...item.guests] : undefined,
  }));
  const repairedDecor: PlacedDecor[] = (layout.decor || []).map((item, index) => {
    const parentKind = item.parentType === 'table'
      ? 'table'
      : item.parentType === 'fixture'
        ? 'fixture'
        : item.parentType === 'decor'
          ? 'decor'
          : null;
    const candidates = parentKind
      ? referenceCandidates(review.records, item.parentId, parentKind)
      : [];
    const parent = candidates.length > 0
      ? chosenRecord(review, `decor:${index}:parentId`, selections, candidates)
      : null;
    return {
      ...item,
      id: byKey.get(`decor:${index}`)?.repairedId || item.id,
      parentId: parent?.repairedId || item.parentId,
    };
  });
  const repairedRows: CeremonyChairRow[] = (layout.ceremonyRows || []).map((item, index) => ({
    ...item,
    id: byKey.get(`ceremony-row:${index}`)?.repairedId || item.id,
  }));
  const repairedGuests = guests.map((guest, index) => {
    const tableCandidates = referenceCandidates(review.records, guest.tableId, 'table');
    const tableMembership = tableCandidates.filter((candidate) =>
      layout.tables[candidate.index]?.guests?.includes(guest.id));
    const tableTarget = tableMembership.length === 1
      ? tableMembership[0]
      : tableCandidates.length > 0
        ? chosenRecord(review, `guest:${index}:tableId`, selections, tableCandidates)
        : null;
    const roomCandidates = referenceCandidates(review.records, guest.roomId, 'fixture');
    const roomMembership = roomCandidates.filter((candidate) =>
      layout.fixtures[candidate.index]?.guests?.includes(guest.id));
    const roomTarget = roomMembership.length === 1
      ? roomMembership[0]
      : roomCandidates.length > 0
        ? chosenRecord(review, `guest:${index}:roomId`, selections, roomCandidates)
        : null;
    return {
      ...guest,
      tableId: tableTarget?.repairedId || guest.tableId,
      roomId: roomTarget?.repairedId || guest.roomId,
    };
  });
  return {
    layout: {
      tables: repairedTables,
      fixtures: repairedFixtures,
      decor: repairedDecor,
      ceremonyRows: repairedRows,
    },
    guests: repairedGuests,
  };
}

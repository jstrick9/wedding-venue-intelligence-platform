import type {
  ChairSpec,
  ChairType,
  DecorArrangement,
  DecorItem,
  FixtureType,
  PlacedDecor,
  PlacedFixture,
  PlacedTable,
  TableSpec,
} from '../types';
import { configuredChairType, tableSeatCount } from './layoutSeating';
import { catalogFamilyIds, catalogFamilyInventory, catalogFamilyKey } from './catalogFamily';

export interface TableInventoryCandidate {
  specId: string;
  chairCount?: number;
  customCapacity?: number;
  chairType?: ChairType;
}

/** Return a user-facing blocker, or null when one more table can be allocated. */
export function tablePlacementInventoryIssue(
  candidate: TableInventoryCandidate,
  placedTables: PlacedTable[],
  tableSpecs: TableSpec[],
  chairSpecs: ChairSpec[],
  excludeTableId?: string,
): string | null {
  const spec = tableSpecs.find((item) => item.id === candidate.specId);
  if (!spec) return 'This table cannot be placed because its catalog definition is missing.';
  if (spec.archived) return `${spec.name} is archived and cannot be placed in a new layout.`;
  const allocatedTables = excludeTableId
    ? placedTables.filter((table) => table.id !== excludeTableId)
    : placedTables;
  const tableFamilyIds = catalogFamilyIds(tableSpecs, spec);
  const tableUsed = allocatedTables.filter((table) => tableFamilyIds.has(table.specId)).length;
  const tableInventory = catalogFamilyInventory(tableSpecs, spec);
  if (tableInventory !== undefined && tableUsed + 1 > tableInventory) {
    return `${spec.name} inventory is fully allocated.`;
  }

  const chairType = configuredChairType(candidate as Pick<PlacedTable, 'chairType'>, spec);
  const needed = tableSeatCount(candidate, spec);
  if (chairType === 'none' || needed === 0) return null;
  const chairSpec = chairSpecs.find((item) => item.id === chairType);
  if (!chairSpec) {
    return `This table requires the missing chair type "${chairType}". Choose a configured chair type or set the chair count to zero.`;
  }
  const chairInventory = catalogFamilyInventory(chairSpecs, chairSpec);
  if (chairInventory === undefined) return null;
  const chairFamilyIds = catalogFamilyIds(chairSpecs, chairSpec);

  const used = allocatedTables.reduce((total, table) => {
    const placedSpec = tableSpecs.find((item) => item.id === table.specId);
    return chairFamilyIds.has(configuredChairType(table, placedSpec))
      ? total + tableSeatCount(table, placedSpec)
      : total;
  }, 0);
  const remaining = Math.max(0, chairInventory - used);
  return needed > remaining
    ? `Placing this requires ${needed} ${chairSpec.name} chairs, but only ${remaining} remain.`
    : null;
}

export function fixturePlacementInventoryIssue(
  specId: string,
  isExterior: boolean,
  placedFixtures: PlacedFixture[],
  fixtureTypes: FixtureType[],
): string | null {
  const spec = fixtureTypes.find((item) => item.id === specId);
  if (!spec) return 'This item cannot be placed because its catalog definition is missing.';
  if (spec.archived) return `${spec.name} is archived and cannot be placed in a new layout.`;
  const fixtureFamilyIds = catalogFamilyIds(fixtureTypes, spec);
  const used = placedFixtures.filter((fixture) =>
    fixtureFamilyIds.has(fixture.specId)
      && (isExterior ? fixture.isExterior : !fixture.isExterior)).length;
  const inventory = catalogFamilyInventory(fixtureTypes, spec);
  return inventory !== undefined && used + 1 > inventory
    ? `${spec.name} inventory is fully allocated.`
    : null;
}

type AppliedDecorTarget = Pick<PlacedTable | PlacedFixture, 'id' | 'appliedArrangementId'>;

export function decorInventoryUsage(
  tables: AppliedDecorTarget[],
  fixtures: AppliedDecorTarget[],
  placedDecor: PlacedDecor[],
  arrangements: DecorArrangement[],
  excludeTargetId?: string,
): Map<string, number> {
  const usage = new Map<string, number>();
  const add = (decorItemId: string, quantity = 1) => {
    usage.set(decorItemId, (usage.get(decorItemId) || 0) + quantity);
  };
  placedDecor.forEach((item) => add(item.decorItemId));
  [...tables, ...fixtures].forEach((target) => {
    if (target.id === excludeTargetId || !target.appliedArrangementId) return;
    arrangements
      .find((arrangement) => arrangement.id === target.appliedArrangementId)
      ?.items.forEach((item) => add(item.decorItemId));
  });
  return usage;
}

function additionalDecorInventoryIssue(
  additions: Map<string, number>,
  usage: Map<string, number>,
  decorItems: DecorItem[],
): string | null {
  const checkedFamilies = new Set<string>();
  for (const [decorItemId] of additions) {
    const spec = decorItems.find((item) => item.id === decorItemId);
    if (!spec) return 'This decor allocation contains an item whose catalog definition is missing.';
    if (spec.archived) return `${spec.name} is archived and cannot be allocated to a new layout.`;
    const familyKey = catalogFamilyKey(spec);
    if (checkedFamilies.has(familyKey)) continue;
    checkedFamilies.add(familyKey);
    const familyIds = catalogFamilyIds(decorItems, spec);
    const needed = [...additions].reduce((total, [id, count]) =>
      familyIds.has(id) ? total + count : total, 0);
    const used = [...usage].reduce((total, [id, count]) =>
      familyIds.has(id) ? total + count : total, 0);
    const inventory = catalogFamilyInventory(decorItems, spec);
    if (inventory === undefined) continue;
    const remaining = Math.max(0, inventory - used);
    if (needed > remaining) {
      return `${spec.name} inventory is insufficient: ${needed} needed, ${remaining} remaining.`;
    }
  }
  return null;
}

export function arrangementPlacementInventoryIssue(
  arrangementId: string,
  tables: AppliedDecorTarget[],
  fixtures: AppliedDecorTarget[],
  placedDecor: PlacedDecor[],
  arrangements: DecorArrangement[],
  decorItems: DecorItem[],
  excludeTargetId?: string,
): string | null {
  const arrangement = arrangements.find((item) => item.id === arrangementId);
  if (!arrangement) return 'This decor design cannot be applied because it no longer exists.';
  const additions = new Map<string, number>();
  arrangement.items.forEach((item) => {
    additions.set(item.decorItemId, (additions.get(item.decorItemId) || 0) + 1);
  });
  return additionalDecorInventoryIssue(
    additions,
    decorInventoryUsage(tables, fixtures, placedDecor, arrangements, excludeTargetId),
    decorItems,
  );
}

export function decorPlacementInventoryIssue(
  decorItemId: string,
  placedDecor: PlacedDecor[],
  decorItems: DecorItem[],
  tables: AppliedDecorTarget[] = [],
  fixtures: AppliedDecorTarget[] = [],
  arrangements: DecorArrangement[] = [],
): string | null {
  const spec = decorItems.find((item) => item.id === decorItemId);
  if (!spec) return 'This decor cannot be placed because its catalog definition is missing.';
  if (spec.archived) return `${spec.name} is archived and cannot be placed in a new layout.`;
  const additions = new Map([[decorItemId, 1]]);
  return additionalDecorInventoryIssue(
    additions,
    decorInventoryUsage(tables, fixtures, placedDecor, arrangements),
    decorItems,
  );
}

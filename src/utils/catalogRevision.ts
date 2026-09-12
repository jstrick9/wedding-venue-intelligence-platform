import type { CatalogDefinition, CatalogKind } from './catalogReferences';

const PHYSICAL_FIELDS: Record<CatalogKind, readonly string[]> = {
  table: [
    'shape', 'width', 'height', 'capacity', 'isSeatingType', 'seatingStyle',
    'seatingRowCount', 'seatingRowSpacing', 'customPath', 'polygonPoints',
    'defaultChairType', 'showChairs', 'allowedChairTypes', 'defaultChairLayout',
    'isRoom', 'inventoryCount',
  ],
  fixture: [
    'shape', 'width', 'height', 'isExterior', 'category', 'lodgingType',
    'isRoom', 'capacity', 'customPath', 'customDrawing', 'wallStyleId',
    'ignoreSpacingRules', 'inventoryCount',
  ],
  chair: ['width', 'depth', 'inventoryCount'],
  decor: ['width', 'height', 'widthInches', 'heightInches', 'customDrawing', 'inventoryCount'],
};

const FIELD_LABELS: Record<string, string> = {
  shape: 'Shape',
  width: 'Width',
  height: 'Height',
  capacity: 'Capacity',
  isSeatingType: 'Seating-only type',
  seatingStyle: 'Seating style',
  seatingRowCount: 'Row count',
  seatingRowSpacing: 'Row spacing',
  customPath: 'Custom outline',
  polygonPoints: 'Outline points',
  defaultChairType: 'Default chair',
  showChairs: 'Default chair visibility',
  allowedChairTypes: 'Allowed chairs',
  defaultChairLayout: 'Default chair layout',
  isRoom: 'Room semantics',
  inventoryCount: 'Inventory',
  isExterior: 'Exterior semantics',
  category: 'Spatial category',
  lodgingType: 'Lodging type',
  customDrawing: 'Custom drawing',
  wallStyleId: 'Wall style',
  ignoreSpacingRules: 'Spacing-rule exemption',
  depth: 'Depth',
  widthInches: 'Additional width inches',
  heightInches: 'Additional height inches',
};

export interface CatalogPhysicalChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

function equalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function catalogPhysicalChanges(
  kind: CatalogKind,
  source: CatalogDefinition,
  proposed: CatalogDefinition,
): CatalogPhysicalChange[] {
  const before = source as unknown as Record<string, unknown>;
  const after = proposed as unknown as Record<string, unknown>;
  return PHYSICAL_FIELDS[kind]
    .filter((field) => !equalValue(before[field], after[field]))
    .map((field) => ({
      field,
      label: FIELD_LABELS[field] || field,
      before: before[field],
      after: after[field],
    }));
}

function nextRevisionId(familyId: string, revision: number, existingIds: Set<string>): string {
  const safeFamily = familyId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const base = `${safeFamily}-rev-${revision}`;
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** Create an active revision and an archived source record with a shared family. */
export function createCatalogRevision<T extends CatalogDefinition>(
  source: T,
  proposed: T,
  allDefinitions: T[],
): { archivedSource: T; revision: T } {
  const familyId = source.catalogFamilyId || source.id;
  const family = allDefinitions.filter((definition) =>
    (definition.catalogFamilyId || definition.id) === familyId);
  const revisionNumber = Math.max(
    1,
    ...family.map((definition) => definition.catalogRevision || 1),
  ) + 1;
  const id = nextRevisionId(familyId, revisionNumber, new Set(allDefinitions.map((item) => item.id)));
  return {
    archivedSource: {
      ...source,
      archived: true,
      catalogFamilyId: familyId,
      catalogRevision: source.catalogRevision || 1,
    },
    revision: {
      ...proposed,
      id,
      archived: false,
      catalogFamilyId: familyId,
      catalogRevision: revisionNumber,
    },
  };
}

export function formatCatalogChangeValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length === 0 ? 'None' : value.join(', ');
  if (typeof value === 'object') return 'Updated structured definition';
  return String(value);
}

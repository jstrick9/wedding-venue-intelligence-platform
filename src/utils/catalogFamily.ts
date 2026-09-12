interface CatalogFamilyMember {
  id: string;
  archived?: boolean;
  catalogFamilyId?: string;
  catalogRevision?: number;
  inventoryCount?: number;
}

export function catalogFamilyKey(definition: CatalogFamilyMember): string {
  return definition.catalogFamilyId || definition.id;
}

export function catalogFamilyMembers<T extends CatalogFamilyMember>(
  definitions: T[],
  definition: CatalogFamilyMember,
): T[] {
  const key = catalogFamilyKey(definition);
  return definitions.filter((candidate) => catalogFamilyKey(candidate) === key);
}

export function catalogFamilyIds<T extends CatalogFamilyMember>(
  definitions: T[],
  definition: CatalogFamilyMember,
): Set<string> {
  return new Set(catalogFamilyMembers(definitions, definition).map((candidate) => candidate.id));
}

export function catalogFamilyStatus<T extends CatalogFamilyMember>(
  definitions: T[],
  definition: T,
): {
  revision: number;
  familySize: number;
  hasActiveSibling: boolean;
  isHistoricalRevision: boolean;
  isCurrentRevision: boolean;
} {
  const members = catalogFamilyMembers(definitions, definition);
  const hasActiveSibling = members.some((candidate) =>
    candidate.id !== definition.id && !candidate.archived);
  const highestRevision = Math.max(...members.map((candidate) => candidate.catalogRevision || 1));
  return {
    revision: definition.catalogRevision || 1,
    familySize: members.length,
    hasActiveSibling,
    isHistoricalRevision: Boolean(definition.archived && hasActiveSibling),
    isCurrentRevision: Boolean(!definition.archived && (definition.catalogRevision || 1) === highestRevision),
  };
}

export function catalogFamilyWithMultipleActiveMembers<T extends CatalogFamilyMember>(
  definitions: T[],
): T[] | undefined {
  const families = new Map<string, T[]>();
  definitions.forEach((definition) => {
    if (definition.archived) return;
    const key = catalogFamilyKey(definition);
    const members = families.get(key) || [];
    members.push(definition);
    families.set(key, members);
  });
  return [...families.values()].find((members) => members.length > 1);
}

export function changedHistoricalCatalogMember<T extends CatalogFamilyMember>(
  current: T[],
  proposed: T[],
): T | undefined {
  return current.find((definition) => {
    if (!catalogFamilyStatus(current, definition).isHistoricalRevision) return false;
    const candidate = proposed.find((item) => item.id === definition.id);
    return Boolean(candidate && JSON.stringify(candidate) !== JSON.stringify(definition));
  });
}

/** The newest active revision owns the shared inventory limit for its family. */
export function catalogFamilyInventory<T extends CatalogFamilyMember>(
  definitions: T[],
  definition: T,
): number | undefined {
  const members = catalogFamilyMembers(definitions, definition);
  const active = members
    .filter((candidate) => !candidate.archived)
    .sort((left, right) => (right.catalogRevision || 1) - (left.catalogRevision || 1))[0];
  return (active || definition).inventoryCount;
}

import { catalogFamilyStatus } from '../../utils/catalogFamily';

interface CatalogMember {
  id: string;
  archived?: boolean;
  catalogFamilyId?: string;
  catalogRevision?: number;
}

interface CatalogRevisionStatusProps<T extends CatalogMember> {
  definition: T;
  definitions: T[];
  compact?: boolean;
}

export function CatalogRevisionStatus<T extends CatalogMember>({
  definition,
  definitions,
  compact = false,
}: CatalogRevisionStatusProps<T>) {
  const status = catalogFamilyStatus(definitions, definition);
  if (status.familySize < 2 && !definition.catalogRevision && !definition.catalogFamilyId) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? '' : 'mt-2'}`}>
      <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700">
        Revision {status.revision}
      </span>
      {status.isHistoricalRevision && (
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
          Historical revision
        </span>
      )}
      {status.isCurrentRevision && (
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
          Current revision
        </span>
      )}
    </div>
  );
}

export function HistoricalRevisionNotice<T extends CatalogMember>({
  definition,
  definitions,
}: Omit<CatalogRevisionStatusProps<T>, 'compact'>) {
  const status = catalogFamilyStatus(definitions, definition);
  if (!status.isHistoricalRevision) return null;
  return (
    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      Retained for layouts that reference this exact revision. Revision {status.revision} cannot be restored while a current revision is active; migrate layouts only through guided replacement.
    </p>
  );
}

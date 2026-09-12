import { useEffect, useMemo, useState } from 'react';
import type {
  CatalogDefinition,
  CatalogKind,
  CatalogReferenceSummary,
} from '../utils/catalogReferences';
import type { CatalogReplacementReview } from '../utils/catalogReplacementReview';
import ModalDialog from './ModalDialog';

interface CatalogLifecycleDialogProps {
  kind: CatalogKind;
  definition: CatalogDefinition;
  summary: CatalogReferenceSummary;
  candidates: CatalogDefinition[];
  reviewReplacement: (replacementId: string) => CatalogReplacementReview;
  onArchive: () => void;
  onReplace: (replacementId: string, review: CatalogReplacementReview) => void;
  onClose: () => void;
}

function kindLabel(kind: CatalogKind): string {
  if (kind === 'decor') return 'décor item';
  return kind;
}

export function CatalogLifecycleDialog({
  kind,
  definition,
  summary,
  candidates,
  reviewReplacement,
  onArchive,
  onReplace,
  onClose,
}: CatalogLifecycleDialogProps) {
  const [replacementId, setReplacementId] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const review = useMemo(
    () => replacementId ? reviewReplacement(replacementId) : null,
    [replacementId, reviewReplacement],
  );

  useEffect(() => setAcknowledged(false), [replacementId]);

  return (
    <ModalDialog
      title={`Referenced ${kindLabel(kind)} cannot be deleted`}
      description={`${definition.name} is still required by ${summary.totalReferences} known reference${summary.totalReferences === 1 ? '' : 's'}.`}
      onClose={onClose}
      className="max-w-3xl"
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <strong>Deletion was blocked to protect existing layouts.</strong> Archive this definition to hide it from new placement, or choose a compatible replacement and review every affected source. No placed item will be moved or assigned a new ID.
        </div>

        <section aria-labelledby="catalog-dependencies-heading">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 id="catalog-dependencies-heading" className="font-semibold text-gray-900">
              Dependency review
            </h3>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
              {summary.affectedLayouts} layout{summary.affectedLayouts === 1 ? '' : 's'}
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white">
            {summary.entries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 border-b border-gray-100 px-3 py-2.5 last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-800">{entry.label}</div>
                  <div className="text-xs text-gray-500">{entry.detail}</div>
                </div>
                <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">{entry.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4" aria-labelledby="archive-heading">
          <h3 id="archive-heading" className="font-semibold text-blue-950">Safe immediate action</h3>
          <p className="mt-1 text-sm text-blue-900">
            Archiving preserves rendering, dimensions, seating, and inventory references in existing layouts while removing this definition from all new-placement catalogs.
          </p>
          <button
            type="button"
            onClick={onArchive}
            className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            {definition.archived ? 'Keep archived and close' : `Archive ${definition.name}`}
          </button>
        </section>

        <section className="rounded-xl border border-gray-200 p-4" aria-labelledby="replacement-heading">
          <h3 id="replacement-heading" className="font-semibold text-gray-900">Guided replacement</h3>
          <p className="mt-1 text-sm text-gray-600">
            Coordinates, rotation, labels, instance IDs, and explicit seating are preserved. Legacy catalog-only seat values are materialized before replacement.
          </p>
          <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-gray-600" htmlFor="catalog-replacement">
            Compatible replacement
          </label>
          <select
            id="catalog-replacement"
            value={replacementId}
            onChange={(event) => setReplacementId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Choose a replacement…</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
            ))}
          </select>

          {candidates.length === 0 && (
            <p className="mt-2 text-sm text-amber-700">No active compatible replacement is configured. Archive this item or create a compatible catalog definition first.</p>
          )}

          {review && (
            <div className="mt-4 space-y-3" aria-live="polite">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs uppercase text-gray-500">Affected sources</div>
                  <div className="text-xl font-bold text-gray-900">{review.affectedSourceIds.length}</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs uppercase text-gray-500">Placed references</div>
                  <div className="text-xl font-bold text-gray-900">{review.affectedInstances}</div>
                </div>
              </div>

              {review.blockers.length > 0 && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
                  <strong>Replacement is blocked:</strong>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {review.blockers.map((issue, index) => (
                      <li key={`${issue.sourceId}:${index}`}><span className="font-medium">{issue.sourceLabel}:</span> {issue.message}</li>
                    ))}
                  </ul>
                  <p className="mt-2">Repair these boundary, collision, compatibility, or inventory issues before replacing. Items will not be silently moved or clamped.</p>
                </div>
              )}

              {review.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  <strong>Review notes:</strong>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {review.warnings.map((issue, index) => (
                      <li key={`${issue.sourceId}:${index}`}><span className="font-medium">{issue.sourceLabel}:</span> {issue.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {review.blockers.length === 0 && (
                <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>I reviewed every affected source and understand that tied décor designs will be detached where required. No item coordinates will change.</span>
                </label>
              )}

              <button
                type="button"
                disabled={review.blockers.length > 0 || !acknowledged}
                onClick={() => onReplace(replacementId, review)}
                className="rounded-lg bg-[#4A1942] px-4 py-2 text-sm font-semibold text-white hover:bg-[#35122f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply reviewed replacement
              </button>
            </div>
          )}
        </section>

        <div className="flex justify-end border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

export default CatalogLifecycleDialog;

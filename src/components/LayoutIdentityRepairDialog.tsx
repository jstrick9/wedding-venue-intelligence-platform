import { useMemo, useRef, useState } from 'react';
import type { LayoutIdentityReview } from '../utils/layoutIdentity';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface LayoutIdentityRepairDialogProps {
  review: LayoutIdentityReview;
  onApply: (selections: Record<string, string>) => void | Promise<void>;
  onClose: () => void;
}

const KIND_LABEL: Record<string, string> = {
  table: 'Table',
  fixture: 'Venue item',
  decor: 'Décor item',
  'ceremony-row': 'Ceremony row',
};

export function LayoutIdentityRepairDialog({ review, onApply, onClose }: LayoutIdentityRepairDialogProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusTrap(dialogRef, true, undefined, titleRef);
  const allReferencesChosen = useMemo(
    () => review.ambiguousReferences.every((reference) =>
      reference.candidates.some((candidate) => candidate.key === selections[reference.key])),
    [review.ambiguousReferences, selections],
  );

  const apply = async () => {
    if (!acknowledged || !allReferencesChosen || applying) return;
    setApplying(true);
    setError(null);
    try {
      await onApply(selections);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The identity repair could not be applied.');
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[21000] flex items-center justify-center bg-black/60 p-3 sm:p-5">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-identity-repair-title"
        tabIndex={-1}
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-amber-300 bg-amber-50 px-5 py-4">
          <div>
            <h2 ref={titleRef} id="layout-identity-repair-title" tabIndex={-1} className="text-xl font-bold text-amber-950">
              Repair duplicate layout identities
            </h2>
            <p className="mt-1 text-sm text-amber-900">
              This layout is read-only until its placed objects have unique IDs.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-amber-900 hover:bg-amber-100" aria-label="Close identity repair review">✕</button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <strong>Coordinate-preserving repair:</strong> the first occurrence keeps its ID; {review.changedEntityCount} later or blank-ID object{review.changedEntityCount === 1 ? '' : 's'} receive new IDs. Labels, coordinates, rotations, seating, dimensions, and catalog references do not change. Apply updates only this working draft; save it explicitly afterward.
          </div>

          <section aria-labelledby="identity-changes-heading">
            <h3 id="identity-changes-heading" className="font-bold text-gray-900">Proposed identity changes</h3>
            <div className="mt-3 space-y-2">
              {review.records.filter((record) => record.changed).map((record) => (
                <div key={record.key} className="grid gap-2 rounded-lg border border-gray-200 p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="font-semibold text-gray-900">{record.label}</div>
                    <div className="mt-1 text-xs text-gray-500">{KIND_LABEL[record.kind]} · position ({record.x}, {record.y}) ft</div>
                  </div>
                  <div className="break-all rounded-md bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700">
                    {record.originalId || '(blank ID)'} → {record.repairedId}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {review.ambiguousReferences.length > 0 && (
            <section aria-labelledby="identity-links-heading" className="rounded-xl border border-purple-200 bg-purple-50 p-4">
              <h3 id="identity-links-heading" className="font-bold text-purple-950">Relationships that require your choice</h3>
              <p className="mt-1 text-sm text-purple-800">Duplicate IDs make these historical links ambiguous. Nothing is selected automatically.</p>
              <div className="mt-4 space-y-4">
                {review.ambiguousReferences.map((reference) => (
                  <label key={reference.key} className="block text-sm font-medium text-purple-950">
                    {reference.ownerLabel}
                    <span className="mt-1 block text-xs font-normal text-purple-800">{reference.description}</span>
                    <select
                      value={selections[reference.key] || ''}
                      onChange={(event) => setSelections((current) => ({ ...current, [reference.key]: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="">Choose a target…</option>
                      {reference.candidates.map((candidate) => (
                        <option key={candidate.key} value={candidate.key}>
                          {candidate.label} — {KIND_LABEL[candidate.kind]} at ({candidate.x}, {candidate.y}) ft{candidate.changed ? ' · receives new ID' : ' · keeps ID'}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>
          )}

          {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>}

          <label className="flex items-start gap-3 rounded-xl border border-gray-300 bg-gray-50 p-4 text-sm text-gray-800">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 accent-purple-700" />
            <span>I reviewed every identity change and relationship choice. I understand that no object will move and that I must save the repaired working layout explicitly.</span>
          </label>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <p className="text-xs text-gray-600">Closing keeps the layout read-only; it does not discard or repair anything.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={applying} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Close review</button>
            <button type="button" onClick={() => void apply()} disabled={!acknowledged || !allReferencesChosen || applying} className="rounded-lg bg-purple-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {applying ? 'Applying…' : 'Apply identity repair'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

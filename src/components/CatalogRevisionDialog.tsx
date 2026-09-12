import { useState } from 'react';
import type {
  CatalogDefinition,
  CatalogKind,
  CatalogReferenceSummary,
} from '../utils/catalogReferences';
import {
  formatCatalogChangeValue,
  type CatalogPhysicalChange,
} from '../utils/catalogRevision';
import ModalDialog from './ModalDialog';

interface CatalogRevisionDialogProps {
  kind: CatalogKind;
  source: CatalogDefinition;
  proposed: CatalogDefinition;
  summary: CatalogReferenceSummary;
  changes: CatalogPhysicalChange[];
  onConfirm: () => void;
  onClose: () => void;
}

export function CatalogRevisionDialog({
  kind,
  source,
  summary,
  changes,
  onConfirm,
  onClose,
}: CatalogRevisionDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <ModalDialog
      title={`Create a new ${kind === 'decor' ? 'décor' : kind} revision?`}
      description={`${source.name} is referenced by existing layout or configuration data.`}
      onClose={onClose}
      className="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950" role="status">
          <strong>Existing layouts will not change.</strong> The current definition will be archived for exact historical rendering, and this edit will become a new active definition with a unique ID. No placed item, submitted plan, or approved couple layout will be migrated automatically.
        </div>

        <section aria-labelledby="revision-changes-heading">
          <h3 id="revision-changes-heading" className="font-semibold text-gray-900">Proposed physical and seating changes</h3>
          <div className="mt-2 overflow-hidden rounded-xl border border-gray-200">
            {changes.map((change) => (
              <div key={change.field} className="grid grid-cols-[minmax(100px,0.8fr)_minmax(100px,1fr)_auto_minmax(100px,1fr)] items-center gap-2 border-b border-gray-100 px-3 py-2.5 text-sm last:border-b-0">
                <span className="font-medium text-gray-700">{change.label}</span>
                <span className="truncate text-gray-500">{formatCatalogChangeValue(change.before)}</span>
                <span aria-hidden="true" className="text-gray-400">→</span>
                <span className="truncate font-semibold text-gray-900">{formatCatalogChangeValue(change.after)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-gray-50 p-4" aria-labelledby="revision-impact-heading">
          <h3 id="revision-impact-heading" className="font-semibold text-gray-900">Reference impact</h3>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-gray-500">Known references retained</dt><dd className="text-xl font-bold text-gray-900">{summary.totalReferences}</dd></div>
            <div><dt className="text-gray-500">Existing layouts unchanged</dt><dd className="text-xl font-bold text-gray-900">{summary.affectedLayouts}</dd></div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-gray-600">
            Archived and active revisions share one inventory family, so existing allocations continue to count against the active revision's inventory limit. Use guided replacement later if specific layouts should adopt the new dimensions or seating.
          </p>
        </section>

        <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>I understand this creates a new active revision and leaves all existing layout references on the archived source definition.</span>
        </label>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel edit
          </button>
          <button
            type="button"
            disabled={!acknowledged}
            onClick={onConfirm}
            className="rounded-lg bg-[#4A1942] px-4 py-2 text-sm font-semibold text-white hover:bg-[#35122f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create active revision
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

export default CatalogRevisionDialog;

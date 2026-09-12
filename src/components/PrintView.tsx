import { useState } from 'react';
import { Venue, PlacedTable, PlacedFixture, Guest, CeremonyChairRow } from '../types';
import { getTableSpecs, getLinenColors } from '../hooks/useLayoutState';
import { getConfig } from '../config';
import SafeImage from './SafeImage';
import { downloadLayoutPng, downloadLayoutPdf } from '../utils/layoutExport';
import { showToast } from './Toast';
import { describeUnknownError } from '../utils/unknownError';
import { layoutSeatCount, tableSeatCount } from '../utils/layoutSeating';

export interface PrintViewProps {
  venue: Venue;
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  ceremonyRows?: CeremonyChairRow[];
  guests: Guest[];
  layoutName: string;
  onClose: () => void;
  /** The live floor-plan <svg> (used for high-fidelity PNG/PDF export). */
  exportSvgRef?: React.RefObject<SVGSVGElement | null>;
}

export function PrintView({
  venue,
  tables,
  fixtures,
  ceremonyRows = [],
  layoutName,
  onClose,
  exportSvgRef,
}: PrintViewProps) {
  const tableSpecs = getTableSpecs();
  const config = getConfig();
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);
  const [showLinenColorKey, setShowLinenColorKey] = useState(true);
  const [showRoomSetupChecklist, setShowRoomSetupChecklist] = useState(true);
  // Capture the already-rendered canonical Design Studio SVG when the print
  // preview opens. This keeps venue shape, rotations, chairs, decor, and canvas
  // geometry identical instead of rebuilding an incomplete second floor plan.
  const [floorPlanSvgMarkup] = useState(() => exportSvgRef?.current?.outerHTML || '');

  const handlePrint = () => {
    window.print();
  };

  const runExport = async (kind: 'png' | 'pdf') => {
    const svg = exportSvgRef?.current;
    if (!svg) {
      showToast('Floor plan is not ready to export yet.', 'warning');
      return;
    }
    setExporting(kind);
    try {
      const base = (layoutName || 'layout').trim().replace(/[^a-z0-9-_]+/gi, '-') || 'layout';
      if (kind === 'png') {
        await downloadLayoutPng(svg, base);
      } else {
        await downloadLayoutPdf(svg, base);
      }
      showToast(`Exported ${kind.toUpperCase()} successfully.`, 'success');
    } catch (err) {
      showToast(describeUnknownError(err, 'Could not export the floor plan. Try again.'), 'warning');
    } finally {
      setExporting(null);
    }
  };

  // One seating source of truth across the editor, couple portal, assignments,
  // and print: the placed chair count (with legacy/catalog fallback).
  const tableCapacity = (table: PlacedTable) => {
    const spec = tableSpecs.find((candidate) => candidate.id === table.specId);
    return tableSeatCount(table, spec);
  };

  const getTotalCapacity = () => layoutSeatCount(tables, tableSpecs, ceremonyRows);

  return (
    <div className="fixed inset-0 z-[10000] bg-white overflow-auto spm-print-view">
      <div className="print:hidden no-print sticky top-0 z-10 bg-white border-b px-6 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-lg font-semibold text-gray-900">Print Preview</div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void runExport('png')}
              disabled={exporting !== null}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === 'png' ? 'Exporting…' : '🖼️ PNG'}
            </button>
            <button
              type="button"
              onClick={() => void runExport('pdf')}
              disabled={exporting !== null}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === 'pdf' ? 'Exporting…' : '📄 PDF'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-lg bg-[#4A1942] text-white hover:bg-[#5b2352]"
            >
              🖨️ Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-wrap">
          <span className="font-semibold text-gray-600">Print sheet options:</span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showLinenColorKey}
              onChange={(e) => setShowLinenColorKey(e.target.checked)}
              className="rounded accent-[#4A1942]"
            />
            <span>Linen color key</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showRoomSetupChecklist}
              onChange={(e) => setShowRoomSetupChecklist(e.target.checked)}
              className="rounded accent-[#4A1942]"
            />
            <span>Room setup checklist</span>
          </label>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 border-b pb-6 mb-6">
          {config.logoUrl && (
            <SafeImage
              src={config.logoUrl}
              alt={config.venueName}
              className="h-16 w-auto object-contain"
              fallback={null}
            />
          )}

          <div>
            <h1 className="text-3xl font-bold text-gray-900">{config.venueName}</h1>
            <h2 className="text-xl text-gray-700 mt-1">{layoutName || 'Event Layout'}</h2>
            <p className="text-sm text-gray-500 mt-2">
              {venue.name} • {venue.width}' × {venue.height}'
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="rounded-lg border bg-gray-50 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{tables.length}</div>
            <div className="text-sm text-gray-600">Tables</div>
          </div>
          <div className="rounded-lg border bg-gray-50 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{fixtures.length}</div>
            <div className="text-sm text-gray-600">Venue Items</div>
          </div>
          <div className="rounded-lg border bg-gray-50 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{getTotalCapacity()}</div>
            <div className="text-sm text-gray-600">Configured Seats</div>
          </div>
          <div className="rounded-lg border bg-gray-50 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{venue.capacity}</div>
            <div className="text-sm text-gray-600">Venue Maximum</div>
          </div>
        </div>

        {showLinenColorKey && (
          <div className="mb-8 rounded-lg border bg-gray-50 p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Linen Color Key</h3>
            {(() => {
              const linenColors = getLinenColors();
              const usedColorIds = Array.from(new Set(tables.map((t) => t.linenColor || 'white')));
              return (
                <div className="flex flex-wrap gap-4 text-xs">
                  {usedColorIds.map((cid) => {
                    const colorObj = linenColors.find((c) => c.id === cid) || { name: cid, hex: '#ffffff' };
                    const count = tables.filter((t) => (t.linenColor || 'white') === cid).length;
                    return (
                      <div key={cid} className="flex items-center gap-1.5">
                        <span
                          className="w-4 h-4 rounded border border-gray-300 inline-block shrink-0"
                          style={{ backgroundColor: colorObj.hex }}
                        />
                        <span className="font-medium text-gray-800 capitalize">{colorObj.name}</span>
                        <span className="text-gray-500">({count} table{count === 1 ? '' : 's'})</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        <div className="mb-10">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Floor Plan</h3>

          {floorPlanSvgMarkup ? (
            <div
              className="border rounded-xl overflow-hidden bg-white [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              aria-label="Canonical floor plan"
              dangerouslySetInnerHTML={{ __html: floorPlanSvgMarkup }}
            />
          ) : (
            <div className="rounded-xl border border-red-300 bg-red-50 p-5 text-sm text-red-900" role="alert">
              <strong>Canonical floor plan unavailable.</strong>{' '}
              Close Print Preview and reopen it after the Design Studio canvas finishes rendering. No simplified substitute is shown because it could misrepresent the venue setup.
            </div>
          )}
        </div>

        <div className="mb-10">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Table Setup</h3>
          <p className="mb-4 text-sm text-gray-600">
            Operational seat configuration only. Guest assignments are managed in the couple-facing portal.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tables.map((table) => {
              const spec = tableSpecs.find((candidate) => candidate.id === table.specId);
              const configuredSeats = tableCapacity(table);
              const linen = getLinenColors().find((color) => color.id === (table.linenColor || 'white'));
              return (
                <div key={table.id} className="rounded-lg border p-4 bg-white">
                  <h4 className="font-semibold text-gray-900">{table.label}</h4>
                  <p className="mt-1 text-sm text-gray-600">{spec?.name || 'Unknown Table'}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-500">Configured seats</dt>
                      <dd className="mt-1 font-semibold text-gray-900">{configuredSeats}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-500">Linen</dt>
                      <dd className="mt-1 font-semibold text-gray-900">
                        {table.hasLinen === false ? 'None' : (linen?.name || table.linenColor || 'White')}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </div>

        {showRoomSetupChecklist && (
          <div className="mb-10 page-break">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Room Setup Checklist</h3>
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
                <label className="flex items-center gap-2">
                  <span className="w-4 h-4 border border-gray-400 rounded inline-block shrink-0" />
                  <span>Verify table placement &amp; spacing against floor plan</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-4 h-4 border border-gray-400 rounded inline-block shrink-0" />
                  <span>Confirm {tables.length} table linen(s) placed per color key</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-4 h-4 border border-gray-400 rounded inline-block shrink-0" />
                  <span>Set chairs ({getTotalCapacity()} total seats configured)</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-4 h-4 border border-gray-400 rounded inline-block shrink-0" />
                  <span>Check aisle width &amp; emergency exit clearances</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-4 h-4 border border-gray-400 rounded inline-block shrink-0" />
                  <span>Confirm dance floor / DJ / bar fixture placement</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-4 h-4 border border-gray-400 rounded inline-block shrink-0" />
                  <span>Verify power &amp; lighting access for vendors</span>
                </label>
              </div>
              <div className="border-t border-gray-200 pt-4 mt-4 flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
                <span>Setup Lead Signature: ___________________________</span>
                <span>Date/Time Verified: _______________</span>
              </div>
            </div>
          </div>
        )}

        <div className="border-t pt-6 text-center text-sm text-gray-500">
          <p>Generated by {config.venueName} Layout Planner</p>
          <p>{new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}
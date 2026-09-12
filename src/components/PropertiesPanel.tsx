import { useEffect, useState } from 'react';
import { PlacedTable, PlacedFixture, PlacedDecor, ChairType } from '../types';
import { getTableSpecs, getFixtureTypes, getLinenColors, getDecorItems } from '../hooks/useLayoutState';
import {
  configuredChairCount,
  shouldRenderChairGraphics,
  tableSeatCount,
} from '../utils/layoutSeating';
import { getChairSpecs } from '../data/venueData';
import { useBrandingConfig } from '../config';
import SafeImage from './SafeImage';
import { emit } from '../utils/appEvents';

export interface PropertiesPanelProps {
  selectedId: string | null;
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  decor?: PlacedDecor[];
  onUpdateTable: (id: string, updates: Partial<PlacedTable>) => void;
  onUpdateFixture: (id: string, updates: Partial<PlacedFixture>) => void;
  onUpdateDecor?: (id: string, updates: Partial<PlacedDecor>) => void;
  onRemoveItem: (id: string) => void;
  onDuplicateItem: (id: string) => void;
  onRepairCatalogReference?: (id: string, replacementId: string) => void;
  onClose: () => void;
  onViewImage: (url: string, title: string) => void;
  visible: boolean;
  onToggleVisibility: () => void;
  arrangements: any[]; // DecorArrangement[]
}

export function PropertiesPanel({
  selectedId,
  tables,
  fixtures,
  decor = [],
  onUpdateTable,
  onUpdateFixture,
  onUpdateDecor = () => undefined,
  onRemoveItem,
  onDuplicateItem,
  onRepairCatalogReference,
  onClose,
  onViewImage,
  visible,
  onToggleVisibility,
  arrangements = [],
}: PropertiesPanelProps) {
  const config = useBrandingConfig();
  const tableSpecs = getTableSpecs();
  const fixtureTypes = getFixtureTypes();
  const decorItems = getDecorItems();
  const linenColors = getLinenColors().filter((c) => c.enabled);
  const [repairSpecId, setRepairSpecId] = useState('');
  useEffect(() => setRepairSpecId(''), [selectedId]);

  const table = tables.find((t) => t.id === selectedId);
  const fixture = fixtures.find((f) => f.id === selectedId);
  const decorItem = decor.find((candidate) => candidate.id === selectedId);
  const item = table || fixture || decorItem;

  const tableSpec = table ? tableSpecs.find((s) => s.id === table.specId) : null;
  const fixtureSpec = fixture ? fixtureTypes.find((s) => s.id === fixture.specId) : null;
  const decorSpec = decorItem ? decorItems.find((candidate) => candidate.id === decorItem.decorItemId) : null;
  const spec = tableSpec || fixtureSpec || decorSpec;
  const missingReferenceId = table?.specId || fixture?.specId || decorItem?.decorItemId;
  const repairOptions = table
    ? tableSpecs.filter((candidate) => !candidate.archived)
    : fixture
      ? fixtureTypes.filter((candidate) => !candidate.archived)
      : decorItem
        ? decorItems.filter((candidate) => !candidate.archived)
        : [];

  const effectiveCapacity = table && tableSpec ? tableSeatCount(table, tableSpec) : 0;
  const appliedArrangementId = table?.appliedArrangementId || fixture?.appliedArrangementId;
  const compatibleArrangements = arrangements.filter((arrangement) => {
    if (arrangement.id === appliedArrangementId) return true;
    if (table) {
      return arrangement.baseType === 'table'
        && (!arrangement.baseSpecId || arrangement.baseSpecId === table.specId);
    }
    if (fixture && fixtureSpec) {
      if (arrangement.baseType === 'table') return false;
      if (arrangement.baseSpecId && arrangement.baseSpecId !== fixture.specId) return false;
      if (arrangement.baseType === 'arch') {
        return !!fixtureSpec.allowAsDecorBase || fixtureSpec.name.toLowerCase().includes('arch');
      }
      return true;
    }
    return false;
  });

  const getLinenColorInfo = (colorId?: string) => {
    const defaultColor = {
      id: 'white',
      name: 'White',
      hex: '#FFFFFF',
      textColor: '#374151',
      enabled: true,
    };
    return linenColors.find((c) => c.id === colorId) || linenColors[0] || defaultColor;
  };

  if (!visible) {
    return (
      <div
        className="w-12 h-full min-h-0 flex flex-col items-center py-4 shadow-lg"
        style={{ background: `linear-gradient(to bottom, ${config.primaryColor}, ${config.primaryDark})` }}
      >
        <button
          onClick={onToggleVisibility}
          className="p-2 hover:bg-white/20 rounded-lg text-white transition-colors"
          title="Show Properties"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M5 12h14" />
          </svg>
        </button>

        {selectedId && (
          <button
            onClick={onToggleVisibility}
            className="mt-3 flex flex-col items-center gap-1 p-2 hover:bg-white/20 rounded-lg text-white transition-colors group"
            title="Click to view properties for selected item"
            type="button"
          >
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs whitespace-nowrap rotate-90 origin-center mt-4 opacity-70 group-hover:opacity-100">
              Open
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-80 h-full min-h-0 overflow-hidden bg-gray-50 border-l border-gray-200 flex flex-col shadow-sm">
      {/* Header */}
      <div
        className="p-3 flex items-center justify-between"
        style={{
          background: `linear-gradient(to right, ${config.primaryColor}, ${config.primaryDark})`,
          color: config.headerTextColor,
        }}
      >
        <h3 className="font-bold text-white flex items-center gap-2">
          <span>⚙️</span> Properties
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/20 rounded text-white/80 hover:text-white transition-colors"
          title="Close panel"
          type="button"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 bg-gray-100" role="region" aria-label="Selected item properties" tabIndex={0}>
        {!item ? (
          <div className="text-center text-gray-500 py-8">
            <div className="text-4xl mb-3">👆</div>
            <p className="font-medium text-gray-700">No item selected</p>
            <p className="text-sm mt-2">Click an item on the canvas to edit its properties</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Item info card */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center shadow-inner border"
                  style={{
                    backgroundColor:
                      table && table.hasLinen !== false
                        ? getLinenColorInfo(table.linenColor).hex
                        : spec?.color || '#e5e7eb',
                    borderColor: config.primaryColor,
                  }}
                >
                  <span
                    style={{
                      color:
                        table && table.hasLinen !== false
                          ? getLinenColorInfo(table.linenColor).textColor
                          : '#374151',
                    }}
                  >
                    {(fixtureSpec as any)?.icon || decorSpec?.icon || ((spec as any)?.shape === 'circle' ? '●' : '▢')}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-gray-800">{spec?.name || 'Unknown'}</div>
                  <div className="text-xs text-gray-500">
                    {spec
                      ? `${spec.width}' × ${spec.height}' • ${table ? `Seats ${effectiveCapacity}` : decorItem ? 'Decor' : 'Fixture'}`
                      : `Missing reference: ${missingReferenceId || 'unknown'}`}
                  </div>
                </div>
              </div>

              {spec?.imageUrl && (
                <button
                  onClick={() => onViewImage(spec.imageUrl!, spec.name)}
                  className="w-full py-2 text-sm rounded-lg flex items-center justify-center gap-2 transition-colors border"
                  style={{
                    color: config.primaryColor,
                    borderColor: `${config.primaryColor}33`,
                    backgroundColor: `${config.primaryColor}0D`,
                  }}
                  type="button"
                >
                  📷 View Actual Image
                </button>
              )}

              {Array.isArray((spec as any)?.images) && (spec as any).images.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Image Gallery
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(spec as any).images.slice(0, 6).map((img: any) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() =>
                          onViewImage(img.url, img.label || spec?.name || 'Fixture Image')
                        }
                        className="relative rounded border border-gray-200 overflow-hidden hover:ring-2 hover:ring-[#4A1942]/40"
                        title={img.label || 'View image'}
                      >
                        <SafeImage
                          src={img.url}
                          alt={img.label || spec?.name || 'Fixture Image'}
                          className="w-full h-16 object-cover"
                          fallback={
                            <div className="w-full h-16 flex items-center justify-center bg-gray-100 text-[10px] text-gray-400">
                              Broken image
                            </div>
                          }
                        />
                        {img.label && (
                          <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
                            {img.label}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!spec && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950" role="alert">
                <div className="font-semibold">Catalog definition is missing</div>
                <p className="mt-1 text-xs leading-relaxed">
                  This historical item is using conservative fallback geometry. Choose an active replacement; its ID, label, coordinates, and rotation will be preserved. Boundary and inventory checks run before repair{(table?.appliedArrangementId || fixture?.appliedArrangementId) ? ', and the incompatible applied décor design will be detached' : ''}.
                </p>
                <label htmlFor="repair-catalog-reference" className="mt-3 block text-xs font-semibold uppercase tracking-wide text-red-800">
                  Replacement definition
                </label>
                <select
                  id="repair-catalog-reference"
                  value={repairSpecId}
                  onChange={(event) => setRepairSpecId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  <option value="">Choose a replacement…</option>
                  {repairOptions.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!repairSpecId}
                  onClick={() => onRepairCatalogReference?.(item.id, repairSpecId)}
                  className="mt-3 w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Repair catalog reference
                </button>
              </div>
            )}

            {/* Label */}
            {!decorItem && (
              <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Label
                </label>
                <input
                  type="text"
                  value={table?.label || fixture?.label || ''}
                  onChange={(e) => {
                    if (table) {
                      onUpdateTable(table.id, { label: e.target.value });
                    } else if (fixture) {
                      onUpdateFixture(fixture.id, { label: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                  placeholder="Enter label..."
                />
              </div>
            )}

            {/* Applied Design / Arrangement */}
            {!decorItem && <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Applied Design
              </label>
              <select
                value={appliedArrangementId || ''}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  if (table) {
                    onUpdateTable(table.id, { appliedArrangementId: val });
                  } else if (fixture) {
                    onUpdateFixture(fixture.id, { appliedArrangementId: val });
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent text-sm"
              >
                <option value="">No Design Applied</option>
                {compatibleArrangements.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              {appliedArrangementId && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-green-600 font-bold uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    Design Active
                  </span>
                  <button
                    onClick={() => {
                      emit('spm_open_decor_designer', { arrangementId: appliedArrangementId });
                    }}
                    className="text-[10px] text-blue-600 font-bold hover:underline"
                    type="button"
                  >
                    Edit Design
                  </button>
                </div>
              )}
            </div>}

            {/* Fixture Variant Selection */}
            {fixture && fixtureSpec && fixtureSpec.hasVariants && fixtureSpec.variants && (
              <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                  {fixtureSpec.name.includes('Wall') ? 'Wall Style' : 'Variant'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {fixtureSpec.variants.map((variant) => (
                    <button
                      key={variant.id}
                      onClick={() =>
                        onUpdateFixture(fixture.id, {
                          variant: variant.id,
                          variantColor: variant.color,
                        })
                      }
                      className={`p-3 rounded-lg border-2 text-left transition-all hover:shadow-md ${
                        fixture.variant === variant.id
                          ? 'border-[#4A1942] bg-[#4A1942]/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      type="button"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border border-gray-300"
                          style={{ backgroundColor: variant.color }}
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-700">{variant.name}</div>
                          <div className="text-xs text-gray-400">{variant.icon}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {fixture.variant && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="text-xs text-gray-500 mb-2">
                      Current:{' '}
                      <strong>
                        {fixtureSpec.variants.find((v) => v.id === fixture.variant)?.name ||
                          'Default'}
                      </strong>
                    </div>
                    <button
                      onClick={() =>
                        onUpdateFixture(fixture.id, {
                          variant: undefined,
                          variantColor: undefined,
                        })
                      }
                      className="text-xs hover:underline"
                      style={{ color: config.primaryColor }}
                      type="button"
                    >
                      Reset to default
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Table Linen Settings */}
            {table && tableSpec && !tableSpec.isSeatingType && (
              <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Table Linen
                </label>

                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() =>
                      onUpdateTable(table.id, {
                        hasLinen: table.hasLinen === false ? true : false,
                      })
                    }
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      table.hasLinen !== false ? 'bg-[#4A1942]' : 'bg-gray-300'
                    }`}
                    type="button"
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        table.hasLinen !== false ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-700">
                    {table.hasLinen !== false ? 'Linen Applied' : 'No Linen'}
                  </span>
                </div>

                {table.hasLinen !== false && (
                  <>
                    <div className="text-xs text-gray-500 mb-2">Select Linen Color:</div>
                    <div className="grid grid-cols-5 gap-2">
                      {linenColors.map((color) => (
                        <button
                          key={color.id}
                          onClick={() =>
                            onUpdateTable(table.id, { linenColor: color.id as any })
                          }
                          className={`w-10 h-10 rounded-lg border-2 transition-all hover:scale-105 ${
                            (table.linenColor || 'white') === color.id
                              ? 'border-[#4A1942] ring-2 ring-[#4A1942]/30'
                              : 'border-gray-300'
                          }`}
                          style={{ backgroundColor: color.hex }}
                          title={color.name}
                          type="button"
                        />
                      ))}
                    </div>

                    <div className="mt-2 text-center text-sm font-medium text-gray-700">
                      {getLinenColorInfo(table.linenColor).name}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Table Chair Settings */}
            {table &&
              tableSpec &&
              (() => {
                const allChairSpecs = getChairSpecs();
                const isSeatingType = !!tableSpec.isSeatingType;
                const chairCount = configuredChairCount(table, tableSpec);
                const showChairs = shouldRenderChairGraphics(table, tableSpec);
                const currentChairType = table.chairType || tableSpec.defaultChairType || 'white-plastic';
                const chairSpecs = allChairSpecs.filter((chair) =>
                  !chair.archived || chair.id === currentChairType);
                const restoredChairType: ChairType = currentChairType === 'none'
                  ? tableSpec.defaultChairType && tableSpec.defaultChairType !== 'none'
                    ? tableSpec.defaultChairType
                    : 'white-plastic'
                  : currentChairType;
                const minimumChairCount = 0;
                const maxChairCount = Math.max(minimumChairCount, tableSpec.capacity);

                return (
                  <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                      Chairs
                    </label>

                    {!isSeatingType && (
                      <div className="flex items-center gap-3 mb-4">
                        <button
                          onClick={() =>
                            onUpdateTable(table.id, { showChairs: !showChairs })
                          }
                          disabled={chairCount === 0}
                          aria-pressed={showChairs}
                          aria-label="Show chair graphics"
                          className={`relative w-12 h-6 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            showChairs ? 'bg-[#4A1942]' : 'bg-gray-300'
                          }`}
                          type="button"
                        >
                          <div
                            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                              showChairs ? 'translate-x-7' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className="text-sm text-gray-700">
                          {chairCount === 0
                            ? 'No chairs configured'
                            : showChairs
                              ? 'Chair graphics shown'
                              : 'Chair graphics hidden'}
                        </span>
                      </div>
                    )}

                    {isSeatingType && (
                      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                        Seating groups display their configured chairs; zero creates an empty group with no chair footprint.
                      </div>
                    )}

                    {/* Chair configuration remains available when graphics are hidden
                        or the count is zero, so a standing table can be converted back. */}
                    {chairCount >= 0 && (
                      <>
                        <div className="mb-4">
                          <div className="text-xs text-gray-500 mb-2">Chair Type:</div>
                          <select
                            value={currentChairType}
                            onChange={(e) => {
                              const nextChairType = e.target.value as ChairType;
                              onUpdateTable(table.id, nextChairType === 'none'
                                ? { chairType: 'none', chairCount: 0, showChairs: false }
                                : {
                                    chairType: nextChairType,
                                    ...(isSeatingType ? { showChairs: true } : {}),
                                  });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                          >
                            {chairSpecs.map((chair) => (
                                <option key={chair.id} value={chair.id}>
                                  {chair.icon} {chair.name}
                                </option>
                              ))}
                          </select>

                          <div className="mt-2 flex items-center gap-2">
                            <div
                              className="w-8 h-8 rounded border-2"
                              style={{
                                backgroundColor:
                                  chairSpecs.find((c) => c.id === currentChairType)?.color ||
                                  '#FFFFFF',
                                borderColor: '#666666',
                              }}
                            />
                            <span className="text-sm text-gray-600">
                              {chairSpecs.find((c) => c.id === currentChairType)?.name}
                            </span>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500 mb-2">
                            {isSeatingType ? 'Chairs per row:' : 'Configured seats:'}
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  const newValue = Math.max(minimumChairCount, chairCount - 1);
                                  onUpdateTable(table.id, {
                                    chairCount: newValue,
                                    ...(newValue > 0 && currentChairType === 'none' ? { chairType: restoredChairType } : {}),
                                    ...(isSeatingType ? { showChairs: true } : {}),
                                  });
                                }}
                                disabled={chairCount <= minimumChairCount}
                                aria-label="Remove one configured chair"
                                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                type="button"
                              >
                                −
                              </button>

                              <input
                                type="number"
                                min={minimumChairCount}
                                max={maxChairCount}
                                value={chairCount}
                                aria-label={isSeatingType ? 'Chairs per row' : 'Configured seats'}
                                onChange={(e) => {
                                  const value = Number.parseInt(e.target.value, 10);
                                  if (value >= minimumChairCount && value <= maxChairCount) {
                                    onUpdateTable(table.id, {
                                      chairCount: value,
                                      ...(value > 0 && currentChairType === 'none' ? { chairType: restoredChairType } : {}),
                                      ...(isSeatingType ? { showChairs: true } : {}),
                                    });
                                  }
                                }}
                                className="w-16 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent text-center font-semibold"
                              />

                              <button
                                onClick={() => {
                                  const newValue = Math.min(maxChairCount, chairCount + 1);
                                  onUpdateTable(table.id, {
                                    chairCount: newValue,
                                    ...(newValue > 0 && currentChairType === 'none' ? { chairType: restoredChairType } : {}),
                                    ...(isSeatingType ? { showChairs: true } : {}),
                                  });
                                }}
                                disabled={chairCount >= maxChairCount}
                                aria-label="Add one configured chair"
                                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                type="button"
                              >
                                +
                              </button>

                              <span className="text-sm text-gray-500">chairs</span>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-1.5 flex-1 bg-gray-200 rounded-full overflow-hidden"
                                  style={{ width: '80px' }}
                                >
                                  <div
                                    className="h-full bg-[#4A1942] rounded-full transition-all"
                                    style={{
                                      width: `${maxChairCount > 0 ? (chairCount / maxChairCount) * 100 : 0}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-gray-500">
                                  {chairCount}/{maxChairCount}
                                </span>
                              </div>

                              {(table.chairCount !== undefined || table.customCapacity !== undefined) && (
                                <button
                                  onClick={() => onUpdateTable(table.id, {
                                    chairCount: undefined,
                                    customCapacity: undefined,
                                  })}
                                  className="text-xs text-[#4A1942] hover:underline"
                                  type="button"
                                >
                                  Reset to catalog
                                </button>
                              )}
                            </div>

                            {maxChairCount > 0 && chairCount >= maxChairCount && (
                              <p className="text-xs text-amber-600 flex items-center gap-1">
                                <span>⚠️</span> Maximum chairs for this table
                              </p>
                            )}

                            {!isSeatingType && chairCount === 0 && (
                              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                Standing table: no chair graphics or chair clearance will be added.
                              </p>
                            )}

                            {isSeatingType && (
                              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-1">
                                <div>
                                  <span className="font-semibold">Rows:</span>{' '}
                                  {Math.max(1, tableSpec.seatingRowCount || 1)}
                                </div>
                                <div>
                                  <span className="font-semibold">Row Spacing:</span>{' '}
                                  {tableSpec.seatingRowSpacing ?? 3} ft
                                </div>
                                <div>
                                  <span className="font-semibold">Total Chairs:</span>{' '}
                                  {chairCount * Math.max(1, tableSpec.seatingRowCount || 1)}
                                </div>
                              </div>
                            )}

                            <p className="text-xs text-gray-400">
                              Max: {tableSpec.capacity} chairs • Total area: ~
                              {Math.ceil(tableSpec.width + 3)}' ×{' '}
                              {Math.ceil(tableSpec.height + 3)}'
                            </p>
                          </div>
                        </div>

                        {tableSpec.shape === 'rectangle' && !isSeatingType && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="text-xs text-gray-500 mb-2">Chair Placement:</div>
                            <div className="space-y-2">
                              <label className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-200">
                                <input
                                  type="radio"
                                  name="chairLayout"
                                  value="long-sides-only"
                                  checked={
                                    (table.chairLayout ||
                                      tableSpec.defaultChairLayout ||
                                      'all-sides') === 'long-sides-only'
                                  }
                                  onChange={() =>
                                    onUpdateTable(table.id, {
                                      chairLayout: 'long-sides-only',
                                    })
                                  }
                                  className="mt-1 text-[#4A1942] focus:ring-[#4A1942]"
                                />
                                <div>
                                  <div className="font-medium text-sm text-gray-800">
                                    Long Sides Only
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Chairs on long sides only (e.g., 4+4 for 8 chairs)
                                  </div>
                                  <div className="mt-1 flex items-center gap-1">
                                    <div className="w-12 h-6 bg-amber-100 border border-amber-300 rounded relative flex items-center justify-center text-xs">
                                      <span className="absolute -top-2 text-[8px]">○ ○ ○</span>
                                      <span className="absolute -bottom-2 text-[8px]">○ ○ ○</span>
                                    </div>
                                  </div>
                                </div>
                              </label>

                              <label className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-200">
                                <input
                                  type="radio"
                                  name="chairLayout"
                                  value="all-sides"
                                  checked={
                                    (table.chairLayout ||
                                      tableSpec.defaultChairLayout ||
                                      'all-sides') === 'all-sides'
                                  }
                                  onChange={() =>
                                    onUpdateTable(table.id, {
                                      chairLayout: 'all-sides',
                                    })
                                  }
                                  className="mt-1 text-[#4A1942] focus:ring-[#4A1942]"
                                />
                                <div>
                                  <div className="font-medium text-sm text-gray-800">
                                    All Sides
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Chairs on all 4 sides (e.g., 3+3+1+1 for 8 chairs)
                                  </div>
                                  <div className="mt-1 flex items-center gap-1">
                                    <div className="w-12 h-8 bg-amber-100 border border-amber-300 rounded relative flex items-center justify-center text-xs">
                                      <span className="absolute -top-2 text-[8px]">○ ○</span>
                                      <span className="absolute -bottom-2 text-[8px]">○ ○</span>
                                      <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 text-[8px] flex flex-col gap-0.5">
                                        ○
                                      </span>
                                      <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 text-[8px] flex flex-col gap-0.5">
                                        ○
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </label>

                              <label className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-200">
                                <input
                                  type="radio"
                                  name="chairLayout"
                                  value="head-table"
                                  checked={
                                    (table.chairLayout ||
                                      tableSpec.defaultChairLayout ||
                                      'all-sides') === 'head-table'
                                  }
                                  onChange={() =>
                                    onUpdateTable(table.id, {
                                      chairLayout: 'head-table',
                                    })
                                  }
                                  className="mt-1 text-[#4A1942] focus:ring-[#4A1942]"
                                />
                                <div>
                                  <div className="font-medium text-sm text-gray-800">
                                    Head Table
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Chairs on one long side only (facing guests)
                                  </div>
                                  <div className="mt-1 flex items-center gap-1">
                                    <div className="w-12 h-6 bg-amber-100 border border-amber-300 rounded relative flex items-center justify-center text-xs">
                                      <span className="absolute -bottom-2 text-[8px]">
                                        ○ ○ ○ ○
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </label>
                            </div>

                            {table.chairLayout &&
                              table.chairLayout !==
                                (tableSpec.defaultChairLayout || 'all-sides') && (
                                <button
                                  onClick={() =>
                                    onUpdateTable(table.id, {
                                      chairLayout: undefined,
                                    })
                                  }
                                  className="mt-2 text-xs hover:underline"
                                  style={{ color: config.primaryColor }}
                                  type="button"
                                >
                                  Reset to default ({tableSpec.defaultChairLayout || 'all-sides'})
                                </button>
                              )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

            {decorItem && decorSpec && (
              <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Decor notes</label>
                  <textarea
                    value={decorItem.notes || ''}
                    onChange={(event) => onUpdateDecor(decorItem.id, { notes: event.target.value || undefined })}
                    rows={3}
                    placeholder="Setup, placement, or handling notes…"
                    className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#4A1942]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-gray-500">
                    Width scale
                    <input
                      type="number"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={decorItem.scaleX}
                      onChange={(event) => onUpdateDecor(decorItem.id, { scaleX: Math.max(0.1, Math.min(10, Number(event.target.value) || 0.1)) })}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs text-gray-500">
                    Height scale
                    <input
                      type="number"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={decorItem.scaleY}
                      onChange={(event) => onUpdateDecor(decorItem.id, { scaleY: Math.max(0.1, Math.min(10, Number(event.target.value) || 0.1)) })}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    <span>Opacity</span><span>{Math.round((decorItem.opacity ?? 1) * 100)}%</span>
                  </label>
                  <input type="range" min="0.1" max="1" step="0.05" value={decorItem.opacity ?? 1} onChange={(event) => onUpdateDecor(decorItem.id, { opacity: Number(event.target.value) })} className="w-full accent-[#4A1942]" />
                </div>
                <label className="block text-xs text-gray-500">
                  Layer order
                  <input type="number" step="1" value={decorItem.zIndex} onChange={(event) => onUpdateDecor(decorItem.id, { zIndex: Number.parseInt(event.target.value, 10) || 0 })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <p className="text-xs text-gray-400">Anchored to: <span className="font-medium capitalize">{decorItem.parentType}</span></p>
              </div>
            )}

            {/* Position */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Position
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">X (ft)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={item.x}
                    onChange={(e) => {
                      const newX = Number(e.target.value);
                      if (!Number.isFinite(newX)) return;
                      if (table) {
                        onUpdateTable(table.id, { x: newX });
                      } else if (fixture) {
                        onUpdateFixture(fixture.id, { x: newX });
                      } else if (decorItem) {
                        onUpdateDecor(decorItem.id, { x: newX });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500">Y (ft)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={item.y}
                    onChange={(e) => {
                      const newY = Number(e.target.value);
                      if (!Number.isFinite(newY)) return;
                      if (table) {
                        onUpdateTable(table.id, { y: newY });
                      } else if (fixture) {
                        onUpdateFixture(fixture.id, { y: newY });
                      } else if (decorItem) {
                        onUpdateDecor(decorItem.id, { y: newY });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Rotation */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Rotation: {item.rotation}°
              </label>
              <input
                type="range"
                min="0"
                max="360"
                value={item.rotation}
                onChange={(e) => {
                  const newRotation = parseInt(e.target.value);
                  if (table) {
                    onUpdateTable(table.id, { rotation: newRotation });
                  } else if (fixture) {
                    onUpdateFixture(fixture.id, { rotation: newRotation });
                  } else if (decorItem) {
                    onUpdateDecor(decorItem.id, { rotation: newRotation });
                  }
                }}
                className="w-full accent-[#4A1942]"
              />

              <div className="flex justify-between mt-2">
                {[0, 45, 90, 180, 270].map((angle) => (
                  <button
                    key={angle}
                    onClick={() => {
                      if (table) {
                        onUpdateTable(table.id, { rotation: angle });
                      } else if (fixture) {
                        onUpdateFixture(fixture.id, { rotation: angle });
                      } else if (decorItem) {
                        onUpdateDecor(decorItem.id, { rotation: angle });
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded ${
                      item.rotation === angle
                        ? 'bg-[#4A1942] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    type="button"
                  >
                    {angle}°
                  </button>
                ))}
              </div>
            </div>

            {/* Seating capacity (venue sets max seating; guests live in the couples portal) */}
            {table && tableSpec && (
              <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Configured seating
                </label>
                <div className="text-sm text-gray-700">
                  <span className="font-semibold text-2xl">{effectiveCapacity}</span>
                  <span className="text-gray-500 ml-1">seat{effectiveCapacity === 1 ? '' : 's'}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  This total follows the configured chair count. Guest assignments remain
                  with the couple in their portal.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => onDuplicateItem(item.id)}
                disabled={!spec}
                title={!spec ? 'Repair the missing catalog reference before duplicating' : undefined}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: `${config.primaryColor}1A`, color: config.primaryColor }}
                type="button"
              >
                📋 Duplicate
              </button>

              <button
                onClick={() => onRemoveItem(item.id)}
                className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm font-medium transition-colors border border-red-200"
                type="button"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard shortcuts */}
      <div className="p-3 bg-white border-t border-gray-200">
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Delete item</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">Del</kbd>
          </div>
          <div className="flex justify-between">
            <span>Duplicate</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">Ctrl+D</kbd>
          </div>
          <div className="flex justify-between">
            <span>Close panel</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">Esc</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
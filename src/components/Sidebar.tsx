import { useState, useEffect, useMemo, useRef } from 'react';
import type {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import {
  LayoutCategoryInfo,
  TableSpec,
  FixtureType,
  PlacedTable,
  PlacedFixture,
  User,
} from '../types';
import {
  getTableSpecs,
  getFixtureTypes,
  getGuidelines,
  getDecorArrangements,
  getDecorItems,
} from '../hooks/useLayoutState';
import { getChairSpecs } from '../data/venueData';
import { useBrandingConfig } from '../config';
import {
  canPlaceFixtureType,
  canSeeFixtureType,
  canUseTableSpec,
  isAdminUser,
} from '../utils/permissions';
import SafeImage from './SafeImage';
import { showToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { emit, on } from '../utils/appEvents';
import { inventoryState } from '../utils/inventoryUsage';
import { catalogFamilyIds, catalogFamilyInventory } from '../utils/catalogFamily';
import { configuredChairType, tableSeatCount } from '../utils/layoutSeating';

interface DragItem {
  type: 'table' | 'fixture' | 'arrangement';
  specId: string;
  isExterior?: boolean;
}

export interface SidebarProps {
  width: number;
  collapsed: boolean;
  onWidthChange: (width: number) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  gridSize: number;
  onGridSizeChange: (size: number) => void;
  gridContrast?: number;
  onGridContrastChange?: (contrast: number) => void;
  snapToGrid?: boolean;
  onSnapToGridChange?: (snap: boolean) => void;
  onDragStart: (
    type: 'table' | 'fixture' | 'arrangement',
    specId: string,
    isExterior?: boolean,
  ) => void;
  onDragEnd: () => void;
  onCancelPlacement?: () => void;
  currentDragItem: DragItem | null;
  keepAdding?: boolean;
  onKeepAddingChange?: (keepAdding: boolean) => void;
  onClearLayout: () => void;
  isAdmin: boolean;
  currentUser?: User | null;
  onViewImage: (url: string, title: string) => void;
  layoutCategories: LayoutCategoryInfo[];
  currentVenueCategory: string;
  venueWidth: number;
  venueHeight: number;
  canvasWidth?: number;
  canvasHeight?: number;
  onEditVenueGeometry?: () => void;
  onResetView: () => void;
  onResetToVenue?: () => void;
  onResetToCanvas?: () => void;
  placedTables: PlacedTable[];
  placedFixtures: PlacedFixture[];
  /* Newly added props for consolidated Layout Studio tools header */
  currentVenueName?: string;
  onShowDashboard?: () => void;
  onOpenVenueMap?: () => void;
  onShowLayoutsHome?: () => void;
  onSaveLayout?: () => void;
  onSaveMasterLayout?: () => void;
  onPrint?: () => void;
  onShowAdmin?: () => void;
  onOpenOperations?: () => void;
}

export function Sidebar({
  width,
  collapsed,
  onWidthChange,
  onCollapsedChange,
  zoom,
  onZoomChange,
  onDragStart,
  onDragEnd,
  onCancelPlacement,
  currentDragItem,
  keepAdding = false,
  onKeepAddingChange,
  onClearLayout,
  isAdmin,
  currentUser,
  onViewImage,
  currentVenueCategory,
  venueWidth,
  venueHeight,
  canvasWidth,
  canvasHeight,
  onEditVenueGeometry,
  onResetView,
  onResetToVenue,
  onResetToCanvas,
  placedTables,
  placedFixtures,
  showGrid,
  onShowGridChange,
  gridSize,
  onGridSizeChange,
  gridContrast,
  onGridContrastChange,
  snapToGrid,
  onSnapToGridChange,
  currentVenueName,
  onShowDashboard,
  onOpenVenueMap,
  onShowLayoutsHome,
  onSaveLayout,
  onSaveMasterLayout,
  onPrint,
  onShowAdmin,
  onOpenOperations,
}: SidebarProps) {
  const [tableSpecs, setTableSpecsLocal] = useState<TableSpec[]>(() => getTableSpecs());
  const [fixtureTypes, setFixtureTypesState] = useState<FixtureType[]>(() => getFixtureTypes());
  const [guidelines, setGuidelines] = useState(() => getGuidelines());
  const [isResizing, setIsResizing] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('tables');
  const [zoomInput, setZoomInput] = useState(String(Math.round(zoom * 100)));
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogSearchOpen, setCatalogSearchOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const config = useBrandingConfig();
  const normalizedCatalogSearch = catalogSearch.trim().toLowerCase();

  const matchesCatalogSearch = (value: string, extraValues: string[] = []) => {
    if (!normalizedCatalogSearch) return true;
    const haystack = [value, ...extraValues]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedCatalogSearch);
  };

  // Refresh data when app data changes
  useEffect(() => {
    const refresh = () => {
      setTableSpecsLocal(getTableSpecs());
      setFixtureTypesState(getFixtureTypes());
      setGuidelines(getGuidelines());
    };

    refresh();
    return on('spm_data_changed', refresh);
  }, []);

  useEffect(() => {
    setZoomInput(String(Math.round(zoom * 100)));
  }, [zoom]);

  useEffect(() => {
    if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
  }, [activeSection]);

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = Math.max(200, Math.min(450, e.clientX));
        onWidthChange(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  const handleZoomInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setZoomInput(e.target.value);
  };

  const handleZoomInputBlur = () => {
    const value = parseInt(zoomInput, 10);
    // Match the slider/buttons range (10%–300%); the numeric box previously
    // rejected 10–24% and 201–300%, which the slider could already reach.
    if (!Number.isNaN(value) && value >= 10 && value <= 300) {
      onZoomChange(value / 100);
    } else {
      setZoomInput(String(Math.round(zoom * 100)));
    }
  };

  const handleZoomInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleZoomInputBlur();
    }
  };

  const renderShapePreview = (shape: string, color: string, size: number = 32) => {
    const halfSize = size / 2;

    switch (shape) {
      case 'circle':
        return (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={halfSize}
              cy={halfSize}
              r={halfSize - 2}
              fill={color}
              stroke={config.primaryColor || '#4A1942'}
              strokeWidth="1"
            />
          </svg>
        );

      case 'oval':
        return (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <ellipse
              cx={halfSize}
              cy={halfSize}
              rx={halfSize - 2}
              ry={halfSize / 2 - 1}
              fill={color}
              stroke={config.primaryColor || '#4A1942'}
              strokeWidth="1"
            />
          </svg>
        );

      case 'semicircle':
        return (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <path
              d={`M 2 ${size - 2} A ${halfSize - 2} ${halfSize - 2} 0 0 1 ${
                size - 2
              } ${size - 2} Z`}
              fill={color}
              stroke={config.primaryColor || '#4A1942'}
              strokeWidth="1"
            />
          </svg>
        );

      case 'triangle':
        return (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <polygon
              points={`${halfSize},2 ${size - 2},${size - 2} 2,${size - 2}`}
              fill={color}
              stroke={config.primaryColor || '#4A1942'}
              strokeWidth="1"
            />
          </svg>
        );

      case 'hexagon': {
        const hx = size / 4;
        return (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <polygon
              points={`${hx},2 ${size - hx},2 ${size - 2},${halfSize} ${
                size - hx
              },${size - 2} ${hx},${size - 2} 2,${halfSize}`}
              fill={color}
              stroke={config.primaryColor || '#4A1942'}
              strokeWidth="1"
            />
          </svg>
        );
      }

      case 'octagon': {
        const ox = size / 3;
        return (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <polygon
              points={`${ox},2 ${size - ox},2 ${size - 2},${ox} ${size - 2},${
                size - ox
              } ${size - ox},${size - 2} ${ox},${size - 2} 2,${size - ox} 2,${ox}`}
              fill={color}
              stroke={config.primaryColor || '#4A1942'}
              strokeWidth="1"
            />
          </svg>
        );
      }

      default:
        return (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <rect
              x="2"
              y="2"
              width={size - 4}
              height={size - 4}
              fill={color}
              stroke={config.primaryColor || '#4A1942'}
              strokeWidth="1"
              rx="2"
            />
          </svg>
        );
    }
  };

  const visibleTables = tableSpecs.filter((t) => {
    const categoryAllowed =
      isAdminUser(currentUser) ||
      !t.venueCategories ||
      t.venueCategories.length === 0 ||
      t.venueCategories.includes(currentVenueCategory as any);

    return (
      !t.archived &&
      categoryAllowed &&
      canUseTableSpec(currentUser, t) &&
      matchesCatalogSearch(t.name, [t.shape, t.isSeatingType ? 'seating' : 'table'])
    );
  });

  const venueFixtures = fixtureTypes.filter((f) => {
    const isVenueFixture = f.category !== 'exterior' && f.category !== 'lodging';
    const categoryAllowed =
      isAdminUser(currentUser) ||
      !f.venueCategories ||
      f.venueCategories.length === 0 ||
      f.venueCategories.includes(currentVenueCategory as any);

    return (
      !f.archived &&
      isVenueFixture &&
      categoryAllowed &&
      canSeeFixtureType(currentUser, f) &&
      matchesCatalogSearch(f.name, [f.category || '', f.shape || '', f.icon || ''])
    );
  });

  // Distinguish "no catalog items configured" from "search/category filtered out"
  // so the empty state guides the right next action.
  const catalogHasNoTables = tableSpecs.every((spec) => spec.archived);
  const catalogHasNoVenueFixtures = fixtureTypes
    .filter((fixture) => !fixture.archived)
    .every((fixture) => fixture.category === 'exterior' || fixture.category === 'lodging');

  const lodgingFixtures = fixtureTypes.filter((f) =>
    !f.archived && f.category === 'lodging'
      && matchesCatalogSearch(f.name, [f.category || '', f.icon || '']),
  );
  const exteriorFixtures = fixtureTypes.filter((f) =>
    !f.archived && f.category === 'exterior'
      && matchesCatalogSearch(f.name, [f.category || '', f.icon || '']),
  );
  // Pre-compute chair usage for all items (optimization)
  const chairUsageMap = useMemo(() => {
    const usage: Record<string, number> = {};
  
    placedTables.forEach((table) => {
      const tableSpec = tableSpecs.find((candidate) => candidate.id === table.specId);
      const chairType = configuredChairType(table, tableSpec);
      const chairCount = tableSeatCount(table, tableSpec);
      // Hiding graphics is visual only; configured physical chairs still consume
      // inventory. Explicit zero and the No Chairs sentinel consume none.
      if (chairCount > 0 && chairType !== 'none') {
        usage[chairType] = (usage[chairType] || 0) + chairCount;
      }
    });
  
    return usage;
  }, [placedTables, tableSpecs]);

  if (collapsed) {
    return (
      <div
        className="w-12 h-full min-h-0 flex flex-col items-center py-4 shadow-lg"
        style={{ backgroundColor: config.primaryColor }}
      >
        <button
          onClick={() => onCollapsedChange(false)}
          className="p-2 hover:bg-white/20 rounded-lg text-white transition-colors"
          title="Expand sidebar"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 5l7 7-7 7M5 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    );
  }

  const renderItem = (
    item: {
      id: string;
      name: string;
      shape: string;
      width: number;
      height: number;
      capacity?: number;
      color?: string;
      imageUrl?: string;
      icon?: string;
      linenColor?: 'white' | 'black';
      inventoryCount?: number;
      isSeatingType?: boolean;
      seatingRowCount?: number;
      seatingRowSpacing?: number;
    },
    type: 'table' | 'fixture',
    isExterior?: boolean,
  ) => {
    const isSelected =
      currentDragItem?.specId === item.id && currentDragItem?.type === type;

    const isAllowedToPlace =
      type === 'table'
        ? canUseTableSpec(currentUser, item as TableSpec)
        : canPlaceFixtureType(currentUser, item as FixtureType);

    const catalog = type === 'table' ? tableSpecs : fixtureTypes;
    const familyIds = catalogFamilyIds(catalog as any[], item as any);
    const totalInventory = catalogFamilyInventory(catalog as any[], item as any);
    const usedCount = type === 'table'
      ? placedTables.filter((placed) => familyIds.has(placed.specId)).length
      : placedFixtures.filter((placed) =>
          familyIds.has(placed.specId)
            && (isExterior ? placed.isExterior : !placed.isExterior)).length;
    const { remaining: remainingInventory, outOfStock: isOutOfStock } = inventoryState(
      usedCount,
      totalInventory,
    );

    const chairCatalog = getChairSpecs();
    const chairUsageInfo = type === 'table'
      ? chairCatalog
          .filter((chair) => !chair.archived && chair.id !== 'none'
            && catalogFamilyInventory(chairCatalog, chair) !== undefined)
          .map((chair) => {
            const familyIdsForChair = catalogFamilyIds(chairCatalog, chair);
            const used = [...familyIdsForChair].reduce(
              (total, chairId) => total + (chairUsageMap[chairId] || 0),
              0,
            );
            const total = catalogFamilyInventory(chairCatalog, chair);
            return {
              chairId: chair.id,
              used,
              total,
              remaining: total !== undefined ? total - used : undefined,
            };
          })
      : [];

    const handleDragStartEvent = (e: DragEvent<HTMLDivElement>) => {
      if (!isAllowedToPlace) {
        e.preventDefault();
        showToast('You do not have permission to place this item.', 'warning');
        return;
      }

      if (isOutOfStock) {
        e.preventDefault();
        showToast(`"${item.name}" is out of inventory (${usedCount}/${totalInventory} used).`, 'warning');
        return;
      }

      const dragData = JSON.stringify({ type, specId: item.id, isExterior });
      e.dataTransfer.setData('application/json', dragData);
      e.dataTransfer.setData('text/plain', dragData);
      e.dataTransfer.effectAllowed = 'copy';

      onDragStart(type, item.id, isExterior);
    };

    const handleDragEndEvent = () => {
      onDragEnd();
    };

    const handleClick = () => {
      if (!isAllowedToPlace) {
        showToast('You do not have permission to place this item.', 'warning');
        return;
      }

      if (isOutOfStock) {
        showToast(`"${item.name}" is out of inventory (${usedCount}/${totalInventory} used).`, 'warning');
        return;
      }

      if (currentDragItem?.specId === item.id && currentDragItem?.type === type) {
        (onCancelPlacement || onDragEnd)();
      } else {
        onDragStart(type, item.id, isExterior);
      }
    };

    return (
      <div
        key={item.id}
        draggable={!isOutOfStock && isAllowedToPlace}
        onDragStart={handleDragStartEvent}
        onDragEnd={handleDragEndEvent}
        onClick={handleClick}
        className={`p-3 rounded-lg transition-all border ${
          isOutOfStock
            ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-60'
            : isSelected
              ? 'bg-green-50 border-green-400 ring-2 ring-green-300 shadow-md cursor-grab'
              : 'bg-white hover:bg-gray-50 border-gray-200 hover:shadow-sm cursor-grab active:cursor-grabbing'
        }`}
        style={{
          borderColor: isSelected ? '#22c55e' : undefined,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 44, height: 44 }}>
            {type === 'fixture' && item.icon ? (
              <span className="text-3xl">{item.icon}</span>
            ) : (
              renderShapePreview(item.shape, item.color || '#e5e7eb', 44)
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate flex items-center gap-1.5">
              <span className="truncate">{item.name}</span>
              {type === 'table' && item.isSeatingType && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-semibold">
                  Seating
                </span>
              )}
            </div>

            <div className="text-xs text-gray-500">
              {type === 'table' && item.isSeatingType ? (
                <span>
                  {(item.seatingRowCount || 1)} rows • {(item.seatingRowSpacing || 3)}ft spacing
                </span>
              ) : (
                <span>
                  {item.width}' × {item.height}'
                </span>
              )}

              {type === 'table' && item.capacity !== undefined && (
                <span
                  className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: `${config.primaryColor || '#4A1942'}1A`,
                    color: config.primaryColor || '#4A1942',
                  }}
                >
                  {item.capacity === 0 ? 'Standing · 0 seats' : (
                    <>
                      🪑{' '}
                      {item.isSeatingType
                        ? item.capacity * Math.max(1, item.seatingRowCount || 1)
                        : item.capacity}
                    </>
                  )}
                </span>
              )}
            </div>

            {totalInventory !== undefined && (
              <div
                className={`text-xs mt-1 font-medium ${
                  isOutOfStock
                    ? 'text-red-600'
                    : remainingInventory !== undefined && remainingInventory <= 3
                      ? 'text-orange-600'
                      : 'text-green-600'
                }`}
              >
                📦 {isOutOfStock ? 'Out of Stock' : `${remainingInventory} left`}
                <span className="text-gray-400 font-normal ml-1">
                  ({usedCount}/{totalInventory})
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleClick();
              }}
              aria-pressed={isSelected}
              disabled={isOutOfStock || !isAllowedToPlace}
              aria-label={`${isSelected ? 'Cancel placement of' : 'Place'} ${item.name}`}
              title={!isAllowedToPlace ? 'You do not have permission to place this item' : isOutOfStock ? 'Out of inventory' : undefined}
              className={`rounded px-2 py-1 text-[10px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50 ${isSelected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700 hover:bg-purple-100 hover:text-purple-800'}`}
            >
              {isSelected ? 'Cancel' : 'Place'}
            </button>
            {item.imageUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewImage(item.imageUrl!, item.name);
                }}
                className="p-1 hover:bg-gray-100 rounded text-xs"
                title="View image"
                type="button"
              >
                📷
              </button>
            )}

            {isSelected && <span className="text-green-500 text-lg">✓</span>}
            {isOutOfStock && <span className="text-red-500 text-lg">⛔</span>}
          </div>
        </div>

        {type === 'table' &&
          chairUsageInfo.some((c) => c.remaining !== undefined && c.remaining <= 5) && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <div className="text-xs text-orange-600 font-medium">⚠️ Chair Inventory:</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {chairUsageInfo
                  .filter((c) => c.total !== undefined)
                  .map((c) => {
                    const spec = getChairSpecs().find((cs) => cs.id === c.chairId);
                    const isLow = c.remaining !== undefined && c.remaining <= 5;

                    return (
                      <span
                        key={c.chairId}
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          isLow ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {spec?.icon || '🪑'} {c.remaining}/{c.total}
                      </span>
                    );
                  })}
              </div>
            </div>
          )}
      </div>
    );
  };

  const sections = [
    { id: 'tables', label: 'Tables/Seating', icon: '🪑' },
    { id: 'fixtures', label: 'Venue Items', icon: '🏛️' },
    { id: 'decor', label: 'Decor Designs', icon: '🎀' },
    ...(isAdmin ? [{ id: 'lodging', label: 'Lodging Items', icon: '🛏️' }] : []),
    ...(isAdmin ? [{ id: 'exterior', label: 'Arch/Landscape Items', icon: '🌳' }] : []),
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'tips', label: 'Tips', icon: '💡' },
  ];
  const showCatalogSearch = ['tables', 'fixtures', 'decor', 'lodging', 'exterior'].includes(activeSection);
  const sectionSearchPlaceholder: Record<string, string> = {
    tables: 'Find a table or seating style',
    fixtures: 'Find a venue fixture',
    decor: 'Find a saved design',
    lodging: 'Find a lodging fixture',
    exterior: 'Find an exterior feature',
  };
  const activeDecorItemIds = new Set(getDecorItems()
    .filter((item) => !item.archived)
    .map((item) => item.id));
  const activeBaseSpecIds = new Set([
    ...tableSpecs.filter((item) => !item.archived).map((item) => item.id),
    ...fixtureTypes.filter((item) => !item.archived).map((item) => item.id),
  ]);
  const availableDecorArrangements = getDecorArrangements().filter((arrangement) =>
    (!arrangement.baseSpecId || activeBaseSpecIds.has(arrangement.baseSpecId))
      && arrangement.items.every((item) => activeDecorItemIds.has(item.decorItemId)),
  );
  const matchingDecorArrangements = availableDecorArrangements.filter((arr) =>
    matchesCatalogSearch(arr.name, [arr.baseType, String(arr.items.length)]),
  );

  return (
    <div
      className="h-full min-h-0 overflow-hidden flex flex-col shadow-xl relative select-none"
      style={{ width, backgroundColor: '#f3f4f6' }}
    >
      {/* Header */}
      <div
        className="p-3 text-white flex items-center justify-between shadow-sm shrink-0"
        style={{
          background: `linear-gradient(to right, ${config.primaryColor}, ${
            config.primaryDark || config.primaryColor
          })`,
        }}
      >
        <h2 className="font-bold text-sm">Layout Tools</h2>
        <button
          onClick={() => onCollapsedChange(true)}
          className="p-1.5 hover:bg-white/20 rounded transition-colors"
          title="Collapse sidebar"
          type="button"
        >
          ◀
        </button>
      </div>

      {/* Mobile instruction */}
      <div className="p-2 bg-blue-50 text-blue-700 text-xs border-b md:hidden">
        <span className="font-medium">📱 Tap</span> an item, then <span className="font-medium">tap</span> on the canvas to place it
      </div>

      {/* Desktop instruction */}
      <div className="p-2 bg-green-50 text-green-700 text-xs border-b hidden md:block">
        <span className="font-medium">🖱️ Drag</span> an item to the canvas, or <span className="font-medium">click</span> to select then click on canvas
      </div>

      {/* Section tabs — always show each section's name */}
      <div className="shrink-0 bg-white border-b border-gray-300 p-2 flex flex-wrap gap-1.5">
        {sections.map((section) => {
          const active = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                active
                  ? 'btn-primary bg-[#4A1942] text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={active ? { backgroundColor: config.primaryColor || '#4A1942' } : undefined}
              aria-pressed={active}
              title={section.label}
              type="button"
            >
              <span className="text-sm leading-none">{section.icon}</span>
              <span>{section.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div
        ref={contentScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain mr-2 p-3 space-y-3"
        role="region"
        aria-label={`${sections.find((section) => section.id === activeSection)?.label || 'Layout'} tools`}
        tabIndex={0}
      >
        {currentDragItem && (
          <div className="rounded-xl border border-purple-300 bg-purple-50 p-3 shadow-sm" role="status">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-purple-900">Placement mode active</div>
                <p className="mt-1 text-[11px] text-purple-700">
                  {currentDragItem.type === 'arrangement'
                    ? 'Click a compatible base to apply this design.'
                    : `Click the canvas to place ${keepAdding ? 'items until you cancel' : 'one item'}.`}{' '}
                  Escape cancels.
                </p>
              </div>
              <button type="button" onClick={onCancelPlacement || onDragEnd} className="rounded p-1 text-purple-700 hover:bg-purple-100" aria-label="Cancel placement">✕</button>
            </div>
            {onKeepAddingChange && (
              <label className="mt-3 flex items-center gap-2 text-xs font-medium text-purple-900">
                <input type="checkbox" checked={keepAdding} onChange={(event) => onKeepAddingChange(event.target.checked)} className="h-4 w-4 accent-purple-700" />
                Keep adding after each successful placement
              </label>
            )}
          </div>
        )}

        {showCatalogSearch && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setCatalogSearchOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
              aria-expanded={catalogSearchOpen}
              aria-controls="sidebar-catalog-search"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                <span>🔍</span> Quick find
              </span>
              <span className="text-gray-400 transition-transform" style={{ transform: catalogSearchOpen ? 'rotate(180deg)' : undefined }}>▾</span>
            </button>
            {catalogSearchOpen && (
              <div className="px-3 pb-3 pt-0 border-t border-gray-100">
                <input
                  id="sidebar-catalog-search"
                  type="search"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder={sectionSearchPlaceholder[activeSection] || 'Search this section'}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1942]/20 focus:border-[#4A1942]"
                />
                {catalogSearch && (
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                    <span>Showing matches for “{catalogSearch}”</span>
                    <button
                      type="button"
                      onClick={() => setCatalogSearch('')}
                      className="hover:underline font-semibold"
                      style={{ color: config.primaryColor || '#4A1942' }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeSection === 'tables' && (
          <>
            <p className="text-xs text-gray-500 mb-2">
              Drag tables or seating arrangements to the canvas, or click to select
            </p>

            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">
                Table Types
              </div>
              {visibleTables
                .filter((spec) => !spec.isSeatingType)
                .map((spec) => renderItem(spec, 'table'))}
            </div>

            {visibleTables.some((spec) => spec.isSeatingType) && (
              <div className="space-y-2 mt-3">
                <div className="text-[11px] uppercase tracking-wide font-semibold text-purple-600">
                  Seating Types
                </div>
                {visibleTables
                  .filter((spec) => spec.isSeatingType)
                  .map((spec) => renderItem(spec, 'table'))}
              </div>
            )}

            {visibleTables.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                {catalogHasNoTables
                  ? (isAdmin ? 'No table types yet. Add them in the Admin Panel → Tables/Seating.' : 'No table types have been configured yet. Please check back later.')
                  : 'No tables or seating styles match this search.'}
              </div>
            )}
          </>
        )}

        {activeSection === 'fixtures' && (
          <>
            <p className="text-xs text-gray-500 mb-2">Venue fixtures &amp; areas</p>
            {venueFixtures.map((fixture) => renderItem(fixture, 'fixture'))}
            {venueFixtures.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                {catalogHasNoVenueFixtures
                  ? (isAdmin ? 'No fixtures yet. Add them in the Admin Panel → Fixtures.' : 'No fixtures have been configured yet. Please check back later.')
                  : 'No venue fixtures match this search.'}
              </div>
            )}
          </>
        )}

        {activeSection === 'decor' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Decor Arrangements
                </h3>
                <button
                  onClick={() =>
                    emit('spm_open_decor_designer')
                  }
                  className="btn-primary text-[10px] bg-[#4A1942] text-white px-3 py-1.5 rounded-lg font-bold hover:bg-[#3b1435] transition-all active:scale-95 shadow-sm flex items-center gap-1"
                  style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                  type="button"
                >
                  <span>✨</span>
                  <span>OPEN DESIGNER</span>
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] text-gray-500 italic px-1">
                  Drag a saved design onto a compatible base, or click it and then click the base.
                </p>

                {availableDecorArrangements.length === 0 ? (
                  <div className="text-center py-10 bg-white/50 border-2 border-dashed border-gray-200 rounded-2xl px-4 mx-1">
                    <div className="text-3xl mb-2 opacity-50">🎀</div>
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                      No designs saved yet
                    </p>
                    <button
                      onClick={() =>
                        emit('spm_open_decor_designer')
                      }
                      className="mt-3 bg-purple-50 text-purple-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-purple-100 transition-colors"
                      type="button"
                    >
                      Start Designing →
                    </button>
                  </div>
                ) : matchingDecorArrangements.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500 mx-1">
                    No saved designs match this search.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 px-1">
                    {matchingDecorArrangements.map((arr) => (
                      <div
                        key={arr.id}
                        draggable
                        role="button"
                        tabIndex={0}
                        aria-pressed={currentDragItem?.type === 'arrangement' && currentDragItem.specId === arr.id}
                        aria-label={`Place saved design ${arr.name}`}
                        onDragStart={(e) => {
                          const dragData = JSON.stringify({
                            type: 'arrangement',
                            specId: arr.id,
                          });
                          e.dataTransfer.setData('application/json', dragData);
                          e.dataTransfer.setData('text/plain', dragData);
                          e.dataTransfer.effectAllowed = 'copy';
                          onDragStart('arrangement', arr.id);
                        }}
                        onDragEnd={onDragEnd}
                        onClick={() => {
                          if (currentDragItem?.type === 'arrangement' && currentDragItem.specId === arr.id) {
                            (onCancelPlacement || onDragEnd)();
                          } else {
                            onDragStart('arrangement', arr.id);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          if (currentDragItem?.type === 'arrangement' && currentDragItem.specId === arr.id) {
                            (onCancelPlacement || onDragEnd)();
                          } else {
                            onDragStart('arrangement', arr.id);
                          }
                        }}
                        className={`group rounded-2xl p-3 shadow-sm transition-all cursor-grab active:cursor-grabbing flex items-center gap-4 relative overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${currentDragItem?.type === 'arrangement' && currentDragItem.specId === arr.id ? 'border-2 border-purple-500 bg-purple-50' : 'border border-gray-200 bg-white hover:border-[#4A1942] hover:shadow-xl'}`}
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#4A1942] opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: config.primaryColor || '#4A1942' }} />
                        <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform overflow-hidden border border-gray-100">
                          {(() => {
                            const catalog = getDecorItems();
                            const firstItem = arr.items[0];
                            const decorSpec = catalog.find(
                              (s: any) => s.id === firstItem?.decorItemId,
                            );

                            if (decorSpec?.images?.[0]?.url) {
			      return (
  				<SafeImage
    				  src={decorSpec.images[0].url}
    				  alt={decorSpec.name || 'Decor preview'}
    				  className="w-full h-full object-cover"
    				  fallback={
      				    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-[10px] text-gray-400">
        			      Broken image
      				    </div>
    				  }
  				/>
			      );
                            }

                            return (
                              <span>
                                {arr.baseType === 'table'
                                  ? '🍽️'
                                  : arr.baseType === 'arch'
                                    ? '⛩️'
                                    : '🎀'}
                              </span>
                            );
                          })()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-black text-gray-900 uppercase tracking-tight truncate">
                            {arr.name}
                          </div>
                          <div className="text-[9px] text-gray-400 font-bold uppercase mt-0.5 flex items-center gap-2">
                            <span>{arr.items.length} ITEMS</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span>{arr.baseType}</span>
                          </div>
                        </div>

                        <div className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity font-black text-sm">
                          ⠿
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSection === 'lodging' && isAdmin && (
          <>
            <p className="text-xs text-gray-500 mb-2">
              Lodging &amp; Utilities fixtures (Admin only)
            </p>
            {lodgingFixtures.map((fixture) => renderItem(fixture, 'fixture'))}
            {lodgingFixtures.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                No lodging fixtures match this search.
              </div>
            )}
          </>
        )}

        {activeSection === 'exterior' && isAdmin && (
          <>
            <p className="text-xs text-gray-500 mb-2">
              Architectural/Landscape features (Admin only)
            </p>
            {exteriorFixtures.map((fixture) => renderItem(fixture, 'fixture', true))}
            {exteriorFixtures.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                No exterior features match this search.
              </div>
            )}
          </>
        )}

        {activeSection === 'settings' && (
          <div className="space-y-4">
            {/* Workspace Snapshot */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Workspace Snapshot
                  </p>
                  <h3 className="text-sm font-semibold text-gray-800 mt-1">
                    {venueWidth}' × {venueHeight}' {currentVenueCategory} layout
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => emit('spm_open_workspace_help')}
                  className="text-xs font-medium hover:underline"
                  style={{ color: config.primaryColor || '#4A1942' }}
                >
                  Keyboard help
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="rounded-lg bg-gray-50 px-2 py-2">
                  <div className="text-base font-bold text-gray-900">{placedTables.length}</div>
                  <div className="text-[11px] text-gray-500">Tables</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-2 py-2">
                  <div className="text-base font-bold text-gray-900">{placedFixtures.length}</div>
                  <div className="text-[11px] text-gray-500">Fixtures</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-2 py-2">
                  <div className="text-base font-bold text-gray-900">{Math.round(zoom * 100)}%</div>
                  <div className="text-[11px] text-gray-500">Zoom</div>
                </div>
              </div>
            </div>

            {/* Grid & Snap controls */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Grid &amp; Snap
              </p>
              <div className="mt-2 space-y-2">
                <label className="flex items-center justify-between gap-3 text-sm text-gray-700 cursor-pointer">
                  <span>Show grid</span>
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => onShowGridChange(e.target.checked)}
                    className="w-4 h-4 accent-[#4A1942]"
                    style={{ accentColor: config.primaryColor || '#4A1942' }}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-gray-700 cursor-pointer">
                  <span>Snap to grid</span>
                  <input
                    type="checkbox"
                    checked={snapToGrid}
                    onChange={(e) => onSnapToGridChange?.(e.target.checked)}
                    className="w-4 h-4 accent-[#4A1942]"
                    style={{ accentColor: config.primaryColor || '#4A1942' }}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                  <span>Grid size</span>
                  <select
                    value={gridSize}
                    onChange={(e) => onGridSizeChange(Number(e.target.value))}
                    className="px-2 py-1 border border-gray-300 rounded-lg text-sm"
                  >
                    {[1, 2, 5, 10, 20].map((size) => (
                      <option key={size} value={size}>{size} ft</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                  <span>Grid contrast</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={gridContrast}
                    onChange={(e) => onGridContrastChange?.(Number(e.target.value))}
                    className="w-28 accent-[#4A1942]"
                    style={{ accentColor: config.primaryColor || '#4A1942' }}
                  />
                </label>
              </div>
            </div>

            {onEditVenueGeometry && (
              <div className="bg-white rounded-lg p-3 border border-purple-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-800">🏛️ Venue & Canvas Geometry</div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {venueWidth}' × {venueHeight}' footprint
                      {canvasWidth && canvasHeight ? ` · ${canvasWidth}' × ${canvasHeight}' canvas` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-purple-100 px-2 py-1 text-[10px] font-bold text-purple-700">DRAFT + APPLY</span>
                </div>
                <button
                  type="button"
                  onClick={onEditVenueGeometry}
                  className="mt-3 w-full rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-800 hover:bg-purple-100"
                >
                  Edit geometry & review impact
                </button>
              </div>
            )}

            {/* Zoom controls */}
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                🔍 Zoom Level
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-gray-300 hover:bg-gray-100 font-bold text-xl transition-colors"
                  title="Zoom Out (−10%)"
                  type="button"
                >
                  −
                </button>

                <input
                  type="range"
                  min="10"
                  max="300"
                  value={zoom * 100}
                  onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
                  className="flex-1 accent-current h-2"
                  style={{ accentColor: config.primaryColor }}
                />

                <button
                  onClick={() => onZoomChange(Math.min(3, zoom + 0.1))}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-gray-300 hover:bg-gray-100 font-bold text-xl transition-colors"
                  title="Zoom In (+10%)"
                  type="button"
                >
                  +
                </button>
              </div>

              <div className="flex items-center justify-center mt-3 gap-2">
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={zoomInput}
                  onChange={handleZoomInputChange}
                  onBlur={handleZoomInputBlur}
                  onKeyDown={handleZoomInputKeyDown}
                  className="w-20 text-center border-2 rounded-lg px-2 py-1.5 text-sm font-semibold"
                />
                <span className="text-sm text-gray-500 font-medium">%</span>
              </div>

              <div className="flex flex-wrap gap-1 mt-3 justify-center">
                {[25, 50, 75, 100, 150, 200].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => onZoomChange(pct / 100)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      Math.round(zoom * 100) === pct
                        ? 'text-white font-semibold'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                    style={{
                      backgroundColor:
                        Math.round(zoom * 100) === pct
                          ? config.primaryColor
                          : undefined,
                    }}
                    type="button"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Reset View Controls */}
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                🎯 Reset View
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onResetToVenue || onResetView}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-white text-sm font-medium transition-colors hover:opacity-90"
                  style={{ backgroundColor: config.primaryColor }}
                  title="Fit the venue to the screen (Ctrl+1)"
                  type="button"
                >
                  <span>🏛️</span>
                  <span>Venue</span>
                </button>

                <button
                  onClick={onResetToCanvas || onResetView}
                  className="flex items-center justify-center gap-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white text-sm font-medium transition-colors"
                  title="Fit the entire canvas to the screen (Ctrl+0)"
                  type="button"
                >
                  <span>📐</span>
                  <span>Canvas</span>
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-2 text-center">
                Venue: {venueWidth}' × {venueHeight}'{' '}
                {canvasWidth && canvasHeight
                  ? `• Canvas: ${canvasWidth}' × ${canvasHeight}'`
                  : ''}
              </p>
            </div>

            {/* Clear layout */}
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors"
                type="button"
              >
                🗑️ Clear All Items
              </button>
            </div>
          </div>
        )}

        {activeSection === 'tips' && (
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="font-semibold text-sm text-gray-800">💡 Quick Tips</h4>
                <button
                  type="button"
                  onClick={() => emit('spm_open_workspace_help')}
                  className="text-[11px] hover:underline font-semibold"
                  style={{ color: config.primaryColor || '#4A1942' }}
                >
                  Open shortcut guide
                </button>
              </div>
              <ul className="text-xs text-gray-600 space-y-1.5">
                <li>• <strong>Drag</strong> items from sidebar to canvas</li>
                <li>• <strong>Click</strong> to select, then click on canvas</li>
                <li>• <strong>Use Quick find</strong> to jump to any table, fixture, or design</li>
                <li>• <strong>Shift + Drag</strong> to pan the view</li>
                <li>• <strong>Delete</strong> key removes selected item</li>
                <li>• <strong>Ctrl/Cmd + D</strong> duplicates item</li>
                <li>• <strong>P</strong> toggles properties panel</li>
                <li>• <strong>?</strong> opens the full workspace shortcut guide</li>
              </ul>
            </div>

            {guidelines.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <h4 className="font-semibold text-sm text-gray-800 mb-2">📏 Layout Guidelines</h4>
                <ul className="text-xs text-gray-600 space-y-1.5">
                  {guidelines
                    .filter((g) => g.enabled !== false)
                    .map((g) => (
                      <li key={g.id}>
                        • <strong>{g.title}:</strong> {g.description}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        role="separator"
        aria-label="Resize Layout Tools"
        aria-orientation="vertical"
        aria-valuemin={200}
        aria-valuemax={450}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-gray-400/30 focus:bg-purple-300/60 focus:outline-none transition-colors"
        onMouseDown={handleMouseDown as (e: ReactMouseEvent<HTMLDivElement>) => void}
        onDoubleClick={() => onWidthChange(280)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 25 : 10;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            onWidthChange(Math.max(200, width - step));
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            onWidthChange(Math.min(450, width + step));
          } else if (event.key === 'Home') {
            event.preventDefault();
            onWidthChange(200);
          } else if (event.key === 'End') {
            event.preventDefault();
            onWidthChange(450);
          }
        }}
      />

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear all items"
        message="Remove every table, seating group, fixture, and decor item from this layout? You can restore the cleared layout with Undo."
        confirmLabel="Clear All"
        tone="danger"
        onConfirm={() => {
          onClearLayout();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
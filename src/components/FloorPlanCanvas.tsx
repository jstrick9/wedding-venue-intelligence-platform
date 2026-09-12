import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Venue, PlacedTable, PlacedFixture, Guest, CeremonyChairRow, RectangularChairLayout, PlacedDecor, DecorArrangement, LayoutReviewPin } from '../types';
import { getTableSpecs, getFixtureTypes, getLinenColors, getDecorArrangements, getDecorItems } from '../hooks/useLayoutState';
import { getChairSpecs, getSpacingSettings } from '../data/venueData';
import { useBrandingConfig } from '../config';
import { on } from '../utils/appEvents';
import {
  configuredChairCount,
  layoutSeatCount,
  seatingGroupGeometry,
  shouldRenderChairGraphics,
  tableSeatCount,
} from '../utils/layoutSeating';
import { effectiveCanvasGeometry, venueShapePolygon } from '../utils/venueGeometry';
import { ceremonyChairPlacements } from '../utils/ceremonyRowGeometry';

interface Position {
  x: number;
  y: number;
}

export interface FloorPlanCanvasProps {
  venue: Venue;
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  decor: PlacedDecor[];
  guests: Guest[];
  arrangements?: DecorArrangement[];
  ceremonyRows?: CeremonyChairRow[];
  reviewPins?: LayoutReviewPin[];
  onSelectReviewPin?: (pinId: string) => void;
  selectedId: string | null;
  zoom: number;
  showGrid: boolean;
  gridSize: number;
  gridContrast?: number;
  onSelect: (id: string | null) => void;
  onDoubleClick: (id: string) => void;
  onMove: (id: string, position: Position, isExterior?: boolean, exact?: boolean) => void;
  onDrop: (position: Position, isExterior?: boolean) => void;
  onClickToPlace: (position: Position, isExterior?: boolean) => void;
  isDragging: boolean;
  isDraggingExterior?: boolean;
  isAdmin: boolean;
  /** Venue workspaces show configured seats; couple/assignment workspaces retain assigned/available counts. */
  capacityMode?: 'venue' | 'assignments' | 'hidden';
  onViewImage: (url: string, title: string) => void;
  panOffset: { x: number; y: number };
  onPanChange: (offset: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  /** Called once when the user begins dragging an item or presses an arrow key
   *  to nudge one, so the caller can push a single undo snapshot per gesture. */
  onDragStart?: () => void;
  containerRef?: React.RefObject<HTMLDivElement>;
  /** Forwards the internal <svg> element (used for PNG/PDF layout export). */
  svgRef?: React.RefObject<SVGSVGElement | null>;
  onMoveVenueFeature?: (featureType: 'indoor' | 'outdoor', featureId: string, position: Position) => void;
}

export function FloorPlanCanvas({
  venue,
  tables,
  fixtures,
  decor = [],
  guests = [],
  arrangements: propArrangements,
  ceremonyRows = [],
  reviewPins = [],
  onSelectReviewPin,
  selectedId,
  zoom,
  showGrid,
  gridSize,
  gridContrast = 0.45,
  onSelect,
  onDoubleClick,
  onMove,
  onDrop,
  onClickToPlace,
  isDragging,
  isDraggingExterior = false,
  capacityMode = 'assignments',
  onViewImage,
  panOffset,
  onPanChange,
  onZoomChange,
  onDragStart,
  containerRef: externalContainerRef,
  svgRef: externalSvgRef,
}: FloorPlanCanvasProps) {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const svgRef = useRef<SVGSVGElement>(null);

  // Keep both the internal ref and any forwarded ref pointing at the <svg>.
  const setSvgRef = useCallback(
    (node: SVGSVGElement | null) => {
      svgRef.current = node;
      if (externalSvgRef) externalSvgRef.current = node;
    },
    [externalSvgRef],
  );
  // Tracks whether the current item drag has actually moved (so an undo
  // snapshot is pushed once per real drag, not on click-to-select).
  const dragMovedRef = useRef(false);
  const [dragState, setDragState] = useState<{ id: string; startX: number; startY: number; itemX: number; itemY: number; isExterior: boolean } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  // Two-finger pinch-to-zoom: tracks the two active pointers and zooms about the
  // midpoint between them (anchored to the point under the fingers).
  const [pinch, setPinch] = useState<{ id1: number; id2: number; startDist: number; startZoom: number; startMidX: number; startMidY: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  
  const tableSpecs = getTableSpecs();
  const fixtureTypes = getFixtureTypes();
  const linenColors = getLinenColors();
  const arrangements = propArrangements || getDecorArrangements();
  const config = useBrandingConfig();

  const [showOnboardingHint, setShowOnboardingHint] = useState<boolean>(() => {
    try {
      return localStorage.getItem('spm_studio_onboarding_seen') !== 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!showOnboardingHint) return;
    const timer = setTimeout(() => {
      setShowOnboardingHint(false);
      try {
        localStorage.setItem('spm_studio_onboarding_seen', 'true');
      } catch {
        // ignore
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [showOnboardingHint]);

  useEffect(() => {
    if ((tables.length > 0 || fixtures.length > 0 || decor.length > 0) && showOnboardingHint) {
      setShowOnboardingHint(false);
      try {
        localStorage.setItem('spm_studio_onboarding_seen', 'true');
      } catch {
        // ignore
      }
    }
  }, [tables.length, fixtures.length, decor.length, showOnboardingHint]);

  const scale = 8; // pixels per foot
  const effectiveCanvas = effectiveCanvasGeometry(venue);
  const canvasWidth = effectiveCanvas.canvasWidth * scale;
  const canvasHeight = effectiveCanvas.canvasHeight * scale;
  const venueX = effectiveCanvas.venueX * scale;
  const venueY = effectiveCanvas.venueY * scale;
  const venueWidth = venue.width * scale;
  const venueHeight = venue.height * scale;

  // One canonical outline drives both rendering and collision validation.
  const venueBoundaryPoints = useMemo(
    () => venueShapePolygon(venue).map((point) => ({
      x: venueX + point.x * scale,
      y: venueY + point.y * scale,
    })),
    [venue, venueX, venueY, scale],
  );
  const venueBoundaryString = venueBoundaryPoints
    .map((point) => `${point.x},${point.y}`)
    .join(' ');

  const getLinenColorInfo = useCallback((colorId?: string) => {
    const defaultColor = { id: 'white', name: 'White', hex: '#FFFFFF', textColor: '#374151' };
    if (!colorId) return defaultColor;
    const found = linenColors.find(c => c.id === colorId);
    return found || defaultColor;
  }, [linenColors]);

  const chairSpecs = getChairSpecs();
  const decorCatalog = getDecorItems();
  const [localArrangements, setLocalArrangements] = useState<any[]>(() => {
	try {
	  const raw = localStorage.getItem('spm_decor_arrangements');
      return raw ? JSON.parse(raw) : [];
	} catch {
      return [];
	}
  });

  const decorArrangements = propArrangements || localArrangements;

  // Update when storage changes
  useEffect(() => {
	const handleChange = () => {
	  try {
        const raw = localStorage.getItem('spm_decor_arrangements');
        setLocalArrangements(raw ? JSON.parse(raw) : []);
	  } catch {
		setLocalArrangements([]);
      }
    };
    return on('spm_data_changed', handleChange);
  }, []);
  void getSpacingSettings();

  // Render applied arrangement helper
  const renderAppliedArrangement = (arrangementId: string, centerX: number, centerY: number) => {
    const arrangement = decorArrangements.find(a => a.id === arrangementId);
    if (!arrangement) return null;

    // 12 pixels per inch in designer, 8 pixels per foot in layout
    // ratio = (8/12) / 12 = 0.666 / 12 ... wait.
    // In designer: 1 inch = 12 pixels.
    // In layout: 1 foot = 8 pixels => 1 inch = 8/12 = 0.666 pixels.
    // So relative coords in inches need to be multiplied by (8/12).
    const designScale = 8 / 12; 

    return [...arrangement.items]
      .sort((a: any, b: any) => (Number.isFinite(a.zIndex) ? a.zIndex : 0) - (Number.isFinite(b.zIndex) ? b.zIndex : 0))
      .map((item: any, idx: number) => {
      const spec = decorCatalog.find(s => s.id === item.decorItemId);
      if (!spec) return null;

      const scaleX = Math.abs(Number.isFinite(item.scaleX) ? item.scaleX : 1);
      const scaleY = Math.abs(Number.isFinite(item.scaleY) ? item.scaleY : 1);
      const itemX = Number.isFinite(item.x) ? item.x : 0;
      const itemY = Number.isFinite(item.y) ? item.y : 0;
      const rotation = Number.isFinite(item.rotation) ? item.rotation : 0;
      const w = (spec.width * 12 + (spec.widthInches || 0)) * scaleX * designScale;
      const h = (spec.height * 12 + (spec.heightInches || 0)) * scaleY * designScale;
      
      const ix = centerX + itemX * designScale - w / 2;
      const iy = centerY + itemY * designScale - h / 2;

      return (
        <g key={`${arrangementId}-${idx}`} transform={`rotate(${rotation}, ${ix + w/2}, ${iy + h/2})`}>
          {spec.imageUrl || (spec.images && spec.images.length > 0) ? (
            <image href={spec.imageUrl || spec.images?.[0]?.url} x={ix} y={iy} width={w} height={h} />
          ) : (
            <rect x={ix} y={iy} width={w} height={h} fill={spec.color || '#ddd'} stroke={config.primaryColor || '#4A1942'} strokeWidth="0.5" rx="1" />
          )}
        </g>
      );
    });
  };

  // Render decor item helper
  const renderDecor = (d: PlacedDecor) => {
    const spec = decorCatalog.find(item => item.id === d.decorItemId);
    if (!spec) return null;

    const x = d.parentType === 'canvas' ? d.x * scale : venueX + d.x * scale;
    const y = d.parentType === 'canvas' ? d.y * scale : venueY + d.y * scale;
    const scaleX = Math.abs(Number.isFinite(d.scaleX) ? d.scaleX : 1);
    const scaleY = Math.abs(Number.isFinite(d.scaleY) ? d.scaleY : 1);
    const w = (spec.width * 12 + (spec.widthInches || 0)) / 12 * scale * scaleX;
    const h = (spec.height * 12 + (spec.heightInches || 0)) / 12 * scale * scaleY;
    const rotation = Number.isFinite(d.rotation) ? d.rotation : 0;
    const isSelected = selectedId === d.id;

    // Use image if available, fallback to icon/color
    return (
      <g
        key={d.id}
        className="cursor-move"
        transform={`rotate(${rotation}, ${x + w / 2}, ${y + h / 2})`}
        role="button"
        tabIndex={0}
        aria-label={`${spec.name}, decor item`}
        aria-pressed={isSelected}
        onPointerDown={(e) => handleItemPointerDown(e, d.id, d.x, d.y, d.parentType === 'canvas')}
        onDoubleClick={(e) => handleItemDoubleClick(e, d.id, spec.imageUrl, spec.name)}
        onKeyDown={(e) => handleItemKeyDown(e, d.id, d.x, d.y, d.parentType === 'canvas')}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(d.id);
        }}
        opacity={d.opacity ?? 1}
      >
        {spec.imageUrl || (spec.images && spec.images.length > 0) ? (
          <image
            href={spec.imageUrl || spec.images?.[0]?.url}
            x={x}
            y={y}
            width={w}
            height={h}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <g>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={spec.color || '#E5E7EB'}
              stroke={config.primaryColor || '#4A1942'}
              strokeWidth={1}
              rx={2}
            />
            {spec.icon && (
              <text
                x={x + w / 2}
                y={y + h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(w, h) * 0.6}
              >
                {spec.icon}
              </text>
            )}
          </g>
        )}
        
        {isSelected && (
          <rect
            x={x - 2}
            y={y - 2}
            width={w + 4}
            height={h + 4}
            fill="none"
            stroke={config.primaryColor}
            strokeWidth={2}
            strokeDasharray="4,2"
            rx={3}
          />
        )}
      </g>
    );
  };

  // Calculate chair positions
  const calculateChairPositions = useCallback((
    tableX: number, 
    tableY: number, 
    tableWidth: number, 
    tableHeight: number, 
    chairCount: number, 
    tableShape: string,
    chairType: string,
    chairLayout?: RectangularChairLayout
  ): { x: number; y: number; rotation: number }[] => {
    const positions: { x: number; y: number; rotation: number }[] = [];
    const chairSpec = chairSpecs.find(c => c.id === chairType) || chairSpecs[0];
    if (!chairSpec || chairType === 'none') return positions;

    const chairSize = chairSpec.width * scale;
    const paddingVal = 2;

    if (tableShape === 'circle' || tableShape === 'oval') {
      const radiusX = (tableWidth / 2) + chairSize / 2 + paddingVal;
      const radiusY = (tableHeight / 2) + chairSize / 2 + paddingVal;
      for (let i = 0; i < chairCount; i++) {
        const angle = (i / chairCount) * Math.PI * 2 - Math.PI / 2;
        const angleInDegrees = angle * 180 / Math.PI;
        const rotation = angleInDegrees + 90;
        positions.push({
          x: tableX + tableWidth / 2 + Math.cos(angle) * radiusX - chairSize / 2,
          y: tableY + tableHeight / 2 + Math.sin(angle) * radiusY - chairSize / 2,
          rotation: rotation
        });
      }
    } else if (tableShape === 'rectangle') {
      const isHorizontal = tableWidth >= tableHeight;
      const layout = chairLayout || 'all-sides';
      
      if (layout === 'head-table') {
        const longSide = Math.max(tableWidth, tableHeight);
        for (let i = 0; i < chairCount; i++) {
          const offset = (i + 0.5) / chairCount * longSide;
          if (isHorizontal) {
            positions.push({ 
              x: tableX + offset - chairSize / 2, 
              y: tableY + tableHeight + paddingVal, 
              rotation: 0
            });
          } else {
            positions.push({ 
              x: tableX + tableWidth + paddingVal, 
              y: tableY + offset - chairSize / 2, 
              rotation: -90
            });
          }
        }
      } else if (layout === 'long-sides-only') {
        const longSide = Math.max(tableWidth, tableHeight);
        const chairsPerSide = Math.ceil(chairCount / 2);
        
        for (let i = 0; i < chairsPerSide; i++) {
          const offset = (i + 0.5) / chairsPerSide * longSide;
          if (isHorizontal) {
            if (positions.length < chairCount) {
              positions.push({ 
                x: tableX + offset - chairSize / 2, 
                y: tableY - chairSize - paddingVal, 
                rotation: 0
              });
            }
            if (positions.length < chairCount) {
              positions.push({ 
                x: tableX + offset - chairSize / 2, 
                y: tableY + tableHeight + paddingVal, 
                rotation: 180
              });
            }
          } else {
            if (positions.length < chairCount) {
              positions.push({ 
                x: tableX - chairSize - paddingVal, 
                y: tableY + offset - chairSize / 2, 
                rotation: -90
              });
            }
            if (positions.length < chairCount) {
              positions.push({ 
                x: tableX + tableWidth + paddingVal, 
                y: tableY + offset - chairSize / 2, 
                rotation: 90
              });
            }
          }
        }
      } else {
        // all-sides
        const longSide = Math.max(tableWidth, tableHeight);
        const shortSide = Math.min(tableWidth, tableHeight);
        const longSideCapacity = Math.floor(longSide / (chairSize + 2));
        const shortSideCapacity = Math.floor(shortSide / (chairSize + 2));
        const totalCapacity = (longSideCapacity * 2) + (shortSideCapacity * 2);
        
        let remaining = chairCount;
        const chairsPerLongSide = Math.min(
          Math.ceil(remaining * (longSideCapacity / totalCapacity)),
          longSideCapacity
        );
        remaining -= chairsPerLongSide * 2;
        const chairsPerShortSide = Math.min(
          Math.ceil(remaining / 2),
          shortSideCapacity
        );
        
        for (let i = 0; i < chairsPerLongSide; i++) {
          const offset = (i + 0.5) / chairsPerLongSide * longSide;
          if (isHorizontal) {
            positions.push({ x: tableX + offset - chairSize / 2, y: tableY - chairSize - paddingVal, rotation: 0 });
            positions.push({ x: tableX + offset - chairSize / 2, y: tableY + tableHeight + paddingVal, rotation: 180 });
          } else {
            positions.push({ x: tableX - chairSize - paddingVal, y: tableY + offset - chairSize / 2, rotation: -90 });
            positions.push({ x: tableX + tableWidth + paddingVal, y: tableY + offset - chairSize / 2, rotation: 90 });
          }
        }
        
        for (let i = 0; i < chairsPerShortSide; i++) {
          const offset = (i + 0.5) / Math.max(1, chairsPerShortSide) * shortSide;
          if (isHorizontal) {
            if (positions.length < chairCount) {
              positions.push({ x: tableX - chairSize - paddingVal, y: tableY + offset - chairSize / 2, rotation: -90 });
            }
            if (positions.length < chairCount) {
              positions.push({ x: tableX + tableWidth + paddingVal, y: tableY + offset - chairSize / 2, rotation: 90 });
            }
          } else {
            if (positions.length < chairCount) {
              positions.push({ x: tableX + offset - chairSize / 2, y: tableY - chairSize - paddingVal, rotation: 0 });
            }
            if (positions.length < chairCount) {
              positions.push({ x: tableX + offset - chairSize / 2, y: tableY + tableHeight + paddingVal, rotation: 180 });
            }
          }
        }
      }
    } else if (tableShape === 'semicircle') {
      const straightSideWidth = tableWidth;
      for (let i = 0; i < chairCount; i++) {
        const offset = (i + 0.5) / chairCount * straightSideWidth;
        positions.push({
          x: tableX + offset - chairSize / 2,
          y: tableY + tableHeight + paddingVal,
          rotation: 180
        });
      }
    } else {
      const radius = (Math.max(tableWidth, tableHeight) / 2) + chairSize / 2 + paddingVal;
      for (let i = 0; i < chairCount; i++) {
        const angle = (i / chairCount) * Math.PI * 2 - Math.PI / 2;
        const angleInDegrees = angle * 180 / Math.PI;
        const rotation = angleInDegrees + 90;
        positions.push({
          x: tableX + tableWidth / 2 + Math.cos(angle) * radius - chairSize / 2,
          y: tableY + tableHeight / 2 + Math.sin(angle) * radius - chairSize / 2,
          rotation: rotation
        });
      }
    }

    return positions.slice(0, chairCount);
  }, [chairSpecs, scale]);

  // Render ceremony chair rows from the same feet-based geometry used by the
  // impact report. This preserves legacy template rows without introducing a
  // second capacity model for new table-based seating groups.
  const renderCeremonyChairRow = useCallback((row: CeremonyChairRow, index: number) => {
    const chairSpec = chairSpecs.find((candidate) => candidate.id === row.chairType) || chairSpecs[0];
    if (!chairSpec || row.chairType === 'none') return null;
    const placements = ceremonyChairPlacements(row, chairSpec.width);
    const rowX = venueX + row.x * scale;
    const rowY = venueY + row.y * scale;

    return (
      <g key={`ceremony-row-${index}`} data-ceremony-row-id={row.id}>
        {placements.map((chair, chairIndex) => {
          const x = venueX + chair.x * scale;
          const y = venueY + chair.y * scale;
          const size = chair.size * scale;
          return (
            <g key={`ceremony-chair-${index}-${chairIndex}`} transform={`rotate(${chair.rotation}, ${x + size / 2}, ${y + size / 2})`}>
              <rect x={x} y={y} width={size} height={size} fill={chairSpec.color || '#F5F5DC'} stroke="#8B7355" strokeWidth={1} rx={2} />
              <rect x={x + 1} y={y + 1} width={Math.max(0, size - 2)} height={size * 0.3} fill={chairSpec.color || '#F5F5DC'} stroke="#8B7355" strokeWidth={0.5} rx={1} />
            </g>
          );
        })}
        {row.label && (
          <text x={rowX} y={rowY - chairSpec.width * scale - 5} textAnchor="middle" fontSize="10" fill="#374151">
            {row.label}
          </text>
        )}
      </g>
    );
  }, [chairSpecs, scale, venueX, venueY]);

  // Auto-size font to fit within item
  const getFontSize = (text: string, width: number, height: number): number => {
    const maxWidth = width * 0.9;
    const maxHeight = height * 0.4;
    const charWidth = 7;
    const estimatedWidth = text.length * charWidth;
    const widthBasedSize = Math.min(12, (maxWidth / estimatedWidth) * 12);
    const heightBasedSize = Math.min(12, maxHeight);
    return Math.max(7, Math.min(widthBasedSize, heightBasedSize));
  };

  // Render shape helper
  const renderShape = (
    shape: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string,
    strokeWidth: number,
    patternId?: string,
    customPoints?: string
  ) => {
    const fillValue = patternId ? `url(#${patternId})` : fill;
    
    switch (shape) {
      case 'polygon':
        if (customPoints) {
          // customPoints are likely absolute coordinates, but they might need to be shifted by (x,y) 
          // However, CustomVenueBuilder produces points from 0 to canvasWidth.
          // Wait, if it's a table/fixture polygon, it might be relative to 0,0. 
          // Let's assume customPoints are relative to (x,y) if they are just basic shapes, 
          // but for venue it's already absolute. We'll handle shifting in the rendering.
          return (
            <polygon
              points={customPoints}
              fill={fillValue}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          );
        }
        return null;
      case 'circle':
        return (
          <ellipse
            cx={x + width / 2}
            cy={y + height / 2}
            rx={width / 2}
            ry={height / 2}
            fill={fillValue}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        );
      case 'oval':
        return (
          <ellipse
            cx={x + width / 2}
            cy={y + height / 2}
            rx={width / 2}
            ry={height / 2}
            fill={fillValue}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        );
      case 'triangle':
        return (
          <polygon
            points={`${x + width / 2},${y} ${x + width},${y + height} ${x},${y + height}`}
            fill={fillValue}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        );
      case 'semicircle':
        return (
          <path
            d={`M ${x} ${y + height} A ${width / 2} ${height} 0 0 1 ${x + width} ${y + height} L ${x} ${y + height}`}
            fill={fillValue}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        );
      case 'hexagon':
        const hxCenter = x + width / 2;
        const hyCenter = y + height / 2;
        const hr = Math.min(width, height) / 2;
        const hexPoints = Array.from({ length: 6 }, (_, i) => {
          const angle = (i * 60 - 30) * Math.PI / 180;
          return `${hxCenter + hr * Math.cos(angle)},${hyCenter + hr * Math.sin(angle)}`;
        }).join(' ');
        return (
          <polygon
            points={hexPoints}
            fill={fillValue}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        );
      case 'octagon':
        const oxCenter = x + width / 2;
        const oyCenter = y + height / 2;
        const or = Math.min(width, height) / 2;
        const octPoints = Array.from({ length: 8 }, (_, i) => {
          const angle = (i * 45 - 22.5) * Math.PI / 180;
          return `${oxCenter + or * Math.cos(angle)},${oyCenter + or * Math.sin(angle)}`;
        }).join(' ');
        return (
          <polygon
            points={octPoints}
            fill={fillValue}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        );
      default:
        return (
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={fillValue}
            stroke={stroke}
            strokeWidth={strokeWidth}
            rx={3}
          />
        );
    }
  };

  // Render chair with occupied indicator
  const renderChair = (
    x: number,
    y: number,
    size: number,
    rotation: number,
    chairSpec: typeof chairSpecs[0],
    isOccupied: boolean = false,
    guestName?: string
  ) => {
    const baseColor = chairSpec?.color || '#F5F5DC';
    // Occupied chairs have a different visual treatment
    const color = isOccupied ? baseColor : baseColor;
    const occupiedIndicatorColor = config.primaryColor || '#4A1942'; // Brand color for occupied
    
    return (
      <g data-layout-chair="true" aria-hidden="true" transform={`rotate(${rotation}, ${x + size/2}, ${y + size/2})`}>
        {/* Chair seat */}
        <rect
          x={x}
          y={y}
          width={size}
          height={size}
          fill={color}
          stroke={isOccupied ? occupiedIndicatorColor : "#8B7355"}
          strokeWidth={isOccupied ? 2 : 1}
          rx={2}
        />
        {/* Chair back */}
        <rect
          x={x + 1}
          y={y}
          width={size - 2}
          height={size * 0.3}
          fill={color}
          stroke={isOccupied ? occupiedIndicatorColor : "#8B7355"}
          strokeWidth={isOccupied ? 1.5 : 0.5}
          rx={1}
        />
        {/* Occupied indicator - person icon or filled circle */}
        {isOccupied && (
          <>
            {/* Filled circle to show occupied */}
            <circle
              cx={x + size / 2}
              cy={y + size / 2 + 2}
              r={size * 0.25}
              fill={occupiedIndicatorColor}
            />
            {/* Small person icon head */}
            <circle
              cx={x + size / 2}
              cy={y + size / 2 - 1}
              r={size * 0.12}
              fill="white"
            />
            {/* Guest name tooltip - rendered as title for hover */}
            {guestName && (
              <title>{guestName}</title>
            )}
          </>
        )}
        {/* Empty seat indicator */}
        {!isOccupied && (
          <circle
            cx={x + size / 2}
            cy={y + size / 2 + 2}
            r={size * 0.15}
            fill="none"
            stroke="#ccc"
            strokeWidth={1}
            strokeDasharray="2,2"
          />
        )}
      </g>
    );
  };

  // Convert screen coordinates to venue coordinates
  const screenToVenue = useCallback((clientX: number, clientY: number, forExterior: boolean = false): Position => {
    if (!svgRef.current || !containerRef.current) return { x: 0, y: 0 };
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left + containerRef.current.scrollLeft - panOffset.x) / zoom;
    const y = (clientY - rect.top + containerRef.current.scrollTop - panOffset.y) / zoom;
    
    if (forExterior) {
      return { x: Math.max(0, x / scale), y: Math.max(0, y / scale) };
    } else {
      return { x: Math.max(0, (x - venueX) / scale), y: Math.max(0, (y - venueY) / scale) };
    }
  }, [zoom, panOffset, scale, venueX, venueY, containerRef]);

  // Handle item mouse down
  // Pointer-based (unifies mouse + touch + pen) so items can be dragged on
  // touch/mobile devices too, not just with a mouse.
  const handleItemPointerDown = (e: React.PointerEvent, id: string, itemX: number, itemY: number, isExterior: boolean = false) => {
    e.stopPropagation();
    if (e.button === 1 || e.shiftKey) return;

    // Register the pointer so that putting a second finger on the canvas
    // transitions into a pinch (which cancels this item drag).
    if (e.pointerType !== 'mouse') updatePointers(e);

    onSelect(id);
    dragMovedRef.current = false;
    setDragState({
      id,
      startX: e.clientX,
      startY: e.clientY,
      itemX,
      itemY,
      isExterior
    });
  };

  // Handle item double click
  const handleItemDoubleClick = (e: React.MouseEvent, id: string, imageUrl?: string, title?: string) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      if (imageUrl) {
        onViewImage(imageUrl, title || 'Item Image');
      }
    } else {
      onDoubleClick(id);
    }
  };

  // Keyboard support for canvas items: Enter/Space to select, arrow keys to
  // nudge the item a step (Shift = 1ft, plain = 0.5ft). Delete/Backspace is
  // handled globally by the workspace. This makes the canvas usable without a
  // mouse and consistent with the app's screen-reader/keyboard work.
  const handleItemKeyDown = (
    e: React.KeyboardEvent,
    id: string,
    itemX: number,
    itemY: number,
    isExterior: boolean,
  ) => {
    if (e.target !== e.currentTarget) return;

    const step = e.shiftKey ? 1 : 0.5;
    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case 'ArrowLeft': dx = -step; break;
      case 'ArrowRight': dx = step; break;
      case 'ArrowUp': dy = -step; break;
      case 'ArrowDown': dy = step; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(id);
        return;
      default:
        return;
    }
    e.preventDefault();
    onSelect(id);
    // Each arrow-key nudge is a discrete action, so snapshot before it so the
    // user can undo one nudge at a time.
    onDragStart?.();
    onMove(id, { x: Math.max(0, itemX + dx), y: Math.max(0, itemY + dy) }, isExterior, true);
  };

  // Handle canvas click for placing items
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (dragState || isPanning) return;
    
    const target = e.target as Element;
    const isItemGroup = target.closest('g.cursor-move');
    
    if (isItemGroup) return;
    
    if (isDragging) {
      const position = screenToVenue(e.clientX, e.clientY, isDraggingExterior);
      onClickToPlace(position, isDraggingExterior);
      return;
    }
    
    onSelect(null);
  };

  // Keep the pan offset inside the container so the canvas can't be panned
  // entirely off-screen (the parent's programmatic fit/reset calls still set
  // whatever offset they want — this only bounds user-driven pan/zoom).
  const clampPan = useCallback(
    (next: Position): Position => {
      const container = containerRef.current;
      if (!container) return next;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const cW = (canvasWidth || 1) * zoom;
      const cH = (canvasHeight || 1) * zoom;
      const margin = 60;

      const clamp = (v: number, min: number, max: number) =>
        Math.min(Math.max(v, min), max);

      // Horizontal
      let x: number;
      if (cW <= cw) {
        x = (cw - cW) / 2; // fit: center it
      } else {
        x = clamp(next.x, cw - cW - margin, margin);
      }
      // Vertical
      let y: number;
      if (cH <= ch) {
        y = (ch - cH) / 2;
      } else {
        y = clamp(next.y, ch - cH - margin, margin);
      }
      return { x, y };
    },
    [canvasWidth, canvasHeight, zoom, containerRef],
  );

  // Pointer move effect for dragging (pointer events cover mouse + touch + pen).
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        onPanChange(
          clampPan({ x: panStart.offsetX + dx, y: panStart.offsetY + dy }),
        );
        return;
      }
      
      if (dragState) {
        const dx = (e.clientX - dragState.startX) / zoom;
        const dy = (e.clientY - dragState.startY) / zoom;
        
        let newX = dragState.itemX + dx / scale;
        let newY = dragState.itemY + dy / scale;
        
        // Clamp to positive positions
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        
        // Push a single undo snapshot on the first real movement of the drag
        // (so a mere click-to-select does not pollute the undo history, and a
        // whole drag is undoable as one step).
        if (!dragMovedRef.current) {
          dragMovedRef.current = true;
          onDragStart?.();
        }
        onMove(dragState.id, { x: newX, y: newY }, dragState.isExterior);
      }
    };

    const handlePointerUp = () => {
      setDragState(null);
      setIsPanning(false);
    };

    if (dragState || isPanning) {
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      return () => {
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [dragState, isPanning, panStart, zoom, scale, onMove, onPanChange, clampPan, onDragStart]);

  // Handle wheel zoom — zoom is anchored to the point under the cursor so the
  // content the user is looking at stays under their mouse.
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0.25, Math.min(2, zoom + delta));
      if (newZoom === zoom) return;

      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      if (container && rect) {
        const localX = e.clientX - rect.left + container.scrollLeft;
        const localY = e.clientY - rect.top + container.scrollTop;
        // The base (un-zoomed) coordinate under the cursor.
        const baseX = (localX - panOffset.x) / zoom;
        const baseY = (localY - panOffset.y) / zoom;
        // Reposition the pan so that base coordinate stays under the cursor.
        onPanChange(
          clampPan({
            x: localX - baseX * newZoom,
            y: localY - baseY * newZoom,
          }),
        );
      }
      onZoomChange(newZoom);
    },
    [zoom, panOffset, onZoomChange, onPanChange, clampPan, containerRef],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel, containerRef]);

  // Handle pan start (pointer event so middle/shift-drag works on touch too).
  const handlePanStart = (e: React.PointerEvent) => {
    if (e.button === 1 || e.shiftKey) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, offsetX: panOffset.x, offsetY: panOffset.y });
    }
  };

  // ── Pinch-to-zoom (two-finger) ─────────────────────────────────────────────
  // Track every active pointer. When two pointers are down on the canvas, we
  // enter pinch mode and zoom about the midpoint between them, anchored so the
  // point under the fingers stays put (same math as the ctrl+wheel zoom).
  const updatePointers = (e: React.PointerEvent) => {
    const map = pointersRef.current;
    if (e.pointerType === 'mouse') return; // mice are one pointer; pinch is touch/pen
    if (e.type === 'pointerdown') map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    else if (e.type === 'pointermove' && map.has(e.pointerId)) map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    else if (e.type === 'pointerup' || e.type === 'pointercancel') map.delete(e.pointerId);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    updatePointers(e);
    // Only start pinch when exactly two non-mouse pointers are active.
    if (pointersRef.current.size !== 2) return;
    const [a, b] = [...pointersRef.current.values()];
    const startDist = Math.hypot(b.x - a.x, b.y - a.y);
    if (startDist < 5) return;
    // End any item drag so a two-finger gesture doesn't move the selected item.
    setDragState(null);
    setPinch({
      id1: [...pointersRef.current.keys()][0],
      id2: [...pointersRef.current.keys()][1],
      startDist,
      startZoom: zoom,
      startMidX: (a.x + b.x) / 2,
      startMidY: (a.y + b.y) / 2,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    updatePointers(e);
    if (!pinch) return;
    const p1 = pointersRef.current.get(pinch.id1);
    const p2 = pointersRef.current.get(pinch.id2);
    if (!p1 || !p2) return;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const scale = dist / Math.max(1, pinch.startDist);
    const newZoom = Math.max(0.25, Math.min(2, pinch.startZoom * scale));
    if (newZoom === zoom) return;

    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    if (container && rect) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const localX = midX - rect.left + container.scrollLeft;
      const localY = midY - rect.top + container.scrollTop;
      const baseX = (localX - panOffset.x) / pinch.startZoom;
      const baseY = (localY - panOffset.y) / pinch.startZoom;
      onPanChange(
        clampPan({ x: localX - baseX * newZoom, y: localY - baseY * newZoom }),
      );
    }
    onZoomChange(newZoom);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    updatePointers(e);
    if (pointersRef.current.size < 2) setPinch(null);
  };

  // Handle drag over and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = e.dataTransfer.getData('application/json')
        || e.dataTransfer.getData('text/plain');
      if (data) {
        const parsed = JSON.parse(data) as { type?: string; isExterior?: boolean } | null;
        if (!parsed || typeof parsed !== 'object') return;
        // Saved arrangements can target either venue-local or canvas-anchored
        // bases, so preserve raw canvas coordinates and let the caller derive both.
        const usesCanvasCoordinates = isDraggingExterior
          || !!parsed.isExterior
          || parsed.type === 'arrangement';
        const position = screenToVenue(e.clientX, e.clientY, usesCanvasCoordinates);
        onDrop(position, usesCanvasCoordinates);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-auto bg-gray-100"
      onPointerDown={(e) => { handlePointerDown(e); handlePanStart(e); }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleCanvasClick}
      style={{ cursor: isPanning ? 'grabbing' : isDragging ? 'crosshair' : 'default', touchAction: pinch || isPanning || dragState ? 'none' : 'pan-x pan-y' }}
    >
      <style>{`
        @keyframes spm-pulse-aura {
          0% { stroke-width: 2px; stroke-opacity: 0.8; box-shadow: 0 0 5px rgba(74, 25, 66, 0.5); }
          50% { stroke-width: 8px; stroke-opacity: 0.4; box-shadow: 0 0 15px rgba(74, 25, 66, 0.8); }
          100% { stroke-width: 2px; stroke-opacity: 0.8; box-shadow: 0 0 5px rgba(74, 25, 66, 0.5); }
        }
        @keyframes spm-badge-float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
          100% { transform: translateY(0px); }
        }
        .design-active-aura {
          animation: spm-pulse-aura 2.5s infinite ease-in-out;
          pointer-events: none;
        }
        .design-badge-float {
          animation: spm-badge-float 3s infinite ease-in-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .design-active-aura,
          .design-badge-float {
            animation: none;
          }
        }
      `}</style>
      <svg
        ref={setSvgRef}
        width={canvasWidth * zoom}
        height={canvasHeight * zoom}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        className="block"
        style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
      >
        <defs>
          {/* Pattern definitions */}
          <pattern id="checkered" patternUnits="userSpaceOnUse" width="20" height="20">
            <rect width="10" height="10" fill="#FFFFFF"/>
            <rect x="10" width="10" height="10" fill="#000000"/>
            <rect y="10" width="10" height="10" fill="#000000"/>
            <rect x="10" y="10" width="10" height="10" fill="#FFFFFF"/>
          </pattern>
          <pattern id="grass" patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill="#90EE90"/>
            <circle cx="3" cy="3" r="1" fill="#228B22" opacity="0.5"/>
            <circle cx="7" cy="7" r="1" fill="#228B22" opacity="0.5"/>
          </pattern>
          <pattern id="wood" patternUnits="userSpaceOnUse" width="20" height="20">
            <rect width="20" height="20" fill="#DEB887"/>
            <line x1="0" y1="5" x2="20" y2="5" stroke="#CD853F" strokeWidth="0.5" opacity="0.3"/>
            <line x1="0" y1="15" x2="20" y2="15" stroke="#CD853F" strokeWidth="0.5" opacity="0.3"/>
          </pattern>
          <pattern id="gravel" patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill="#A9A9A9"/>
            <circle cx="2" cy="2" r="1" fill="#808080"/>
            <circle cx="8" cy="5" r="1.5" fill="#696969"/>
            <circle cx="4" cy="8" r="1" fill="#778899"/>
          </pattern>
          <pattern id="concrete" patternUnits="userSpaceOnUse" width="20" height="20">
            <rect width="20" height="20" fill="#C0C0C0"/>
            <line x1="0" y1="0" x2="20" y2="0" stroke="#A0A0A0" strokeWidth="0.5"/>
            <line x1="0" y1="0" x2="0" y2="20" stroke="#A0A0A0" strokeWidth="0.5"/>
          </pattern>
          <pattern id="tile" patternUnits="userSpaceOnUse" width="15" height="15">
            <rect width="15" height="15" fill="#F5F5DC"/>
            <rect width="14" height="14" fill="#FFFAF0" stroke="#D2B48C" strokeWidth="0.5"/>
          </pattern>
          <pattern id="brick" patternUnits="userSpaceOnUse" width="20" height="10">
            <rect width="20" height="10" fill="#CD5C5C"/>
            <rect width="9" height="4" fill="#B22222" stroke="#8B4513" strokeWidth="0.3"/>
            <rect x="10" width="10" height="4" fill="#B22222" stroke="#8B4513" strokeWidth="0.3"/>
            <rect x="5" y="5" width="9" height="5" fill="#B22222" stroke="#8B4513" strokeWidth="0.3"/>
            <rect x="15" y="5" width="5" height="5" fill="#B22222" stroke="#8B4513" strokeWidth="0.3"/>
            <rect y="5" width="4" height="5" fill="#B22222" stroke="#8B4513" strokeWidth="0.3"/>
          </pattern>
          <pattern id="marble" patternUnits="userSpaceOnUse" width="30" height="30">
            <rect width="30" height="30" fill="#F5F5F5"/>
            <path d="M0 15 Q 10 10, 20 15 T 30 15" stroke="#D3D3D3" strokeWidth="0.5" fill="none" opacity="0.5"/>
            <path d="M5 25 Q 15 20, 25 25" stroke="#E0E0E0" strokeWidth="0.3" fill="none" opacity="0.5"/>
          </pattern>
          <pattern id="carpet" patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill="#8B0000"/>
            <rect width="4" height="4" fill="#A52A2A" opacity="0.3"/>
            <rect x="4" y="4" width="4" height="4" fill="#A52A2A" opacity="0.3"/>
          </pattern>
          <pattern id="decor-sparkle" patternUnits="userSpaceOnUse" width="10" height="10">
            <circle cx="2" cy="2" r="0.5" fill="white" opacity="0.6" />
            <circle cx="7" cy="7" r="0.5" fill="white" opacity="0.6" />
            <circle cx="5" cy="3" r="0.3" fill="white" opacity="0.4" />
          </pattern>
        </defs>

        {/* Canvas background */}
        <rect
          x="0"
          y="0"
          width={canvasWidth}
          height={canvasHeight}
          fill={venue.canvasFillColor || '#e8e4e0'}
          stroke={venue.canvasBorderColor || '#888888'}
          strokeWidth={2}
          className="canvas-bg"
        />

        {/* Grid */}
        {showGrid && (
          <g>
            {Array.from({ length: Math.ceil(canvasWidth / (gridSize * scale)) + 1 }).map((_, i) => (
              <line
                key={`v-${i}`}
                x1={i * gridSize * scale}
                y1={0}
                x2={i * gridSize * scale}
                y2={canvasHeight}
                stroke="#4b5563"
                strokeWidth={0.8}
                opacity={Math.max(0.15, Math.min(1, gridContrast))}
              />
            ))}
            {Array.from({ length: Math.ceil(canvasHeight / (gridSize * scale)) + 1 }).map((_, i) => (
              <line
                key={`h-${i}`}
                x1={0}
                y1={i * gridSize * scale}
                x2={canvasWidth}
                y2={i * gridSize * scale}
                stroke="#4b5563"
                strokeWidth={0.8}
                opacity={Math.max(0.15, Math.min(1, gridContrast))}
              />
            ))}
            {Array.from({ length: Math.ceil(canvasWidth / (gridSize * scale * 5)) + 1 }).map((_, i) => (
              <line
                key={`mv-${i}`}
                x1={i * gridSize * scale * 5}
                y1={0}
                x2={i * gridSize * scale * 5}
                y2={canvasHeight}
                stroke="#1f2937"
                strokeWidth={1}
                opacity={Math.max(0.25, Math.min(1, gridContrast + 0.15))}
              />
            ))}
            {Array.from({ length: Math.ceil(canvasHeight / (gridSize * scale * 5)) + 1 }).map((_, i) => (
              <line
                key={`mh-${i}`}
                x1={0}
                y1={i * gridSize * scale * 5}
                x2={canvasWidth}
                y2={i * gridSize * scale * 5}
                stroke="#1f2937"
                strokeWidth={1}
                opacity={Math.max(0.25, Math.min(1, gridContrast + 0.15))}
              />
            ))}
          </g>
        )}

        {/* Venue boundary */}
        {(() => {
          const fill = venue.pattern ? `url(#${venue.pattern})` : (venue.color || '#FFFFFF');
          const stroke = venue.showBorder !== false ? (venue.borderColor || config.primaryColor) : 'transparent';
          const strokeWidth = venue.showBorder !== false ? (venue.borderWidth || 3) : 0;
          
          if (['l-shape', 't-shape', 'u-shape', 'custom'].includes(venue.shape || 'rectangle')) {
            return (
              <polygon
                points={venueBoundaryString}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
            );
          }

          // Default Rectangle
          return (
            <rect
              x={venueX}
              y={venueY}
              width={venueWidth}
              height={venueHeight}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          );
        })()}

        {/* Lodging Rooms */}
        {venue.rooms && venue.rooms.map(room => {
          const rx = venueX + room.x * scale;
          const ry = venueY + room.y * scale;
          const rw = room.width * scale;
          const rh = room.height * scale;
          return (
            <g key={room.id}>
              <rect
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                fill={room.color || '#E2E8F0'}
                stroke="#94A3B8"
                strokeWidth={2}
                opacity={0.8}
              />
              <text
                x={rx + rw / 2}
                y={ry + rh / 2 - 5}
                textAnchor="middle"
                fontSize={Math.max(10, Math.min(rw, rh) * 0.15)}
                fill="#334155"
                fontWeight="bold"
              >
                {room.name}
              </text>
              <text
                x={rx + rw / 2}
                y={ry + rh / 2 + 10}
                textAnchor="middle"
                fontSize={Math.max(8, Math.min(rw, rh) * 0.1)}
                fill="#475569"
              >
                {room.assignedGuests.length}/{room.capacity} Guests
              </text>
            </g>
          );
        })}

        {/* Venue label */}
        <text
          x={venueX + venueWidth / 2}
          y={venueY - 12}
          textAnchor="middle"
          className="font-bold"
          fontSize="13"
          fill={config.primaryColor}
        >
          {venue.name} ({venue.width}' × {venue.height}')
        </text>

        {/* Ceremony rows */}
        {ceremonyRows.map((row, index) => renderCeremonyChairRow(row, index))}

        {/* Placed Decor */}
        {decor.map(d => renderDecor(d))}

        {/* Fixtures (exterior first, then interior) */}
        {[...fixtures]
          .sort((a, b) => (a.isExterior ? -1 : 1) - (b.isExterior ? -1 : 1))
          .map(fixture => {
            const spec = fixtureTypes.find(s => s.id === fixture.specId);
            if (!spec) return null;

            const x = fixture.isExterior 
              ? fixture.x * scale 
              : venueX + fixture.x * scale;
            const y = fixture.isExterior 
              ? fixture.y * scale 
              : venueY + fixture.y * scale;
            const w = spec.width * scale;
            const h = spec.height * scale;
            const isSelected = selectedId === fixture.id;
            const fontSize = getFontSize(fixture.label, w, h);
            
            let color = spec.color || '#9CA3AF';
            let displayIcon = spec.showIconOnCanvas !== false ? spec.icon : '';
            const fontColor = spec.fontColor || '#374151';
            const showBorder = spec.showBorder === true;
            const borderColor = showBorder ? (spec.borderColor || '#000000') : 'transparent';
            const borderWidth = showBorder ? (spec.borderWidth || 2) : 0;
            
            // Determine pattern ID for this fixture
            let fixturePatternId: string | undefined = undefined;
            if (spec.pattern && spec.pattern !== 'solid') {
              fixturePatternId = spec.pattern;
            }
            
            if (spec.hasVariants && spec.variants && fixture.variant) {
              const selectedVariant = spec.variants.find(v => v.id === fixture.variant);
              if (selectedVariant) {
                color = selectedVariant.color || color;
                displayIcon = selectedVariant.icon || displayIcon;
              }
            }

          // Calculate rotation center point
          const centerX = x + w / 2;
          const centerY = y + h / 2;
          const fixtureRotation = fixture.rotation || 0;

          return (
            <g
              key={fixture.id}
              className="cursor-move"
              transform={`rotate(${fixtureRotation}, ${centerX}, ${centerY})`}
              role="button"
              tabIndex={0}
              aria-label={`${fixture.label}, ${spec.name}`}
              aria-pressed={selectedId === fixture.id}
              onPointerDown={(e) => handleItemPointerDown(e, fixture.id, fixture.x, fixture.y, fixture.isExterior)}
              onDoubleClick={(e) => handleItemDoubleClick(e, fixture.id, spec.imageUrl, spec.name)}
              onKeyDown={(e) => handleItemKeyDown(e, fixture.id, fixture.x, fixture.y, !!fixture.isExterior)}
            >
              {/* Design Active Status Overlay */}
              {fixture.appliedArrangementId && (
                <>
                  {/* Atmospheric Aura */}
                  <g className="design-active-aura">
                    {renderShape(spec.shape || 'rectangle', x - 4, y - 4, w + 8, h + 8, 'transparent', config.primaryColor, 3, undefined)}
                  </g>
                  
                  {/* Floating Status Badge */}
                  {(() => {
                    const arrangement = arrangements.find(a => a.id === fixture.appliedArrangementId);
                    return (
                      <g transform={`translate(${x + w - 2}, ${y + 2})`} className="design-badge-float">
                        <circle r="13" fill="white" className="shadow-md" />
                        <circle r="11" fill={config.primaryColor} stroke="white" strokeWidth="2" />
                        <text textAnchor="middle" dy="4" fontSize="11" fill="white" style={{ pointerEvents: 'none' }}>🎀</text>
                        {arrangement && <title>Applied Design: {arrangement.name}</title>}
                      </g>
                    );
                  })()}
                </>
              )}

              {renderShape(spec.shape || 'rectangle', x, y, w, h, color, borderColor, borderWidth, fixturePatternId)}
              
              {/* Surface Sparkle Overlay for active design */}
              {fixture.appliedArrangementId && (
                <g style={{ pointerEvents: 'none' }}>
                  {renderShape(spec.shape || 'rectangle', x, y, w, h, 'url(#decor-sparkle)', 'transparent', 0, undefined)}
                </g>
              )}
                
                {displayIcon && (
                  <text
                    x={x + w / 2}
                    y={y + h / 2 - 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.min(w, h) * 0.4}
                  >
                    {displayIcon}
                  </text>
                )}
                
                <text
                  x={x + w / 2}
                  y={y + h / 2 + (displayIcon ? 10 : 4)}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fill={fontColor}
                  fontWeight="500"
                >
                  {fixture.label}
                </text>
                
                {isSelected && (
                  <rect
                    x={x - 3}
                    y={y - 3}
                    width={w + 6}
                    height={h + 6}
                    fill="none"
                    stroke={config.primaryColor}
                    strokeWidth={2}
                    strokeDasharray="4,2"
                    rx={3}
                  />
                )}

                {/* Render applied design */}
                {fixture.appliedArrangementId && renderAppliedArrangement(fixture.appliedArrangementId, centerX, centerY)}
              </g>
            );
          })}

        {/* Tables */}
        {tables.map(table => {
          const spec = tableSpecs.find(s => s.id === table.specId);
          if (!spec) return null;

          const x = venueX + table.x * scale;
          const y = venueY + table.y * scale;
          const isSelected = selectedId === table.id;
          const isSeatingOnly = !!spec.isSeatingType;
          const chairType = table.chairType || spec.defaultChairType || 'white-plastic';
          const chairCount = configuredChairCount(table, spec);
          const chairSpec = chairSpecs.find(c => c.id === chairType);

          // Seating types are chair-only rows: dimensions are shared with the
          // collision engine so the visible and validated footprints stay equal.
          const seatingLayout = isSeatingOnly
            ? seatingGroupGeometry(chairCount, spec, chairSpec)
            : null;

          const w = isSeatingOnly && seatingLayout
            ? Math.max(1, seatingLayout.rowWidthFt) * scale
            : spec.width * scale;
          const h = isSeatingOnly && seatingLayout
            ? Math.max(1, seatingLayout.rowDepthFt) * scale
            : spec.height * scale;
          const fontSize = getFontSize(table.label, w, h);
          
          // Handle linen color
          let tableColor = spec.color || '#FFFFFF';
          let textColor = '#374151';
          
          if (table.hasLinen && table.linenColor) {
            const linenInfo = getLinenColorInfo(table.linenColor);
            tableColor = linenInfo.hex;
            textColor = linenInfo.textColor || '#374151';
          }
          
          // Chair rendering. An explicit zero always renders zero chairs; hiding
          // graphics remains a visual-only choice and does not alter seat totals.
          const showChairs = shouldRenderChairGraphics(table, spec);
          const chairPositions = showChairs && chairSpec && chairType !== 'none'
            ? (isSeatingOnly
                ? (seatingLayout?.chairs || []).map((chair) => ({
                    x: x + chair.x * scale,
                    y: y + chair.y * scale,
                    rotation: chair.rotation,
                  }))
                : calculateChairPositions(x, y, w, h, chairCount, spec.shape, chairType, table.chairLayout))
            : [];

          // Get assigned guests
          const assignedGuests = guests.filter(g => g.tableId === table.id);
          const totalSeatCapacity = tableSeatCount(table, spec);
          const seatDisplay = capacityMode === 'hidden'
            ? ''
            : capacityMode === 'venue'
              ? `${totalSeatCapacity} seat${totalSeatCapacity === 1 ? '' : 's'}`
              : totalSeatCapacity === 0
                ? '0/0'
                : `${assignedGuests.length}/${totalSeatCapacity}`;

                // Calculate rotation center point for the table (and its chairs)
                const tableCenterX = x + w / 2;
                const tableCenterY = y + h / 2;
                const tableRotation = table.rotation || 0;

                return (
                  <g
                    key={table.id}
                    className="cursor-move"
                    transform={`rotate(${tableRotation}, ${tableCenterX}, ${tableCenterY})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${table.label}, ${spec.name}`}
                    aria-pressed={selectedId === table.id}
                    onPointerDown={(e) => handleItemPointerDown(e, table.id, table.x, table.y)}
                    onDoubleClick={(e) => handleItemDoubleClick(e, table.id, spec.imageUrl, spec.name)}
                    onKeyDown={(e) => handleItemKeyDown(e, table.id, table.x, table.y, false)}
                  >
                    {/* Design Active Status Overlay */}
                    {table.appliedArrangementId && (
                      <>
                        {/* Atmospheric Aura (Chair-Aware) */}
                        <g className="design-active-aura">
                          {(() => {
                            const chairW = (chairSpec?.width || 1.5) * scale;
                            return renderShape(
                              spec.shape, 
                              x - chairW - 4, 
                              y - chairW - 4, 
                              w + (chairW * 2) + 8, 
                              h + (chairW * 2) + 8, 
                              'transparent', 
                              config.primaryColor, 
                              3
                            );
                          })()}
                        </g>
                        
                        {/* Floating Status Badge (Outer-Positioned) */}
                        {(() => {
                          const arrangement = arrangements.find(a => a.id === table.appliedArrangementId);
                          const chairW = (chairSpec?.width || 1.5) * scale;
                          return (
                            <g 
                              transform={`translate(${x + w + chairW - 4}, ${y - chairW + 4})`} 
                              className="design-badge-float"
                            >
                              <circle r="13" fill="white" className="shadow-md" />
                              <circle r="11" fill={config.primaryColor} stroke="white" strokeWidth="2" />
                              <text textAnchor="middle" dy="4" fontSize="11" fill="white" style={{ pointerEvents: 'none' }}>🎀</text>
                              {arrangement && <title>Applied Design: {arrangement.name}</title>}
                            </g>
                          );
                        })()}
                      </>
                    )}
              {/* Chairs - show occupied status */}
              {chairPositions.map((pos, idx) => {
                // Check if this seat is occupied by a guest
                const guestAtSeat = assignedGuests[idx];
                const isOccupied = idx < assignedGuests.length;
                const guestName = guestAtSeat?.name;
                
                return (
                  <React.Fragment key={`chair-${table.id}-${idx}`}>
                    {chairSpec && renderChair(
                      pos.x, 
                      pos.y, 
                      chairSpec.width * scale, 
                      pos.rotation, 
                      chairSpec,
                      isOccupied,
                      guestName
                    )}
                  </React.Fragment>
                );
              })}
              
              {/* Table surface (hidden for seating-only types) */}
              {!isSeatingOnly && renderShape(spec.shape, x, y, w, h, tableColor, config.primaryColor || '#4A1942', 2)}
              
              {/* Surface Sparkle Overlay for active design */}
              {table.appliedArrangementId && !isSeatingOnly && (
                <g style={{ pointerEvents: 'none' }}>
                  {renderShape(spec.shape, x, y, w, h, 'url(#decor-sparkle)', 'transparent', 0)}
                </g>
              )}
              
              {/* Table label */}
              <text
                x={x + w / 2}
                y={isSeatingOnly ? y - 6 : y + h / 2 - 4}
                textAnchor="middle"
                fontSize={fontSize}
                fill={textColor}
                fontWeight="600"
              >
                {table.label}
              </text>

              {isSeatingOnly && (
                <text
                  x={x + w / 2}
                  y={y - 18}
                  textAnchor="middle"
                  fontSize={Math.max(9, fontSize - 1)}
                  fill="#7c3aed"
                  fontWeight="700"
                >
                  💺 Seating
                </text>
              )}
              
              {/* Seat count */}
              {capacityMode !== 'hidden' && (
                <text
                  x={x + w / 2}
                  y={y + h / 2 + 8}
                  textAnchor="middle"
                  fontSize={Math.max(7, fontSize - 2)}
                  fill={table.appliedArrangementId ? config.primaryColor : textColor}
                  fontWeight={table.appliedArrangementId ? 'bold' : 'normal'}
                  opacity={table.appliedArrangementId ? 1 : 0.8}
                >
                  {seatDisplay}
                </text>
              )}
              
              {/* Selection indicator */}
              {isSelected && (
                <rect
                  x={x - 3}
                  y={y - 3}
                  width={w + 6}
                  height={h + 6}
                  fill="none"
                  stroke={config.primaryColor}
                  strokeWidth={2}
                  strokeDasharray="4,2"
                  rx={spec.shape === 'circle' ? (w + 6) / 2 : 3}
                />
              )}

              {/* Render applied design */}
              {table.appliedArrangementId && renderAppliedArrangement(table.appliedArrangementId, tableCenterX, tableCenterY)}
            </g>
          );
        })}

        {/* Layout Review Pins */}
        {reviewPins.length > 0 && (
          <g key="review-pins-group">
            {reviewPins.map((pin, i) => {
              const absX = venueX + (pin.x || 0) * scale;
              const absY = venueY + (pin.y || 0) * scale;
              return (
                <g
                  key={pin.id}
                  transform={`translate(${absX}, ${absY})`}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`Review Pin ${i + 1}: ${pin.comment}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectReviewPin?.(pin.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectReviewPin?.(pin.id);
                  }}
                >
                  <circle
                    r={14}
                    fill="#E11D48"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                  <text
                    y={4}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize={11}
                    fontWeight="bold"
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Persona-aware capacity indicator. Venue admins need configured setup
            seats; assignment ratios remain available to couple-facing consumers. */}
        {capacityMode !== 'hidden' && (() => {
          const configuredSeats = layoutSeatCount(tables, tableSpecs, ceremonyRows);
          const assignedSeats = guests.filter((guest) => guest.tableId).length;
          const label = capacityMode === 'venue'
            ? `🪑 ${configuredSeats} seats • Max: ${venue.capacity}`
            : `👥 ${assignedSeats} / ${configuredSeats} seated • Max: ${venue.capacity}`;
          return (
            <g transform={`translate(${canvasWidth - 205}, ${canvasHeight - 30})`}>
              <rect x="0" y="0" width="200" height="25" fill="white" stroke="#ccc" strokeWidth={1} rx={4} opacity={0.95} />
              <text x="10" y="17" fontSize="11" fill="#374151">{label}</text>
            </g>
          );
        })()}
      </svg>

      {/* Empty-state onboarding hint: shown only the first time when the canvas has no items yet, auto-dismissing after 2-3 seconds. */}
      {showOnboardingHint && !isDragging && tables.length === 0 && fixtures.length === 0 && decor.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div className="max-w-sm rounded-2xl border border-gray-200 bg-white/90 p-5 text-center shadow-sm backdrop-blur">
            <div className="text-4xl mb-2">🪑</div>
            <p className="text-base font-semibold text-gray-800">Let's build your layout</p>
            <p className="mt-2 text-sm text-gray-600">
              Drag a <strong>table</strong>, <strong>fixture</strong>, or{' '}
              <strong>decor item</strong> from the left sidebar onto this canvas to get
              started — or click an item, then click on the canvas to place it.
            </p>
          </div>
        </div>
      )}

      {/* Status bar when dragging */}
      {isDragging && (
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-10 text-sm font-medium">
          {isDraggingExterior ? '🌳' : '🪑'} Click on the canvas to place the item
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Venue, LodgingFloor, LodgingRoom, LodgingFurniture, LodgingFurnitureType, Guest } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { getSavedLayouts } from '../hooks/useLayoutState';
import { createEntityId } from '../utils/entityId';

interface LodgingBuilderProps {
  venue: Venue;
  onSave: (floors: LodgingFloor[]) => void;
  onClose: () => void;
}

const SCALE = 10; // px per foot
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const furnitureCatalog: Array<{ type: LodgingFurnitureType; label: string; icon: string; width: number; height: number; color: string }> = [
  { type: 'bed-king', label: 'King Bed', icon: '🛏️', width: 6, height: 7, color: '#DBEAFE' },
  { type: 'bed-queen', label: 'Queen Bed', icon: '🛏️', width: 5, height: 7, color: '#DBEAFE' },
  { type: 'bed-double', label: 'Double Bed', icon: '🛏️', width: 4.5, height: 6, color: '#DBEAFE' },
  { type: 'bed-twin', label: 'Twin Bed', icon: '🛏️', width: 3, height: 6, color: '#DBEAFE' },
  { type: 'nightstand', label: 'Nightstand', icon: '🪵', width: 2, height: 2, color: '#F3E8FF' },
  { type: 'dresser', label: 'Dresser', icon: '🗄️', width: 4, height: 1.5, color: '#FDE68A' },
  { type: 'chair', label: 'Chair', icon: '🪑', width: 2, height: 2, color: '#FEF3C7' },
  { type: 'sofa', label: 'Sofa', icon: '🛋️', width: 7, height: 3.5, color: '#FBCFE8' },
  { type: 'sleeper-sofa', label: 'Sleeper Sofa', icon: '🛋️', width: 7, height: 4, color: '#FBCFE8' },
  { type: 'couch', label: 'Couch', icon: '🛋️', width: 6, height: 3, color: '#FBCFE8' },
  { type: 'toilet', label: 'Toilet', icon: '🚽', width: 1.5, height: 2, color: '#E0F2FE' },
  { type: 'shower', label: 'Shower', icon: '🚿', width: 3, height: 3, color: '#E0F2FE' },
  { type: 'bath-shower', label: 'Bath/Shower', icon: '🛁', width: 5, height: 2.5, color: '#E0F2FE' },
  { type: 'sink', label: 'Sink', icon: '🚰', width: 2, height: 1.5, color: '#E0F2FE' },
  { type: 'refrigerator', label: 'Refrigerator', icon: '🧊', width: 3, height: 3, color: '#E5E7EB' },
  { type: 'pool-table', label: 'Pool Table', icon: '🎱', width: 8, height: 4, color: '#BBF7D0' },
  { type: 'custom', label: 'Custom Item', icon: '📦', width: 3, height: 3, color: '#E5E7EB' },
];

export const LodgingBuilder: React.FC<LodgingBuilderProps> = ({ venue, onSave, onClose }) => {
  const initialFloors = venue.floors && venue.floors.length > 0
    ? venue.floors
    : [{ id: 'f1', name: 'First Floor', level: 1, width: venue.width, height: venue.height, rooms: venue.rooms || [] }];

  const [floors, setFloors] = useState<LodgingFloor[]>(initialFloors);
  const [activeFloorId, setActiveFloorId] = useState<string>(initialFloors[0]?.id || 'f1');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [pendingDeleteRoomId, setPendingDeleteRoomId] = useState<string | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [draggingRoomId, setDraggingRoomId] = useState<string | null>(null);
  const [draggingFurnitureId, setDraggingFurnitureId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [roomShapeDraft, setRoomShapeDraft] = useState<'rectangle' | 'custom'>('rectangle');
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(1);
  const [searchFurniture, setSearchFurniture] = useState('');
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<'room' | 'guests' | 'furniture' | 'item'>('room');
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Guests come from the app's saved layouts (the real guest list), not a legacy
  // localStorage key that the rest of the app no longer writes.
  const guests: Guest[] = useMemo(() => {
    try {
      const layouts = getSavedLayouts() as { guests?: Guest[] }[];
      const merged = new Map<string, Guest>();
      layouts.forEach((l) => {
        (l.guests || []).forEach((g) => merged.set(g.id, g));
      });
      return Array.from(merged.values());
    } catch {
      return [];
    }
  }, []);
  const activeFloor = floors.find(f => f.id === activeFloorId);
  const selectedRoom = activeFloor?.rooms.find(r => r.id === selectedRoomId) || null;
  const selectedFurniture = selectedRoom?.furniture?.find(f => f.id === selectedFurnitureId) || null;

  const unassignedGuests = useMemo(
    () => guests.filter(g => g.rsvpStatus !== 'declined'),
    [guests]
  );

  const filteredFurnitureCatalog = furnitureCatalog.filter(item =>
    item.label.toLowerCase().includes(searchFurniture.toLowerCase()) ||
    item.type.toLowerCase().includes(searchFurniture.toLowerCase())
  );

  const updateFloors = (updater: (prev: LodgingFloor[]) => LodgingFloor[]) => {
    setFloors(prev => updater(prev));
  };

  const addFloor = () => {
    const newFloor: LodgingFloor = {
      id: createEntityId('floor', floors.map((floor) => floor.id)),
      name: `Floor ${floors.length + 1}`,
      level: floors.length + 1,
      width: venue.width,
      height: venue.height,
      rooms: [],
    };
    setFloors(prev => [...prev, newFloor]);
    setActiveFloorId(newFloor.id);
    setSelectedRoomId(null);
  };

  const updateActiveFloor = (updates: Partial<LodgingFloor>) => {
    updateFloors(prev => prev.map(f => f.id === activeFloorId ? { ...f, ...updates } : f));
  };

  const addRoom = () => {
    if (!activeFloor) return;
    const newRoom: LodgingRoom = {
      id: createEntityId('room', floors.flatMap((floor) => floor.rooms.map((room) => room.id))),
      name: `Room ${activeFloor.rooms.length + 1}`,
      width: 14,
      height: 12,
      x: 1,
      y: 1,
      shape: roomShapeDraft,
      polygonPoints: roomShapeDraft === 'custom'
        ? [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 12 }, { x: 0, y: 12 }]
        : undefined,
      capacity: 2,
      assignedGuests: [],
      color: '#E2E8F0',
      label: '',
      furniture: [],
    };
    updateFloors(prev => prev.map(f => f.id === activeFloorId ? { ...f, rooms: [...f.rooms, newRoom] } : f));
    setSelectedRoomId(newRoom.id);
    setSelectedFurnitureId(null);
  };

  const updateRoom = (roomId: string, updates: Partial<LodgingRoom>) => {
    updateFloors(prev => prev.map(f => f.id === activeFloorId ? {
      ...f,
      rooms: f.rooms.map(r => r.id === roomId ? { ...r, ...updates } : r),
    } : f));
  };

  const deleteRoom = (roomId: string) => {
    if (!activeFloor) return;
    setPendingDeleteRoomId(roomId);
  };

  const confirmDeleteRoom = () => {
    if (!pendingDeleteRoomId) return;
    updateFloors(prev => prev.map(f => f.id === activeFloorId ? {
      ...f,
      rooms: f.rooms.filter(r => r.id !== pendingDeleteRoomId),
    } : f));
    if (selectedRoomId === pendingDeleteRoomId) {
      setSelectedRoomId(null);
      setSelectedFurnitureId(null);
    }
  };

  const addFurniture = (type: LodgingFurnitureType) => {
    if (!selectedRoom) return;
    const def = furnitureCatalog.find(f => f.type === type) || furnitureCatalog[0];
    const newFurniture: LodgingFurniture = {
      id: createEntityId('furniture', floors.flatMap((floor) => floor.rooms.flatMap((room) => (room.furniture || []).map((item) => item.id)))),
      type: def.type,
      x: 1,
      y: 1,
      width: def.width,
      height: def.height,
      rotation: 0,
      color: def.color,
      label: def.label,
    };
    updateRoom(selectedRoom.id, { furniture: [...(selectedRoom.furniture || []), newFurniture] });
    setSelectedFurnitureId(newFurniture.id);
  };

  const updateFurniture = (furnitureId: string, updates: Partial<LodgingFurniture>) => {
    if (!selectedRoom) return;
    updateRoom(selectedRoom.id, {
      furniture: (selectedRoom.furniture || []).map(item => item.id === furnitureId ? { ...item, ...updates } : item),
    });
  };

  const deleteFurniture = (furnitureId: string) => {
    if (!selectedRoom) return;
    updateRoom(selectedRoom.id, {
      furniture: (selectedRoom.furniture || []).filter(item => item.id !== furnitureId),
    });
    if (selectedFurnitureId === furnitureId) setSelectedFurnitureId(null);
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!canvasRef.current || !activeFloor) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const snapCoordinate = (value: number) => (
        snapToGrid ? Math.round(value / gridSize) * gridSize : value
      );
      const x = snapCoordinate(
        clamp((e.clientX - rect.left) / SCALE - dragOffset.x, 0, activeFloor.width),
      );
      const y = snapCoordinate(
        clamp((e.clientY - rect.top) / SCALE - dragOffset.y, 0, activeFloor.height),
      );

      if (draggingRoomId) {
        const room = activeFloor.rooms.find(r => r.id === draggingRoomId);
        if (!room) return;
        const roomX = clamp(x, 0, Math.max(0, activeFloor.width - room.width));
        const roomY = clamp(y, 0, Math.max(0, activeFloor.height - room.height));
        setFloors((previous) => previous.map((floor) =>
          floor.id === activeFloor.id
            ? {
                ...floor,
                rooms: floor.rooms.map((candidate) =>
                  candidate.id === draggingRoomId
                    ? { ...candidate, x: roomX, y: roomY }
                    : candidate,
                ),
              }
            : floor,
        ));
      }

      if (draggingFurnitureId && selectedRoom) {
        const item = selectedRoom.furniture?.find(f => f.id === draggingFurnitureId);
        if (!item) return;
        const itemX = clamp(
          x - selectedRoom.x,
          0,
          Math.max(0, selectedRoom.width - item.width),
        );
        const itemY = clamp(
          y - selectedRoom.y,
          0,
          Math.max(0, selectedRoom.height - item.height),
        );
        setFloors((previous) => previous.map((floor) =>
          floor.id === activeFloor.id
            ? {
                ...floor,
                rooms: floor.rooms.map((room) =>
                  room.id === selectedRoom.id
                    ? {
                        ...room,
                        furniture: (room.furniture || []).map((candidate) =>
                          candidate.id === draggingFurnitureId
                            ? { ...candidate, x: itemX, y: itemY }
                            : candidate,
                        ),
                      }
                    : room,
                ),
              }
            : floor,
        ));
      }
    };

    const handleUp = () => {
      setDraggingRoomId(null);
      setDraggingFurnitureId(null);
    };

    if (draggingRoomId || draggingFurnitureId) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingRoomId, draggingFurnitureId, dragOffset, activeFloor, selectedRoom, gridSize, snapToGrid]);

  const saveAll = () => {
    onSave(floors);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-[96vw] h-[94vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-[#4A1942] to-[#2f1032] text-white">
          <div>
            <h2 className="text-xl font-semibold">🏨 Lodging Builder</h2>
            <p className="text-sm text-white/85">{venue.name} • Floors, rooms, furniture, occupancy, and guest assignments</p>
          </div>
          <div className="flex gap-2">
            <button onClick={saveAll} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium">💾 Save Lodging Layout</button>
            <button onClick={onClose} aria-label="Close lodging builder" className="px-3 py-2 hover:bg-white/15 rounded-lg">✕</button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_380px] h-full min-h-0">
          <div className="border-r border-gray-200 bg-gray-50 overflow-y-auto p-4 space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#4A1942]">Floors</h3>
                <button onClick={addFloor} className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">+ Add Floor</button>
              </div>
              <div className="space-y-2">
                {floors.map(floor => (
                  <button
                    key={floor.id}
                    onClick={() => {
                      setActiveFloorId(floor.id);
                      setSelectedRoomId(null);
                      setSelectedFurnitureId(null);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${activeFloorId === floor.id ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className="font-medium">{floor.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{floor.width}’ × {floor.height}’ • {floor.rooms.length} rooms</div>
                  </button>
                ))}
              </div>
            </div>

            {activeFloor && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <h3 className="font-semibold text-[#4A1942]">Floor Settings</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</label>
                    <input value={activeFloor.name} onChange={(e) => updateActiveFloor({ name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Level</label>
                    <input type="number" value={activeFloor.level} onChange={(e) => updateActiveFloor({ level: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Width</label>
                    <input type="number" value={activeFloor.width} onChange={(e) => updateActiveFloor({ width: parseInt(e.target.value) || venue.width })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Height</label>
                    <input type="number" value={activeFloor.height} onChange={(e) => updateActiveFloor({ height: parseInt(e.target.value) || venue.height })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#4A1942]">Rooms</h3>
                <button onClick={addRoom} disabled={!activeFloor} className="px-3 py-1.5 text-sm bg-[#4A1942]/10 text-[#4A1942] rounded-lg hover:bg-[#4A1942]/20 disabled:opacity-50">+ Add Room</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'rectangle', label: 'Rectangle' },
                  { id: 'custom', label: 'Custom' },
                ].map((shape) => (
                  <button
                    key={shape.id}
                    onClick={() => setRoomShapeDraft(shape.id as 'rectangle' | 'custom')}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${roomShapeDraft === shape.id ? 'bg-[#4A1942]/10 border-[#4A1942]/40 text-[#4A1942]' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}
                  >
                    {shape.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => {
                    if (!activeFloor) return;
                    const newRoom: LodgingRoom = {
                      id: createEntityId('room-suite', floors.flatMap((floor) => floor.rooms.map((room) => room.id))),
                      name: `Suite ${activeFloor.rooms.length + 1}`,
                      width: 18,
                      height: 14,
                      x: 1,
                      y: 1,
                      shape: 'rectangle',
                      capacity: 4,
                      assignedGuests: [],
                      color: '#DBEAFE',
                      label: '',
                      furniture: [],
                    };
                    updateFloors(prev => prev.map(f => f.id === activeFloorId ? { ...f, rooms: [...f.rooms, newRoom] } : f));
                    setSelectedRoomId(newRoom.id);
                  }}
                  className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                >
                  + Suite
                </button>
                <button
                  onClick={() => {
                    if (!activeFloor) return;
                    const newRoom: LodgingRoom = {
                      id: createEntityId('room-bath', floors.flatMap((floor) => floor.rooms.map((room) => room.id))),
                      name: `Bathroom ${activeFloor.rooms.length + 1}`,
                      width: 8,
                      height: 6,
                      x: 1,
                      y: 1,
                      shape: 'rectangle',
                      capacity: 1,
                      assignedGuests: [],
                      color: '#E0F2FE',
                      label: '',
                      furniture: [],
                    };
                    updateFloors(prev => prev.map(f => f.id === activeFloorId ? { ...f, rooms: [...f.rooms, newRoom] } : f));
                    setSelectedRoomId(newRoom.id);
                  }}
                  className="px-3 py-2 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100"
                >
                  + Bath
                </button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {activeFloor?.rooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => { setSelectedRoomId(room.id); setSelectedFurnitureId(null); }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedRoomId === room.id ? 'bg-[#4A1942]/10 border-[#4A1942]/40' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className="font-medium text-gray-800">{room.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{room.width}’ × {room.height}’ • {room.assignedGuests.length}/{room.capacity} guests</div>
                  </button>
                ))}
                {!activeFloor?.rooms.length && <div className="text-sm text-gray-500 italic">No rooms yet. Add a room to begin.</div>}
              </div>
            </div>
          </div>

          <div className="relative bg-gray-100 min-h-0 overflow-auto p-4">
            {activeFloor && (
              <div
                ref={canvasRef}
                className="relative mx-auto bg-white border-2 border-gray-400 shadow-lg rounded-xl overflow-hidden origin-top"
                style={{ width: activeFloor.width * SCALE, height: activeFloor.height * SCALE, transform: `scale(${zoom})` }}
                onClick={() => { setSelectedRoomId(null); setSelectedFurnitureId(null); }}
              >
                {showGrid && (
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `linear-gradient(to right, rgba(203,213,225,0.7) 1px, transparent 1px), linear-gradient(to bottom, rgba(203,213,225,0.7) 1px, transparent 1px)`,
                      backgroundSize: `${gridSize * SCALE}px ${gridSize * SCALE}px`,
                    }}
                  />
                )}

                {activeFloor.rooms.map(room => (
                  <div
                    key={room.id}
                    className={`absolute border-2 rounded-lg shadow-sm cursor-move overflow-hidden ${selectedRoomId === room.id ? 'border-[#4A1942] ring-2 ring-[#4A1942]/30' : 'border-gray-400'}`}
                    style={{
                      left: room.x * SCALE,
                      top: room.y * SCALE,
                      width: room.width * SCALE,
                      height: room.height * SCALE,
                      backgroundColor: room.color || '#E2E8F0',
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedRoomId(room.id);
                      setSelectedFurnitureId(null);
                      if (!canvasRef.current) return;
                      const rect = canvasRef.current.getBoundingClientRect();
                      setDragOffset({
                        x: (e.clientX - rect.left) / SCALE - room.x,
                        y: (e.clientY - rect.top) / SCALE - room.y,
                      });
                      setDraggingRoomId(room.id);
                    }}
                  >
                    <div className="absolute inset-x-0 top-0 bg-white/70 backdrop-blur-sm px-2 py-1 border-b border-black/10 text-[11px] font-semibold flex items-center justify-between">
                      <span className="truncate">{room.name}</span>
                      <span className="text-gray-600">{room.assignedGuests.length}/{room.capacity}</span>
                    </div>

                    {room.furniture?.map(item => {
                      const icon = furnitureCatalog.find(f => f.type === item.type)?.icon || '📦';
                      return (
                        <div
                          key={item.id}
                          className={`absolute border rounded-md flex items-center justify-center text-xs cursor-move shadow-sm ${selectedFurnitureId === item.id ? 'border-purple-500 ring-2 ring-purple-300' : 'border-gray-400'}`}
                          style={{
                            left: item.x * SCALE,
                            top: item.y * SCALE,
                            width: item.width * SCALE,
                            height: item.height * SCALE,
                            transform: `rotate(${item.rotation}deg)`,
                            backgroundColor: item.color || '#F8FAFC',
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedRoomId(room.id);
                            setSelectedFurnitureId(item.id);
                            if (!canvasRef.current) return;
                            const rect = canvasRef.current.getBoundingClientRect();
                            setDragOffset({
                              x: (e.clientX - rect.left) / SCALE - room.x - item.x,
                              y: (e.clientY - rect.top) / SCALE - room.y - item.y,
                            });
                            setDraggingFurnitureId(item.id);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRoomId(room.id);
                            setSelectedFurnitureId(item.id);
                          }}
                        >
                          <span className="pointer-events-none">{icon}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            <div className="absolute bottom-4 right-4 rounded-xl bg-white/95 shadow-lg border border-gray-200 p-3 flex flex-wrap gap-3 items-center">
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid</label>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} /> Snap</label>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span>Grid</span>
                <input type="range" min={0.5} max={5} step={0.5} value={gridSize} onChange={(e) => setGridSize(parseFloat(e.target.value))} />
                <span>{gridSize}’</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2)))} className="w-8 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50">−</button>
                <span className="min-w-[52px] text-center font-medium">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))} className="w-8 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50">+</button>
              </div>
            </div>
          </div>

          <div className="border-l border-gray-200 bg-white overflow-y-auto p-4 space-y-4">
            {selectedRoom ? (
              <>
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="grid grid-cols-4 border-b border-gray-200 text-sm">
                    {[
                      { id: 'room', label: 'Room', icon: '🏨' },
                      { id: 'guests', label: 'Guests', icon: '👥' },
                      { id: 'furniture', label: 'Library', icon: '🛋️' },
                      { id: 'item', label: 'Selected', icon: '⚙️' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveRightPanelTab(tab.id as 'room' | 'guests' | 'furniture' | 'item')}
                        className={`px-3 py-3 font-medium transition-colors ${activeRightPanelTab === tab.id ? 'bg-[#4A1942] text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
                      >
                        <div>{tab.icon}</div>
                        <div className="text-xs mt-1">{tab.label}</div>
                      </button>
                    ))}
                  </div>

                  <div className="p-4 space-y-4">
                    {activeRightPanelTab === 'room' && (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-[#4A1942]">Room Settings</h3>
                          <button onClick={() => deleteRoom(selectedRoom.id)} className="px-3 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100">Delete Room</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Room Name</label>
                            <input value={selectedRoom.name} onChange={(e) => updateRoom(selectedRoom.id, { name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Width</label>
                            <input type="number" value={selectedRoom.width} onChange={(e) => updateRoom(selectedRoom.id, { width: parseFloat(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Height</label>
                            <input type="number" value={selectedRoom.height} onChange={(e) => updateRoom(selectedRoom.id, { height: parseFloat(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">X</label>
                            <input type="number" value={selectedRoom.x} onChange={(e) => updateRoom(selectedRoom.id, { x: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Y</label>
                            <input type="number" value={selectedRoom.y} onChange={(e) => updateRoom(selectedRoom.id, { y: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Shape</label>
                            <select value={selectedRoom.shape || 'rectangle'} onChange={(e) => updateRoom(selectedRoom.id, { shape: e.target.value as 'rectangle' | 'custom' })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                              <option value="rectangle">Rectangle</option>
                              <option value="custom">Custom</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Max Occupants</label>
                            <input type="number" value={selectedRoom.capacity} onChange={(e) => updateRoom(selectedRoom.id, { capacity: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Room Color</label>
                            <div className="flex items-center gap-2 mt-1">
                              <input type="color" value={selectedRoom.color || '#E2E8F0'} onChange={(e) => updateRoom(selectedRoom.id, { color: e.target.value })} className="w-12 h-10 border border-gray-300 rounded cursor-pointer" />
                              <input value={selectedRoom.color || '#E2E8F0'} onChange={(e) => updateRoom(selectedRoom.id, { color: e.target.value })} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeRightPanelTab === 'guests' && (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-[#4A1942]">Guest Assignments</h3>
                          <span className="text-xs text-gray-500">{selectedRoom.assignedGuests.length}/{selectedRoom.capacity}</span>
                        </div>
                        <div className="space-y-2 max-h-[420px] overflow-y-auto">
                          {unassignedGuests.map(guest => {
                            const assigned = selectedRoom.assignedGuests.includes(guest.id);
                            const disabled = !assigned && selectedRoom.assignedGuests.length >= selectedRoom.capacity;
                            return (
                              <label key={guest.id} className={`flex items-center justify-between gap-2 p-3 rounded-lg border ${assigned ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200'} ${disabled ? 'opacity-50' : ''}`}>
                                <div>
                                  <div className="text-sm font-medium text-gray-800">{guest.name}</div>
                                  <div className="text-xs text-gray-500">{guest.group || 'Guest'}</div>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={assigned}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...selectedRoom.assignedGuests, guest.id].slice(0, selectedRoom.capacity)
                                      : selectedRoom.assignedGuests.filter(id => id !== guest.id);
                                    updateRoom(selectedRoom.id, { assignedGuests: next });
                                  }}
                                />
                              </label>
                            );
                          })}
                          {!unassignedGuests.length && <div className="text-sm text-gray-500 italic">No guests available.</div>}
                        </div>
                      </div>
                    )}

                    {activeRightPanelTab === 'furniture' && (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-[#4A1942]">Furniture Library</h3>
                          <span className="text-xs text-gray-500">Click to add, drag to position</span>
                        </div>
                        <input value={searchFurniture} onChange={(e) => setSearchFurniture(e.target.value)} placeholder="Search furniture..." className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                        <div className="grid grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
                          {filteredFurnitureCatalog.map(item => (
                            <button key={item.type} onClick={() => addFurniture(item.type)} className="p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-left flex items-center gap-2">
                              <span className="text-lg">{item.icon}</span>
                              <div>
                                <div className="text-sm font-medium text-gray-700">{item.label}</div>
                                <div className="text-xs text-gray-500">{item.width}’ × {item.height}’</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeRightPanelTab === 'item' && (
                      selectedFurniture ? (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-[#4A1942]">Furniture Settings</h3>
                            <button onClick={() => deleteFurniture(selectedFurniture.id)} className="px-3 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100">Delete</button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Label</label>
                              <input value={selectedFurniture.label || ''} onChange={(e) => updateFurniture(selectedFurniture.id, { label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Width</label>
                              <input type="number" value={selectedFurniture.width} onChange={(e) => updateFurniture(selectedFurniture.id, { width: parseFloat(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Height</label>
                              <input type="number" value={selectedFurniture.height} onChange={(e) => updateFurniture(selectedFurniture.id, { height: parseFloat(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">X</label>
                              <input type="number" value={selectedFurniture.x} onChange={(e) => updateFurniture(selectedFurniture.id, { x: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Y</label>
                              <input type="number" value={selectedFurniture.y} onChange={(e) => updateFurniture(selectedFurniture.id, { y: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rotation</label>
                              <input type="number" value={selectedFurniture.rotation} onChange={(e) => updateFurniture(selectedFurniture.id, { rotation: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Color</label>
                              <input type="color" value={selectedFurniture.color || '#E5E7EB'} onChange={(e) => updateFurniture(selectedFurniture.id, { color: e.target.value })} className="w-full h-10 border border-gray-300 rounded cursor-pointer" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">Select a furniture item in the canvas to edit it here.</div>
                      )
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-gray-500 p-6">
                <div>
                  <div className="text-5xl mb-3">🏨</div>
                  <h3 className="text-lg font-semibold text-gray-700">Select a room to edit</h3>
                  <p className="text-sm mt-2">Choose a room from the left or add a new room to start configuring lodging layouts.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteRoomId}
        title="Delete room"
        message="Are you sure you want to delete this room and its furniture? This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          confirmDeleteRoom();
          setPendingDeleteRoomId(null);
        }}
        onCancel={() => setPendingDeleteRoomId(null)}
      />
    </div>
  );
};

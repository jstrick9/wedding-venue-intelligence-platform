import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  DecorItem, 
  DecorArrangement, 
  PlacedDecor,
  DecorPackage,
  DecorCategoryDef
} from '../types';
import { 
  getDecorItems, 
  getDecorArrangements, 
  getTableSpecs, 
  getFixtureTypes,
  getDecorPackages,
  getDecorCategories,
  setDecorArrangements as persistDecorArrangements
} from '../hooks/useLayoutState';
import { useBrandingConfig } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { showToast } from './Toast';
import { on } from '../utils/appEvents';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { createEntityId } from '../utils/entityId';

interface DecorDesignerProps {
  onClose: () => void;
  onSave: (arrangement: DecorArrangement) => void;
  initialArrangement?: DecorArrangement | null;
}

export const DecorDesigner: React.FC<DecorDesignerProps> = ({ onClose, onSave, initialArrangement }) => {
  const config = useBrandingConfig();
  const { user } = useAuth();
  
  // -- State --
  const [activeSidebarTab, setActiveSidebarTab] = useState<'catalog' | 'arrangements'>('catalog');
  // ID of the design awaiting a non-blocking delete confirmation.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [decorCatalog, setDecorCatalog] = useState<DecorItem[]>(() => getDecorItems());
  const [arrangements, setArrangements] = useState<DecorArrangement[]>(() => getDecorArrangements());
  const [decorPackages] = useState<DecorPackage[]>(() => getDecorPackages());
  const [decorCategories] = useState<DecorCategoryDef[]>(() => getDecorCategories());
  
  const [designName, setDesignName] = useState(initialArrangement?.name || '');
  const [baseType, setBaseType] = useState<'table' | 'fixture' | 'arch' | 'other'>(initialArrangement?.baseType || 'table');
  const [baseSpecId, setBaseSpecId] = useState<string>(initialArrangement?.baseSpecId || '');
  
  const [placedItems, setPlacedItems] = useState<PlacedDecor[]>(() => {
    if (initialArrangement) {
      return initialArrangement.items.map((item) => ({
        id: createEntityId('designer-decor'),
        decorItemId: item.decorItemId,
        x: item.x,
        y: item.y,
        rotation: item.rotation,
        scaleX: item.scaleX,
        scaleY: item.scaleY,
        opacity: 1,
        zIndex: item.zIndex,
        parentType: 'decor',
      }));
    }
    return [];
  });
  
  // Multi-select: keep a Set so Shift+Click / Ctrl+A naturally extend the selection.
  // `selectedId` is derived as the *last* item added so the existing single-select
  // properties panel keeps working unchanged.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectedId = useMemo(() => {
    if (selectedIds.size === 0) return null;
    // Iteration order on Set is insertion order, so last() is just an Array.from peek.
    const arr = Array.from(selectedIds);
    return arr[arr.length - 1];
  }, [selectedIds]);
  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);
  const [showProperties, setShowProperties] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Persist a tiny bit of UI chrome state per-user across opens.
  const [showRulers, setShowRulers] = useState<boolean>(() => {
    try { return localStorage.getItem('spm_decor_show_rulers') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('spm_decor_show_rulers', showRulers ? '1' : '0'); } catch {}
  }, [showRulers]);
  
  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string | 'all'>('all');
  const [filterPackageId, setFilterPackageId] = useState<string | 'all'>('all');

  // UI States
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [controllerMinimized, setControllerMinimized] = useState(false);
  const [controllerPos, setControllerPos] = useState({ x: 300, y: 20 });
  const [isDraggingController, setIsDraggingController] = useState(false);
  const [dragState, setDragState] = useState<{ id: string; startX: number; startY: number; itemX: number; itemY: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // -- Data Fetching & Sync --
  useEffect(() => {
    const handleDataChange = () => {
      setDecorCatalog(getDecorItems());
      setArrangements(getDecorArrangements());
    };
    return on('spm_data_changed', handleDataChange);
  }, []);

  const availableBases = useMemo(() => {
    const tables = getTableSpecs().filter(s => !s.archived && s.allowAsDecorBase);
    const fixtures = getFixtureTypes().filter(s => !s.archived && s.allowAsDecorBase && (s.category === 'interior' || s.category === 'both'));
    return { tables, fixtures };
  }, []);

  useEffect(() => {
    if (!baseSpecId) {
      if (availableBases.tables.length > 0) {
        setBaseType('table');
        setBaseSpecId(availableBases.tables[0].id);
      } else if (availableBases.fixtures.length > 0) {
        setBaseType('fixture');
        setBaseSpecId(availableBases.fixtures[0].id);
      }
    }
  }, [availableBases, baseSpecId]);

  const baseItem = useMemo(() => {
    if (baseType === 'table') return availableBases.tables.find(s => s.id === baseSpecId);
    if (baseType === 'fixture') return availableBases.fixtures.find(s => s.id === baseSpecId);
    return null;
  }, [baseType, baseSpecId, availableBases]);

  const filteredCatalog = useMemo(() => {
    return decorCatalog.filter(item => {
      if (item.archived) return false;
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategoryId === 'all' || item.categoryId === filterCategoryId;
      
      let matchesPackage = true;
      if (filterPackageId !== 'all') {
        const pkg = decorPackages.find(p => p.id === filterPackageId);
        if (pkg) {
          // A package contains arrangements; gather every decorItemId used in those arrangements
          const arrangementIds = new Set(pkg.arrangements.map(a => a.arrangementId));
          const allowedDecorIds = new Set<string>();
          arrangements
            .filter(a => arrangementIds.has(a.id))
            .forEach(a => a.items.forEach(it => allowedDecorIds.add(it.decorItemId)));
          matchesPackage = allowedDecorIds.has(item.id);
        }
      }

      return matchesSearch && matchesCategory && matchesPackage;
    });
  }, [decorCatalog, searchTerm, filterCategoryId, filterPackageId, decorPackages, arrangements]);

  const scale = 8; // 8 pixels per inch
  const canvasWidthInches = 144;
  const canvasHeightInches = 144;

  // -- Auto-Fit Zoom Logic --
  useEffect(() => {
    if (!baseItem || !containerRef.current) return;
    
    const container = containerRef.current;
    const padding = 120;
    const currentSidebarWidth = sidebarCollapsed ? 48 : sidebarWidth;
    const availableW = container.clientWidth - currentSidebarWidth - (showProperties ? 288 : 0) - padding;
    const availableH = container.clientHeight - 64 - padding;
    
    const itemW = baseItem.width * 12 * scale;
    const itemH = baseItem.height * 12 * scale;
    
    const zX = availableW / itemW;
    const zY = availableH / itemH;
    const newZoom = Math.min(zX, zY, 1.5);
    
    setZoom(newZoom);
  }, [baseItem, sidebarCollapsed, sidebarWidth, showProperties]);

  // -- Interaction Handlers --
  const handleSave = () => {
    const trimmedName = designName.trim();
    if (!trimmedName) {
      showToast('Please enter a name for this design', 'warning');
      return;
    }

    // Check for duplicate names for the same user. Use the same userId the
    // record will be saved with so the check and the record can't diverge
    // (previously the check used 'current-user' but the record used 'anonymous'
    // for unauthenticated users, making the guard ineffective in that case).
    const ownerId = user?.id || 'anonymous';
    const isDuplicate = arrangements.some(a =>
      a.name.toLowerCase() === trimmedName.toLowerCase() &&
      a.userId === ownerId &&
      a.id !== (initialArrangement?.id || '')
    );

    if (isDuplicate) {
      showToast(`A design named "${trimmedName}" already exists. Please choose a unique name for this user.`, 'warning');
      return;
    }

    const arrangement: DecorArrangement = {
      id: initialArrangement?.id || createEntityId('arrangement', arrangements.map((item) => item.id)),
      name: trimmedName,
      userId: ownerId, 
      baseType,
      baseSpecId,
      items: placedItems.map(item => ({
        decorItemId: item.decorItemId,
        x: item.x,
        y: item.y,
        rotation: item.rotation,
        scaleX: item.scaleX,
        scaleY: item.scaleY,
        zIndex: item.zIndex
      })),
      createdAt: initialArrangement?.createdAt || new Date().toISOString()
    };

    onSave(arrangement);
  };

  const handleAddItem = (spec: DecorItem) => {
    const newItem: PlacedDecor = {
      id: createEntityId('designer-decor', placedItems.map((item) => item.id)),
      decorItemId: spec.id,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      zIndex: 100 + placedItems.length,
      parentType: 'decor'
    };
    setPlacedItems([...placedItems, newItem]);
    setSelectedId(newItem.id);
    setShowProperties(true); // Auto-open properties on initial drop for new items
  };

  const handleItemMouseDown = (e: React.MouseEvent, item: PlacedDecor) => {
    e.stopPropagation();
    e.preventDefault();

    // Shift / Cmd / Ctrl click extends the selection without dropping the rest;
    // a plain click on an already-selected item keeps the multi-selection so the
    // user can then drag the whole group together.
    setSelectedIds((prev) => {
      const isExtend = e.shiftKey || e.metaKey || e.ctrlKey;
      if (isExtend) {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
        return next;
      }
      if (prev.has(item.id) && prev.size > 1) return prev; // keep group selection for drag
      return new Set([item.id]);
    });
    // Note: We specifically do NOT set showProperties to true here
    // so that single-click only selects/moves, matching main layout UX.

    setDragState({
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      itemX: item.x,
      itemY: item.y
    });
  };

  // Track item drag at the window level so releasing the mouse outside the modal still ends the drag.
  // When multiple items are selected, the entire group translates together by (dx, dy).
  useEffect(() => {
    if (!dragState) return;
    const startSnapshot = new Map(placedItems.map((i) => [i.id, { x: i.x, y: i.y }] as const));
    const movingIds = selectedIds.has(dragState.id) && selectedIds.size > 1
      ? selectedIds
      : new Set<string>([dragState.id]);
    const onMove = (em: MouseEvent) => {
      const dx = (em.clientX - dragState.startX) / (scale * zoom);
      const dy = (em.clientY - dragState.startY) / (scale * zoom);
      setPlacedItems((prev) => prev.map((item) => {
        if (!movingIds.has(item.id)) return item;
        const start = startSnapshot.get(item.id) ?? { x: item.x, y: item.y };
        return { ...item, x: start.x + dx, y: start.y + dy };
      }));
    };
    const onUp = () => setDragState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // placedItems intentionally omitted — we snapshot once at drag start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, scale, zoom, selectedIds]);

  // Keyboard shortcuts:
  //   Esc        — close panel / clear selection / close designer
  //   Del/Bksp   — remove every selected item
  //   +/-        — zoom in/out
  //   Cmd/Ctrl+A — select all placed decor
  //   Cmd/Ctrl+D — duplicate selection
  //   Arrows     — nudge selection by 1 inch (Shift = 6 inch)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping) return;

      const meta = e.metaKey || e.ctrlKey;
      const hasSelection = selectedIds.size > 0;

      if (e.key === 'Escape') {
        if (showProperties) { setShowProperties(false); return; }
        if (hasSelection) { setSelectedIds(new Set()); return; }
        onClose();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!hasSelection) return;
        e.preventDefault();
        setPlacedItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
        setSelectedIds(new Set());
        setShowProperties(false);
        return;
      }

      if ((e.key === '+' || e.key === '=')) { setZoom((z) => Math.min(4, z + 0.1)); return; }
      if (e.key === '-') { setZoom((z) => Math.max(0.2, z - 0.1)); return; }

      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(placedItems.map((i) => i.id)));
        return;
      }

      if (meta && e.key.toLowerCase() === 'd' && hasSelection) {
        e.preventDefault();
        duplicateSelection();
        return;
      }

      // Arrow-key nudge — power users expect this in any design tool.
      const NUDGE = e.shiftKey ? 6 : 1; // inches
      let dx = 0, dy = 0;
      if (e.key === 'ArrowUp') dy = -NUDGE;
      else if (e.key === 'ArrowDown') dy = NUDGE;
      else if (e.key === 'ArrowLeft') dx = -NUDGE;
      else if (e.key === 'ArrowRight') dx = NUDGE;
      if ((dx || dy) && hasSelection) {
        e.preventDefault();
        setPlacedItems((prev) => prev.map((i) =>
          selectedIds.has(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i,
        ));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // duplicateSelection is stable below; placedItems read inside is via setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, placedItems, showProperties, onClose]);

  // Duplicate every selected item with a small visual offset, then select the duplicates.
  const duplicateSelection = useCallback(() => {
    if (selectedIds.size === 0) return;
    setPlacedItems((prev) => {
      const baseZ = prev.reduce((m, i) => Math.max(m, i.zIndex), 100);
      const additions: PlacedDecor[] = [];
      let z = baseZ + 1;
      const newIds: string[] = [];
      prev.forEach((item) => {
        if (!selectedIds.has(item.id)) return;
        const id = createEntityId('designer-decor', [...prev, ...additions].map((candidate) => candidate.id));
        additions.push({ ...item, id, x: item.x + 6, y: item.y + 6, zIndex: z++ });
        newIds.push(id);
      });
      setSelectedIds(new Set(newIds));
      return [...prev, ...additions];
    });
    showToast(`Duplicated ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`, 'info');
  }, [selectedIds]);

  const handleItemDoubleClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    setShowProperties(true); // Double-click is required to open properties for existing items
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingController) {
      setControllerPos(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDraggingController(false);
  };

  const loadArrangement = useCallback((arr: DecorArrangement) => {
    setDesignName(arr.name);
    setBaseType(arr.baseType);
    setBaseSpecId(arr.baseSpecId ?? '');
    setPlacedItems(arr.items.map((item) => ({
      id: createEntityId('designer-decor'),
      decorItemId: item.decorItemId,
      x: item.x,
      y: item.y,
      rotation: item.rotation,
      scaleX: item.scaleX,
      scaleY: item.scaleY,
      opacity: 1,
      zIndex: item.zIndex,
      parentType: 'decor' as const,
    })));
    setSelectedId(null);
    setShowProperties(false);
    setActiveSidebarTab('catalog');
    showToast(`Loaded "${arr.name}"`, 'info');
  }, [setSelectedId]);

  const handleDeleteArrangement = useCallback((id: string) => {
    // Non-blocking, in-app confirm (consistent with the rest of the app) rather
    // than the native window.confirm dialog.
    const next = arrangements.filter(a => a.id !== id);
    setArrangements(next);
    persistDecorArrangements(next);
    setConfirmDeleteId(null);
    showToast('Design deleted', 'success');
  }, [arrangements]);

    const selectedItem = placedItems.find(i => i.id === selectedId);
  const selectedItemSpec = selectedItem ? decorCatalog.find(s => s.id === selectedItem.decorItemId) : null;

  // Trap keyboard focus inside the modal — accessibility + power-user UX so Tab
  // doesn't escape into the underlying app.
  useFocusTrap(containerRef, true);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Decor Designer"
      tabIndex={-1}
      className="fixed inset-0 z-[10000] bg-white flex flex-col font-sans overflow-hidden outline-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Header */}
      <header 
        className="h-16 flex items-center justify-between px-6 border-b border-gray-200 z-50 shrink-0 shadow-lg"
        style={{ background: `linear-gradient(to right, ${config.primaryColor}, ${config.primaryDark})` }}
      >
        <div className="flex items-center gap-4">
          {config.logoUrl ? (
            <div className="bg-white/10 p-1.5 rounded-xl backdrop-blur-sm border border-white/10">
              <img src={config.logoUrl} alt="Logo" className="h-10 w-auto object-contain" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white font-black shadow-inner">SP</div>
          )}
          <div className="h-10 w-px bg-white/20 mx-2 hidden sm:block" />
          <div className="flex flex-col">
            <h1 className="text-white font-black uppercase tracking-tighter text-sm flex items-center gap-2">
              Decor Designer
              <span className="bg-white/20 px-2 py-0.5 rounded text-[9px] tracking-normal font-bold">PRO v2.0</span>
            </h1>
            <input 
              type="text" 
              value={designName}
              onChange={e => setDesignName(e.target.value)}
              className="bg-transparent text-white/80 border-none p-0 focus:ring-0 text-[10px] font-bold uppercase tracking-widest placeholder:text-white/30 w-full max-w-[200px]"
              placeholder="ENTER DESIGN NAME..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            aria-label="Close Decor Designer (Esc)"
            title="Close (Esc)"
            className="px-5 py-2 rounded-xl text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Discard
          </button>
          <button 
            onClick={handleSave}
            className="bg-white px-6 py-2.5 rounded-xl text-purple-900 text-[10px] font-black uppercase tracking-widest shadow-xl hover:shadow-white/10 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="text-lg">💾</span>
            Save Design
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar (Catalog & Arrangements) */}
        <aside 
          className={`flex flex-col z-40 transition-all duration-300 relative border-r border-gray-300 bg-gray-100 shadow-2xl ${sidebarCollapsed ? 'w-[56px]' : ''}`}
          style={{ width: sidebarCollapsed ? 56 : sidebarWidth }}
        >
          {/* Sidebar Tabs (matching layout tools) */}
          <div className="flex flex-col h-full">
            <div className="flex border-b border-gray-300 bg-white">
              {!sidebarCollapsed && (
                <>
                  <button 
                    onClick={() => setActiveSidebarTab('catalog')}
                    className={`flex-1 flex flex-col items-center py-3 border-r border-gray-300 transition-all ${activeSidebarTab === 'catalog' ? 'bg-purple-50 text-[#4A1942]' : 'text-gray-400 hover:bg-gray-50'}`}
                    title="Catalog"
                  >
                    <span className="text-xl">🏺</span>
                    <span className="text-[9px] font-black uppercase tracking-widest mt-1">Catalog</span>
                  </button>
                  <button 
                    onClick={() => setActiveSidebarTab('arrangements')}
                    className={`flex-1 flex flex-col items-center py-3 transition-all ${activeSidebarTab === 'arrangements' ? 'bg-purple-50 text-[#4A1942]' : 'text-gray-400 hover:bg-gray-50'}`}
                    title="My Designs"
                  >
                    <span className="text-xl">🎀</span>
                    <span className="text-[9px] font-black uppercase tracking-widest mt-1">My Designs</span>
                  </button>
                </>
              )}
              {sidebarCollapsed && (
                <div className="w-full flex flex-col items-center py-4 gap-6 bg-[#4A1942]/5">
                  <button onClick={() => { setSidebarCollapsed(false); setActiveSidebarTab('catalog'); }} className="p-2 hover:bg-purple-100 rounded-xl transition-colors">🏺</button>
                  <button onClick={() => { setSidebarCollapsed(false); setActiveSidebarTab('arrangements'); }} className="p-2 hover:bg-purple-100 rounded-xl transition-colors">🎀</button>
                </div>
              )}
            </div>

            {!sidebarCollapsed && (
              <>
                {/* Discovery Engine (Search & Filters) */}
                <div className="p-4 bg-white border-b border-gray-200 space-y-3 shadow-sm">
                  <div className="relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-purple-500 transition-colors text-xs">🔍</span>
                    <input 
                      type="text" 
                      placeholder="SEARCH DECOR..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-purple-500/5 focus:border-purple-400 outline-none transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Category</label>
                      <select 
                        value={filterCategoryId}
                        onChange={e => setFilterCategoryId(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2 py-2 text-[9px] font-bold uppercase tracking-widest outline-none focus:border-purple-400 transition-colors"
                      >
                        <option value="all">ALL CATEGORIES</option>
                        {decorCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Style</label>
                      <select 
                        value={filterPackageId}
                        onChange={e => setFilterPackageId(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2 py-2 text-[9px] font-bold uppercase tracking-widest outline-none focus:border-purple-400 transition-colors"
                      >
                        <option value="all">ALL STYLES</option>
                        {decorPackages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 sidebar-scroll bg-gray-50/50">
                  {activeSidebarTab === 'catalog' ? (
                    <div className="grid grid-cols-2 gap-3 pb-8">
                      {filteredCatalog.map(item => (
                        <button 
                          key={item.id}
                          onClick={() => handleAddItem(item)}
                          className="bg-white border border-gray-200 rounded-2xl p-2.5 hover:border-purple-400 hover:shadow-xl hover:-translate-y-1 transition-all text-left group"
                        >
                          <div className="aspect-square bg-gray-50 rounded-xl overflow-hidden mb-2 relative border border-gray-100 shadow-inner">
                            {item.images && item.images.length > 0 ? (
                              <img src={item.images[0].url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-3xl opacity-50 group-hover:scale-110 transition-transform">{item.icon || '🎀'}</div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                          </div>
                          <div className="font-black text-[9px] text-gray-900 truncate uppercase tracking-widest">{item.name}</div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="text-[8px] text-gray-400 font-bold uppercase">{item.width}'{item.widthInches}" × {item.height}'{item.heightInches}"</div>
                            <span className="text-[8px] px-1.5 py-0.5 bg-gray-100 rounded-full font-black text-gray-500">+{item.inventoryCount}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {arrangements.filter(a => a.userId === (user?.id || 'anonymous')).length === 0 ? (
                        <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-2xl bg-white/50">
                          <div className="text-3xl mb-2">💎</div>
                          <p className="text-[9px] font-black uppercase text-gray-400 tracking-[0.2em]">No saved designs yet</p>
                        </div>
                      ) : (
                        arrangements
                          .filter(a => a.userId === (user?.id || 'current-user'))
                          .map(arr => (
                            <div key={arr.id} className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-purple-400 hover:shadow-xl transition-all group">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <div className="font-black text-[10px] text-gray-900 uppercase tracking-widest">{arr.name}</div>
                                  <div className="text-[8px] text-gray-400 font-bold uppercase mt-0.5 flex items-center gap-2">
                                    <span>{arr.items.length} ITEMS</span>
                                    <span className="w-1 h-1 bg-gray-300 rounded-full" />
                                    <span>{arr.baseType}</span>
                                  </div>
                                </div>
                                <div className="text-lg opacity-0 group-hover:opacity-100 transition-opacity">✨</div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => loadArrangement(arr)}
                                  className="flex-1 py-2 bg-gray-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#4A1942] transition-all"
                                >Load Design</button>
                                {confirmDeleteId === arr.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteArrangement(arr.id)}
                                      className="px-2 py-2 bg-red-500 text-white rounded-xl text-[9px] font-black hover:bg-red-600 transition-colors"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="px-2 py-2 bg-gray-200 text-gray-600 rounded-xl text-[9px] font-black hover:bg-gray-300 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    aria-label={`Delete design ${arr.name}`}
                                    onClick={() => setConfirmDeleteId(arr.id)}
                                    className="px-3 py-2 bg-red-50 text-red-500 rounded-xl text-[9px] font-black hover:bg-red-100 transition-colors"
                                  >🗑</button>
                                )}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Collapse/Expand Toggle (at bottom) */}
            <button 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-4 border-t border-gray-300 bg-white text-gray-400 hover:text-purple-600 transition-colors flex items-center justify-center w-full"
            >
              <svg className={`w-5 h-5 transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
              </svg>
            </button>
          </div>
          
          {/* Resize Handle */}
          {!sidebarCollapsed && (
            <div 
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-purple-400 transition-colors z-50"
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startWidth = sidebarWidth;
                const handleMove = (em: MouseEvent) => setSidebarWidth(Math.max(240, Math.min(480, startWidth + (em.clientX - startX))));
                const handleUp = () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
                window.addEventListener('mousemove', handleMove);
                window.addEventListener('mouseup', handleUp);
              }}
            />
          )}
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 bg-[#EBEDF0] relative flex items-center justify-center overflow-hidden">
          {availableBases.tables.length === 0 && availableBases.fixtures.length === 0 && (
            <div className="absolute inset-0 z-[55] flex items-center justify-center bg-white/80 backdrop-blur-sm">
              <div className="max-w-sm text-center p-8 rounded-2xl border-2 border-dashed border-purple-200 bg-white shadow-xl">
                <div className="text-3xl mb-3">🪑</div>
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-800 mb-2">No base objects available</h3>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Mark at least one Table Spec or interior Fixture as <strong>"Allow as decor base"</strong>
                  in the Admin panel to start designing arrangements.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 px-4 py-2 bg-[#4A1942] text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                >Close</button>
              </div>
            </div>
          )}
          {/* Base Controller */}
          <div 
            className="absolute z-[60] shadow-2xl transition-opacity duration-300"
            style={{ left: controllerPos.x, top: controllerPos.y, opacity: isDraggingController ? 0.5 : 1 }}
          >
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-white/50 w-72 shadow-2xl select-none overflow-hidden">
              <div 
                className="px-4 py-3 bg-gray-900/5 border-b border-black/5 flex items-center justify-between cursor-move"
                onMouseDown={(e) => {
                  setIsDraggingController(true);
                  const startX = e.clientX - controllerPos.x;
                  const startY = e.clientY - controllerPos.y;
                  const handleMove = (em: MouseEvent) => setControllerPos({ x: em.clientX - startX, y: em.clientY - startY });
                  const handleUp = () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); setIsDraggingController(false); };
                  window.addEventListener('mousemove', handleMove);
                  window.addEventListener('mouseup', handleUp);
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏗️</span>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Base Object</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setControllerPos({ x: sidebarWidth + 20, y: 80 })} className="p-1.5 hover:bg-black/5 rounded-lg text-gray-400 text-xs">⌂</button>
                  <button onClick={() => setControllerMinimized(!controllerMinimized)} className="p-1.5 hover:bg-black/5 rounded-lg text-gray-400">{controllerMinimized ? '□' : '—'}</button>
                </div>
              </div>

              {!controllerMinimized && (
                <div className="p-5 space-y-5">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Selected Object</label>
                    <select 
                      value={`${baseType}:${baseSpecId}`}
                      onChange={e => {
                        const [type, id] = e.target.value.split(':');
                        setBaseType(type as any);
                        setBaseSpecId(id);
                      }}
                      className="w-full bg-white border-2 border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold focus:border-purple-400 outline-none transition-all"
                    >
                      {availableBases.tables.length > 0 && (
                        <optgroup label="🪑 Tables">
                          {availableBases.tables.map(s => <option key={s.id} value={`table:${s.id}`}>{s.name}</option>)}
                        </optgroup>
                      )}
                      {availableBases.fixtures.length > 0 && (
                        <optgroup label="📦 Venue Fixtures">
                          {availableBases.fixtures.map(s => <option key={s.id} value={`fixture:${s.id}`}>{s.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-purple-50 rounded-xl p-3 border border-purple-100 text-center">
                      <span className="block text-[8px] text-purple-400 uppercase font-black mb-1">Width</span>
                      <span className="text-sm font-black text-purple-900">{baseItem?.width}'</span>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-3 border border-purple-100 text-center">
                      <span className="block text-[8px] text-purple-400 uppercase font-black mb-1">Height</span>
                      <span className="text-sm font-black text-purple-900">{baseItem?.height}'</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setZoom(z => Math.max(0.2, z - 0.1))}
                      aria-label="Zoom out"
                      title="Zoom out (−)"
                      className="w-9 h-9 rounded-xl border-2 border-gray-100 font-black hover:bg-gray-50"
                    >−</button>
                    <span className="text-[10px] font-black text-gray-800" aria-live="polite">{Math.round(zoom * 100)}%</span>
                    <button
                      onClick={() => setZoom(z => Math.min(4, z + 0.1))}
                      aria-label="Zoom in"
                      title="Zoom in (+)"
                      className="w-9 h-9 rounded-xl border-2 border-gray-100 font-black hover:bg-gray-50"
                    >+</button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRulers((r) => !r)}
                    aria-pressed={showRulers}
                    className={`w-full mt-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${showRulers ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'}`}
                  >📏 Rulers {showRulers ? 'On' : 'Off'}</button>
                </div>
              )}
            </div>
          </div>

          {/* Canvas wrapper — adds horizontal/vertical inch rulers when enabled. */}
          <div className="relative" style={{ paddingTop: showRulers ? 22 : 0, paddingLeft: showRulers ? 22 : 0 }}>
            {showRulers && (
              <>
                {/* Top ruler: 1ft (12in) major ticks, 6in mid ticks. */}
                <div
                  className="absolute top-0 left-[22px] right-0 h-[22px] bg-white/90 border-b border-gray-200 text-[8px] font-bold text-gray-400 select-none"
                  style={{ width: canvasWidthInches * scale * zoom }}
                  aria-hidden="true"
                >
                  {Array.from({ length: Math.floor(canvasWidthInches / 12) + 1 }).map((_, i) => {
                    const px = i * 12 * scale * zoom;
                    return (
                      <div key={i} className="absolute top-0 h-full" style={{ left: px }}>
                        <div className="w-px h-3 bg-gray-300" />
                        <span className="absolute left-1 top-2.5">{i}'</span>
                      </div>
                    );
                  })}
                </div>
                {/* Left ruler. */}
                <div
                  className="absolute left-0 top-[22px] bottom-0 w-[22px] bg-white/90 border-r border-gray-200 text-[8px] font-bold text-gray-400 select-none"
                  style={{ height: canvasHeightInches * scale * zoom }}
                  aria-hidden="true"
                >
                  {Array.from({ length: Math.floor(canvasHeightInches / 12) + 1 }).map((_, i) => {
                    const px = i * 12 * scale * zoom;
                    return (
                      <div key={i} className="absolute left-0 w-full" style={{ top: px }}>
                        <div className="h-px w-3 bg-gray-300" />
                        <span className="absolute top-0.5 left-2.5">{i}'</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Canvas */}
            <div
              className="bg-white shadow-[0_0_100px_rgba(0,0,0,0.1)] relative"
              style={{
                width: canvasWidthInches * scale * zoom,
                height: canvasHeightInches * scale * zoom,
                backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)',
                backgroundSize: `${scale * zoom}px ${scale * zoom}px`,
              }}
              onClick={() => { setSelectedIds(new Set()); setShowProperties(false); }}
            >
            {/* Guide */}
            {baseItem && (
              <div 
                className="absolute border-4 border-dashed border-purple-100 flex items-center justify-center pointer-events-none"
                style={{
                  left: '50%', top: '50%',
                  width: baseItem.width * 12 * scale * zoom,
                  height: baseItem.height * 12 * scale * zoom,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: baseItem.shape === 'circle' ? '50%' : '12px',
                  backgroundColor: 'rgba(124, 58, 237, 0.01)'
                }}
              >
                <div className="text-[10px] font-black text-purple-200 uppercase tracking-widest">{baseItem.name}</div>
              </div>
            )}

            <svg 
              className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
              viewBox={`0 0 ${canvasWidthInches} ${canvasHeightInches}`}
            >
              {placedItems.sort((a, b) => a.zIndex - b.zIndex).map(item => {
                const spec = decorCatalog.find(s => s.id === item.decorItemId);
                if (!spec) return null;
                const w = (spec.width * 12 + (spec.widthInches || 0)) * item.scaleX;
                const h = (spec.height * 12 + (spec.heightInches || 0)) * item.scaleY;
                const isSelected = selectedIds.has(item.id);
                
                return (
                  <g 
                    key={item.id}
                    className="pointer-events-auto cursor-move"
                    transform={`translate(${(canvasWidthInches / 2) + item.x - (w / 2)}, ${(canvasHeightInches / 2) + item.y - (h / 2)}) rotate(${item.rotation}, ${w / 2}, ${h / 2})`}
                    onMouseDown={(e) => handleItemMouseDown(e, item)}
                    onDoubleClick={(e) => handleItemDoubleClick(e, item.id)}
                  >
                    {spec.images?.[0] ? (
                      <image href={spec.images[0].url} width={w} height={h} style={{ opacity: item.opacity }} />
                    ) : spec.imageUrl ? (
                      <image href={spec.imageUrl} width={w} height={h} style={{ opacity: item.opacity }} />
                    ) : (
                      <rect width={w} height={h} fill={spec.color || '#DDD'} stroke={config.primaryColor} strokeWidth="0.2" style={{ opacity: item.opacity }} rx="0.2" />
                    )}
                    {isSelected && <rect x="-0.5" y="-0.5" width={w+1} height={h+1} fill="none" stroke={config.primaryColor} strokeWidth="0.5" strokeDasharray="1,0.5" rx="0.5" />}
                  </g>
                );
              })}
            </svg>
            </div>
          </div>
        </main>

        {/* Properties Panel */}
        <aside 
          className={`bg-white border-l border-gray-200 shadow-2xl transition-all duration-500 overflow-hidden ${showProperties && selectedItem ? 'w-72' : 'w-0'}`}
        >
          {selectedItem && (
            <div className="w-72 p-6 flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-gray-400">Settings</h3>
                  {selectedIds.size > 1 && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase tracking-widest">
                      {selectedIds.size} selected
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowProperties(false)}
                  aria-label="Close settings panel"
                  className="text-gray-300 hover:text-gray-900 transition-colors font-bold text-lg"
                >✕</button>
              </div>

              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-xl overflow-hidden shadow-sm">
                  {selectedItemSpec?.images?.[0] ? <img src={selectedItemSpec.images[0].url} className="w-full h-full object-cover" alt=""/> : selectedItemSpec?.icon || '🎀'}
                </div>
                <div className="min-w-0">
                  <div className="font-black text-[10px] uppercase truncate tracking-widest">{selectedItemSpec?.name}</div>
                  <div className="text-[8px] font-black text-purple-400 uppercase mt-0.5">{selectedItemSpec?.categoryId}</div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-[9px] font-black uppercase text-gray-400 tracking-widest">Rotation <span>{selectedItem.rotation}°</span></div>
                  <input type="range" min="0" max="360" value={selectedItem.rotation} onChange={e => setPlacedItems(prev => prev.map(i => i.id === selectedId ? { ...i, rotation: parseInt(e.target.value) } : i))} className="w-full accent-purple-600" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-[9px] font-black uppercase text-gray-400 tracking-widest">Scale <span>{Math.round(selectedItem.scaleX * 100)}%</span></div>
                  <input type="range" min="0.1" max="3" step="0.05" value={selectedItem.scaleX} onChange={e => { const v = parseFloat(e.target.value); setPlacedItems(prev => prev.map(i => i.id === selectedId ? { ...i, scaleX: v, scaleY: v } : i)); }} className="w-full accent-purple-600" />
                </div>
                <div className="space-y-3 text-center pt-4 border-t border-gray-50">
                  <div className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-3">Layering</div>
                  <div className="flex gap-2">
                    <button onClick={() => setPlacedItems(prev => prev.map(i => i.id === selectedId ? { ...i, zIndex: Math.max(0, i.zIndex - 1) } : i))} className="flex-1 py-2 rounded-xl border-2 border-gray-100 font-bold hover:bg-gray-50">↓ Back</button>
                    <button onClick={() => setPlacedItems(prev => prev.map(i => i.id === selectedId ? { ...i, zIndex: i.zIndex + 1 } : i))} className="flex-1 py-2 rounded-xl border-2 border-gray-100 font-bold hover:bg-gray-50">↑ Front</button>
                  </div>
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-2">
                <button
                  type="button"
                  onClick={duplicateSelection}
                  aria-label={`Duplicate ${selectedIds.size} selected item${selectedIds.size === 1 ? '' : 's'} (Cmd/Ctrl+D)`}
                  title="Duplicate (⌘/Ctrl + D)"
                  className="py-3 bg-purple-50 text-purple-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-100 transition-all"
                >Duplicate {selectedIds.size > 1 ? `(${selectedIds.size})` : 'Item'}</button>
                <button
                  type="button"
                  onClick={() => {
                    setPlacedItems(prev => prev.filter(i => !selectedIds.has(i.id)));
                    setSelectedIds(new Set());
                    setShowProperties(false);
                  }}
                  aria-label={`Delete ${selectedIds.size} selected item${selectedIds.size === 1 ? '' : 's'}`}
                  title="Delete (Del)"
                  className="py-3 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all"
                >Delete {selectedIds.size > 1 ? `(${selectedIds.size})` : 'Item'}</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default DecorDesigner;

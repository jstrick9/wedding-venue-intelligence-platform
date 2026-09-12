import { useState, useRef, useEffect } from 'react';
import { Venue, User } from '../types';
import { SavedLayout } from '../hooks/useLayoutState';
import { useBrandingConfig } from '../config';
import { layoutCategories } from '../data/venueData';
import {
  canAccessAdminPanel,
  canAccessOperationsPanel,
  canPrintLayouts,
} from '../utils/permissions';
import ModalDialog from './ModalDialog';
import { emit } from '../utils/appEvents';
import { ConfirmDialog } from './ConfirmDialog';

export interface HeaderProps {
  currentVenue: Venue;
  venues: Venue[];
  selectedVenueCategories?: string[];
  onChangeVenue: (venueId: string) => void;
  onChangeVenueCategories?: (categories: string[]) => void;
  onSaveLayout: (name: string) => void;
  /** Saves a layout, overwriting an existing one with the same name (otherwise creates new). */
  onSaveLayoutOverwrite?: (name: string) => void;
  onSaveMasterLayout?: () => void;
  onClearMasterLayout?: () => void;
  onPrint: () => void;
  onShowTemplates: () => void;
  onShowSpacesLayouts?: () => void;
  onOpenVenueMap?: () => void;
  onShowAdmin?: () => void;
  onOpenOperations?: () => void;
  onShowDashboard?: () => void;
  onShowWorkspaceHelp?: () => void;
  onLogout: () => void;
  userName: string;
  isAdmin: boolean;
  isStaff?: boolean;
  savedLayouts: SavedLayout[];
  onLoadSavedLayout: (id: string) => void;
  onDeleteSavedLayout: (id: string) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  currentUser?: User | null;
}

export function Header({
  currentVenue,
  venues,
  selectedVenueCategories = [],
  onChangeVenue,
  onChangeVenueCategories,
  onSaveLayout,
  onSaveLayoutOverwrite,
  onSaveMasterLayout,
  onClearMasterLayout,
  onPrint,
  onShowTemplates,
  onShowSpacesLayouts,
  onOpenVenueMap,
  onShowAdmin,
  onOpenOperations,
  onShowDashboard,
  onShowWorkspaceHelp,
  onLogout,
  userName,
  isAdmin,
  isStaff,
  savedLayouts,
  onLoadSavedLayout,
  onDeleteSavedLayout,
  mobileMenuOpen,
  setMobileMenuOpen,
  currentUser,
}: HeaderProps) {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [layoutName, setLayoutName] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);
  const [showVenueFilter, setShowVenueFilter] = useState(false);
  const [layoutToDelete, setLayoutToDelete] = useState<SavedLayout | null>(null);
  const [confirmClearMaster, setConfirmClearMaster] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const venueDropdownRef = useRef<HTMLDivElement>(null);
  const venueFilterRef = useRef<HTMLDivElement>(null);

  const config = useBrandingConfig();

  const canOpenAdmin = canAccessAdminPanel(currentUser);
  const canOpenOperations = canAccessOperationsPanel(currentUser);
  const canPrint = canPrintLayouts(currentUser);

  const isStudioPage =
    window.location.hash.startsWith('#/studio') ||
    window.location.hash.startsWith('#/venuemap') ||
    window.location.hash === '';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
      if (
        venueDropdownRef.current &&
        !venueDropdownRef.current.contains(event.target as Node)
      ) {
        setShowVenueDropdown(false);
      }
      if (
        venueFilterRef.current &&
        !venueFilterRef.current.contains(event.target as Node)
      ) {
        setShowVenueFilter(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = () => {
    if (layoutName.trim()) {
      onSaveLayout(layoutName.trim());
      setLayoutName('');
      setShowSaveModal(false);
    }
  };

  // Overwrites an existing layout with the same name (updates in place).
  const handleSaveOverwrite = () => {
    if (layoutName.trim() && onSaveLayoutOverwrite) {
      onSaveLayoutOverwrite(layoutName.trim());
      setLayoutName('');
      setShowSaveModal(false);
    }
  };

  const layoutNameExists =
    layoutName.trim().length > 0 &&
    savedLayouts.some(
      (l) => l.venueId === currentVenue.id
        && l.name.toLowerCase() === layoutName.trim().toLowerCase(),
    );

  const handleVenueSelect = (venueId: string) => {
    setShowVenueDropdown(false);
    setMobileMenuOpen(false);

    if (venueId !== currentVenue.id) {
      setTimeout(() => {
        onChangeVenue(venueId);
      }, 10);
    }
  };

  const categoryInfo = layoutCategories.find((c) => c.id === currentVenue.category);

  const toggleVenueCategory = (categoryId: string) => {
    if (!onChangeVenueCategories) return;

    const next = selectedVenueCategories.includes(categoryId)
      ? selectedVenueCategories.filter((id) => id !== categoryId)
      : [...selectedVenueCategories, categoryId];

    onChangeVenueCategories(next);
  };

  const clearVenueCategories = () => {
    onChangeVenueCategories?.([]);
  };

  const visibleVenues = venues.filter((v) => isAdmin || v.isMaster !== false);
  const filteredVenues =
    selectedVenueCategories.length > 0
      ? visibleVenues.filter((v) => selectedVenueCategories.includes(v.category))
      : visibleVenues;

  // Accurately label the current user's access level (used in both menus) so
  // admins can see at a glance which role is signed in during multi-role testing.
  const roleLabel = (() => {
    const role = currentUser?.role;
    if (role === 'guest') return 'Guest';
    if (role === 'staff') return 'Staff';
    if (role === 'admin') return 'Admin';
    if (role === 'basic') {
      if (currentUser?.userRole === 'master' || currentUser?.isMasterUser) return 'Master';
      if (currentUser?.userRole === 'read-only') return 'Read Only';
      if (currentUser?.userRole === 'shared') return 'Shared';
      return 'Basic';
    }
    return isAdmin ? 'Admin' : isStaff ? 'Staff' : 'User';
  })();

  return (
    <>
      <header
        className="text-white shadow-lg no-print spm-studio-chrome"
        style={{
          zIndex: 100,
          position: 'relative',
          background: `linear-gradient(to right, ${config.primaryColor}, ${config.primaryDark})`,
          color: config.headerTextColor,
        }}
      >
        <div className="flex items-center justify-between px-2 md:px-4 py-2 gap-2">
          <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
            <span className="sr-only">Layout Studio</span>
            {onOpenVenueMap && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenVenueMap();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold transition-all text-white shadow-sm"
                title="Open full-venue wayfinding map"
              >
                <span>🗺️</span>
                <span>Venue Map</span>
              </button>
            )}
            {onShowSpacesLayouts && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onShowSpacesLayouts();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold transition-all text-white shadow-sm"
                title="Open venue spaces & layout templates"
              >
                <span>🏛️</span>
                <span>Spaces &amp; Layouts</span>
              </button>
            )}
          </div>

          <div className="hidden md:flex items-center gap-2 flex-shrink min-w-0">
            <div
              ref={venueDropdownRef}
              className="flex items-center gap-2 bg-white/10 rounded-lg px-2 py-1.5"
            >
              <span className="text-white/70 text-xs whitespace-nowrap">Venue:</span>

              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowVenueDropdown(!showVenueDropdown);
                  }}
                  className="bg-white/20 text-white font-medium border-none outline-none cursor-pointer rounded px-2 py-1 flex items-center gap-1 hover:bg-white/30 transition-colors max-w-[180px] lg:max-w-[250px] xl:max-w-[300px]"
                >
                  <span className="truncate text-sm">{currentVenue.name}</span>
                  <span className="text-xs text-white/70 whitespace-nowrap hidden lg:inline">
                    ({currentVenue.width}'×{currentVenue.height}')
                  </span>
                  {isAdmin && !currentVenue.isMaster && (
                    <span className="text-xs text-yellow-300 whitespace-nowrap">
                      [Draft]
                    </span>
                  )}
                  <span className="text-xs ml-1 flex-shrink-0">
                    {showVenueDropdown ? '▲' : '▼'}
                  </span>
                </button>

                {showVenueDropdown && (
                  <div
                    className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl py-1 min-w-[280px] max-h-[400px] overflow-y-auto"
                    style={{ zIndex: 99999 }}
                  >
                    <div className="px-3 py-2 bg-gray-100 text-gray-600 text-xs font-medium border-b">
                      Select a Venue ({filteredVenues.length} available)
                    </div>

                    {filteredVenues.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleVenueSelect(v.id);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-purple-50 transition-colors flex items-center justify-between border-b border-gray-100 last:border-b-0 ${
                          v.id === currentVenue.id
                            ? 'bg-purple-100 text-purple-700'
                            : 'text-gray-800'
                        }`}
                      >
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {v.name}
                            {isAdmin && !v.isMaster && (
                              <span className="text-xs text-orange-600">[Draft]</span>
                            )}
                            {v.isMaster && (
                              <span className="text-xs text-green-600">★</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {v.width}' × {v.height}' • {v.capacity} guests
                          </div>
                        </div>

                        {v.id === currentVenue.id && (
                          <span className="text-purple-600 text-lg">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="relative" ref={venueFilterRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowVenueFilter(!showVenueFilter);
                }}
                className="bg-white/20 hover:bg-white/30 text-white rounded-lg px-2 py-1.5 text-sm flex items-center gap-1 transition-colors"
                title="Filter venues by category"
              >
                <span>🔎</span>
                <span className="hidden lg:inline">Filter</span>
                {selectedVenueCategories.length > 0 && (
                  <span className="bg-white rounded-full px-1.5 text-[10px] font-bold" style={{ color: config.primaryColor || '#4A1942' }}>
                    {selectedVenueCategories.length}
                  </span>
                )}
              </button>

              {showVenueFilter && (
                <div
                  className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl p-3 min-w-[280px]"
                  style={{ zIndex: 99999 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-800">
                      Filter by Venue Category
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        clearVenueCategories();
                      }}
                      className="text-xs hover:underline font-semibold"
                      style={{ color: config.primaryColor || '#4A1942' }}
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {layoutCategories.map((category) => {
                      const active = selectedVenueCategories.includes(category.id);

                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleVenueCategory(category.id);
                          }}
                          className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                            active
                              ? 'border-[#4A1942] bg-[#4A1942]/10 text-[#4A1942]'
                              : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                          }`}
                          style={
                            active
                              ? {
                                  borderColor: config.primaryColor || '#4A1942',
                                  backgroundColor: `${config.primaryColor || '#4A1942'}18`,
                                  color: config.primaryColor || '#4A1942',
                                }
                              : undefined
                          }
                        >
                          <div className="font-medium text-sm flex items-center gap-1">
                            <span>{category.icon}</span>
                            <span>{category.name}</span>
                          </div>
                          <div className="text-[11px] opacity-70 mt-0.5">
                            {category.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {categoryInfo && (
              <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                <span>{categoryInfo.icon}</span>
                <span className="hidden lg:inline">{categoryInfo.name}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {onShowDashboard && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onShowDashboard();
                }}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold transition-colors whitespace-nowrap text-white"
                aria-label="Close Design Studio and return to Home"
                title="Close and return to Home"
              >
                <span>←</span>
                <span>Home</span>
                <span className="text-white/60 font-normal ml-0.5">✕</span>
              </button>
            )}

            {onShowWorkspaceHelp && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onShowWorkspaceHelp();
                }}
                className="hidden md:flex items-center gap-1 px-2 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                title="Open workspace help and keyboard shortcuts"
              >
                <span>❔</span>
                <span className="hidden lg:inline">Workspace Help</span>
                <span className="lg:hidden">Help</span>
              </button>
            )}

            <div className="hidden md:block relative" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowMenu(!showMenu);
                }}
                className="flex items-center gap-1 px-2 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              >
                <span>☰</span>
                <span className="hidden lg:inline">Menu</span>
              </button>

              {showMenu && (
                <div
                  className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl py-1 min-w-[220px]"
                  style={{ zIndex: 99999 }}
                >
                  {canOpenAdmin && onShowAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onShowAdmin();
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2 font-medium"
                      title="Admin & System Settings"
                    >
                      <span>⚙️</span>
                      <span>Admin &amp; System Settings</span>
                    </button>
                  )}
                  {canOpenOperations && onOpenOperations && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onOpenOperations();
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2 font-medium"
                      title="Operations Studio"
                    >
                      <span>🛠️</span>
                      <span>Operations Studio</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      emit('spm_open_vendors');
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    title="Vendor Management"
                  >
                    <span>🤝</span>
                    <span>Vendors</span>
                  </button>
                  <button
                    onClick={() => {
                      emit('spm_open_timeline');
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    title="Wedding Timeline"
                  >
                    <span>📅</span>
                    <span>Timeline</span>
                  </button>
                  <button
                    onClick={() => {
                      emit('spm_open_chat');
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    title="Portal Chat & Direct Messages"
                  >
                    <span>💬</span>
                    <span>Chat</span>
                  </button>
                  {isStudioPage && (
                    <>
                      <hr className="my-1 border-gray-100" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setShowSaveModal(true);
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <span>💾</span>
                        <span>Save Layout</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setShowLoadModal(true);
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <span>📂</span>
                        <span>Load Layout</span>
                      </button>

                      {isAdmin && onSaveMasterLayout && (
                        <>
                          <hr className="my-1 border-gray-100" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              onSaveMasterLayout();
                              setShowMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 text-green-700 hover:bg-green-50 flex items-center gap-2 font-semibold"
                          >
                            <span>👑</span>
                            <span>Save as Master Layout</span>
                          </button>

                          {currentVenue.masterLayout && onClearMasterLayout && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setShowMenu(false);
                                setConfirmClearMaster(true);
                              }}
                              className="w-full text-left px-4 py-2 text-red-700 hover:bg-red-50 flex items-center gap-2"
                            >
                              <span>🗑️</span>
                              <span>Clear Master Layout</span>
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                  <hr className="my-1 border-gray-100" />
                  {canPrint && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onPrint();
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <span>🖨️</span>
                      <span>Print Layout</span>
                    </button>
                  )}
                  <hr className="my-1 border-gray-100" />
                  <div className="px-4 py-2 text-xs text-gray-400 font-medium">
                    Signed in as: {userName} ({roleLabel})
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setMobileMenuOpen(!mobileMenuOpen);
              }}
              className="md:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <span className="text-2xl">{mobileMenuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div
            className="md:hidden bg-[#3d1a45] border-t border-white/20 max-h-[80vh] overflow-y-auto"
            style={{ zIndex: 99998 }}
          >
            <div className="p-4 border-b border-white/10 space-y-3">
              <div>
                <label className="text-white/70 text-xs font-medium block mb-2">
                  FILTER VENUE CATEGORIES
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {layoutCategories.map((category) => {
                    const active = selectedVenueCategories.includes(category.id);

                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          toggleVenueCategory(category.id);
                        }}
                        className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? 'bg-white font-bold'
                            : 'bg-white/10 text-white/90 hover:bg-white/20'
                        }`}
                        style={active ? { color: config.primaryColor || '#4A1942' } : undefined}
                      >
                        <div className="font-medium flex items-center gap-1">
                          <span>{category.icon}</span>
                          <span>{category.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedVenueCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      clearVenueCategories();
                    }}
                    className="mt-2 text-xs text-white/80 underline"
                  >
                    Clear category filters
                  </button>
                )}
              </div>

              <div>
                <label className="text-white/70 text-xs font-medium block mb-2">
                  SELECT VENUE
                </label>

                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {filteredVenues.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleVenueSelect(v.id);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                        v.id === currentVenue.id
                          ? 'bg-white/30 text-white'
                          : 'bg-white/10 text-white/90 hover:bg-white/20'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-sm">
                          {v.name}
                          {isAdmin && !v.isMaster && (
                            <span className="text-orange-300 ml-1 text-xs">[Draft]</span>
                          )}
                        </div>
                        <div className="text-xs text-white/60">
                          {v.width}' × {v.height}' • {v.capacity} guests
                        </div>
                      </div>

                      {v.id === currentVenue.id && <span className="text-lg">✓</span>}
                    </button>
                  ))}

                  {filteredVenues.length === 0 && (
                    <div className="px-3 py-3 text-sm text-white/70 bg-white/5 rounded-lg">
                      No venues match the selected categories.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 space-y-2">
              {canOpenAdmin && onShowAdmin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onShowAdmin();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full py-3 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-left font-medium"
                >
                  ⚙️ Admin &amp; System Settings
                </button>
              )}

              {canOpenOperations && onOpenOperations && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenOperations();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full py-3 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-left font-medium"
                >
                  📋 Operations
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    emit('spm_open_vendors');
                    setMobileMenuOpen(false);
                  }}
                  className="py-3 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-center"
                >
                  🤝 Vendors
                </button>
                <button
                  type="button"
                  onClick={() => {
                    emit('spm_open_timeline');
                    setMobileMenuOpen(false);
                  }}
                  className="py-3 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-center"
                >
                  📅 Timeline
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    emit('spm_open_chat');
                    setMobileMenuOpen(false);
                  }}
                  className="py-3 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-center col-span-2"
                >
                  💬 Portal Chat &amp; DMs
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {onShowWorkspaceHelp && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onShowWorkspaceHelp();
                      setMobileMenuOpen(false);
                    }}
                    className="py-3 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-center"
                  >
                    ❔ Help
                  </button>
                )}

                {isStudioPage && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowSaveModal(true);
                        setMobileMenuOpen(false);
                      }}
                      className="py-3 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-center"
                    >
                      💾 Save
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowLoadModal(true);
                        setMobileMenuOpen(false);
                      }}
                      className="py-3 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-center"
                    >
                      📂 Load
                    </button>
                  </>
                )}
              </div>

              {isStudioPage && isAdmin && onSaveMasterLayout && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onSaveMasterLayout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full py-3 px-4 bg-green-600/80 hover:bg-green-600 rounded-lg text-center font-bold"
                >
                  👑 Save as Master Layout
                </button>
              )}

              {canPrint && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onPrint();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-center font-bold"
                >
                  🖨️ Print Layout
                </button>
              )}

              <div className="pt-2 border-t border-white/20 mt-2">
                <div className="text-white/60 text-xs mb-2 px-2">
                  Signed in as: {userName} ({roleLabel})
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {showSaveModal && (
        <ModalDialog
          title="Save Layout"
          description="Save the current layout so you can return to it later."
          onClose={() => setShowSaveModal(false)}
          className="max-w-md"
        >
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter layout name..."
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
              autoFocus
            />
            {layoutNameExists && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ A saved layout named "{layoutName.trim()}" already exists. You can
                overwrite it or save a new copy.
              </p>
            )}

            <div className="flex flex-wrap gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              {layoutNameExists && onSaveLayoutOverwrite ? (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!layoutName.trim()}
                    className="px-4 py-2 border border-[#4A1942] text-[#4A1942] rounded-lg hover:bg-[#4A1942]/5 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      borderColor: config.primaryColor || '#4A1942',
                      color: config.primaryColor || '#4A1942',
                    }}
                    title="Create a new, separate saved layout with this name"
                  >
                    Save as new copy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveOverwrite}
                    className="btn-primary px-4 py-2 bg-[#4A1942] text-white rounded-lg hover:bg-[#5c2a64]"
                    style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                    title="Update the existing saved layout with this name"
                  >
                    Overwrite existing
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!layoutName.trim()}
                  className="btn-primary px-4 py-2 bg-[#4A1942] text-white rounded-lg hover:bg-[#5c2a64] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                >
                  Save Layout
                </button>
              )}
            </div>
          </div>
        </ModalDialog>
      )}

      <ConfirmDialog
        open={!!layoutToDelete}
        title="Delete saved layout?"
        message={`Delete "${layoutToDelete?.name || ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          if (layoutToDelete) onDeleteSavedLayout(layoutToDelete.id);
          setLayoutToDelete(null);
        }}
        onCancel={() => setLayoutToDelete(null)}
      />

      <ConfirmDialog
        open={confirmClearMaster}
        title="Clear master layout?"
        message={`Remove the saved master layout for ${currentVenue.name}? This space will become a draft until you save a new master layout. This cannot be undone.`}
        confirmLabel="Clear Master"
        tone="danger"
        onConfirm={() => {
          onClearMasterLayout?.();
          setConfirmClearMaster(false);
        }}
        onCancel={() => setConfirmClearMaster(false)}
      />

      {showLoadModal && (
        <ModalDialog
          title="Load Layout"
          description="Choose one of your previously saved layouts."
          onClose={() => setShowLoadModal(false)}
          className="max-w-md"
        >
          <div className="space-y-4">
            {savedLayouts.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🗂️</div>
                <p className="text-gray-500">No saved layouts found.</p>
                <p className="text-sm text-gray-400 mt-2">
                  Use <strong>💾 Save Layout</strong> in the header to save the current
                  layout, then it will appear here to load anytime.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {savedLayouts.map((layout) => (
                  <div
                    key={layout.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                  >
                    <div>
                      <div className="font-medium text-gray-800">{layout.name}</div>
                      <div className="text-xs text-gray-500">
                        {layout.tables?.length || 0} tables, {layout.fixtures?.length || 0}{' '}
                        fixtures • {new Date(layout.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onLoadSavedLayout(layout.id);
                          setShowLoadModal(false);
                        }}
                        className="btn-primary px-3 py-1 bg-[#4A1942] text-white rounded text-sm hover:bg-[#5c2a64]"
                        style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => setLayoutToDelete(layout)}
                        className="px-3 py-1 bg-red-100 text-red-600 rounded text-sm hover:bg-red-200"
                        aria-label={`Delete saved layout ${layout.name}`}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowLoadModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </ModalDialog>
      )}
    </>
  );
}
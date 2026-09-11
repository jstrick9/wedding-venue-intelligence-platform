import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useLayoutState, getSavedLayouts, setSavedLayouts, getTemplates, getTableSpecs, getFixtureTypes, getDecorArrangements } from '../hooks/useLayoutState';
import { scrubArrangementRefs } from '../utils/decorCleanup';
import { useLayoutBackendSync } from '../hooks/useLayoutBackendSync';
import { useEntityBackendSync } from '../hooks/useEntityBackendSync';
import { EventAnswer, EventQuestion, LayoutTemplate, VenueMapConfig } from '../types';
import { layoutCategories } from '../data/venueData';
import { useAuth } from '../contexts/AuthContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { WelcomeModal } from './WelcomeModal';
import { showToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import AppStatusBar, { StatusBarItem } from './AppStatusBar';
import { CenteredModal } from './CenteredModal';
import { buildMessageThreadId } from '../models/DirectMessage';
import { useSubmissionWorkflow } from '../hooks/useSubmissionWorkflow';
import { getConfig, useBrandingConfig } from '../config';
import { applyDocumentBranding } from '../utils/documentBranding';
import { checkTableCollision, checkFixtureCollision } from '../utils/collisionDetection';
import { subscribeToCollaborationEvents } from '../utils/collaborationChannel';
import {
  buildProjectHealthReport,
  createEmergencyRecoverySnapshot,
  recoverCorruptDomains,
  type ProjectHealthReport,
} from '../utils/recovery';
import { STORAGE_KEYS } from '../constants/storageKeys';
import {
  canAccessAdminPanel,
  canAccessOperationsPanel,
  canEditLayout,
  canMoveFixture,
  canPrintLayouts,
} from '../utils/permissions';
import { UndoRedoProvider } from '../contexts/UndoRedoContext';
import { UndoRedoToolbar } from './UndoRedoToolbar';
import { VenueDashboard } from './VenueDashboard';
import { StudioLayoutsHome } from './StudioLayoutsHome';
import { VenueMapDesigner } from './VenueMapDesigner';
import {
  cacheVenueMapConfigFromServer,
  emptyVenueMapConfig,
  getVenueMapConfig,
  getVenueMapStructuralRecoveryArtifacts,
  saveVenueMapConfig,
} from '../services/wayfinding/venueWayfindingService';
import { coordinateVenueMapSave } from '../services/wayfinding/venueMapSaveCoordinator';
import {
  acceptEntityDomainRevision,
  getEntityDomainRevision,
} from '../services/repository/entityRepository';
import { getCoupleEvents } from '../services/couples/coupleService';
import { computeSpaceSeating } from '../utils/spaceSeating';
import { emit, emitDataChanged, on, type UndoSnapshot } from '../utils/appEvents';
import { VENUE_HOME_HASH, needsVenueHomeHashRewrite } from '../utils/venueHomeRoute';
import { venueMapGuestRouteCoverageIssues } from '../utils/venueMapDesigner';
import { useModals } from '../contexts/ModalContext';

// ─── Lazy-loaded modal / portal components ───────────────────────────────────
const DecorDesigner = lazy(() => import('./DecorDesigner').then((m) => ({ default: m.DecorDesigner })));
const EventOverview = lazy(() => import('./EventOverview').then((m) => ({ default: m.EventOverview })));
const WorkspaceHelp = lazy(() => import('./WorkspaceHelp').then((m) => ({ default: m.WorkspaceHelp })));
const StaffOperationsPanel = lazy(() => import('./StaffOperationsPanel'));
const AdminPanel = lazy(() => import('./AdminPanel').then((m) => ({ default: m.AdminPanel })));
const PrintView = lazy(() => import('./PrintView').then((m) => ({ default: m.PrintView })));
const TemplateSelector = lazy(() => import('./TemplateSelector').then((m) => ({ default: m.TemplateSelector })));
const DirectMessagePanel = lazy(() => import('./DirectMessagePanel').then((m) => ({ default: m.DirectMessagePanel })));
const SubmissionStatusPanel = lazy(() => import('./SubmissionStatusPanel').then((m) => ({ default: m.SubmissionStatusPanel })));
const EventQuestionsWizard = lazy(() => import('./EventQuestionsWizard').then((m) => ({ default: m.EventQuestionsWizard })));
const VendorPanel = lazy(() => import('./VendorPanel').then((m) => ({ default: m.VendorPanel })));
const TimelinePanel = lazy(() => import('./TimelinePanel').then((m) => ({ default: m.TimelinePanel })));

interface Position { x: number; y: number; }
interface DragItem { type: 'table' | 'fixture' | 'arrangement'; specId: string; isExterior?: boolean; }
interface VenueMapConflictState {
  localMap: VenueMapConfig;
  currentPayload: unknown;
  currentUpdatedAt: string | null;
  /** Fail closed until the mounted editor confirms overwrite cannot drop staged form edits. */
  overwriteBlocked: boolean;
}

export default function AuthenticatedApp() {
  const { user: authUser, organizationId, isAdmin, isGuest, logout, getAllUsers } = useAuth();
  const user = authUser!;
  const allUsers = getAllUsers();
  const isStaff = user?.role === 'staff';
  const layoutState = useLayoutState();

  const [view, setView] = useState<'dashboard' | 'studio' | 'admin' | 'venuemap'>('dashboard');
  const [venueMapDirty, setVenueMapDirty] = useState(false);
  const [venueMapConflict, setVenueMapConflict] = useState<VenueMapConflictState | null>(null);
  const venueMapConflictCoverageIssues = useMemo(
    () => venueMapConflict
      ? venueMapGuestRouteCoverageIssues(venueMapConflict.localMap, layoutState.venues)
      : [],
    [layoutState.venues, venueMapConflict],
  );
  const [resolvingVenueMapConflict, setResolvingVenueMapConflict] = useState(false);
  const [venueMapEditorKey, setVenueMapEditorKey] = useState(0);
  // An accepted server write remains authoritative even when browser storage is
  // unavailable. Keep a tenant-scoped in-memory seed so a later editor remount
  // cannot resurrect an older cache and label it saved.
  const [venueMapEditorSeed, setVenueMapEditorSeed] = useState<{
    organizationId: string | null;
    map: VenueMapConfig;
  } | null>(null);
  const venueMapDirtyRef = useRef(false);
  const viewRef = useRef<'dashboard' | 'studio' | 'admin' | 'venuemap'>('dashboard');
  const [confirmVenueMapLeave, setConfirmVenueMapLeave] = useState(false);
  const [pendingVenueMapHash, setPendingVenueMapHash] = useState<string | null>(null);
  // Guard leaving the studio while the working layout has unsaved changes.
  const [pendingStudioLeave, setPendingStudioLeave] = useState<(() => void) | null>(null);
  // Warn before saving an empty layout as a venue's master layout.
  const [confirmEmptyMasterLayout, setConfirmEmptyMasterLayout] = useState(false);

  useEffect(() => {
    venueMapDirtyRef.current = venueMapDirty;
  }, [venueMapDirty]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const leaveVenueMap = () => {
    if (venueMapDirty) {
      setPendingVenueMapHash('#/studio');
      setConfirmVenueMapLeave(true);
      return;
    }
    window.location.hash = '#/studio'; setView('studio'); closeAll();
  };

  // Any navigation away from the Studio (Dashboard/Admin/Venue Map/logout) checks
  // the layout dirty flag; if set, ask before discarding the in-memory layout.
  const guardStudioLeave = useCallback((action: () => void) => {
    if (layoutState.layoutDirty) {
      setPendingStudioLeave(() => action);
      return;
    }
    action();
  }, [layoutState.layoutDirty]);

  const canOpenAdminPanel = canAccessAdminPanel(user);
  const canOpenOperationsPanel = canAccessOperationsPanel(user);
  const canPrintCurrentLayout = canPrintLayouts(user);
  const canEditCurrentLayout = canEditLayout(user);
  
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  // Coalesces property-panel edits (label/linen/chairs/applied design) into undo
  // steps: a discrete action is one step, and rapid text typing doesn't flood the
  // undo history (updates to the same item within a short window share a step).
  const propertyEditUndoRef = useRef<{ id: string; at: number } | null>(null);
  const floorPlanSvgRef = useRef<SVGSVGElement>(null);
  const brandingConfig = useBrandingConfig();
  const [projectHealth, setProjectHealth] = useState<ProjectHealthReport | null>(null);
  // Lets a user dismiss the layout-warning banner; it reappears if the set of
  // warnings changes (a fresh collision/overlap the user hasn't acknowledged).
  const [dismissedWarningsKey, setDismissedWarningsKey] = useState<string | null>(null);
  const [safeMode, setSafeMode] = useState(false);

  const { modals, editingArrangementId, setEditingArrangementId, open, close, closeAll } = useModals();

  // Route support: `#/home` is the venue workspace; leftover `#/dashboard`,
  // `#/venue`, empty, and `#/` rewrite to Home. `#/admin` and `#/studio` stay
  // dedicated destinations. Reading the hash keeps the URL in sync with view.
  useEffect(() => {
    const applyHash = () => {
      const h = window.location.hash || '';
      const staysOnVenueMap = h.startsWith('#/venuemap');
      if (viewRef.current === 'venuemap' && venueMapDirtyRef.current && !staysOnVenueMap) {
        setPendingVenueMapHash(h || VENUE_HOME_HASH);
        setConfirmVenueMapLeave(true);
        window.history.replaceState(window.history.state, '', '#/venuemap');
        return;
      }
      if (h.startsWith('#/admin')) setView('admin');
      else if (h.startsWith('#/studio')) setView('studio');
      else if (staysOnVenueMap) setView('venuemap');
      else if (h.startsWith('#/home') || needsVenueHomeHashRewrite(h)) {
        if (needsVenueHomeHashRewrite(h)) window.history.replaceState(window.history.state, '', VENUE_HOME_HASH);
        setView('dashboard');
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const showVendors = modals.vendors;
  const showTimeline = modals.timeline;
  const showAdmin = modals.admin;
  const showTemplates = modals.templates;
  const showPrint = modals.print;
  const showOperations = modals.operations;
  const showMessages = modals.messages;
  const showSubmission = modals.submission;
  const showEventQuestions = modals.eventQuestions;
  const showDecorDesigner = modals.decorDesigner;
  const showOverview = modals.overview;

  const [showLayoutsHome, setShowLayoutsHome] = useState(false);

  // Local UI state
  const initialUiPrefs = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.UI_PREFS);
      return raw ? (JSON.parse(raw) as {
        snapToGrid?: boolean;
        gridSize?: number;
        showGrid?: boolean;
        gridContrast?: number;
        sidebarWidth?: number;
        sidebarCollapsed?: boolean;
      }) : {};
    } catch {
      return {};
    }
  })();
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(Boolean(initialUiPrefs.showGrid));
  const [gridSize, setGridSize] = useState(typeof initialUiPrefs.gridSize === 'number' ? initialUiPrefs.gridSize : 5);
  const [gridContrast, setGridContrast] = useState(typeof initialUiPrefs.gridContrast === 'number' ? initialUiPrefs.gridContrast : 0.45);
  const [snapToGrid, setSnapToGrid] = useState(Boolean(initialUiPrefs.snapToGrid));
  const [showProperties, setShowProperties] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Small-viewport (mobile/tablet) mode: the side panels become overlays so the
  // layout canvas always gets the full viewport width.
  const [isMobile, setIsMobile] = useState(false);
  const isMobileRef = useRef(false);

  // Persist lightweight UI preferences (sidebar width/collapsed, grid & snap)
  // so a returning user's workspace layout is remembered across sessions.
  // On mobile we don't persist the forced-collapse so the desktop preference
  // isn't clobbered.
  useEffect(() => {
    if (isMobileRef.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEYS.UI_PREFS,
        JSON.stringify({ sidebarWidth, sidebarCollapsed, showGrid, gridSize, gridContrast, snapToGrid }),
      );
    } catch {
      // ignore storage quota errors
    }
  }, [sidebarWidth, sidebarCollapsed, showGrid, gridSize, gridContrast, snapToGrid]);

  // Responsive workspace: on small screens default the side panels to their
  // collapsed rails (so the canvas is maximized); restore desktop prefs when the
  // viewport grows back to md+. No-op where matchMedia is unavailable (e.g. jsdom).
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const applyViewport = () => {
      const mobile = mq.matches;
      isMobileRef.current = mobile;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
        setShowProperties(false);
      } else {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.UI_PREFS);
          if (raw) {
            const prefs = JSON.parse(raw) as { sidebarCollapsed?: boolean; sidebarWidth?: number };
            if (typeof prefs.sidebarCollapsed === 'boolean') setSidebarCollapsed(prefs.sidebarCollapsed);
            if (typeof prefs.sidebarWidth === 'number') setSidebarWidth(prefs.sidebarWidth);
          }
        } catch {
          // ignore corrupt prefs
        }
      }
    };
    applyViewport();
    mq.addEventListener('change', applyViewport);
    return () => mq.removeEventListener('change', applyViewport);
  }, []);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [savedLayouts, setSavedLayoutsState] = useState(() => getSavedLayouts());
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedVenueCategories, setSelectedVenueCategories] = useState<string[]>([]);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const [showWorkspaceHelp, setShowWorkspaceHelp] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState<(() => void) | null>(null);
  const [pendingVenueChange, setPendingVenueChange] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(() => {
    const config = getConfig();
    return config.showWelcomeByDefault !== false;
  });

  useEffect(() => {
    const report = buildProjectHealthReport();
    setProjectHealth(report);
    if (report.overallStatus === 'corrupt') setSafeMode(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (isAdmin) { setShowWelcome(false); return; }
    if (isGuest) {
      const config = getConfig();
      if (config.showWelcomeByDefault !== false) setShowWelcome(true);
      return;
    }
    const permanentlyHidden = localStorage.getItem(STORAGE_KEYS.WELCOME_HIDDEN) === 'true';
    if (permanentlyHidden) setShowWelcome(false);
  }, [user, isGuest, isAdmin]);

  const selectableVenues = (isAdmin ? layoutState.venues : layoutState.venues.filter(v => v.isMaster !== false))
    .filter(v => selectedVenueCategories.length === 0 || selectedVenueCategories.includes(v.category));

  const isMasterBasicUser = user.role === 'basic' && (user.userRole === 'master' || user.isMasterUser === true);
  const currentEventName = user.eventName || user.department || 'general';
  const masterThreadId = buildMessageThreadId(currentEventName, user.id);
  const submissionWorkflow = useSubmissionWorkflow();

  const readEventAnswers = useCallback((): EventAnswer[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EVENT_ANSWERS);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as EventAnswer[];
      return Array.isArray(parsed) ? parsed.filter((a) => a.userId === user.id && a.eventId === currentEventName) : [];
    } catch { return []; }
  }, [user.id, currentEventName]);

  const [currentEventAnswers, setCurrentEventAnswers] = useState<EventAnswer[]>(readEventAnswers);

  useEffect(() => {
    setCurrentEventAnswers(readEventAnswers());
    return on('spm_data_changed', () => setCurrentEventAnswers(readEventAnswers()));
  }, [readEventAnswers]);

  const eventQuestions = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EVENT_QUESTIONS);
      if (!raw) return [] as EventQuestion[];
      const parsed = JSON.parse(raw) as EventQuestion[];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return [] as EventQuestion[]; }
  }, [showAdmin]);

  const saveEventAnswers = useCallback((answers: EventAnswer[]) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EVENT_ANSWERS);
      const existing = raw ? (JSON.parse(raw) as EventAnswer[]) : [];
      const filtered = (Array.isArray(existing) ? existing : []).filter((a) => !(a.userId === user.id && a.eventId === currentEventName));
      localStorage.setItem(STORAGE_KEYS.EVENT_ANSWERS, JSON.stringify([...filtered, ...answers]));
    } catch {}
  }, [user.id, currentEventName]);

  const currentSubmission = submissionWorkflow.getByMasterAndEvent(user.id, currentEventName);

  const statusItems = useMemo<StatusBarItem[]>(() => {
    const items: StatusBarItem[] = [];
    if (safeMode) {
      items.push({
        id: 'safe-mode', kind: 'warning', title: 'Safe Mode is active',
        description: 'Some saved project data appears damaged.',
        actions: [{ label: 'Attempt Auto-Repair', onClick: () => void handleAutoRepair() }, { label: 'Reload App', onClick: () => window.location.reload() }],
      });
    } else if (projectHealth?.overallStatus === 'warning') {
      items.push({
        id: 'health-warning', kind: 'warning', title: 'Project health warning',
        description: 'Some saved project data may be incomplete.',
        actions: [{ label: 'Reload App', onClick: () => window.location.reload() }],
      });
    }
    return items;
  }, [safeMode, projectHealth]);

  useEffect(() => {
    if (selectableVenues.length === 0) return;
    if (!selectableVenues.some(v => v.id === layoutState.currentVenue.id)) {
      layoutState.changeVenue(selectableVenues[0].id);
    }
  }, [selectableVenues, layoutState.currentVenue.id, layoutState]);

  const fitAndCenterVenue = useCallback(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const venue = layoutState.currentVenue;
    const scale = 8;
    const padding = venue.exteriorPadding || { top: 40, right: 30, bottom: 30, left: 40 };
    const canvasWidth = venue.canvasWidth ? venue.canvasWidth * scale : (venue.width + padding.left + padding.right) * scale;
    const canvasHeight = venue.canvasHeight ? venue.canvasHeight * scale : (venue.height + padding.top + padding.bottom) * scale;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const marginPx = 40;
    const zoomX = (containerWidth - marginPx) / canvasWidth;
    const zoomY = (containerHeight - marginPx) / canvasHeight;
    const newZoom = Math.min(1.5, Math.max(0.25, Math.min(zoomX, zoomY)));
    const scaledCanvasWidth = canvasWidth * newZoom;
    const scaledCanvasHeight = canvasHeight * newZoom;
    const offsetX = Math.max(20, (containerWidth - scaledCanvasWidth) / 2);
    const offsetY = Math.max(20, (containerHeight - scaledCanvasHeight) / 2);
    setZoom(newZoom);
    setPanOffset({ x: offsetX, y: offsetY });
  }, [layoutState.currentVenue]);

  const handleResetView = useCallback(() => fitAndCenterVenue(), [fitAndCenterVenue]);

  function ensureCanEditLayout(): boolean {
    if (canEditCurrentLayout) return true;
    showToast('You do not have permission to edit this layout.', 'warning');
    return false;
  }

  const handleResetToVenue = useCallback(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const venue = layoutState.currentVenue;
    const scale = 8;
    const padding = venue.exteriorPadding || { top: 40, right: 30, bottom: 30, left: 40 };
    const venueOffsetX = (venue.venueX ?? padding.left) * scale;
    const venueOffsetY = (venue.venueY ?? padding.top) * scale;
    let minX = venueOffsetX; let minY = venueOffsetY;
    let maxX = venueOffsetX + venue.width * scale; let maxY = venueOffsetY + venue.height * scale;
    if (venue.shape === 'custom' && venue.shapePoints && venue.shapePoints.length >= 3) {
      const xs = venue.shapePoints.map((p) => venueOffsetX + p.x * scale);
      const ys = venue.shapePoints.map((p) => venueOffsetY + p.y * scale);
      minX = Math.min(...xs); minY = Math.min(...ys); maxX = Math.max(...xs); maxY = Math.max(...ys);
    }
    const shapeWidth = Math.max(1, maxX - minX); const shapeHeight = Math.max(1, maxY - minY);
    const margin = 40; const containerWidth = container.clientWidth - margin; const containerHeight = container.clientHeight - margin;
    const zoomX = containerWidth / shapeWidth; const zoomY = containerHeight / shapeHeight;
    const newZoom = Math.min(zoomX, zoomY, 1);
    const panX = (container.clientWidth - shapeWidth * newZoom) / 2 - minX * newZoom;
    const panY = (container.clientHeight - shapeHeight * newZoom) / 2 - minY * newZoom;
    setZoom(newZoom); setPanOffset({ x: panX, y: panY });
  }, [layoutState.currentVenue]);

  const handleResetToCanvas = useCallback(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const venue = layoutState.currentVenue;
    const scale = 8;
    const padding = venue.exteriorPadding || { top: 40, right: 30, bottom: 30, left: 40 };
    const canvasWidth = venue.canvasWidth ? venue.canvasWidth * scale : (venue.width + padding.left + padding.right) * scale;
    const canvasHeight = venue.canvasHeight ? venue.canvasHeight * scale : (venue.height + padding.top + padding.bottom) * scale;
    const containerWidth = container.clientWidth - 40; const containerHeight = container.clientHeight - 40;
    const zoomX = containerWidth / canvasWidth; const zoomY = containerHeight / canvasHeight;
    const newZoom = Math.min(zoomX, zoomY, 2);
    const panX = (containerWidth - canvasWidth * newZoom) / 2 + 20; const panY = (containerHeight - canvasHeight * newZoom) / 2 + 20;
    setZoom(newZoom); setPanOffset({ x: panX, y: panY });
  }, [layoutState.currentVenue]);

  useEffect(() => {
    layoutState.setOnVenueChange(() => {
      setTimeout(() => {
        fitAndCenterVenue();
      }, 50);
    });
  }, [layoutState, fitAndCenterVenue]);

  useEffect(() => {
    if (view === 'studio') {
      const timer = setTimeout(() => {
        fitAndCenterVenue();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [view, fitAndCenterVenue]);

  const refreshSavedLayouts = useCallback(() => setSavedLayoutsState(getSavedLayouts()), []);
  const handleEntitiesLoaded = useCallback(() => {
    refreshSavedLayouts();
    // pullEntities has just refreshed the canonical browser domains. It is now
    // safe to retire an accepted-write seed that existed only as cache fallback.
    setVenueMapEditorSeed(null);
  }, [refreshSavedLayouts]);

  // Platform layout sync: pulls shared layouts on load and exposes a push for
  // the save/delete handlers (no-op in local mode).
  const layoutBackendSync = useLayoutBackendSync({
    userId: user.id,
    organizationId,
    onLoaded: refreshSavedLayouts,
  });

  // Platform entity sync: pulls shared catalog/asset/design domains on load and
  // exposes a push used after admin edits (no-op in local mode).
  const entityBackendSync = useEntityBackendSync({
    userId: user.id,
    organizationId,
    onLoaded: handleEntitiesLoaded,
  });

  const keepVenueMapConflictDraft = useCallback(() => {
    setVenueMapConflict(null);
    setVenueMapDirty(true);
  }, []);

  const reloadVenueMapConflict = useCallback(() => {
    if (!venueMapConflict || !organizationId) return;
    try {
      cacheVenueMapConfigFromServer(venueMapConflict.currentPayload);
      acceptEntityDomainRevision(
        organizationId,
        'venueMapConfigs',
        venueMapConflict.currentUpdatedAt,
      );
      // The authoritative value is now in the canonical cache, so any older
      // accepted-write fallback must not override this explicit reload.
      setVenueMapEditorSeed(null);
      setVenueMapConflict(null);
      setVenueMapDirty(false);
      setVenueMapEditorKey((key) => key + 1);
      showToast('Loaded the shared venue map. Your conflicting draft was discarded.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The shared venue map could not be loaded.', 'warning');
    }
  }, [organizationId, venueMapConflict]);

  const overwriteVenueMapConflict = useCallback(async () => {
    if (!venueMapConflict || venueMapConflict.overwriteBlocked) return;
    setResolvingVenueMapConflict(true);
    try {
      const result = await entityBackendSync.saveVenueMapToBackend(
        venueMapConflict.localMap,
        venueMapConflict.currentUpdatedAt,
        true,
      );
      if (result.status !== 'saved') return;
      try {
        saveVenueMapConfig(venueMapConflict.localMap, { emitChange: false });
      } catch {
        // Server save succeeded; the storage layer already surfaced its warning.
      }
      // Seed the forced-save remount from the accepted payload, not from a cache
      // write that may have failed. A later successful backend pull clears this.
      setVenueMapEditorSeed({
        organizationId,
        map: venueMapConflict.localMap,
      });
      setVenueMapConflict(null);
      setVenueMapDirty(false);
      setVenueMapEditorKey((key) => key + 1);
      showToast('Your draft replaced the shared venue map.', 'success');
    } finally {
      setResolvingVenueMapConflict(false);
    }
  }, [entityBackendSync, organizationId, venueMapConflict]);

  // Keep the saved-layouts list in sync with storage on same-tab data changes
  // (e.g. an admin "Reset to defaults" clears saved layouts; without this the
  // Header dropdown would show stale entries until reload).
  useEffect(() => {
    return on('spm_data_changed', () => refreshSavedLayouts());
  }, [refreshSavedLayouts]);

  // When admin edits persist an entity domain (spm_data_changed), flush that
  // domain to the backend so other devices/users stay in sync.
  useEffect(() => {
    if (!entityBackendSync.enabled) return;
    return on('spm_data_changed', (detail) => {
      const type = detail?.type;
      if (!type || type === 'backend_hydrated' || detail?.source === 'backend') return;
      if (type === 'all') {
        void entityBackendSync.saveToBackend();
        return;
      }
      void entityBackendSync.saveDomainToBackend(type);
    });
  }, [entityBackendSync]);

  // Data-integrity: when decor arrangements change (a design is deleted), scrub
  // stale appliedArrangementId references from placed tables/fixtures so no item
  // points at a deleted design (broken "Design Active" badge / "Edit Design").
  useEffect(() => {
    return on('spm_data_changed', () => {
      const valid = new Set(getDecorArrangements().map((a) => a.id));
      const tablesNeedScrub = layoutState.layout.tables.some(
        (t) => t.appliedArrangementId && !valid.has(t.appliedArrangementId),
      );
      const fixturesNeedScrub = layoutState.layout.fixtures.some(
        (f) => f.appliedArrangementId && !valid.has(f.appliedArrangementId),
      );
      if (!tablesNeedScrub && !fixturesNeedScrub) return;
      layoutState.updateLayout({
        tables: tablesNeedScrub
          ? scrubArrangementRefs(layoutState.layout.tables, valid)
          : layoutState.layout.tables,
        fixtures: fixturesNeedScrub
          ? scrubArrangementRefs(layoutState.layout.fixtures, valid)
          : layoutState.layout.fixtures,
      });
    });
  }, [layoutState]);
  const pushUndoSnapshot = useCallback(() => {
    const snapshot = {
      tables: [...layoutState.layout.tables], fixtures: [...layoutState.layout.fixtures],
      decor: [...(layoutState.layout.decor || [])], timestamp: Date.now(),
    };
    emit('spm_push_undo_snapshot', snapshot satisfies UndoSnapshot);
  }, [layoutState.layout]);

  const handleRestoreSnapshot = useCallback((snapshot: { tables: any[]; fixtures: any[]; decor: any[] }) => {
    layoutState.updateLayout({ tables: snapshot.tables, fixtures: snapshot.fixtures, decor: snapshot.decor || [], });
  }, [layoutState]);

  // Clear the whole layout as a single undoable action. Previously it called
  // clearLayout() directly with no undo snapshot, so an accidental "Clear All
  // Items" was irreversible (unlike single-item delete).
  const handleClearLayout = useCallback(() => {
    const hasItems =
      layoutState.layout.tables.length > 0 ||
      layoutState.layout.fixtures.length > 0 ||
      (layoutState.layout.decor || []).length > 0;
    if (!hasItems) return;
    pushUndoSnapshot();
    layoutState.clearLayout();
    showToast('Layout cleared.', 'success');
  }, [layoutState, pushUndoSnapshot]);

  // Delete/duplicate via the Properties panel must be undoable, matching the
  // keyboard shortcuts (Delete / Ctrl+D) which already push an undo snapshot.
  const handleRemoveItem = useCallback((id: string) => {
    pushUndoSnapshot();
    layoutState.removeItem(id);
  }, [layoutState, pushUndoSnapshot]);

  const handleDuplicateItem = useCallback((id: string) => {
    pushUndoSnapshot();
    layoutState.duplicateItem(id);
  }, [layoutState, pushUndoSnapshot]);

  async function handleAutoRepair() {
    await createEmergencyRecoverySnapshot({ id: user.id, name: user.name });
    const repaired = recoverCorruptDomains();
    const report = buildProjectHealthReport();
    setProjectHealth(report);
    setSafeMode(report.overallStatus === 'corrupt');
    emitDataChanged('all');
    showToast(`Recovered ${repaired.length} damaged data area(s).`, 'warning');
  }

  useEffect(() => {
    return subscribeToCollaborationEvents((event) => {
      if (event.type === 'layout-saved') {
        refreshSavedLayouts();
        if (event.actorName && event.actorName !== user.name) showToast(`${event.actorName} saved a newer layout revision.`, 'info');
      }
    });
  }, [refreshSavedLayouts, user.name]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEYS.SAVED_LAYOUTS) refreshSavedLayouts(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshSavedLayouts]);

  useEffect(() => on('spm_open_workspace_help', () => setShowWorkspaceHelp(true)), []);

  // Event-bus → modal wiring (the Header/Sidebar/PropertiesPanel emit these to
  // open modals without prop-drilling). Previously handled by useAppModals.
  useEffect(() => {
    const offs = [
      on('spm_open_vendors', () => {
        closeAll();
        window.location.hash = VENUE_HOME_HASH;
        setView('dashboard');
        emit('spm_dashboard_open_section', 'vendors');
      }),
      on('spm_open_timeline', () => {
        closeAll();
        window.location.hash = VENUE_HOME_HASH;
        setView('dashboard');
        emit('spm_dashboard_open_section', 'timeline');
      }),
      on('spm_open_ops', () => {
        closeAll();
        window.location.hash = VENUE_HOME_HASH;
        setView('dashboard');
        emit('spm_dashboard_open_section', 'ops');
      }),
      on('spm_open_chat', () => {
        closeAll();
        window.location.hash = VENUE_HOME_HASH;
        setView('dashboard');
        emit('spm_dashboard_open_section', 'chat');
      }),
      on('spm_open_decor_designer', (detail) => {
        if (detail?.arrangementId) setEditingArrangementId(detail.arrangementId);
        open('decorDesigner');
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [open, closeAll]);

  // Couples booked into the current space (venue-side verification). Lets the
  // venue admin confirm the placed seating will seat every couple's expected
  // guest count for this space — guest mgmt lives in the couples portal.
  const spaceCouples = useMemo(
    () => getCoupleEvents().filter((ev) => (ev.selectedSpaces || []).includes(layoutState.currentVenue.id)),
    [layoutState.currentVenue.id],
  );
  const getTotalCapacity = useCallback(() => {
    const tableSpecs = getTableSpecs();
    return layoutState.layout.tables.reduce((sum, table) => {
      const spec = tableSpecs.find(s => s.id === table.specId);
      if (!spec) return sum;
      // Mirror the GuestPanel capacity logic so the on-canvas counter agrees
      // with the guest panel: seating rows = chairCount×rowCount; otherwise
      // customCapacity overrides the spec capacity.
      if (spec.isSeatingType) {
        const perRow = table.chairCount ?? table.customCapacity ?? spec.capacity ?? 0;
        const rowCount = Math.max(1, spec.seatingRowCount || 1);
        return sum + perRow * rowCount;
      }
      return sum + (table.customCapacity ?? spec.capacity ?? 0);
    }, 0);
  }, [layoutState.layout.tables]);

  const handleDragStart = useCallback((type: 'table' | 'fixture' | 'arrangement', specId: string, isExterior?: boolean) => {
    setDragItem({ type, specId, isExterior });
  }, []);

  const handleDragEnd = useCallback(() => setDragItem(null), []);

  const applyGridSnap = useCallback((position: Position): Position => {
    if (!snapToGrid) return position;
    return { x: Math.round(position.x / gridSize) * gridSize, y: Math.round(position.y / gridSize) * gridSize, };
  }, [snapToGrid, gridSize]);

  const resolvePlacement = useCallback((rawPosition: Position, item: { kind: 'table' | 'fixture' | 'arrangement'; specId: string; isExterior?: boolean; id?: string; showChairs?: boolean; chairType?: string; chairLayout?: any }, opts?: { silent?: boolean }) => {
    const venue = layoutState.currentVenue;
    const snapped = applyGridSnap({ ...rawPosition });
    const normalized = !!item.isExterior ? { x: Math.max(0, Math.min(snapped.x, (venue.canvasWidth || venue.width + 80) - 5)), y: Math.max(0, Math.min(snapped.y, (venue.canvasHeight || venue.height + 80) - 5)), } : { x: Math.max(0, Math.min(snapped.x, venue.width - 2)), y: Math.max(0, Math.min(snapped.y, venue.height - 2)), };
    if (item.kind === 'table') {
      const collision = checkTableCollision({ x: normalized.x, y: normalized.y, specId: item.specId, showChairs: item.showChairs ?? true, chairType: item.chairType ?? 'white-plastic', chairLayout: item.chairLayout ?? 'all-sides', }, layoutState.layout.tables, layoutState.layout.fixtures, venue, item.id);
      if (collision.collides) {
        if (!opts?.silent) showToast(collision.wallError || collision.details || `Cannot place table here.`, 'warning');
        return { ok: false as const, position: normalized };
      }
      return { ok: true as const, position: normalized };
    }
    const collision = checkFixtureCollision({ x: normalized.x, y: normalized.y, specId: item.specId, isExterior: !!item.isExterior }, layoutState.layout.tables, layoutState.layout.fixtures, venue, item.id);
    if (collision.collides) {
      if (!opts?.silent) showToast(collision.wallError || collision.details || 'Cannot place item here.', 'warning');
      return { ok: false as const, position: normalized };
    }
    return { ok: true as const, position: normalized };
  }, [layoutState, applyGridSnap]);

  const handleDrop = useCallback((position: Position, isExterior?: boolean) => {
    if (!ensureCanEditLayout()) return;
    if (!dragItem) return;
    if (dragItem.type === 'arrangement') {
      const { x, y } = position;
      const targetTable = layoutState.layout.tables.find(t => {
        const spec = getTableSpecs().find(s => s.id === t.specId);
        return spec && x >= t.x && x <= t.x + spec.width && y >= t.y && y <= t.y + spec.height;
      });
      if (targetTable) {
        pushUndoSnapshot();
        layoutState.updateTable(targetTable.id, { appliedArrangementId: dragItem.specId });
        showToast(`Applied design to ${targetTable.label}`, 'success');
        setDragItem(null); return;
      }
      showToast('To apply a design, drop it onto a table.', 'info');
      setDragItem(null); return;
    }
    const placement = resolvePlacement(position, { kind: dragItem.type, specId: dragItem.specId, isExterior: !!(dragItem.isExterior || isExterior), });
    if (!placement.ok) return;
    pushUndoSnapshot();
    if (dragItem.type === 'table') layoutState.addTable(dragItem.specId, placement.position);
    else layoutState.addFixture(dragItem.specId, placement.position, dragItem.isExterior);
    setDragItem(null); setShowProperties(true);
  }, [dragItem, layoutState, resolvePlacement, ensureCanEditLayout]);

  const handleSelectItem = useCallback((id: string | null) => layoutState.setSelectedId(id), [layoutState]);
  const handleDoubleClickItem = useCallback((id: string) => { layoutState.setSelectedId(id); setShowProperties(true); }, [layoutState]);

  // A single undo snapshot is pushed once per interaction (at drag start, via
  // onDragStart, or once per discrete arrow-key nudge) so that Undo rewinds an
  // entire drag as one step rather than hundreds of per-mousemove snapshots.
  const handleMoveItem = useCallback((id: string, position: Position, isExterior?: boolean) => {
    if (!ensureCanEditLayout()) return;
    const table = layoutState.layout.tables.find(t => t.id === id);
    if (table) {
      const placement = resolvePlacement(position, { kind: 'table', id, specId: table.specId, isExterior: false, }, { silent: true });
      if (placement.ok) { layoutState.updateTable(id, { x: placement.position.x, y: placement.position.y }); }
      return;
    }
    const fixture = layoutState.layout.fixtures.find(f => f.id === id);
    if (fixture) {
      const spec = getFixtureTypes().find(s => s.id === fixture.specId);
      if (spec?.isPermanent || !canMoveFixture(user, spec!)) { showToast('Cannot move this fixture.', 'warning'); return; }
      const placement = resolvePlacement(position, { kind: 'fixture', id, specId: fixture.specId, isExterior: !!(fixture.isExterior || isExterior), }, { silent: true });
      if (placement.ok) { layoutState.updateFixture(id, { x: placement.position.x, y: placement.position.y }); }
    }
  }, [layoutState, resolvePlacement, user, ensureCanEditLayout]);

  // Push an undo snapshot for a property-panel edit, coalescing bursts to the
  // same item within a short window so typing a label is ~1 step, not per-keystroke.
  const pushPropertyUndo = useCallback((id: string) => {
    const now = Date.now();
    const last = propertyEditUndoRef.current;
    if (last && last.id === id && now - last.at < 800) return;
    pushUndoSnapshot();
    propertyEditUndoRef.current = { id, at: now };
  }, [pushUndoSnapshot]);

  const handleUpdateTableSafe = useCallback((id: string, updates: Partial<any>) => {
    if (!ensureCanEditLayout()) return;
    const existing = layoutState.layout.tables.find(t => t.id === id);
    if (!existing) return;
    if (updates.x !== undefined || updates.y !== undefined) {
      const placement = resolvePlacement({ x: updates.x ?? existing.x, y: updates.y ?? existing.y }, { kind: 'table', id, specId: existing.specId, ...updates });
      if (placement.ok) { pushUndoSnapshot(); layoutState.updateTable(id, { ...updates, x: placement.position.x, y: placement.position.y }); }
      return;
    }
    // Metadata/property edits (label, linen, chairs, applied design) are undoable
    // too — coalesced so rapid typing doesn't flood history.
    pushPropertyUndo(id);
    layoutState.updateTable(id, updates);
  }, [layoutState, resolvePlacement, ensureCanEditLayout, pushPropertyUndo]);

  const handleUpdateFixtureSafe = useCallback((id: string, updates: Partial<any>) => {
    if (!ensureCanEditLayout()) return;
    const existing = layoutState.layout.fixtures.find(f => f.id === id);
    if (!existing) return;
    if (updates.x !== undefined || updates.y !== undefined) {
      const placement = resolvePlacement({ x: updates.x ?? existing.x, y: updates.y ?? existing.y }, { kind: 'fixture', id, specId: existing.specId, ...updates });
      if (placement.ok) { pushUndoSnapshot(); layoutState.updateFixture(id, { ...updates, x: placement.position.x, y: placement.position.y }); }
      return;
    }
    pushPropertyUndo(id);
    layoutState.updateFixture(id, updates);
  }, [layoutState, resolvePlacement, ensureCanEditLayout, pushPropertyUndo]);

  const handleVenueChange = useCallback((venueId: string) => {
    // Changing venues loads that venue's master layout, which replaces the current
    // layout. Use the dirty tracker (not just item count) so any unsaved edit —
    // including a metadata change with the same item count — prompts before the
    // work is discarded.
    if (layoutState.layoutDirty && venueId !== layoutState.currentVenue.id) {
      setPendingVenueChange(venueId);
      return;
    }
    layoutState.changeVenue(venueId);
    layoutState.markLayoutClean();
    setTimeout(fitAndCenterVenue, 100);
  }, [layoutState, fitAndCenterVenue]);

  const confirmVenueChange = useCallback(() => {
    if (!pendingVenueChange) return;
    const venueId = pendingVenueChange;
    setPendingVenueChange(null);
    layoutState.changeVenue(venueId);
    layoutState.markLayoutClean();
    setTimeout(fitAndCenterVenue, 100);
  }, [pendingVenueChange, layoutState, fitAndCenterVenue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // These are floor-plan canvas shortcuts; keep them scoped to the Studio so
      // they don't act on a stale selection in other views (e.g. the venue map).
      if (view !== 'studio') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || e.key === 'Backspace')) { if (layoutState.selectedId) { e.preventDefault(); layoutState.removeItem(layoutState.selectedId); } }
      else if (mod && (e.key === 'd' || e.key === 'D')) {
        if (layoutState.selectedId) { e.preventDefault(); pushUndoSnapshot(); layoutState.duplicateItem(layoutState.selectedId); }
      }
      else if (e.key === 'p' || e.key === 'P') { if (!mod) { setShowProperties(v => !v); } }
      else if (e.key === '?') { e.preventDefault(); setShowWorkspaceHelp(true); }
      else if (mod && e.key === '1') { e.preventDefault(); handleResetToVenue(); }
      else if (mod && e.key === '0') { e.preventDefault(); handleResetToCanvas(); }
      else if (e.key === 'Escape') { layoutState.setSelectedId(null); setShowProperties(false); setDragItem(null); }
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, layoutState, pushUndoSnapshot, handleResetToVenue, handleResetToCanvas]);

  useEffect(() => { rootStyles(brandingConfig); }, [brandingConfig]);

  // Keep the browser tab title and favicon in sync with venue branding.
  useEffect(() => {
    applyDocumentBranding({
      name: brandingConfig.venueName,
      logoUrl: brandingConfig.logoUrl,
      primaryColor: brandingConfig.primaryColor,
    });
  }, [brandingConfig.venueName, brandingConfig.logoUrl, brandingConfig.primaryColor]);

  // Warn before a browser refresh/close if the working layout has unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (layoutState.layoutDirty || venueMapDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [layoutState.layoutDirty, venueMapDirty]);

  // Save/delete wrappers that flush to the shared backend after the local
  // localStorage write (no-op when the platform backend is disabled).
  const handleSaveLayoutWithSync = useCallback(
    (name: string) => {
      const id = layoutState.saveLayout(name);
      layoutState.markLayoutClean();
      // Refresh the Header's saved-layout list in the same tab (in local mode the
      // backend sync is a no-op and saving doesn't emit a data-changed event, so
      // the new layout would otherwise not appear in "Load Layout" until reload).
      refreshSavedLayouts();
      void layoutBackendSync.saveToBackend();
      showToast(`Layout "${name}" saved.`, 'success');
      return id;
    },
    [layoutState, layoutBackendSync, refreshSavedLayouts],
  );

  // Load a saved layout, then treat the loaded content as the clean baseline.
  const handleLoadSavedLayout = useCallback(
    (id: string) => {
      layoutState.loadLayout(id);
      layoutState.markLayoutClean();
      handleResetView();
      showToast('Saved layout loaded.', 'success');
    },
    [layoutState, handleResetView],
  );

  const handleSaveMasterLayout = useCallback(() => {
    const isLayoutEmpty =
      layoutState.layout.tables.length === 0 &&
      layoutState.layout.fixtures.length === 0 &&
      (layoutState.layout.decor || []).length === 0;
    if (isLayoutEmpty) {
      setConfirmEmptyMasterLayout(true);
      return;
    }
    layoutState.saveMasterLayout();
    layoutState.markLayoutClean();
    showToast(`Saved as the master layout for ${layoutState.currentVenue.name}.`, 'success');
  }, [layoutState]);

  const handleSaveLayoutOverwriteWithSync = useCallback(
    (name: string) => {
      const id = layoutState.saveLayoutWithOverwrite(name);
      layoutState.markLayoutClean();
      refreshSavedLayouts();
      void layoutBackendSync.saveToBackend();
      showToast(`Layout "${name}" saved.`, 'success');
      return id;
    },
    [layoutState, layoutBackendSync, refreshSavedLayouts],
  );

  const handleDeleteSavedLayoutWithSync = useCallback(
    (id: string) => {
      setSavedLayoutsState((prev) => {
        const next = prev.filter((l) => l.id !== id);
        setSavedLayouts(next);
        return next;
      });
      void layoutBackendSync.saveToBackend();
      showToast('Saved layout deleted.', 'success');
    },
    [layoutBackendSync],
  );

  // Shared template-application flow used by both the quick template gallery
  // and the standalone TemplateSelector: warn before overwriting real work,
  // then switch space + load.
  const handleTemplateSelect = useCallback(
    (t: LayoutTemplate) => {
      const proceed = () => {
        if (t.venueId !== layoutState.currentVenue.id) layoutState.changeVenue(t.venueId);
        layoutState.loadTemplate(t);
        layoutState.markLayoutClean();
        handleResetView();
        closeAll();
      };
      if (layoutState.layoutDirty) {
        setPendingOverwrite(() => proceed);
        return;
      }
      proceed();
    },
    [layoutState, handleResetView, closeAll],
  );

  // Never render a venue workspace from the shared browser cache until this
  // exact authenticated organization has been hydrated. This blocks stale data
  // from a previously signed-in tenant, including property maps, during load or
  // after a failed pull.
  if (!entityBackendSync.hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          {entityBackendSync.loadError ? (
            <>
              <div className="text-3xl" aria-hidden="true">⚠️</div>
              <h1 className="mt-3 text-lg font-bold text-gray-900">We couldn’t load your venue workspace</h1>
              <p className="mt-2 text-sm text-gray-600">
                Your venue data has not been opened on this device. Check your connection and try again.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void entityBackendSync.loadFromBackend()}
                  className="rounded-lg bg-[#4A1942] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3b1435]"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <div role="status" aria-live="polite">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#4A1942]" aria-hidden="true" />
              <h1 className="mt-4 text-lg font-bold text-gray-900">Loading your venue workspace…</h1>
              <p className="mt-1 text-sm text-gray-500">Your maps and planning data will appear when they’re ready.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'admin') {
    return (
      <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#f3f4f6' }}>
        <div className="flex-1 overflow-hidden">
          {canOpenAdminPanel ? (
            <AdminPanel
              inline
              onClose={() => { window.location.hash = VENUE_HOME_HASH; setView('dashboard'); }}
              currentLayout={{ tables: layoutState.layout.tables, fixtures: layoutState.layout.fixtures, venueId: layoutState.currentVenue.id, category: layoutState.currentVenue.category }}
              onLoadTemplateForEdit={(t) => { if (t.venueId !== layoutState.currentVenue.id) layoutState.changeVenue(t.venueId); layoutState.loadTemplate(t); layoutState.markLayoutClean(); handleResetView(); }}
              onOpenVenueMap={() => { window.location.hash = '#/venuemap'; setView('venuemap'); closeAll(); }}
            />
          ) : (
            <div className="p-6 text-sm text-gray-500">You don't have admin access.</div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'venuemap') {
    return (
      <div className="spm-venue-map-shell h-screen flex flex-col" style={{ backgroundColor: '#f3f4f6' }}>
        <header className="h-14 px-4 flex items-center justify-between bg-white border-b border-gray-200 no-print spm-studio-chrome">
          <button
            type="button"
            onClick={leaveVenueMap}
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            ← Studio
          </button>
          <span className="text-sm font-semibold text-gray-700">
            🗺️ Venue Map Designer
            {venueMapDirty && <span className="ml-2 text-[11px] font-medium text-amber-600">● Unsaved</span>}
          </span>
          <div className="w-24" />
        </header>
        <div className="spm-venue-map-content flex-1 overflow-auto p-4">
          {canOpenAdminPanel ? (
            <VenueMapDesigner
              key={`${organizationId || 'local'}:${venueMapEditorKey}`}
              map={venueMapEditorSeed?.organizationId === organizationId
                ? venueMapEditorSeed.map
                : getVenueMapConfig() || emptyVenueMapConfig()}
              structuralRecoveryArtifacts={venueMapEditorSeed?.organizationId === organizationId
                ? []
                : getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())}
              venues={layoutState.venues}
              mapTitle={brandingConfig.venueName || 'Venue Map'}
              organizationId={organizationId || undefined}
              baseUpdatedAt={organizationId
                ? getEntityDomainRevision(organizationId, 'venueMapConfigs')
                : undefined}
              onSave={async (next, expectedUpdatedAt) => {
                const outcome = await coordinateVenueMapSave({
                  cloudEnabled: entityBackendSync.enabled,
                  map: next,
                  expectedUpdatedAt,
                  saveToCloud: entityBackendSync.saveVenueMapToBackend,
                  saveToCanonicalCache: (mapToCache, emitChange) => {
                    saveVenueMapConfig(mapToCache, { emitChange });
                  },
                  onConflict: (conflict) => {
                    setVenueMapConflict({ ...conflict, overwriteBlocked: true });
                    setVenueMapDirty(true);
                  },
                });
                if (outcome.status === 'saved') {
                  setVenueMapEditorSeed({ organizationId, map: next });
                }
                return outcome;
              }}
              onConflictDraftChange={(latestDraft, publicationBlocked) => {
                setVenueMapConflict((conflict) => conflict
                  ? {
                      ...conflict,
                      localMap: latestDraft,
                      overwriteBlocked: publicationBlocked,
                    }
                  : conflict);
              }}
              onClose={leaveVenueMap}
              onDirtyChange={setVenueMapDirty}
            />
          ) : (
            <div className="p-6 text-sm text-gray-500">You don't have permission to edit the venue map.</div>
          )}
        </div>
        <ConfirmDialog
          open={confirmVenueMapLeave}
          title="Discard unsaved map changes?"
          message="You have unsaved changes to the venue map. Leaving will discard them. Save the map first to keep your work."
          confirmLabel="Leave anyway"
          cancelLabel="Keep editing"
          initialFocus="cancel"
          tone="danger"
          onConfirm={() => {
            const destination = pendingVenueMapHash || '#/studio';
            setConfirmVenueMapLeave(false);
            setPendingVenueMapHash(null);
            venueMapDirtyRef.current = false;
            setVenueMapDirty(false);
            window.location.hash = destination;
            if (destination.startsWith('#/admin')) setView('admin');
            else if (destination.startsWith('#/studio')) setView('studio');
            else if (destination.startsWith('#/venuemap')) setView('venuemap');
            else setView('dashboard');
            closeAll();
          }}
          onCancel={() => { setConfirmVenueMapLeave(false); setPendingVenueMapHash(null); window.history.replaceState(window.history.state, '', '#/venuemap'); }}
        />
        <ConfirmDialog
          open={venueMapConflict !== null}
          title="Venue map changed elsewhere"
          message={`${venueMapConflict?.overwriteBlocked
            ? 'Another administrator saved this map while you were working, and the retained draft still has unapplied edits or required publication repairs. Keep your draft, resolve the items shown in the designer, and save again before choosing an explicit overwrite. Reloading will discard the entire local draft.'
            : 'Another tab or venue administrator saved this map after you opened it. Your latest draft is still here and has not replaced their work. Keep editing, reload the shared map, or explicitly overwrite it with your draft.'}${venueMapConflictCoverageIssues.length > 0
            ? ` The exact retained draft has ${venueMapConflictCoverageIssues.length} known guest map or wayfinding ${venueMapConflictCoverageIssues.length === 1 ? 'gap' : 'gaps'}: ${venueMapConflictCoverageIssues.slice(0, 3).map((issue) => `${issue.pointLabel}: ${issue.message}`).join(' ')}${venueMapConflictCoverageIssues.length > 3 ? ` Plus ${venueMapConflictCoverageIssues.length - 3} more shown in the designer’s coverage report.` : ''} Overwriting will not create missing pins or routes, or claim step-free access.`
            : ''}`}
          cancelLabel="Keep my draft"
          alternateLabel="Reload shared map"
          confirmLabel={venueMapConflictCoverageIssues.length > 0
            ? 'Overwrite with known gaps'
            : 'Overwrite shared map'}
          initialFocus="cancel"
          tone="danger"
          busy={resolvingVenueMapConflict}
          confirmDisabled={venueMapConflict?.overwriteBlocked ?? true}
          onCancel={keepVenueMapConflictDraft}
          onAlternate={reloadVenueMapConflict}
          onConfirm={() => { void overwriteVenueMapConflict(); }}
        />
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <VenueDashboard
        user={user}
        isAdmin={isAdmin}
        isStaff={isStaff}
        canAdmin={canOpenAdminPanel}
        canOps={canOpenOperationsPanel}
        onOpenAdmin={(tab?: string) => {
          window.location.hash = tab ? `#/admin/${tab}` : '#/admin';
          setView('admin');
          closeAll();
          if (tab) {
            setTimeout(() => emit('spm_open_admin_tab', tab), 20);
          }
        }}
        onOpenOperations={() => {
          window.location.hash = VENUE_HOME_HASH;
          setView('dashboard');
          emit('spm_dashboard_open_section', 'ops');
        }}
        onOpenVendors={() => {
          window.location.hash = VENUE_HOME_HASH;
          setView('dashboard');
          emit('spm_dashboard_open_section', 'vendors');
        }}
        onOpenTimeline={() => {
          window.location.hash = VENUE_HOME_HASH;
          setView('dashboard');
          emit('spm_dashboard_open_section', 'timeline');
        }}
        onOpenStudio={() => { window.location.hash = '#/studio'; setView('studio'); }}
        onLogout={logout}
        users={allUsers}
        opsNode={
          canOpenOperationsPanel ? (
            <StaffOperationsPanel
              inline
              onClose={() => {
                window.location.hash = VENUE_HOME_HASH;
                setView('dashboard');
                emit('spm_dashboard_go_home');
              }}
              currentUser={user}
              isAdmin={isAdmin}
              venueId={layoutState.currentVenue.id}
              eventName={currentEventName}
              users={allUsers}
              venues={selectableVenues}
            />
          ) : undefined
        }
        vendorsNode={
          <VendorPanel
            inline
            onClose={() => {
              window.location.hash = VENUE_HOME_HASH;
              setView('dashboard');
              emit('spm_dashboard_go_home');
            }}
          />
        }
        timelineNode={
          <TimelinePanel
            inline
            onClose={() => {
              window.location.hash = VENUE_HOME_HASH;
              setView('dashboard');
              emit('spm_dashboard_go_home');
            }}
          />
        }
      />
    );
  }

  return (
    <UndoRedoProvider onRestore={handleRestoreSnapshot}>
      <div className="h-screen flex flex-col overflow-hidden spm-studio-root" style={{ fontFamily: brandingConfig.fontFamily, backgroundColor: brandingConfig.backgroundColor, color: brandingConfig.bodyTextColor }}>
        <Header
          currentVenue={layoutState.currentVenue} venues={selectableVenues} selectedVenueCategories={selectedVenueCategories} onChangeVenueCategories={setSelectedVenueCategories} onChangeVenue={handleVenueChange}
          onSaveLayout={() => handleSaveLayoutWithSync(`${layoutState.currentVenue.name} Layout`)} onSaveLayoutOverwrite={handleSaveLayoutOverwriteWithSync} onSaveMasterLayout={isAdmin ? handleSaveMasterLayout : undefined} onClearMasterLayout={isAdmin ? () => { layoutState.clearMasterLayout(); showToast('Master layout cleared.', 'success'); } : undefined} onPrint={() => open('print')}
          onShowTemplates={() => open('templates')} onShowSpacesLayouts={() => setShowLayoutsHome(true)} onOpenVenueMap={canOpenAdminPanel ? () => guardStudioLeave(() => { closeAll(); window.location.hash = '#/venuemap'; setView('venuemap'); }) : undefined} onShowAdmin={canOpenAdminPanel ? () => guardStudioLeave(() => { closeAll(); window.location.hash = '#/admin'; setView('admin'); }) : undefined} onShowDashboard={() => guardStudioLeave(() => { closeAll(); window.location.hash = VENUE_HOME_HASH; setView('dashboard'); })} onLogout={() => guardStudioLeave(logout)} userName={user.name} isAdmin={isAdmin} isStaff={isStaff}
          onOpenOperations={
            canOpenOperationsPanel
              ? () => guardStudioLeave(() => {
                  closeAll();
                  window.location.hash = VENUE_HOME_HASH;
                  setView('dashboard');
                  emit('spm_dashboard_open_section', 'ops');
                })
              : undefined
          }
          savedLayouts={savedLayouts} onLoadSavedLayout={handleLoadSavedLayout} onDeleteSavedLayout={handleDeleteSavedLayoutWithSync}
          mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} onShowWorkspaceHelp={() => setShowWorkspaceHelp(true)} currentUser={user}
        />
        <div className="no-print spm-studio-chrome">
          <AppStatusBar items={statusItems} />
        </div>
        <div className="relative flex-1 flex overflow-hidden">
          {/* Sidebar overlays the canvas on small screens; returns to normal flex
              flow on md+ so the tools don't squeeze the canvas on mobile/tablet. */}
          <div className={`${isMobile ? 'absolute top-0 bottom-0 left-0 z-30 flex' : ''} shrink-0 no-print spm-studio-chrome`}>
            <Sidebar
              width={sidebarWidth} collapsed={sidebarCollapsed} onWidthChange={setSidebarWidth} onCollapsedChange={setSidebarCollapsed} zoom={zoom} onZoomChange={setZoom} showGrid={showGrid} onShowGridChange={setShowGrid} gridSize={gridSize} onGridSizeChange={setGridSize} gridContrast={gridContrast} onGridContrastChange={setGridContrast} snapToGrid={snapToGrid} onSnapToGridChange={setSnapToGrid}
              onDragStart={handleDragStart} onDragEnd={handleDragEnd} currentDragItem={dragItem} onClearLayout={handleClearLayout} isAdmin={isAdmin} onViewImage={(url, title) => setImagePreview({ url, title })}
              layoutCategories={layoutCategories} currentVenueCategory={layoutState.currentVenue.category} venueWidth={layoutState.currentVenue.width} venueHeight={layoutState.currentVenue.height} canvasWidth={layoutState.currentVenue.canvasWidth} canvasHeight={layoutState.currentVenue.canvasHeight}
              onResetView={handleResetView} onResetToVenue={handleResetToVenue} onResetToCanvas={handleResetToCanvas} placedTables={layoutState.layout.tables} placedFixtures={layoutState.layout.fixtures} currentUser={user}
            />
          </div>
          <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden spm-print-canvas-container">
            <FloorPlanCanvas
              venue={layoutState.currentVenue} tables={layoutState.layout.tables} fixtures={layoutState.layout.fixtures} decor={layoutState.layout.decor} guests={layoutState.guests} selectedId={layoutState.selectedId} zoom={zoom} showGrid={showGrid} gridSize={gridSize} gridContrast={gridContrast}
              onSelect={handleSelectItem} onDoubleClick={handleDoubleClickItem} onMove={handleMoveItem} onDrop={handleDrop} onClickToPlace={handleDrop} onDragStart={pushUndoSnapshot} isDragging={!!dragItem} isDraggingExterior={dragItem?.isExterior || false} isAdmin={isAdmin} onViewImage={(url, title) => setImagePreview({ url, title })} panOffset={panOffset} onPanChange={setPanOffset} onZoomChange={setZoom} svgRef={floorPlanSvgRef}
            />
            <div className="absolute bottom-4 left-4 flex items-center gap-2 flex-wrap no-print spm-studio-chrome">
              <div className="bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow-lg text-sm">
                {(() => {
                  const placed = getTotalCapacity();
                  const seating = computeSpaceSeating(placed, layoutState.currentVenue.capacity, spaceCouples);
                  return (
                    <>
                      <span className="font-medium">Capacity:</span>{' '}
                      <span className={seating.overVenueCapacity ? 'text-red-600 font-bold' : 'text-green-600'}>
                        {placed} / {layoutState.currentVenue.capacity}
                      </span>
                      {seating.hasCouples && (
                        <>
                          <span className="ml-2 text-gray-500">
                            · Needs seats for{' '}
                            <span className={seating.underCapacity ? 'text-amber-700 font-semibold' : 'text-green-700'}>
                              {seating.expectedGuests}
                            </span>{' '}
                            guests
                          </span>
                          {seating.underCapacity && (
                            <span
                              className="ml-1 text-amber-700 font-semibold"
                              title="Couples using this space expect more guests than the placed seating seats."
                            >
                              ⚠️ under-capacity
                            </span>
                          )}
                          <span className="block text-[11px] text-gray-400 mt-0.5">
                            Booked couples: {spaceCouples.map((c) => c.coupleName).join(', ')}
                          </span>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() => open('overview')}
                className="bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow-lg text-sm font-medium hover:bg-white"
                aria-label="Open event overview dashboard"
              >
                📊 Overview
              </button>
            </div>
            <UndoRedoToolbar />
            {layoutState.warnings.length > 0 &&
              dismissedWarningsKey !== layoutState.warnings.map((w) => w.id).join('|') && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[min(28rem,92%)] pointer-events-none">
                <div className="bg-amber-50 border border-amber-300 rounded-xl shadow-lg p-3 text-sm text-amber-900 pointer-events-auto">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold mb-1">
                      ⚠️ {layoutState.warnings.length} layout warning{layoutState.warnings.length === 1 ? '' : 's'}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDismissedWarningsKey(layoutState.warnings.map((w) => w.id).join('|'))
                      }
                      className="text-amber-700 hover:text-amber-900 font-bold leading-none"
                      aria-label="Dismiss layout warnings"
                      title="Dismiss (warnings reappear if new issues arise)"
                    >
                      ✕
                    </button>
                  </div>
                  <ul className="text-xs space-y-0.5 max-h-24 overflow-y-auto mt-1">
                    {layoutState.warnings.slice(0, 5).map((w) => (
                      <li key={w.id}>• {w.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {isMasterBasicUser && (
              <div className="absolute bottom-4 left-44 z-20 flex gap-2 no-print spm-studio-chrome">
                <button onClick={() => open('messages')} className="btn-primary bg-[#4A1942] text-white rounded-xl shadow-lg px-3 py-2 text-sm font-medium" style={{ backgroundColor: brandingConfig.primaryColor || '#4A1942' }}>💬 Messages</button>
                <button onClick={() => open('submission')} className="btn-primary bg-[#4A1942] text-white rounded-xl shadow-lg px-3 py-2 text-sm font-medium" style={{ backgroundColor: brandingConfig.primaryColor || '#4A1942' }}>📤 Submit</button>
                <button onClick={() => open('eventQuestions')} className="btn-primary bg-[#4A1942] text-white rounded-xl shadow-lg px-3 py-2 text-sm font-medium" style={{ backgroundColor: brandingConfig.primaryColor || '#4A1942' }}>📝 Questions</button>
              </div>
            )}
          </div>
          <div className={`${isMobile ? 'absolute top-0 bottom-0 right-0 z-30 flex' : ''} shrink-0 no-print spm-studio-chrome`}>
            <PropertiesPanel
              selectedId={layoutState.selectedId} tables={layoutState.layout.tables} fixtures={layoutState.layout.fixtures} onUpdateTable={handleUpdateTableSafe} onUpdateFixture={handleUpdateFixtureSafe}
              onRemoveItem={handleRemoveItem} onDuplicateItem={handleDuplicateItem} onClose={() => setShowProperties(false)}
              onViewImage={(url, title) => setImagePreview({ url, title })} visible={showProperties} onToggleVisibility={() => setShowProperties(v => !v)} arrangements={layoutState.getDecorArrangements()}
            />
          </div>
        </div>
        <Suspense fallback={null}>
          {showOperations && (
            <StaffOperationsPanel
              onClose={() => {
                close('operations');
                window.location.hash = VENUE_HOME_HASH;
                setView('dashboard');
                emit('spm_dashboard_go_home');
              }}
              currentUser={user}
              isAdmin={isAdmin}
              venueId={layoutState.currentVenue.id}
              eventName={currentEventName}
              users={allUsers}
              venues={selectableVenues}
            />
          )}
          {showVendors && (
            <VendorPanel
              onClose={() => {
                close('vendors');
                window.location.hash = VENUE_HOME_HASH;
                setView('dashboard');
                emit('spm_dashboard_go_home');
              }}
            />
          )}
          {showTimeline && (
            <TimelinePanel
              onClose={() => {
                close('timeline');
                window.location.hash = VENUE_HOME_HASH;
                setView('dashboard');
                emit('spm_dashboard_go_home');
              }}
            />
          )}
          {showPrint && canPrintCurrentLayout && (
            <PrintView
              venue={layoutState.currentVenue}
              tables={layoutState.layout.tables}
              fixtures={layoutState.layout.fixtures}
              guests={layoutState.guests}
              layoutName={currentEventName}
              exportSvgRef={floorPlanSvgRef}
              onClose={() => close('print')}
            />
          )}
          {showEventQuestions && (
            <CenteredModal title="Event Questions" onClose={() => close('eventQuestions')}>
              <EventQuestionsWizard
                questions={eventQuestions}
                initialAnswers={currentEventAnswers}
                userId={user.id}
                eventId={currentEventName}
                onSaveAnswers={saveEventAnswers}
                onVenueFilterChange={setSelectedVenueCategories}
                onComplete={() => close('eventQuestions')}
              />
            </CenteredModal>
          )}
          {showSubmission && (
            <CenteredModal title="Submission Status" onClose={() => close('submission')}>
              <SubmissionStatusPanel
                eventName={currentEventName}
                selectedVenueIds={selectableVenues.map((v) => v.id)}
                answers={currentEventAnswers}
                submission={currentSubmission}
                onSubmit={() => {
                  submissionWorkflow.submit({
                    eventName: currentEventName,
                    masterUserId: user.id,
                    masterUserName: user.name,
                    selectedVenueIds: selectableVenues.map((v) => v.id),
                    answers: currentEventAnswers,
                  });
                  showToast('Layout submitted for approval.', 'success');
                }}
              />
            </CenteredModal>
          )}
          {showMessages && (
            <CenteredModal title="Messages" onClose={() => close('messages')}>
              <DirectMessagePanel
                title="Messages"
                threadId={masterThreadId}
                currentUserId={user.id}
                currentUserName={user.name}
                currentUserRole="admin"
              />
            </CenteredModal>
          )}
          {showDecorDesigner && <DecorDesigner onClose={() => close('decorDesigner')} onSave={(a) => { const currentArrangements = layoutState.getDecorArrangements(); const nextArrangements = currentArrangements.find(x => x.id === a.id) ? currentArrangements.map(x => x.id === a.id ? a : x) : [...currentArrangements, a]; layoutState.setDecorArrangements(nextArrangements); close('decorDesigner'); }} initialArrangement={editingArrangementId ? layoutState.getDecorArrangements().find(a => a.id === editingArrangementId) : null} />}
          {showAdmin && <AdminPanel onClose={() => { close('admin'); window.location.hash = VENUE_HOME_HASH; setView('dashboard'); layoutState.refreshVenues(); }} currentLayout={{ tables: layoutState.layout.tables, fixtures: layoutState.layout.fixtures, venueId: layoutState.currentVenue.id, category: layoutState.currentVenue.category }} onLoadTemplateForEdit={(t) => { if (t.venueId !== layoutState.currentVenue.id) layoutState.changeVenue(t.venueId); layoutState.loadTemplate(t); layoutState.markLayoutClean(); handleResetView(); }} onOpenVenueMap={() => { close('admin'); window.location.hash = '#/venuemap'; setView('venuemap'); closeAll(); }} />}
          {showOverview && (
            <EventOverview
              guests={layoutState.guests}
              tables={layoutState.layout.tables}
              tableSpecs={getTableSpecs()}
              venue={layoutState.currentVenue}
              eventName={currentEventName}
              venueName={layoutState.currentVenue.name}
              onOpenVendors={() => {
                close('overview');
                window.location.hash = VENUE_HOME_HASH;
                setView('dashboard');
                emit('spm_dashboard_open_section', 'vendors');
              }}
              onOpenTemplates={() => { close('overview'); open('templates'); }}
              onClose={() => close('overview')}
            />
          )}
          {showTemplates && (
            <TemplateSelector
              templates={getTemplates()}
              layoutCategories={layoutCategories}
              onSelect={handleTemplateSelect}
              onClose={() => close('templates')}
            />
          )}
          {showLayoutsHome && (
            <StudioLayoutsHome
              venues={selectableVenues}
              currentVenueId={layoutState.currentVenue.id}
              templates={getTemplates()}
              layoutCategories={layoutCategories}
              canEdit={canEditCurrentLayout}
              onOpenVenue={(venueId) => {
                setShowLayoutsHome(false);
                // Route through the guarded handler so unsaved work isn't discarded
                // silently (falls back to the switch-venues confirm dialog).
                handleVenueChange(venueId);
              }}
              onSelectTemplate={(t) => {
                setShowLayoutsHome(false);
                handleTemplateSelect(t);
              }}
              onOpenVenueMap={canOpenAdminPanel ? () => {
                setShowLayoutsHome(false);
                guardStudioLeave(() => { window.location.hash = '#/venuemap'; setView('venuemap'); closeAll(); });
              } : undefined}
              onClose={() => setShowLayoutsHome(false)}
            />
          )}
          {showWorkspaceHelp && <WorkspaceHelp onClose={() => setShowWorkspaceHelp(false)} />}
          {imagePreview && (
            <CenteredModal title={imagePreview.title || 'Image Preview'} onClose={() => setImagePreview(null)}>
              <div className="max-h-[70vh] overflow-auto">
                <img
                  src={imagePreview.url}
                  alt={imagePreview.title || 'Preview'}
                  className="mx-auto max-h-[65vh] rounded-lg object-contain shadow-lg"
                  onClick={() => setImagePreview(null)}
                />
              </div>
            </CenteredModal>
          )}
          {showWelcome && (
            <WelcomeModal
              onClose={() => setShowWelcome(false)}
              isAdmin={isAdmin}
              isGuest={isGuest}
            />
          )}
          <ConfirmDialog
            open={!!pendingVenueChange}
            title="Switch venues?"
            message="Your current layout has placed items that haven't been saved. Switching venues will load that venue's master layout and discard this work. Continue?"
            confirmLabel="Discard & Switch"
            onConfirm={() => confirmVenueChange()}
            onCancel={() => setPendingVenueChange(null)}
          />
          {/* ... other modals similarly refactored ... */}

          <ConfirmDialog
            open={!!pendingOverwrite}
            title="Replace current layout?"
            message="Loading a template will replace your current layout. This cannot be undone."
            confirmLabel="Replace"
            onConfirm={() => {
              pendingOverwrite?.();
              setPendingOverwrite(null);
            }}
            onCancel={() => setPendingOverwrite(null)}
          />

          <ConfirmDialog
            open={!!pendingStudioLeave}
            title="Discard unsaved layout changes?"
            message="You have unsaved changes to this layout. Leaving the Studio will discard them. Save the layout first to keep your work."
            confirmLabel="Leave anyway"
            onConfirm={() => {
              const action = pendingStudioLeave;
              setPendingStudioLeave(null);
              action?.();
            }}
            onCancel={() => setPendingStudioLeave(null)}
          />

          <ConfirmDialog
            open={confirmEmptyMasterLayout}
            title="Save empty Master Layout?"
            message={`The layout for "${layoutState.currentVenue.name}" has no tables, fixtures, or decor items. Saving this as the Master Layout will replace any existing master layout with an empty canvas. Are you sure?`}
            confirmLabel="Save empty master"
            onConfirm={() => {
              setConfirmEmptyMasterLayout(false);
              layoutState.saveMasterLayout();
              layoutState.markLayoutClean();
              showToast(`Saved as the master layout for ${layoutState.currentVenue.name}.`, 'success');
            }}
            onCancel={() => setConfirmEmptyMasterLayout(false)}
          />
        </Suspense>
      </div>
    </UndoRedoProvider>
  );
}

function rootStyles(config: any) {
  const root = document.documentElement;
  root.style.setProperty('--primary-color', config.primaryColor);
  root.style.setProperty('--primary-dark', config.primaryDark);
  root.style.setProperty('--primary-light', config.primaryLight);
  root.style.setProperty('--accent-color', config.accentColor);
  root.style.setProperty('--background-color', config.backgroundColor);
  root.style.setProperty('--text-color', config.textColor);
  root.style.setProperty('--font-family', config.fontFamily);
  root.style.setProperty('--heading-font-family', config.headingFontFamily);
  root.style.setProperty('--header-text-color', config.headerTextColor);
  root.style.setProperty('--body-text-color', config.bodyTextColor);
  root.style.setProperty('--accent-text-color', config.accentTextColor);
}

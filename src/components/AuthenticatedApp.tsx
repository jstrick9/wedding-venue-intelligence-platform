import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useLayoutState, getSavedLayouts, setSavedLayouts, getTemplates, getTableSpecs, getFixtureTypes, getDecorArrangements, getDecorItems } from '../hooks/useLayoutState';
import { scrubArrangementRefs } from '../utils/decorCleanup';
import { useLayoutBackendSync } from '../hooks/useLayoutBackendSync';
import { useEntityBackendSync } from '../hooks/useEntityBackendSync';
import { EventAnswer, EventQuestion, LayoutTemplate, VenueMapConfig } from '../types';
import { getChairSpecs, getSpacingSettings, layoutCategories } from '../data/venueData';
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
import {
  checkTableCollision,
  checkFixtureCollision,
  getFixtureFootprintPolygon,
  getTableFootprintPolygon,
} from '../utils/collisionDetection';
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
import { emit, emitDataChanged, on, type UndoSnapshot } from '../utils/appEvents';
import { VENUE_HOME_HASH, needsVenueHomeHashRewrite } from '../utils/venueHomeRoute';
import { venueMapGuestRouteCoverageIssues } from '../utils/venueMapDesigner';
import { useModals } from '../contexts/ModalContext';
import { VenueGeometryEditor } from './VenueGeometryEditor';
import type { GeometryImpactSource } from '../utils/venueGeometryImpact';
import {
  configuredChairCount,
  configuredChairType,
  layoutSeatCount,
} from '../utils/layoutSeating';
import {
  arrangementPlacementInventoryIssue,
  decorPlacementInventoryIssue,
  fixturePlacementInventoryIssue,
  tablePlacementInventoryIssue,
} from '../utils/layoutInventory';
import {
  effectiveCanvasGeometry,
  footprintFitsVenue,
  isSupportedVenueShape,
  pointInPolygon,
  rotatedBoxPolygon,
  venueShapePolygon,
} from '../utils/venueGeometry';
import { appliedArrangementBaseDimensions, appliedArrangementFootprints } from '../utils/decorGeometry';
import { applyLayoutIdentityRepair, buildLayoutIdentityReview } from '../utils/layoutIdentity';
import { LayoutIdentityRepairDialog } from './LayoutIdentityRepairDialog';

// ─── Lazy-loaded modal / portal components ───────────────────────────────────
const DecorDesigner = lazy(() => import('./DecorDesigner').then((m) => ({ default: m.DecorDesigner })));
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

function nearbyDuplicatePositions(x: number, y: number): Position[] {
  const positions: Position[] = [];
  for (let distance = 3; distance <= 48; distance += 3) {
    positions.push(
      { x: x + distance, y },
      { x, y: y + distance },
      { x: x - distance, y },
      { x, y: y - distance },
      { x: x + distance, y: y + distance },
      { x: x - distance, y: y + distance },
      { x: x + distance, y: y - distance },
      { x: x - distance, y: y - distance },
    );
  }
  return positions;
}
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
  const layoutIdentityReview = useMemo(
    () => buildLayoutIdentityReview(layoutState.layout, layoutState.guests),
    [layoutState.layout, layoutState.guests],
  );
  const [showIdentityRepair, setShowIdentityRepair] = useState(false);
  const lastIdentityReviewSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!layoutIdentityReview) {
      lastIdentityReviewSignatureRef.current = null;
      setShowIdentityRepair(false);
      return;
    }
    if (lastIdentityReviewSignatureRef.current !== layoutIdentityReview.signature) {
      lastIdentityReviewSignatureRef.current = layoutIdentityReview.signature;
      setShowIdentityRepair(true);
    }
  }, [layoutIdentityReview]);

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
  const pendingMoveUndoRef = useRef<UndoSnapshot | null>(null);
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

  const [showLayoutsHome, setShowLayoutsHome] = useState(false);
  const [showVenueGeometryEditor, setShowVenueGeometryEditor] = useState(false);

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
  const [keepAdding, setKeepAdding] = useState(false);
  const [savedLayouts, setSavedLayoutsState] = useState(() => getSavedLayouts());
  const venueGeometrySources = useMemo<GeometryImpactSource[]>(() => {
    const venueId = layoutState.currentVenue.id;
    const sources: GeometryImpactSource[] = [{
      id: `working:${venueId}`,
      label: 'Current working layout',
      kind: 'working',
      tables: layoutState.layout.tables,
      fixtures: layoutState.layout.fixtures,
      decor: layoutState.layout.decor || [],
      ceremonyRows: layoutState.layout.ceremonyRows || [],
    }];
    const master = layoutState.currentVenue.masterLayout;
    if (master) {
      sources.push({
        id: `master:${venueId}`,
        label: `Master · ${layoutState.currentVenue.name}`,
        kind: 'master',
        tables: master.tables || [],
        fixtures: master.fixtures || [],
        decor: master.decor || [],
        ceremonyRows: master.ceremonyRows || [],
      });
    }
    savedLayouts
      .filter((layout) => layout.venueId === venueId)
      .forEach((layout) => sources.push({
        id: `named:${layout.id}`,
        label: layout.name,
        kind: 'named',
        tables: layout.tables || [],
        fixtures: layout.fixtures || [],
        decor: layout.decor || [],
        ceremonyRows: layout.ceremonyRows || [],
      }));
    getCoupleEvents().forEach((event) => {
      const coupleLayout = event.spaceLayouts?.[venueId]?.layout;
      if (!coupleLayout) return;
      sources.push({
        id: `couple:${event.id}:${venueId}`,
        label: `${event.coupleName}${event.eventDate ? ` · ${event.eventDate}` : ''}`,
        kind: 'couple',
        tables: coupleLayout.tables || [],
        fixtures: coupleLayout.fixtures || [],
        decor: coupleLayout.decor || [],
        ceremonyRows: coupleLayout.ceremonyRows || [],
      });
    });
    return sources;
  }, [
    layoutState.currentVenue,
    layoutState.layout.tables,
    layoutState.layout.fixtures,
    layoutState.layout.decor,
    layoutState.layout.ceremonyRows,
    savedLayouts,
  ]);
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

  const eventQuestions = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EVENT_QUESTIONS);
      if (!raw) return [] as EventQuestion[];
      const parsed = JSON.parse(raw) as EventQuestion[];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return [] as EventQuestion[]; }
  })();

  const saveEventAnswers = useCallback((answers: EventAnswer[]) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EVENT_ANSWERS);
      const existing = raw ? (JSON.parse(raw) as EventAnswer[]) : [];
      const filtered = (Array.isArray(existing) ? existing : []).filter((a) => !(a.userId === user.id && a.eventId === currentEventName));
      localStorage.setItem(STORAGE_KEYS.EVENT_ANSWERS, JSON.stringify([...filtered, ...answers]));
    } catch {}
  }, [user.id, currentEventName]);

  const currentSubmission = submissionWorkflow.getByMasterAndEvent(user.id, currentEventName);

  const handleAutoRepair = useCallback(async () => {
    await createEmergencyRecoverySnapshot({ id: user.id, name: user.name });
    const repaired = recoverCorruptDomains();
    const report = buildProjectHealthReport();
    setProjectHealth(report);
    setSafeMode(report.overallStatus === 'corrupt');
    emitDataChanged('all');
    showToast(`Recovered ${repaired.length} damaged data area(s).`, 'warning');
  }, [user.id, user.name]);

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
  }, [safeMode, projectHealth, handleAutoRepair]);

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
    const canvas = effectiveCanvasGeometry(venue);
    const canvasWidth = canvas.canvasWidth * scale;
    const canvasHeight = canvas.canvasHeight * scale;
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

  const ensureCanEditLayout = useCallback((): boolean => {
    if (layoutIdentityReview) {
      showToast('This layout is read-only until duplicate object identities are reviewed and repaired.', 'warning');
      setShowIdentityRepair(true);
      return false;
    }
    if (canEditCurrentLayout) return true;
    showToast('You do not have permission to edit this layout.', 'warning');
    return false;
  }, [canEditCurrentLayout, layoutIdentityReview]);

  const handleApplyIdentityRepair = useCallback((selections: Record<string, string>) => {
    if (!layoutIdentityReview) throw new Error('This layout no longer needs identity repair.');
    const repaired = applyLayoutIdentityRepair(
      layoutState.layout,
      layoutState.guests,
      layoutIdentityReview,
      selections,
    );
    layoutState.applyIdentityRepair(repaired.layout, repaired.guests);
    emit('spm_clear_undo_history');
    setShowIdentityRepair(false);
    showToast(`Repaired ${layoutIdentityReview.changedEntityCount} duplicate or blank object ID${layoutIdentityReview.changedEntityCount === 1 ? '' : 's'} without moving any items. Save the working layout explicitly.`, 'success');
  }, [layoutIdentityReview, layoutState]);

  const handleResetToVenue = useCallback(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const venue = layoutState.currentVenue;
    const scale = 8;
    const canvas = effectiveCanvasGeometry(venue);
    const outline = venueShapePolygon(venue);
    const xs = outline.map((point) => (canvas.venueX + point.x) * scale);
    const ys = outline.map((point) => (canvas.venueY + point.y) * scale);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
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
    const canvas = effectiveCanvasGeometry(venue);
    const canvasWidth = canvas.canvasWidth * scale;
    const canvasHeight = canvas.canvasHeight * scale;
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
  const captureUndoSnapshot = useCallback((): UndoSnapshot => ({
    tables: [...layoutState.layout.tables],
    fixtures: [...layoutState.layout.fixtures],
    decor: [...(layoutState.layout.decor || [])],
    ceremonyRows: [...(layoutState.layout.ceremonyRows || [])],
    timestamp: Date.now(),
  }), [layoutState.layout]);

  const pushUndoSnapshot = useCallback(() => {
    propertyEditUndoRef.current = null;
    emit('spm_push_undo_snapshot', captureUndoSnapshot());
  }, [captureUndoSnapshot]);

  // Canvas drags and keyboard nudges validate inside handleMoveItem. Stage the
  // pre-action state first, but only commit it to history once a move is accepted;
  // rejected boundary/collision attempts must not create no-op Undo entries.
  const prepareMoveUndoSnapshot = useCallback(() => {
    pendingMoveUndoRef.current = captureUndoSnapshot();
  }, [captureUndoSnapshot]);
  const commitMoveUndoSnapshot = useCallback(() => {
    const snapshot = pendingMoveUndoRef.current;
    if (!snapshot) return;
    pendingMoveUndoRef.current = null;
    propertyEditUndoRef.current = null;
    emit('spm_push_undo_snapshot', snapshot);
  }, []);

  const handleRestoreSnapshot = useCallback((snapshot: { tables: any[]; fixtures: any[]; decor: any[]; ceremonyRows?: any[] }) => {
    propertyEditUndoRef.current = null;
    pendingMoveUndoRef.current = null;
    layoutState.updateLayout({ tables: snapshot.tables, fixtures: snapshot.fixtures, decor: snapshot.decor || [], ceremonyRows: snapshot.ceremonyRows || [] });
  }, [layoutState]);

  // Clear the whole layout as a single undoable action. Previously it called
  // clearLayout() directly with no undo snapshot, so an accidental "Clear All
  // Items" was irreversible (unlike single-item delete).
  const handleClearLayout = useCallback(() => {
    if (!ensureCanEditLayout()) return;
    const hasItems =
      layoutState.layout.tables.length > 0 ||
      layoutState.layout.fixtures.length > 0 ||
      (layoutState.layout.decor || []).length > 0 ||
      (layoutState.layout.ceremonyRows || []).length > 0;
    if (!hasItems) return;
    pushUndoSnapshot();
    layoutState.clearLayout();
    showToast('Layout cleared.', 'success');
  }, [layoutState, pushUndoSnapshot, ensureCanEditLayout]);

  // Properties-panel deletion is permission-checked and undoable.
  const handleRemoveItem = useCallback((id: string) => {
    if (!ensureCanEditLayout()) return;
    const exists = layoutState.layout.tables.some((item) => item.id === id)
      || layoutState.layout.fixtures.some((item) => item.id === id)
      || (layoutState.layout.decor || []).some((item) => item.id === id);
    if (!exists) return;
    pushUndoSnapshot();
    layoutState.removeItem(id);
  }, [layoutState, pushUndoSnapshot, ensureCanEditLayout]);

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
  }, [open, closeAll, setEditingArrangementId]);

  // Couples booked into the current space (venue-side verification). Lets the
  // venue admin confirm the placed seating will seat every couple's expected
  // guest count for this space — guest mgmt lives in the couples portal.
  const getTotalCapacity = useCallback(
    () => layoutSeatCount(
      layoutState.layout.tables,
      getTableSpecs(),
      layoutState.layout.ceremonyRows || [],
    ),
    [layoutState.layout.ceremonyRows, layoutState.layout.tables],
  );

  const handleDragStart = useCallback((type: 'table' | 'fixture' | 'arrangement', specId: string, isExterior?: boolean) => {
    if (!ensureCanEditLayout()) return;
    setDragItem({ type, specId, isExterior });
  }, [ensureCanEditLayout]);

  // Native dragend fires after both successful and rejected drops, so it is not
  // a reliable placement outcome. handleDrop owns one-shot completion while a
  // rejected boundary/target drop deliberately leaves the guided mode active.
  const handleDragEnd = useCallback(() => undefined, []);

  const applyGridSnap = useCallback((position: Position): Position => {
    if (!snapToGrid) return position;
    return { x: Math.round(position.x / gridSize) * gridSize, y: Math.round(position.y / gridSize) * gridSize, };
  }, [snapToGrid, gridSize]);

  const showCollisionWarning = useCallback((message: string) => {
    if (getSpacingSettings().showCollisionWarnings === false) return;
    showToast(message, 'warning', { duration: 1500, dismissible: false });
  }, []);

  const resolvePlacement = useCallback((rawPosition: Position, item: { kind: 'table' | 'fixture'; specId: string; isExterior?: boolean; id?: string; showChairs?: boolean; chairType?: string; chairCount?: number; customCapacity?: number; chairLayout?: any; rotation?: number }, opts?: { silent?: boolean; exact?: boolean }) => {
    const venue = layoutState.currentVenue;
    const position = opts?.exact ? { ...rawPosition } : applyGridSnap({ ...rawPosition });
    const { canvasWidth, canvasHeight } = effectiveCanvasGeometry(venue);
    if (item.kind === 'table') {
      const spec = getTableSpecs().find((candidate) => candidate.id === item.specId);
      const candidate = {
        x: position.x,
        y: position.y,
        specId: item.specId,
        showChairs: item.showChairs ?? true,
        chairType: item.chairType ?? spec?.defaultChairType ?? 'white-plastic',
        chairCount: item.chairCount ?? item.customCapacity ?? spec?.capacity ?? 0,
        customCapacity: item.customCapacity,
        chairLayout: item.chairLayout ?? spec?.defaultChairLayout ?? 'all-sides',
        rotation: item.rotation ?? 0,
      };
      const footprint = getTableFootprintPolygon(candidate);
      if (footprint.length > 0 && !footprintFitsVenue(footprint, venue, 0)) {
        if (!opts?.silent) showCollisionWarning('The full table and chair footprint must stay inside the venue boundary.');
        return { ok: false as const, position };
      }
      const collision = checkTableCollision(
        candidate,
        layoutState.layout.tables,
        layoutState.layout.fixtures,
        venue,
        item.id,
      );
      if (collision.collides) {
        if (!opts?.silent) showCollisionWarning(collision.wallError || collision.details || 'Cannot place table here.');
        return { ok: false as const, position };
      }
      return { ok: true as const, position };
    }
    const candidate = {
      x: position.x,
      y: position.y,
      specId: item.specId,
      isExterior: !!item.isExterior,
      rotation: item.rotation ?? 0,
    };
    const footprint = getFixtureFootprintPolygon(candidate);
    const insideBoundary = item.isExterior
      ? footprint.every((point) => point.x >= 0
          && point.y >= 0
          && point.x <= canvasWidth
          && point.y <= canvasHeight)
      : footprintFitsVenue(footprint, venue, 0);
    if (!insideBoundary) {
      if (!opts?.silent) {
        showCollisionWarning(`The full item footprint must stay inside the ${item.isExterior ? 'canvas' : 'venue'} boundary.`);
      }
      return { ok: false as const, position };
    }
    const collision = checkFixtureCollision(
      candidate,
      layoutState.layout.tables,
      layoutState.layout.fixtures,
      venue,
      item.id,
    );
    if (collision.collides) {
      if (!opts?.silent) showCollisionWarning(collision.wallError || collision.details || 'Cannot place item here.');
      return { ok: false as const, position };
    }
    return { ok: true as const, position };
  }, [layoutState, applyGridSnap, showCollisionWarning]);

  const handleDuplicateItem = useCallback((id: string) => {
    if (!ensureCanEditLayout()) return;
    const tableSpecs = getTableSpecs();
    const fixtureTypes = getFixtureTypes();
    const chairSpecs = getChairSpecs();
    const decorItems = getDecorItems();
    const arrangements = getDecorArrangements();
    const table = layoutState.layout.tables.find((candidate) => candidate.id === id);
    const fixture = layoutState.layout.fixtures.find((candidate) => candidate.id === id);
    const decor = (layoutState.layout.decor || []).find((candidate) => candidate.id === id);
    if (!table && !fixture && !decor) return;

    if (table) {
      const inventoryIssue = tablePlacementInventoryIssue(
        table,
        layoutState.layout.tables,
        tableSpecs,
        chairSpecs,
      );
      if (inventoryIssue) {
        showToast(inventoryIssue.replace('Placing this', 'Duplicating this'), 'warning');
        return;
      }
      if (table.appliedArrangementId) {
        const decorIssue = arrangementPlacementInventoryIssue(
          table.appliedArrangementId,
          layoutState.layout.tables,
          layoutState.layout.fixtures,
          layoutState.layout.decor || [],
          arrangements,
          decorItems,
        );
        if (decorIssue) {
          showToast(`Cannot duplicate the applied design. ${decorIssue}`, 'warning');
          return;
        }
      }

      const tableSpec = tableSpecs.find((candidate) => candidate.id === table.specId);
      const appliedArrangement = arrangements.find((candidate) => candidate.id === table.appliedArrangementId);
      const position = nearbyDuplicatePositions(table.x, table.y).find((candidate) => {
        const placement = resolvePlacement(
          candidate,
          {
            kind: 'table',
            specId: table.specId,
            showChairs: table.showChairs,
            chairType: table.chairType,
            chairCount: table.chairCount,
            customCapacity: table.customCapacity,
            chairLayout: table.chairLayout,
            rotation: table.rotation,
          },
          { silent: true, exact: true },
        );
        if (!placement.ok) return false;
        if (!appliedArrangement || !tableSpec) return true;
        return appliedArrangementFootprints(
          { ...table, x: candidate.x, y: candidate.y },
          tableSpec,
          appliedArrangement,
          decorItems,
        ).every((component) => footprintFitsVenue(component.polygon, layoutState.currentVenue, 0));
      });
      if (!position) {
        showCollisionWarning('No collision-free location is available nearby for this table copy.');
        return;
      }
      pushUndoSnapshot();
      layoutState.duplicateItem(id, position);
      return;
    }

    if (fixture) {
      const spec = fixtureTypes.find((candidate) => candidate.id === fixture.specId);
      const inventoryIssue = fixturePlacementInventoryIssue(
        fixture.specId,
        !!fixture.isExterior,
        layoutState.layout.fixtures,
        fixtureTypes,
      );
      if (inventoryIssue) {
        showToast(inventoryIssue, 'warning');
        return;
      }
      if (spec?.isPermanent) {
        showToast('Permanent venue features cannot be duplicated from the layout.', 'warning');
        return;
      }
      if (fixture.appliedArrangementId) {
        const decorIssue = arrangementPlacementInventoryIssue(
          fixture.appliedArrangementId,
          layoutState.layout.tables,
          layoutState.layout.fixtures,
          layoutState.layout.decor || [],
          arrangements,
          decorItems,
        );
        if (decorIssue) {
          showToast(`Cannot duplicate the applied design. ${decorIssue}`, 'warning');
          return;
        }
      }
      const venue = layoutState.currentVenue;
      const { canvasWidth, canvasHeight } = effectiveCanvasGeometry(venue);
      const appliedArrangement = arrangements.find((candidate) => candidate.id === fixture.appliedArrangementId);
      const position = nearbyDuplicatePositions(fixture.x, fixture.y).find((candidate) => {
        const placed = { ...fixture, x: candidate.x, y: candidate.y };
        const baseFits = fixture.isExterior
          ? getFixtureFootprintPolygon(placed).every((point) => point.x >= 0 && point.y >= 0 && point.x <= canvasWidth && point.y <= canvasHeight)
          : resolvePlacement(
              candidate,
              { kind: 'fixture', specId: fixture.specId, isExterior: false, rotation: fixture.rotation },
              { silent: true, exact: true },
            ).ok;
        if (!baseFits) return false;
        if (!appliedArrangement || !spec) return true;
        const components = appliedArrangementFootprints(placed, spec, appliedArrangement, decorItems);
        return fixture.isExterior
          ? components.every((component) => component.polygon.every((point) => point.x >= 0
              && point.y >= 0
              && point.x <= canvasWidth
              && point.y <= canvasHeight))
          : components.every((component) => footprintFitsVenue(component.polygon, venue, 0));
      });
      if (!position) {
        showCollisionWarning('No collision-free location is available nearby for this item copy.');
        return;
      }
      pushUndoSnapshot();
      layoutState.duplicateItem(id, position);
      return;
    }

    if (decor) {
      const spec = decorItems.find((candidate) => candidate.id === decor.decorItemId);
      const inventoryIssue = decorPlacementInventoryIssue(
        decor.decorItemId,
        layoutState.layout.decor || [],
        decorItems,
        layoutState.layout.tables,
        layoutState.layout.fixtures,
        arrangements,
      );
      if (inventoryIssue || !spec) {
        showToast(inventoryIssue || 'This decor cannot be duplicated because its catalog definition is missing.', 'warning');
        return;
      }
      const venue = layoutState.currentVenue;
      const { canvasWidth, canvasHeight, venueX, venueY } = effectiveCanvasGeometry(venue);
      const width = Math.max(0.01, (spec.width + (spec.widthInches || 0) / 12) * Math.abs(Number.isFinite(decor.scaleX) ? decor.scaleX : 1));
      const height = Math.max(0.01, (spec.height + (spec.heightInches || 0) / 12) * Math.abs(Number.isFinite(decor.scaleY) ? decor.scaleY : 1));
      const position = nearbyDuplicatePositions(decor.x, decor.y).find((candidate) => {
        const footprint = rotatedBoxPolygon(
          { x: candidate.x, y: candidate.y, width, height },
          { x: candidate.x + width / 2, y: candidate.y + height / 2 },
          decor.rotation || 0,
        );
        if (decor.parentType !== 'canvas' && !footprintFitsVenue(footprint, venue, 0)) return false;
        const offsetX = decor.parentType === 'canvas' ? 0 : venueX;
        const offsetY = decor.parentType === 'canvas' ? 0 : venueY;
        return footprint.every((point) => point.x + offsetX >= 0
          && point.y + offsetY >= 0
          && point.x + offsetX <= canvasWidth
          && point.y + offsetY <= canvasHeight);
      });
      if (!position) {
        showCollisionWarning('No in-bounds location is available nearby for this decor copy.');
        return;
      }
      pushUndoSnapshot();
      layoutState.duplicateItem(id, position);
    }
  }, [ensureCanEditLayout, layoutState, pushUndoSnapshot, resolvePlacement, showCollisionWarning]);

  const appliedDesignIssue = useCallback((
    target: typeof layoutState.layout.tables[number] | typeof layoutState.layout.fixtures[number],
    arrangementId: string,
    options: { checkInventory?: boolean } = {},
  ): string | null => {
    const arrangement = getDecorArrangements().find((candidate) => candidate.id === arrangementId);
    if (!arrangement) return 'This decor design no longer exists.';
    const isTable = target.type === 'table';
    if ((isTable && arrangement.baseType !== 'table') || (!isTable && arrangement.baseType === 'table')) {
      return `This ${arrangement.baseType} design is not compatible with the selected ${isTable ? 'table' : 'fixture'}.`;
    }
    const spec = isTable
      ? getTableSpecs().find((candidate) => candidate.id === target.specId)
      : getFixtureTypes().find((candidate) => candidate.id === target.specId);
    if (!spec) return 'The selected item’s catalog definition is missing.';
    if (arrangement.baseSpecId && arrangement.baseSpecId !== spec.id) {
      return 'This design was created for a different base item.';
    }
    if (!isTable && arrangement.baseType === 'arch') {
      const fixtureSpec = spec as ReturnType<typeof getFixtureTypes>[number];
      if (!fixtureSpec.allowAsDecorBase && !fixtureSpec.name.toLowerCase().includes('arch')) {
        return 'This arch design requires a compatible arch fixture.';
      }
    }

    const footprints = appliedArrangementFootprints(target, spec, arrangement, getDecorItems());
    const venue = layoutState.currentVenue;
    if (!isTable && target.isExterior) {
      const { canvasWidth, canvasHeight } = effectiveCanvasGeometry(venue);
      if (footprints.some((item) => item.polygon.some((point) => point.x < 0 || point.y < 0 || point.x > canvasWidth || point.y > canvasHeight))) {
        return 'This decor design would extend beyond the canvas boundary.';
      }
    } else if (footprints.some((item) => !footprintFitsVenue(item.polygon, venue, 0))) {
      return 'This decor design would extend beyond the venue boundary.';
    }

    if (options.checkInventory === false) return null;
    return arrangementPlacementInventoryIssue(
      arrangement.id,
      layoutState.layout.tables,
      layoutState.layout.fixtures,
      layoutState.layout.decor || [],
      getDecorArrangements(),
      getDecorItems(),
      target.id,
    );
  }, [layoutState]);

  const handleDrop = useCallback((position: Position, isExterior?: boolean) => {
    if (!ensureCanEditLayout()) return;
    if (!dragItem) return;
    if (dragItem.type === 'arrangement') {
      const arrangement = getDecorArrangements().find((candidate) => candidate.id === dragItem.specId);
      if (!arrangement) {
        showToast('This decor design no longer exists.', 'warning');
        setDragItem(null);
        return;
      }
      const point = { x: position.x, y: position.y };
      const {
        venueX: venueOffsetX,
        venueY: venueOffsetY,
      } = effectiveCanvasGeometry(layoutState.currentVenue);
      const venuePoint = isExterior
        ? { x: point.x - venueOffsetX, y: point.y - venueOffsetY }
        : point;
      const venueCanvasPoint = isExterior
        ? point
        : { x: point.x + venueOffsetX, y: point.y + venueOffsetY };
      const tableSpecs = getTableSpecs();
      const fixtureTypes = getFixtureTypes();
      const targetTable = arrangement.baseType === 'table'
        ? layoutState.layout.tables.find((table) => {
            const spec = tableSpecs.find((candidate) => candidate.id === table.specId);
            if (!spec || (arrangement.baseSpecId && arrangement.baseSpecId !== spec.id)) return false;
            const dimensions = appliedArrangementBaseDimensions(table, spec);
            return pointInPolygon(venuePoint, rotatedBoxPolygon(
              { x: table.x, y: table.y, width: dimensions.width, height: dimensions.height },
              { x: table.x + dimensions.width / 2, y: table.y + dimensions.height / 2 },
              table.rotation || 0,
            ));
          })
        : undefined;
      const targetFixture = arrangement.baseType !== 'table'
        ? layoutState.layout.fixtures.find((fixture) => {
            const spec = fixtureTypes.find((candidate) => candidate.id === fixture.specId);
            if (!spec || (arrangement.baseSpecId && arrangement.baseSpecId !== spec.id)) return false;
            if (arrangement.baseType === 'arch' && !spec.allowAsDecorBase && !spec.name.toLowerCase().includes('arch')) return false;
            return pointInPolygon(fixture.isExterior ? venueCanvasPoint : venuePoint, rotatedBoxPolygon(
              { x: fixture.x, y: fixture.y, width: spec.width, height: spec.height },
              { x: fixture.x + spec.width / 2, y: fixture.y + spec.height / 2 },
              fixture.rotation || 0,
            ));
          })
        : undefined;
      const target = targetTable || targetFixture;
      if (!target) {
        showToast(`Drop this ${arrangement.baseType} design onto a compatible ${arrangement.baseType === 'table' ? 'table' : 'fixture'}.`, 'info');
        return;
      }
      const designIssue = appliedDesignIssue(target, arrangement.id);
      if (designIssue) {
        const isBoundaryIssue = designIssue.includes('boundary');
        if (isBoundaryIssue) showCollisionWarning(designIssue);
        else showToast(designIssue, 'warning');
        // A boundary miss can be repaired by choosing another target; an
        // inventory/catalog failure cannot succeed without leaving this mode.
        if (!isBoundaryIssue) setDragItem(null);
        return;
      }
      pushUndoSnapshot();
      if (targetTable) layoutState.updateTable(targetTable.id, { appliedArrangementId: arrangement.id });
      else if (targetFixture) layoutState.updateFixture(targetFixture.id, { appliedArrangementId: arrangement.id });
      showToast(`Applied ${arrangement.name} to ${target.label}.`, 'success');
      if (!keepAdding) setDragItem(null);
      return;
    }
    const exterior = !!(dragItem.isExterior || isExterior);
    const inventoryIssue = dragItem.type === 'table'
      ? tablePlacementInventoryIssue(
          { specId: dragItem.specId },
          layoutState.layout.tables,
          getTableSpecs(),
          getChairSpecs(),
        )
      : fixturePlacementInventoryIssue(
          dragItem.specId,
          exterior,
          layoutState.layout.fixtures,
          getFixtureTypes(),
        );
    if (inventoryIssue) {
      showToast(inventoryIssue, 'warning');
      setDragItem(null);
      return;
    }
    const placement = resolvePlacement(position, { kind: dragItem.type, specId: dragItem.specId, isExterior: exterior });
    if (!placement.ok) return;
    pushUndoSnapshot();
    if (dragItem.type === 'table') layoutState.addTable(dragItem.specId, placement.position);
    else layoutState.addFixture(dragItem.specId, placement.position, exterior);
    if (!keepAdding) {
      setDragItem(null);
      setShowProperties(true);
    }
  }, [dragItem, layoutState, resolvePlacement, ensureCanEditLayout, pushUndoSnapshot, keepAdding, appliedDesignIssue, showCollisionWarning]);

  const handleSelectItem = useCallback((id: string | null) => layoutState.setSelectedId(id), [layoutState]);
  const handleDoubleClickItem = useCallback((id: string) => { layoutState.setSelectedId(id); setShowProperties(true); }, [layoutState]);

  // A single undo snapshot is pushed once per interaction (at drag start, via
  // onDragStart, or once per discrete arrow-key nudge) so that Undo rewinds an
  // entire drag as one step rather than hundreds of per-mousemove snapshots.
  const handleMoveItem = useCallback((id: string, position: Position, isExterior?: boolean, exact = false) => {
    if (!ensureCanEditLayout()) return;
    const table = layoutState.layout.tables.find(t => t.id === id);
    if (table) {
      const placement = resolvePlacement(position, {
        kind: 'table',
        id,
        specId: table.specId,
        showChairs: table.showChairs,
        chairType: table.chairType,
        chairCount: table.chairCount,
        customCapacity: table.customCapacity,
        chairLayout: table.chairLayout,
        rotation: table.rotation,
      }, { silent: true, exact });
      if (placement.ok) {
        if (placement.position.x === table.x && placement.position.y === table.y) return;
        const candidate = { ...table, x: placement.position.x, y: placement.position.y };
        if (!table.appliedArrangementId
          || !appliedDesignIssue(candidate, table.appliedArrangementId, { checkInventory: false })) {
          commitMoveUndoSnapshot();
          layoutState.updateTable(id, { x: placement.position.x, y: placement.position.y });
        }
      }
      return;
    }
    const fixture = layoutState.layout.fixtures.find(f => f.id === id);
    if (fixture) {
      const spec = getFixtureTypes().find(s => s.id === fixture.specId);
      if (spec?.isPermanent || !canMoveFixture(user, spec!)) { showToast('Cannot move this fixture.', 'warning'); return; }
      const placement = resolvePlacement(position, { kind: 'fixture', id, specId: fixture.specId, isExterior: !!(fixture.isExterior || isExterior), rotation: fixture.rotation }, { silent: true, exact });
      if (placement.ok) {
        if (placement.position.x === fixture.x && placement.position.y === fixture.y) return;
        const candidate = { ...fixture, x: placement.position.x, y: placement.position.y };
        if (!fixture.appliedArrangementId
          || !appliedDesignIssue(candidate, fixture.appliedArrangementId, { checkInventory: false })) {
          commitMoveUndoSnapshot();
          layoutState.updateFixture(id, { x: placement.position.x, y: placement.position.y });
        }
      }
      return;
    }
    const decor = (layoutState.layout.decor || []).find((candidate) => candidate.id === id);
    if (decor) {
      if (position.x === decor.x && position.y === decor.y) return;
      const spec = getDecorItems().find((candidate) => candidate.id === decor.decorItemId);
      if (!spec) return;
      const width = Math.max(0.01, (spec.width + (spec.widthInches || 0) / 12) * Math.abs(Number.isFinite(decor.scaleX) ? decor.scaleX : 1));
      const height = Math.max(0.01, (spec.height + (spec.heightInches || 0) / 12) * Math.abs(Number.isFinite(decor.scaleY) ? decor.scaleY : 1));
      const footprint = rotatedBoxPolygon(
        { x: position.x, y: position.y, width, height },
        { x: position.x + width / 2, y: position.y + height / 2 },
        decor.rotation || 0,
      );
      const venue = layoutState.currentVenue;
      const { canvasWidth, canvasHeight, venueX, venueY } = effectiveCanvasGeometry(venue);
      const venueBound = decor.parentType !== 'canvas';
      if (venueBound && !footprintFitsVenue(footprint, venue, 0)) return;
      const offsetX = venueBound ? venueX : 0;
      const offsetY = venueBound ? venueY : 0;
      if (!footprint.every((point) => point.x + offsetX >= 0
        && point.y + offsetY >= 0
        && point.x + offsetX <= canvasWidth
        && point.y + offsetY <= canvasHeight)) return;
      commitMoveUndoSnapshot();
      layoutState.updateDecor(id, position);
    }
  }, [layoutState, resolvePlacement, user, ensureCanEditLayout, appliedDesignIssue, commitMoveUndoSnapshot]);

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
    const candidate = { ...existing, ...updates };
    const changesPhysicalGeometry = [
      'x',
      'y',
      'rotation',
      'chairCount',
      'customCapacity',
      'chairType',
      'chairLayout',
    ].some((key) => Object.prototype.hasOwnProperty.call(updates, key));
    const changesChairAllocation = ['chairCount', 'customCapacity', 'chairType']
      .some((key) => Object.prototype.hasOwnProperty.call(updates, key));
    if (changesChairAllocation) {
      const inventoryIssue = tablePlacementInventoryIssue(
        candidate,
        layoutState.layout.tables,
        getTableSpecs(),
        getChairSpecs(),
        id,
      );
      if (inventoryIssue) {
        showToast(inventoryIssue.replace('Placing this', 'Updating this'), 'warning');
        return;
      }
    }
    const changesAppliedArrangement = Object.prototype.hasOwnProperty.call(updates, 'appliedArrangementId')
      && candidate.appliedArrangementId !== existing.appliedArrangementId;
    if (candidate.appliedArrangementId && (changesPhysicalGeometry || changesAppliedArrangement)) {
      const designIssue = appliedDesignIssue(candidate, candidate.appliedArrangementId, {
        checkInventory: changesAppliedArrangement,
      });
      if (designIssue) {
        if (designIssue.includes('boundary')) showCollisionWarning(designIssue);
        else showToast(designIssue, 'warning');
        return;
      }
    }
    if (changesPhysicalGeometry) {
      const placement = resolvePlacement(
        { x: candidate.x, y: candidate.y },
        {
          kind: 'table',
          id,
          specId: candidate.specId,
          showChairs: candidate.showChairs,
          chairType: candidate.chairType,
          chairCount: candidate.chairCount,
          customCapacity: candidate.customCapacity,
          chairLayout: candidate.chairLayout,
          rotation: candidate.rotation,
        },
        { exact: true },
      );
      if (placement.ok) {
        pushUndoSnapshot();
        layoutState.updateTable(id, { ...updates, x: placement.position.x, y: placement.position.y });
      }
      return;
    }
    // Metadata/property edits (label, linen, visual chair toggle, applied design)
    // are undoable too — coalesced so rapid typing doesn't flood history.
    pushPropertyUndo(id);
    layoutState.updateTable(id, updates);
  }, [layoutState, resolvePlacement, ensureCanEditLayout, pushPropertyUndo, pushUndoSnapshot, appliedDesignIssue, showCollisionWarning]);

  const handleUpdateFixtureSafe = useCallback((id: string, updates: Partial<any>) => {
    if (!ensureCanEditLayout()) return;
    const existing = layoutState.layout.fixtures.find(f => f.id === id);
    if (!existing) return;
    const candidate = { ...existing, ...updates };
    const changesPhysicalGeometry = ['x', 'y', 'rotation']
      .some((key) => Object.prototype.hasOwnProperty.call(updates, key));
    const changesAppliedArrangement = Object.prototype.hasOwnProperty.call(updates, 'appliedArrangementId')
      && candidate.appliedArrangementId !== existing.appliedArrangementId;
    if (candidate.appliedArrangementId && (changesPhysicalGeometry || changesAppliedArrangement)) {
      const designIssue = appliedDesignIssue(candidate, candidate.appliedArrangementId, {
        checkInventory: changesAppliedArrangement,
      });
      if (designIssue) {
        if (designIssue.includes('boundary')) showCollisionWarning(designIssue);
        else showToast(designIssue, 'warning');
        return;
      }
    }
    if (changesPhysicalGeometry) {
      const placement = resolvePlacement(
        { x: candidate.x, y: candidate.y },
        { kind: 'fixture', id, specId: candidate.specId, isExterior: !!candidate.isExterior, rotation: candidate.rotation },
        { exact: true },
      );
      if (placement.ok) {
        pushUndoSnapshot();
        layoutState.updateFixture(id, { ...updates, x: placement.position.x, y: placement.position.y });
      }
      return;
    }
    pushPropertyUndo(id);
    layoutState.updateFixture(id, updates);
  }, [layoutState, resolvePlacement, ensureCanEditLayout, pushPropertyUndo, pushUndoSnapshot, appliedDesignIssue, showCollisionWarning]);

  const handleUpdateDecorSafe = useCallback((id: string, updates: Partial<any>) => {
    if (!ensureCanEditLayout()) return;
    const existing = (layoutState.layout.decor || []).find((candidate) => candidate.id === id);
    if (!existing) return;
    const candidate = { ...existing, ...updates };
    const changesGeometry = ['x', 'y', 'rotation', 'scaleX', 'scaleY'].some((key) => updates[key] !== undefined);
    if (changesGeometry) {
      const spec = getDecorItems().find((item) => item.id === candidate.decorItemId);
      if (!spec) {
        showToast('Cannot update this decor because its catalog definition is missing.', 'warning');
        return;
      }
      const width = Math.max(0.01, (spec.width + (spec.widthInches || 0) / 12) * Math.abs(Number.isFinite(candidate.scaleX) ? candidate.scaleX : 1));
      const height = Math.max(0.01, (spec.height + (spec.heightInches || 0) / 12) * Math.abs(Number.isFinite(candidate.scaleY) ? candidate.scaleY : 1));
      const footprint = rotatedBoxPolygon(
        { x: candidate.x, y: candidate.y, width, height },
        { x: candidate.x + width / 2, y: candidate.y + height / 2 },
        candidate.rotation || 0,
      );
      const venue = layoutState.currentVenue;
      const { canvasWidth, canvasHeight, venueX, venueY } = effectiveCanvasGeometry(venue);
      const venueBound = candidate.parentType !== 'canvas';
      const offsetX = venueBound ? venueX : 0;
      const offsetY = venueBound ? venueY : 0;
      const inVenue = !venueBound || footprintFitsVenue(footprint, venue, 0);
      const inCanvas = footprint.every((point) => point.x + offsetX >= 0
        && point.y + offsetY >= 0
        && point.x + offsetX <= canvasWidth
        && point.y + offsetY <= canvasHeight);
      if (!inVenue || !inCanvas) {
        showCollisionWarning('Decor must remain inside its venue or canvas boundary.');
        return;
      }
    }
    pushPropertyUndo(id);
    layoutState.updateDecor(id, updates);
  }, [ensureCanEditLayout, layoutState, pushPropertyUndo, showCollisionWarning]);

  const handleRepairCatalogReference = useCallback((id: string, replacementId: string) => {
    if (!ensureCanEditLayout()) return;
    const table = layoutState.layout.tables.find((candidate) => candidate.id === id);
    if (table) {
      const spec = getTableSpecs().find((candidate) =>
        candidate.id === replacementId && !candidate.archived);
      if (!spec) {
        showToast('The selected table replacement is no longer available.', 'warning');
        return;
      }
      const repaired = {
        ...table,
        specId: spec.id,
        chairCount: table.chairCount ?? table.customCapacity ?? configuredChairCount(table, null),
        chairType: table.chairType || configuredChairType(table, null),
        chairLayout: table.chairLayout || 'all-sides',
        showChairs: table.showChairs ?? true,
        appliedArrangementId: undefined,
      };
      const inventoryIssue = tablePlacementInventoryIssue(
        repaired,
        layoutState.layout.tables,
        getTableSpecs(),
        getChairSpecs(),
        id,
      );
      if (inventoryIssue) {
        showToast(inventoryIssue.replace('Placing this', 'Repairing this'), 'warning');
        return;
      }
      const placement = resolvePlacement(
        { x: repaired.x, y: repaired.y },
        {
          kind: 'table', id, specId: repaired.specId,
          showChairs: repaired.showChairs, chairType: repaired.chairType,
          chairCount: repaired.chairCount, customCapacity: repaired.customCapacity,
          chairLayout: repaired.chairLayout, rotation: repaired.rotation,
        },
        { exact: true },
      );
      if (!placement.ok) return;
      pushUndoSnapshot();
      layoutState.updateTable(id, repaired);
      showToast(`Catalog reference repaired with ${spec.name}.${table.appliedArrangementId ? ' The incompatible applied décor design was detached.' : ''}`, 'success');
      return;
    }

    const fixture = layoutState.layout.fixtures.find((candidate) => candidate.id === id);
    if (fixture) {
      const spec = getFixtureTypes().find((candidate) =>
        candidate.id === replacementId && !candidate.archived);
      if (!spec) {
        showToast('The selected fixture replacement is no longer available.', 'warning');
        return;
      }
      const replacementExterior = !!spec.isExterior || spec.category === 'exterior';
      if (!!fixture.isExterior !== replacementExterior) {
        showToast('Choose a replacement with the same interior/exterior boundary semantics.', 'warning');
        return;
      }
      const repaired = { ...fixture, specId: spec.id, appliedArrangementId: undefined };
      const inventoryIssue = fixturePlacementInventoryIssue(
        spec.id,
        !!(fixture.isExterior || spec.isExterior || spec.category === 'exterior'),
        layoutState.layout.fixtures.filter((candidate) => candidate.id !== id),
        getFixtureTypes(),
      );
      if (inventoryIssue) {
        showToast(inventoryIssue.replace('placed', 'used for this repair'), 'warning');
        return;
      }
      const placement = resolvePlacement(
        { x: repaired.x, y: repaired.y },
        {
          kind: 'fixture', id, specId: repaired.specId,
          isExterior: !!(repaired.isExterior || spec.isExterior || spec.category === 'exterior'),
          rotation: repaired.rotation,
        },
        { exact: true },
      );
      if (!placement.ok) return;
      pushUndoSnapshot();
      layoutState.updateFixture(id, repaired);
      showToast(`Catalog reference repaired with ${spec.name}.${fixture.appliedArrangementId ? ' The incompatible applied décor design was detached.' : ''}`, 'success');
      return;
    }

    const decor = (layoutState.layout.decor || []).find((candidate) => candidate.id === id);
    if (!decor) return;
    const spec = getDecorItems().find((candidate) =>
      candidate.id === replacementId && !candidate.archived);
    if (!spec) {
      showToast('The selected décor replacement is no longer available.', 'warning');
      return;
    }
    const inventoryIssue = decorPlacementInventoryIssue(
      spec.id,
      (layoutState.layout.decor || []).filter((candidate) => candidate.id !== id),
      getDecorItems(),
      layoutState.layout.tables,
      layoutState.layout.fixtures,
      getDecorArrangements(),
    );
    if (inventoryIssue) {
      showToast(inventoryIssue.replace('placed', 'used for this repair'), 'warning');
      return;
    }
    const width = Math.max(0.01, (spec.width + (spec.widthInches || 0) / 12)
      * Math.abs(Number.isFinite(decor.scaleX) ? decor.scaleX : 1));
    const height = Math.max(0.01, (spec.height + (spec.heightInches || 0) / 12)
      * Math.abs(Number.isFinite(decor.scaleY) ? decor.scaleY : 1));
    const footprint = rotatedBoxPolygon(
      { x: decor.x, y: decor.y, width, height },
      { x: decor.x + width / 2, y: decor.y + height / 2 },
      decor.rotation || 0,
    );
    const venue = layoutState.currentVenue;
    const canvas = effectiveCanvasGeometry(venue);
    const venueBound = decor.parentType !== 'canvas';
    const inBoundary = venueBound
      ? footprintFitsVenue(footprint, venue, 0)
      : footprint.every((point) => point.x >= 0 && point.y >= 0
          && point.x <= canvas.canvasWidth && point.y <= canvas.canvasHeight);
    if (!inBoundary) {
      showCollisionWarning('The replacement décor footprint must stay inside its spatial boundary.');
      return;
    }
    pushUndoSnapshot();
    layoutState.updateDecor(id, { decorItemId: spec.id });
    showToast(`Catalog reference repaired with ${spec.name}.`, 'success');
  }, [
    ensureCanEditLayout,
    layoutState,
    pushUndoSnapshot,
    resolvePlacement,
    showCollisionWarning,
  ]);

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
    setTimeout(fitAndCenterVenue, 100);
  }, [layoutState, fitAndCenterVenue]);

  const confirmVenueChange = useCallback(() => {
    if (!pendingVenueChange) return;
    const venueId = pendingVenueChange;
    setPendingVenueChange(null);
    layoutState.changeVenue(venueId);
    setTimeout(fitAndCenterVenue, 100);
  }, [pendingVenueChange, layoutState, fitAndCenterVenue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // These are floor-plan canvas shortcuts; keep them scoped to the Studio so
      // they don't act on a stale selection in other views (e.g. the venue map).
      if (view !== 'studio') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || e.key === 'Backspace')) {
        if (layoutState.selectedId) { e.preventDefault(); handleRemoveItem(layoutState.selectedId); }
      }
      else if (mod && (e.key === 'd' || e.key === 'D')) {
        if (layoutState.selectedId) { e.preventDefault(); handleDuplicateItem(layoutState.selectedId); }
      }
      else if (e.key === 'p' || e.key === 'P') { if (!mod) { setShowProperties(v => !v); } }
      else if (e.key === '?') { e.preventDefault(); setShowWorkspaceHelp(true); }
      else if (mod && e.key === '1') { e.preventDefault(); handleResetToVenue(); }
      else if (mod && e.key === '0') { e.preventDefault(); handleResetToCanvas(); }
      else if (e.key === 'Escape') { layoutState.setSelectedId(null); setShowProperties(false); setDragItem(null); }
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, layoutState, handleDuplicateItem, handleRemoveItem, handleResetToVenue, handleResetToCanvas]);

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
      if (!ensureCanEditLayout()) return '';
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
    [layoutState, layoutBackendSync, refreshSavedLayouts, ensureCanEditLayout],
  );

  // Load a saved layout, then treat the loaded content as the clean baseline.
  const handleLoadSavedLayout = useCallback(
    (id: string) => {
      layoutState.loadLayout(id);
      handleResetView();
      showToast('Saved layout loaded.', 'success');
    },
    [layoutState, handleResetView],
  );

  const handleSaveMasterLayout = useCallback(() => {
    if (!ensureCanEditLayout()) return;
    const isLayoutEmpty =
      layoutState.layout.tables.length === 0 &&
      layoutState.layout.fixtures.length === 0 &&
      (layoutState.layout.decor || []).length === 0 &&
      (layoutState.layout.ceremonyRows || []).length === 0;
    if (isLayoutEmpty) {
      setConfirmEmptyMasterLayout(true);
      return;
    }
    layoutState.saveMasterLayout();
    layoutState.markLayoutClean();
    showToast(`Saved as the master layout for ${layoutState.currentVenue.name}.`, 'success');
  }, [layoutState, ensureCanEditLayout]);

  const handleSaveLayoutOverwriteWithSync = useCallback(
    (name: string) => {
      if (!ensureCanEditLayout()) return '';
      const id = layoutState.saveLayoutWithOverwrite(name);
      layoutState.markLayoutClean();
      refreshSavedLayouts();
      void layoutBackendSync.saveToBackend();
      showToast(`Layout "${name}" saved.`, 'success');
      return id;
    },
    [layoutState, layoutBackendSync, refreshSavedLayouts, ensureCanEditLayout],
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
              currentLayout={{ tables: layoutState.layout.tables, fixtures: layoutState.layout.fixtures, decor: layoutState.layout.decor || [], ceremonyRows: layoutState.layout.ceremonyRows || [], venueId: layoutState.currentVenue.id, category: layoutState.currentVenue.category }}
              onLoadTemplateForEdit={(t) => { if (t.venueId !== layoutState.currentVenue.id) layoutState.changeVenue(t.venueId); layoutState.loadTemplate(t); handleResetView(); }}
              onOpenVenueMap={() => { window.location.hash = '#/venuemap'; setView('venuemap'); closeAll(); }}
              onReplaceWorkingCatalogReferences={(kind, oldId, replacementId, options) => {
                if (!ensureCanEditLayout()) return;
                pushUndoSnapshot();
                layoutState.replaceWorkingCatalogReferences(kind, oldId, replacementId, options);
              }}
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
    <UndoRedoProvider onRestore={handleRestoreSnapshot} getCurrentSnapshot={captureUndoSnapshot}>
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
          <div className={`${isMobile ? 'absolute top-0 bottom-0 left-0 z-30 flex' : ''} h-full min-h-0 shrink-0 no-print spm-studio-chrome`}>
            <Sidebar
              width={sidebarWidth} collapsed={sidebarCollapsed} onWidthChange={setSidebarWidth} onCollapsedChange={setSidebarCollapsed} zoom={zoom} onZoomChange={setZoom} showGrid={showGrid} onShowGridChange={setShowGrid} gridSize={gridSize} onGridSizeChange={setGridSize} gridContrast={gridContrast} onGridContrastChange={setGridContrast} snapToGrid={snapToGrid} onSnapToGridChange={setSnapToGrid}
              onDragStart={handleDragStart} onDragEnd={handleDragEnd} onCancelPlacement={() => setDragItem(null)} currentDragItem={dragItem} keepAdding={keepAdding} onKeepAddingChange={setKeepAdding} onClearLayout={handleClearLayout} isAdmin={isAdmin} onViewImage={(url, title) => setImagePreview({ url, title })}
              layoutCategories={layoutCategories} currentVenueCategory={layoutState.currentVenue.category} venueWidth={layoutState.currentVenue.width} venueHeight={layoutState.currentVenue.height} canvasWidth={effectiveCanvasGeometry(layoutState.currentVenue).canvasWidth} canvasHeight={effectiveCanvasGeometry(layoutState.currentVenue).canvasHeight}
              onEditVenueGeometry={canOpenAdminPanel ? () => { if (ensureCanEditLayout()) setShowVenueGeometryEditor(true); } : undefined}
              onResetView={handleResetView} onResetToVenue={handleResetToVenue} onResetToCanvas={handleResetToCanvas} placedTables={layoutState.layout.tables} placedFixtures={layoutState.layout.fixtures} currentUser={user}
            />
          </div>
          <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden spm-print-canvas-container">
            <FloorPlanCanvas
              venue={layoutState.currentVenue} tables={layoutState.layout.tables} fixtures={layoutState.layout.fixtures} decor={layoutState.layout.decor} ceremonyRows={layoutState.layout.ceremonyRows || []} guests={layoutState.guests} selectedId={layoutState.selectedId} zoom={zoom} showGrid={showGrid} gridSize={gridSize} gridContrast={gridContrast}
              onSelect={handleSelectItem} onDoubleClick={handleDoubleClickItem} onMove={handleMoveItem} onDrop={handleDrop} onClickToPlace={handleDrop} onDragStart={prepareMoveUndoSnapshot} isDragging={!!dragItem} isDraggingExterior={!!(dragItem?.isExterior || dragItem?.type === 'arrangement')} isAdmin={isAdmin} capacityMode="venue" onViewImage={(url, title) => setImagePreview({ url, title })} panOffset={panOffset} onPanChange={setPanOffset} onZoomChange={setZoom} svgRef={floorPlanSvgRef}
            />
            {(layoutIdentityReview || (canOpenAdminPanel && !isSupportedVenueShape(layoutState.currentVenue.shape))) && (
              <div className="absolute left-3 top-3 z-20 max-w-md space-y-2 no-print spm-studio-chrome">
                {layoutIdentityReview && (
                  <div className="rounded-xl border-2 border-red-500 bg-red-50 p-3 text-sm text-red-950 shadow-lg" role="alert">
                    <strong>Layout identity repair required.</strong> Editing and saving are blocked because placed objects share IDs.
                    {canOpenAdminPanel ? (
                      <button type="button" onClick={() => setShowIdentityRepair(true)} className="ml-2 font-bold underline underline-offset-2">Review guided repair</button>
                    ) : (
                      <span className="ml-1">Ask a venue administrator to review the repair.</span>
                    )}
                  </div>
                )}
                {canOpenAdminPanel && !isSupportedVenueShape(layoutState.currentVenue.shape) && (
                  <div className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 shadow-lg" role="alert">
                    <strong>Venue shape needs repair.</strong> Stored “{layoutState.currentVenue.shape}” geometry is shown as a rectangular compatibility outline.
                    <button type="button" onClick={() => { if (ensureCanEditLayout()) setShowVenueGeometryEditor(true); }} className="ml-2 font-bold underline underline-offset-2">Choose a supported shape</button>
                  </div>
                )}
              </div>
            )}
            <div className="absolute bottom-4 left-4 flex items-center gap-2 flex-wrap no-print spm-studio-chrome">
              <div className="bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow-lg text-sm">
                {(() => {
                  const configuredSeats = getTotalCapacity();
                  return (
                    <>
                      <span className="font-medium">Configured seats:</span>{' '}
                      <span className={configuredSeats > layoutState.currentVenue.capacity ? 'text-red-600 font-bold' : 'text-green-600'}>
                        {configuredSeats}
                      </span>
                      <span className="ml-2 text-gray-600">· Venue maximum: {layoutState.currentVenue.capacity}</span>
                    </>
                  );
                })()}
              </div>
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
          <div className={`${isMobile ? 'absolute top-0 bottom-0 right-0 z-30 flex' : ''} h-full min-h-0 shrink-0 no-print spm-studio-chrome`}>
            <PropertiesPanel
              selectedId={layoutState.selectedId} tables={layoutState.layout.tables} fixtures={layoutState.layout.fixtures} decor={layoutState.layout.decor || []} onUpdateTable={handleUpdateTableSafe} onUpdateFixture={handleUpdateFixtureSafe} onUpdateDecor={handleUpdateDecorSafe}
              onRemoveItem={handleRemoveItem} onDuplicateItem={handleDuplicateItem} onRepairCatalogReference={handleRepairCatalogReference} onClose={() => setShowProperties(false)}
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
              ceremonyRows={layoutState.layout.ceremonyRows || []}
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
          {showAdmin && <AdminPanel onClose={() => { close('admin'); window.location.hash = VENUE_HOME_HASH; setView('dashboard'); layoutState.refreshVenues(); }} currentLayout={{ tables: layoutState.layout.tables, fixtures: layoutState.layout.fixtures, decor: layoutState.layout.decor || [], ceremonyRows: layoutState.layout.ceremonyRows || [], venueId: layoutState.currentVenue.id, category: layoutState.currentVenue.category }} onLoadTemplateForEdit={(t) => { if (t.venueId !== layoutState.currentVenue.id) layoutState.changeVenue(t.venueId); layoutState.loadTemplate(t); handleResetView(); }} onOpenVenueMap={() => { close('admin'); window.location.hash = '#/venuemap'; setView('venuemap'); closeAll(); }} onReplaceWorkingCatalogReferences={(kind, oldId, replacementId, options) => { if (!ensureCanEditLayout()) return; pushUndoSnapshot(); layoutState.replaceWorkingCatalogReferences(kind, oldId, replacementId, options); }} />}
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
          {showIdentityRepair && layoutIdentityReview && canOpenAdminPanel && (
            <LayoutIdentityRepairDialog
              key={layoutIdentityReview.signature}
              review={layoutIdentityReview}
              onApply={handleApplyIdentityRepair}
              onClose={() => setShowIdentityRepair(false)}
            />
          )}
          {showVenueGeometryEditor && canOpenAdminPanel && (
            <VenueGeometryEditor
              venue={layoutState.currentVenue}
              sources={venueGeometrySources}
              onApply={(nextVenue, baselineGeometrySignature) => {
                const result = layoutState.updateCurrentVenue(nextVenue, baselineGeometrySignature);
                if (result !== 'applied') {
                  const reason = result === 'conflict'
                    ? 'Venue geometry changed after this draft opened. Close and reopen the editor before applying.'
                    : result === 'missing'
                      ? 'This venue no longer exists. The geometry draft was not applied.'
                      : 'The active venue changed before geometry could be applied.';
                  throw new Error(reason);
                }
                // setVenues emits the canonical venue-domain change; the shared
                // entity-sync listener performs exactly one backend push.
                setShowVenueGeometryEditor(false);
                setTimeout(handleResetToCanvas, 50);
                showToast('Venue and canvas geometry applied. Placed-item coordinates were preserved.', 'success');
              }}
              onClose={() => setShowVenueGeometryEditor(false)}
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
              if (!ensureCanEditLayout()) return;
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

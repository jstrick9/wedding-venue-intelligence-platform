// src/components/AdminPanel.tsx - thin coordinator for extracted admin tab components.
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Venue,
  TableSpec,
  FixtureType,
  Guideline,
  ShapeType,
  PatternType,
  LayoutCategory,
  LayoutTemplate,
  PlacedTable,
  PlacedFixture,
  PlacedDecor,
  CeremonyChairRow,
  PatternColors,
  RectangularChairLayout,
  ChairSpec,
  DecorItem,
  User,
  EventQuestion,
  EventQuestionAnswerType,
  EventQuestionGroup,
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import { DrawingTool } from './DrawingTool';
import { VenueGeometryEditor } from './VenueGeometryEditor';
import type { GeometryImpactSource } from '../utils/venueGeometryImpact';
import { mergeVenueGeometry, venueGeometrySignature } from '../utils/venueGeometry';
import { LodgingBuilder } from './LodgingBuilder';
import { WelcomeModal } from './WelcomeModal';
import ModalDialog from './ModalDialog';
import { buildMessageThreadId } from '../models/DirectMessage';
import { useDirectMessages } from '../hooks/useDirectMessages';
import { useSubmissionWorkflow } from '../hooks/useSubmissionWorkflow';
import {
  layoutCategories,
  LinenColor,
  getChairSpecs,
  setChairSpecs,
  getSpacingSettings,
  setSpacingSettings,
  getWallStyles,
  setWallStyles,
  defaultWallStyles,
} from '../data/venueData';
import { WallStyle } from '../types';
import {
  getVenues,
  setVenues,
  getSavedLayouts,
  getTableSpecs,
  setTableSpecs,
  getFixtureTypes,
  setFixtureTypes,
  getGuidelines,
  setGuidelines,
  getLinenColors,
  setLinenColors,
  getTemplates,
  setTemplates,
  getDecorItems,
  setDecorItems,
  getDecorCategories,
  setDecorCategories,
  getDecorArrangements,
  setDecorArrangements,
  getDecorPackages,
  setDecorPackages,
  setUsers,
  resetToDefaults,
} from '../hooks/useLayoutState';
import { setConfig, applyRootStyles, useBrandingConfig, Config } from '../config';
import { getCoupleEvents } from '../services/couples/coupleService';
import { getWeddingPackages } from '../services/couples/couplePackageService';
import { AdminDecorSection } from './AdminDecorSection';
import { canAccessAdminPanel } from '../utils/permissions';
import { useRBAC } from '../hooks/useRBAC';
import { createPasswordRecord } from '../utils/auth';
import { normalizeEmail, normalizeUsPhone } from '../utils/contactQuality';
import {
  catalogReplacementCompatibilityIssue,
  collectCatalogLayoutSources,
  summarizeCatalogReferences,
  type CatalogDefinition,
  type CatalogKind,
  type CatalogReferenceSummary,
} from '../utils/catalogReferences';
import {
  reviewCatalogReplacement,
  type CatalogReplacementReview,
} from '../utils/catalogReplacementReview';
import { applyCatalogReplacementToStoredData } from '../utils/catalogLifecycle';
import { CatalogLifecycleDialog } from './CatalogLifecycleDialog';
import {
  catalogPhysicalChanges,
  createCatalogRevision,
  type CatalogPhysicalChange,
} from '../utils/catalogRevision';
import { CatalogRevisionDialog } from './CatalogRevisionDialog';
import { createEntityId } from '../utils/entityId';
import { catalogFamilyWithMultipleActiveMembers, changedHistoricalCatalogMember } from '../utils/catalogFamily';

import { VenueManagement } from './admin/VenueManagement';
import { SeatingAndLinensManagement } from './admin/SeatingAndLinensManagement';
import { StructuresManagement } from './admin/StructuresManagement';
import { TemplateManagement } from './admin/TemplateManagement';
import { GuidelineManagement } from './admin/GuidelineManagement';
import { EventQuestionsManagement } from './admin/EventQuestionsManagement';
import { UserManagement } from './admin/UserManagement';
import { BrandingManagement } from './admin/BrandingManagement';
import { AccessControlPanel } from './admin/AccessControlPanel';
import { SpacingManagement } from './admin/SpacingManagement';
import { CoupleManagement } from './admin/CoupleManagement';
import { VenueWayfindingManagement } from './admin/VenueWayfindingManagement';
import { PackageManagement } from './admin/PackageManagement';
import { BackupManagement } from './admin/BackupManagement';
import { InviteMembers } from './admin/InviteMembers';
import { CommunicationTemplatesManagement, getCommunicationTemplates } from './admin/CommunicationTemplatesManagement';
import { OperationsSettingsManagement, getOperationsChecklistDefaults } from './admin/OperationsSettingsManagement';
import { SecurityAuditManagement } from './admin/SecurityAuditManagement';
import PlatformVenueChatPanel from './PlatformVenueChatPanel';
import { uploadImage } from '../services/storage/imageStorage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { emitDataChanged, on } from '../utils/appEvents';
import type { AdminCommonProps, AdminDialogOptions, AdminTabDefinition } from './admin/AdminTabTypes';
import { buildVenueAdminHash, parseVenueAdminHash } from '../utils/venueAdminRoute';
import { sanitizeHref } from '../utils/safeUrl';

const chairLayoutOptions: { id: RectangularChairLayout; name: string; description: string }[] = [
  { id: 'all-sides', name: 'All Sides', description: 'Chairs on all 4 sides' },
  { id: 'long-sides-only', name: 'Long Sides Only', description: 'Chairs only on long sides (e.g., 4+4)' },
  { id: 'head-table', name: 'Head Table', description: 'Chairs on one side only (facing out)' },
];

const ADMIN_NAV_GROUPS = [
  {
    label: 'Venues & Inventory',
    icon: '🏛️',
    description: 'Spaces, tables, chairs, linens, fixtures, walls, and decor.',
    tabIds: ['venues', 'seating', 'structures', 'decor'],
  },
  {
    label: 'Layout Content',
    icon: '🎨',
    description: 'Spacing rules, layout templates, and design guidelines.',
    tabIds: ['spacing', 'templates', 'guidelines'],
  },
  {
    label: 'Couples Portal',
    icon: '💍',
    description: 'Booked couples, packages, wayfinding, and event questions.',
    tabIds: ['couples', 'packages', 'wayfinding', 'event-questions'],
  },
  {
    label: 'Branding, Access, & Configuration',
    icon: '⚙️',
    description: 'Brand, users, access, invites, chat, templates, and checklists.',
    tabIds: ['branding', 'users', 'access-control', 'invites', 'platform-chat', 'communication-templates', 'operations-settings'],
  },
  {
    label: 'System & Backup',
    icon: '💾',
    description: 'Security audit log and workspace backup/restore.',
    tabIds: ['security-audit', 'backup'],
  },
] as const;

const ADMIN_TAB_GROUP: Record<string, string> = Object.fromEntries(
  ADMIN_NAV_GROUPS.flatMap((group) => group.tabIds.map((id) => [id, group.label])),
);

function initialExpandedAdminGroups(): Set<string> {
  try {
    const fromHash = parseVenueAdminHash(window.location.hash);
    const tab = fromHash || localStorage.getItem(STORAGE_KEYS.ADMIN_LAST_TAB) || 'overview';
    const group = ADMIN_TAB_GROUP[tab];
    return group ? new Set([group]) : new Set();
  } catch {
    return new Set();
  }
}

export interface AdminPanelProps {
  onClose: () => void;
  currentLayout?: {
    tables: PlacedTable[];
    fixtures: PlacedFixture[];
    decor?: PlacedDecor[];
    ceremonyRows?: CeremonyChairRow[];
    venueId: string;
    category?: LayoutCategory;
  };
  onLoadTemplateForEdit?: (template: LayoutTemplate) => void;
  layoutState?: any;
  /** When true, renders inline (not a full-screen overlay) for dashboard embedding. */
  inline?: boolean;
  /** Opens the dedicated full-venue map designer module in the Layout Studio. */
  onOpenVenueMap?: () => void;
  /** Applies a reviewed catalog replacement to the unsaved in-memory studio layout. */
  onReplaceWorkingCatalogReferences?: (
    kind: CatalogKind,
    oldId: string,
    replacementId: string,
    options: { oldTableSpec?: TableSpec; incompatibleArrangementIds?: string[] },
  ) => void;
}

const shapeOptions: ShapeType[] = ['circle', 'rectangle', 'triangle', 'semicircle', 'oval', 'hexagon', 'octagon', 'polygon'];
const patternOptions: PatternType[] = ['solid', 'checkered', 'gravel', 'concrete', 'grass', 'wood', 'tile', 'brick', 'marble', 'water', 'carpet'];

const defaultPatternColors: Record<PatternType, PatternColors> = {
  solid: { color1: '#FFFFFF', color2: '#FFFFFF' },
  checkered: { color1: '#FFFFFF', color2: '#1a1a1a' },
  gravel: { color1: '#B8860B', color2: '#8B7355' },
  concrete: { color1: '#C0C0C0', color2: '#A9A9A9' },
  grass: { color1: '#90EE90', color2: '#228B22' },
  wood: { color1: '#DEB887', color2: '#CD853F' },
  tile: { color1: '#E8E8E8', color2: '#D0D0D0' },
  brick: { color1: '#B74A3A', color2: '#8B4513' },
  marble: { color1: '#F5F5F5', color2: '#C0C0C0' },
  water: { color1: '#87CEEB', color2: '#4169E1' },
  carpet: { color1: '#8B4513', color2: '#654321' },
};

const EVENT_ROLES_STORAGE_KEY = STORAGE_KEYS.EVENT_ROLES;
const EVENT_QUESTIONS_STORAGE_KEY = STORAGE_KEYS.EVENT_QUESTIONS;

const DEFAULT_EVENT_ROLES = [
  'Bride',
  'Groom',
  'Wedding Planner',
  'Venue Manager',
  'Photographer',
  'DJ',
  'Caterer',
  'Decorator',
  'Coordinator',
];

type AdminDialogState = AdminDialogOptions & {
  onConfirm?: () => void | Promise<void>;
};

export function AdminPanel({
  onClose,
  currentLayout,
  onLoadTemplateForEdit,
  layoutState,
  inline = false,
  onOpenVenueMap,
  onReplaceWorkingCatalogReferences,
}: AdminPanelProps) {
  const { createUser, deleteUser, getAllUsers, user, isAdmin, organizationId } = useAuth();
  const canAccessThisPanel = canAccessAdminPanel(user);

  // Remember the last-visited admin section so reopening the panel returns to it.
  const [activeTab, setActiveTab] = useState<string>(
    () => {
      try {
        const fromHash = parseVenueAdminHash(window.location.hash);
        if (fromHash) return fromHash;
        return localStorage.getItem(STORAGE_KEYS.ADMIN_LAST_TAB) || 'overview';
      } catch {
        return 'overview';
      }
    },
  );

  const [tabSearch, setTabSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(initialExpandedAdminGroups);

  const handleSidebarMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      if (e.clientX < 120) {
        setSidebarCollapsed(true);
      } else {
        setSidebarCollapsed(false);
        setSidebarWidth(Math.max(200, Math.min(450, e.clientX)));
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const goToTab = (id: string) => {
    setTabSearch('');
    setActiveTab(id);
    const group = ADMIN_TAB_GROUP[id];
    if (group) {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.add(group);
        return next;
      });
    }
    try {
      const next = buildVenueAdminHash(id);
      if ((window.location.hash || '') !== next) window.location.hash = next;
    } catch {
      // ignore
    }
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  useEffect(() => {
    return on('spm_open_admin_tab', (detail) => {
      if (detail) goToTab(detail);
    });
  }, []);

  useEffect(() => {
    const onHash = () => {
      const next = parseVenueAdminHash(window.location.hash);
      if (next) setActiveTab(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [venues, setVenuesState] = useState(() => getVenues());
  const [tableSpecs, setTableSpecsState] = useState(() => getTableSpecs());
  const [fixtureTypes, setFixtureTypesState] = useState(() => getFixtureTypes());
  const [guidelines, setGuidelinesState] = useState(() => getGuidelines());
  const [templates, setTemplatesState] = useState(() => getTemplates());
  const [linenColors, setLinenColorsState] = useState(() => getLinenColors());
  const config = useBrandingConfig();
  const setConfigState = () => {};
  const [users, setUsersState] = useState(() => getAllUsers());
  const [chairSpecs, setChairSpecsState] = useState(() => getChairSpecs());
  const [spacingSettings, setSpacingSettingsState] = useState(() => getSpacingSettings());
  const [wallStyles, setWallStylesState] = useState<WallStyle[]>(() => getWallStyles());
  const [decorItems, setDecorItemsState] = useState(() => getDecorItems());
  const [decorCategories, setDecorCategoriesState] = useState(() => getDecorCategories());
  const [decorArrangements, setDecorArrangementsState] = useState(() => getDecorArrangements());
  const [decorPackages, setDecorPackagesState] = useState(() => getDecorPackages());
  const [pendingCatalogRemoval, setPendingCatalogRemoval] = useState<{
    kind: CatalogKind;
    definition: CatalogDefinition;
    summary: CatalogReferenceSummary;
  } | null>(null);
  const [pendingCatalogRevision, setPendingCatalogRevision] = useState<{
    kind: CatalogKind;
    source: CatalogDefinition;
    proposed: CatalogDefinition;
    summary: CatalogReferenceSummary;
    changes: CatalogPhysicalChange[];
  } | null>(null);

  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    name: '',
    role: 'staff' as 'admin' | 'basic' | 'staff' | 'guest',
    email: '',
    phone: '',
    contactPhoneNumber: '',
    phoneType: 'Mobile' as 'Mobile' | 'Home' | 'Work' | 'Other',
    preferredCommunication: [] as ('call' | 'text' | 'email')[],
    eventRole: '',
    eventName: '',
    userRole: 'master' as 'admin' | 'master' | 'shared' | 'read-only' | 'staff',
    isMasterUser: false,
    parentUserId: undefined as string | undefined,
    allowSharedAccess: false,
    sharedUserLimit: 0,
    userStatus: 'active' as 'invited' | 'pending' | 'active' | 'suspended' | 'disabled',
    eventDate: '',
    jobTitle: '',
    department: '',
    assignedRoles: [] as string[],
  });

  const [successMessage, setSuccessMessage] = useState('');
  const [createUserFieldErrors, setCreateUserFieldErrors] = useState<Record<string, string>>({});
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showDrawingTool, setShowDrawingTool] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  // Debounce the auto-save success message: asset managers auto-save on every
  // keystroke, so without this the "saved" indicator would keep re-appearing
  // while the user types. The message now surfaces once, after a brief idle.
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [customShapeVenueId, setCustomShapeVenueId] = useState<string | null>(null);
  const [lodgingVenueId, setLodgingVenueId] = useState<string | null>(null);
  const [expandedVenues, setExpandedVenues] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [expandedSeatingTypes, setExpandedSeatingTypes] = useState<Set<string>>(new Set());
  const [showTableTypesSection, setShowTableTypesSection] = useState(false);
  const [showSeatingTypesSection, setShowSeatingTypesSection] = useState(false);
  const [expandedVenueFixtures, setExpandedVenueFixtures] = useState<Set<string>>(new Set());
  const [expandedLodgingFixtures, setExpandedLodgingFixtures] = useState<Set<string>>(new Set());
  const [expandedExteriorFixtures, setExpandedExteriorFixtures] = useState<Set<string>>(new Set());
  const [showVenueFixturesSection, setShowVenueFixturesSection] = useState(false);
  const [showLodgingFixturesSection, setShowLodgingFixturesSection] = useState(false);
  const [showExteriorFixturesSection, setShowExteriorFixturesSection] = useState(false);
  const [expandedChairs, setExpandedChairs] = useState<Set<string>>(new Set());
  const [expandedWalls, setExpandedWalls] = useState<Set<string>>(new Set());
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
  const [expandedGuidelines, setExpandedGuidelines] = useState<Set<string>>(new Set());
  const [expandedBrandingSections, setExpandedBrandingSections] = useState<Set<string>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [showUserDirectMessagesSection, setShowUserDirectMessagesSection] = useState(false);
  const [showUserPendingApprovalsSection, setShowUserPendingApprovalsSection] = useState(false);
  const [showUserEventRolesSection, setShowUserEventRolesSection] = useState(false);
  const [showUserAccountsSection, setShowUserAccountsSection] = useState(false);
  const [expandedLinens, setExpandedLinens] = useState<Set<string>>(new Set());
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [dialog, setDialog] = useState<AdminDialogState | null>(null);

  const [eventRoles, setEventRoles] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(EVENT_ROLES_STORAGE_KEY);
      if (!raw) return DEFAULT_EVENT_ROLES;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_EVENT_ROLES;
      const cleaned = parsed.map((r: unknown) => String(r || '').trim()).filter((r: string) => r.length > 0);
      return cleaned.length > 0 ? cleaned : DEFAULT_EVENT_ROLES;
    } catch {
      return DEFAULT_EVENT_ROLES;
    }
  });
  const [newEventRoleName, setNewEventRoleName] = useState('');
  const [editingEventRoleName, setEditingEventRoleName] = useState<string | null>(null);
  const [editingEventRoleValue, setEditingEventRoleValue] = useState('');
  const [eventQuestions, setEventQuestions] = useState<EventQuestion[]>(() => {
    try {
      const raw = localStorage.getItem(EVENT_QUESTIONS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as EventQuestion[];
    } catch {
      return [];
    }
  });
  const [newQuestion, setNewQuestion] = useState<{
    text: string;
    group: EventQuestionGroup;
    answerType: EventQuestionAnswerType;
    optionsText: string;
  }>({ text: '', group: 'Ceremony', answerType: 'text', optionsText: '' });
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState('');
  const [selectedMessageMasterUserId, setSelectedMessageMasterUserId] = useState<string>('');
  const [showWelcomePreview, setShowWelcomePreview] = useState(false);
  const [showAccessControl, setShowAccessControl] = useState(false);

  const submissionWorkflow = useSubmissionWorkflow();
  const directMessages = useDirectMessages();
  const rbac = useRBAC();
  const allRoles = rbac.getAllRoles();

  const AVAILABLE_WELCOME_FEATURES = [
    'Layout Design',
    'Guest Management',
    'Templates',
    'Print & Share',
    'Event Questions',
    'Chat',
    'Venue Filtering',
  ];
  const currentWelcomeFeatures = config.welcomeFeatures && config.welcomeFeatures.length > 0
    ? config.welcomeFeatures
    : AVAILABLE_WELCOME_FEATURES;

  const masterUsers = users.filter((u) => u.role === 'basic' && (u.userRole === 'master' || u.isMasterUser));

  useEffect(() => {
    if (masterUsers.length === 0) {
      setSelectedMessageMasterUserId('');
      return;
    }
    if (!selectedMessageMasterUserId || !masterUsers.some((u) => u.id === selectedMessageMasterUserId)) {
      setSelectedMessageMasterUserId(masterUsers[0].id);
    }
  }, [users, selectedMessageMasterUserId, masterUsers]);

  useEffect(() => {
    localStorage.setItem(EVENT_ROLES_STORAGE_KEY, JSON.stringify(eventRoles));
  }, [eventRoles]);

  // Persist the last-visited admin section.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ADMIN_LAST_TAB, activeTab);
    } catch {
      // ignore storage failures
    }
  }, [activeTab]);

  useEffect(() => {
    const group = ADMIN_TAB_GROUP[activeTab];
    if (!group) return;
    setExpandedGroups((prev) => {
      if (prev.has(group)) return prev;
      const next = new Set(prev);
      next.add(group);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(EVENT_QUESTIONS_STORAGE_KEY, JSON.stringify(eventQuestions));
  }, [eventQuestions]);

  const toggleSet = (setter: any) => (id: string) => {
    setter((prev: Set<string>) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleVenueExpanded = toggleSet(setExpandedVenues);
  const toggleTableExpanded = toggleSet(setExpandedTables);
  const toggleSeatingTypeExpanded = toggleSet(setExpandedSeatingTypes);
  const toggleVenueFixtureExpanded = toggleSet(setExpandedVenueFixtures);
  const toggleLodgingFixtureExpanded = toggleSet(setExpandedLodgingFixtures);
  const toggleExteriorFixtureExpanded = toggleSet(setExpandedExteriorFixtures);
  const toggleChairExpanded = toggleSet(setExpandedChairs);
  const toggleWallExpanded = toggleSet(setExpandedWalls);
  const toggleLinenExpanded = toggleSet(setExpandedLinens);
  const toggleTemplateExpanded = toggleSet(setExpandedTemplates);
  const toggleGuidelineExpanded = toggleSet(setExpandedGuidelines);
  const toggleUserExpanded = toggleSet(setExpandedUsers);

  const expandAllVenues = () => setExpandedVenues(new Set(venues.map((v) => v.id)));
  const collapseAllVenues = () => setExpandedVenues(new Set());
  const expandAllTables = () => setExpandedTables(new Set(tableSpecs.filter((t) => !t.isSeatingType).map((t) => t.id)));
  const collapseAllTables = () => setExpandedTables(new Set());
  const expandAllSeatingTypes = () => setExpandedSeatingTypes(new Set(tableSpecs.filter((t) => t.isSeatingType).map((t) => t.id)));
  const collapseAllSeatingTypes = () => setExpandedSeatingTypes(new Set());
  const expandAllVenueFixtures = () => setExpandedVenueFixtures(new Set(fixtureTypes.filter((f) => f.category !== 'exterior' && f.category !== 'lodging').map((f) => f.id)));
  const collapseAllVenueFixtures = () => setExpandedVenueFixtures(new Set());
  const expandAllLodgingFixtures = () => setExpandedLodgingFixtures(new Set(fixtureTypes.filter((f) => f.category === 'lodging').map((f) => f.id)));
  const collapseAllLodgingFixtures = () => setExpandedLodgingFixtures(new Set());
  const expandAllExteriorFixtures = () => setExpandedExteriorFixtures(new Set(fixtureTypes.filter((f) => f.category === 'exterior').map((f) => f.id)));
  const collapseAllExteriorFixtures = () => setExpandedExteriorFixtures(new Set());
  const expandAllLinens = () => setExpandedLinens(new Set(linenColors.map((l) => l.id)));
  const collapseAllLinens = () => setExpandedLinens(new Set());

  const showSuccess = (msg: string) => {
    // Debounce: continuous auto-saves (typing in any asset editor) should not
    // keep the message flashing. The final save within the window surfaces once
    // after a short idle, then clears after 3 seconds.
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      setSuccessMessage(msg);
      successTimerRef.current = setTimeout(() => {
        setSuccessMessage('');
        successTimerRef.current = null;
      }, 3000);
    }, 600);
  };

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const showInfo = (title: string, message: string, kind: AdminDialogState['kind'] = 'info') => {
    setDialog({ title, message, kind, confirmLabel: 'OK' });
  };

  const confirmAction = (options: AdminDialogOptions, onConfirm: () => void | Promise<void>) => {
    setDialog({
      kind: 'warning',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      ...options,
      onConfirm,
    });
  };

  const handleSaveVenues = (updated: Venue[]) => { setVenues(updated); setVenuesState(updated); showSuccess('Venues saved!'); };

  const buildCatalogSources = () => collectCatalogLayoutSources({
    currentLayout,
    venues: getVenues(),
    savedLayouts: getSavedLayouts(),
    templates: getTemplates(),
    coupleEvents: getCoupleEvents(),
  });

  const catalogReferenceSummary = (kind: CatalogKind, definitionId: string) =>
    summarizeCatalogReferences(kind, definitionId, {
      sources: buildCatalogSources(),
      tableSpecs: getTableSpecs(),
      arrangements: getDecorArrangements(),
    });

  const guardCatalogRemoval = <T extends CatalogDefinition,>(
    kind: CatalogKind,
    current: T[],
    updated: T[],
    persist: (next: T[]) => void,
  ) => {
    const activeConflict = catalogFamilyWithMultipleActiveMembers(updated);
    if (activeConflict) {
      showInfo(
        'Only one catalog revision can be current',
        `${activeConflict.map((item) => item.name).join(' and ')} belong to the same revision family. Archive the current revision through its reviewed lifecycle before activating another.`,
        'warning',
      );
      return;
    }
    const changedHistorical = changedHistoricalCatalogMember(current, updated);
    if (changedHistorical) {
      const kindLabel = kind === 'decor' ? 'décor' : kind;
      showInfo(
        `Historical ${kindLabel} revision is read-only`,
        `${changedHistorical.name} is retained for layouts that reference this exact revision. Edit the current active revision instead; migrate layouts only through guided replacement.`,
        'warning',
      );
      return;
    }
    const nextIds = new Set(updated.map((item) => item.id));
    const removed = current.filter((item) => !nextIds.has(item.id));
    if (removed.length > 0) {
      if (kind === 'chair' && removed.some((item) => item.id === 'none')) {
        showInfo(
          'No Chairs is required',
          'The reserved No Chairs definition represents explicit zero seating and cannot be archived or deleted.',
          'warning',
        );
        return;
      }
      const referenced = removed
        .map((definition) => ({ definition, summary: catalogReferenceSummary(kind, definition.id) }))
        .find((candidate) => candidate.summary.totalReferences > 0);
      if (referenced) {
        setPendingCatalogRemoval({ kind, ...referenced });
        return;
      }
      persist(updated);
      return;
    }

    const physicalEdit = current.map((source) => {
      const proposed = updated.find((candidate) => candidate.id === source.id);
      if (!proposed) return null;
      const changes = catalogPhysicalChanges(kind, source, proposed);
      return changes.length > 0 ? { source, proposed, changes } : null;
    }).find((candidate): candidate is {
      source: T;
      proposed: T;
      changes: CatalogPhysicalChange[];
    } => !!candidate);

    if (physicalEdit) {
      if (kind === 'chair' && physicalEdit.source.id === 'none') {
        showInfo(
          'No Chairs is fixed',
          'The reserved No Chairs definition must remain zero-sized so explicit zero seating has no physical clearance.',
          'warning',
        );
        return;
      }
      const summary = catalogReferenceSummary(kind, physicalEdit.source.id);
      if (summary.totalReferences > 0) {
        setPendingCatalogRevision({ kind, ...physicalEdit, summary });
        return;
      }
    }
    persist(updated);
  };

  const persistTableSpecs = (updated: TableSpec[]) => {
    setTableSpecs(updated);
    setTableSpecsState(updated);
    showSuccess('Tables saved!');
  };
  const persistFixtureTypes = (updated: FixtureType[]) => {
    setFixtureTypes(updated);
    setFixtureTypesState(updated);
    showSuccess('Fixtures saved!');
  };
  const persistChairSpecs = (updated: ChairSpec[]) => {
    setChairSpecs(updated);
    setChairSpecsState(updated);
    showSuccess('Chairs saved!');
  };
  const persistDecorItems = (updated: DecorItem[]) => {
    setDecorItems(updated);
    setDecorItemsState(updated);
    showSuccess('Décor catalog saved!');
  };

  const handleSaveTables = (updated: TableSpec[]) =>
    guardCatalogRemoval('table', tableSpecs, updated, persistTableSpecs);
  const handleSaveFixtures = (updated: FixtureType[]) =>
    guardCatalogRemoval('fixture', fixtureTypes, updated, persistFixtureTypes);
  const handleSaveGuidelines = (updated: Guideline[]) => { setGuidelines(updated); setGuidelinesState(updated); showSuccess('Guidelines saved!'); };
  const handleSaveTemplates = (updated: LayoutTemplate[]) => { setTemplates(updated); setTemplatesState(updated); showSuccess('Templates saved!'); };
  const handleSaveLinenColors = (updated: LinenColor[]) => { setLinenColors(updated); setLinenColorsState(updated); showSuccess('Linen colors saved!'); };
  const handleSaveWallStyles = (updated: WallStyle[]) => { setWallStyles(updated); setWallStylesState(updated); showSuccess('Wall styles saved!'); };
  const handleSaveConfig = (updated: Config) => { setConfig(updated); applyRootStyles(updated); showSuccess('Branding saved!'); };
  const handleSaveUsers = (updated: User[]) => { setUsers(updated); setUsersState(updated); showSuccess('Users saved!'); };
  const handleSaveSpacing = (updated: typeof spacingSettings) => { setSpacingSettings(updated); setSpacingSettingsState(updated); showSuccess('Spacing saved!'); };

  const buildVenueGeometrySources = (venue: Venue): GeometryImpactSource[] => {
    const sources: GeometryImpactSource[] = [];
    if (currentLayout?.venueId === venue.id) {
      sources.push({
        id: `working:${venue.id}`,
        label: 'Current working layout',
        kind: 'working',
        tables: currentLayout.tables,
        fixtures: currentLayout.fixtures,
        decor: currentLayout.decor || [],
        ceremonyRows: currentLayout.ceremonyRows || [],
      });
    }
    if (venue.masterLayout) {
      sources.push({
        id: `master:${venue.id}`,
        label: `Master · ${venue.name}`,
        kind: 'master',
        tables: venue.masterLayout.tables || [],
        fixtures: venue.masterLayout.fixtures || [],
        decor: venue.masterLayout.decor || [],
        ceremonyRows: venue.masterLayout.ceremonyRows || [],
      });
    }
    getSavedLayouts().filter((layout) => layout.venueId === venue.id).forEach((layout) => {
      sources.push({
        id: `named:${layout.id}`,
        label: layout.name,
        kind: 'named',
        tables: layout.tables || [],
        fixtures: layout.fixtures || [],
        decor: layout.decor || [],
        ceremonyRows: layout.ceremonyRows || [],
      });
    });
    getCoupleEvents().forEach((event) => {
      const layout = event.spaceLayouts?.[venue.id]?.layout;
      if (!layout) return;
      sources.push({
        id: `couple:${event.id}:${venue.id}`,
        label: `${event.coupleName}${event.eventDate ? ` · ${event.eventDate}` : ''}`,
        kind: 'couple',
        tables: layout.tables || [],
        fixtures: layout.fixtures || [],
        decor: layout.decor || [],
        ceremonyRows: layout.ceremonyRows || [],
      });
    });
    return sources;
  };

  const validateEventQuestion = (q: { text: string; answerType: EventQuestionAnswerType; optionsText: string }): string | null => {
    if (!q.text.trim()) return 'Question text is required.';
    if (q.answerType === 'dropdown') {
      const options = q.optionsText.split(',').map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) return 'Dropdown questions require at least one option.';
    }
    return null;
  };

  const handleAddEventQuestion = () => {
    const err = validateEventQuestion(newQuestion);
    if (err) {
      setQuestionError(err);
      return;
    }
    const options = newQuestion.answerType === 'dropdown'
      ? newQuestion.optionsText.split(',').map((o) => o.trim()).filter(Boolean)
      : undefined;
    const question: EventQuestion = {
      id: createEntityId('event-question', eventQuestions.map((question) => question.id)),
      text: newQuestion.text.trim(),
      group: newQuestion.group,
      answerType: newQuestion.answerType,
      options,
      workflow: [],
    };
    setEventQuestions((prev) => [...prev, question]);
    setNewQuestion({ text: '', group: 'Ceremony', answerType: 'text', optionsText: '' });
    setQuestionError('');
    showSuccess('Event question added!');
  };

  const handleUpdateEventQuestion = (id: string, updates: Partial<EventQuestion>) => setEventQuestions((prev) => prev.map((q) => q.id === id ? { ...q, ...updates } : q));
  const handleDeleteEventQuestion = (id: string) => {
    confirmAction(
      {
        title: 'Delete event question?',
        message: 'This question will be removed from future event questionnaires.',
        kind: 'danger',
        confirmLabel: 'Delete Question',
      },
      () => {
        setEventQuestions((prev) => prev.filter((q) => q.id !== id));
        if (editingQuestionId === id) setEditingQuestionId(null);
        showSuccess('Event question deleted!');
      },
    );
  };

  const handleAddEventRole = () => {
    const roleName = newEventRoleName.trim();
    if (!roleName) {
      showInfo('Event role required', 'Enter an Event Role name before adding it.', 'warning');
      return;
    }
    if (eventRoles.some((r) => r.toLowerCase() === roleName.toLowerCase())) {
      showInfo('Duplicate event role', 'This Event Role already exists.', 'warning');
      return;
    }
    setEventRoles((prev) => [...prev, roleName]);
    setNewEventRoleName('');
    showSuccess('Event Role added!');
  };
  const handleStartEditEventRole = (role: string) => { setEditingEventRoleName(role); setEditingEventRoleValue(role); };
  const handleSaveEventRoleEdit = () => {
    if (!editingEventRoleName) return;
    const next = editingEventRoleValue.trim();
    if (!next) {
      showInfo('Event role required', 'Enter an Event Role name before saving.', 'warning');
      return;
    }
    if (eventRoles.some((r) => r.toLowerCase() === next.toLowerCase() && r !== editingEventRoleName)) {
      showInfo('Duplicate event role', 'This Event Role already exists.', 'warning');
      return;
    }
    setEventRoles((prev) => prev.map((r) => (r === editingEventRoleName ? next : r)));
    setEditingEventRoleName(null);
    setEditingEventRoleValue('');
    showSuccess('Event Role updated!');
  };
  const handleDeleteEventRole = (role: string) => {
    confirmAction(
      {
        title: 'Delete event role?',
        message: `Delete Event Role "${role}"? Existing users with this label will not be automatically reassigned.`,
        kind: 'danger',
        confirmLabel: 'Delete Role',
      },
      () => {
        setEventRoles((prev) => prev.filter((r) => r !== role));
        showSuccess('Event Role deleted!');
      },
    );
  };

  const mapUserRoleToLegacyRole = (userRole?: 'admin' | 'master' | 'shared' | 'read-only' | 'staff'): 'admin' | 'basic' | 'staff' => {
    if (userRole === 'admin') return 'admin';
    if (userRole === 'staff') return 'staff';
    return 'basic';
  };

  const validateUserForm = (u: any, requireAuthFields = false): string[] => {
    const errors: string[] = [];
    const normalizedUsername = (u.username || u.email || '').trim();
    if (requireAuthFields) {
      if (!normalizedUsername) errors.push('Username is required.');
      if (!u.password?.trim()) errors.push('Password is required.');
      if (!u.name?.trim()) errors.push('Name is required.');
    }
    const role = u.userRole ?? 'shared';
    if (!u.userRole) errors.push('User Role is required.');
    if (role !== 'admin') {
      if (!u.email?.trim()) errors.push('Email is required for non-admin users.');
      if (!u.contactPhoneNumber?.trim()) errors.push('Contact Phone Number is required for non-admin users.');
      if (!u.phoneType) errors.push('Phone Type is required for non-admin users.');
      if (!u.eventRole?.trim()) errors.push('Event Role is required for non-admin users.');
      if (!u.eventName?.trim()) errors.push('Event Name is required for non-admin users.');
      if (!u.eventDate?.trim()) {
        errors.push('Event Date is required for non-admin users.');
      } else {
        const selected = new Date(`${u.eventDate}T00:00:00`);
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (Number.isNaN(selected.getTime()) || selected <= todayStart) errors.push('Event Date must be in the future for non-admin users.');
      }
    }
    if (u.email?.trim()) {
      const email = normalizeEmail(u.email);
      if (!email.ok) errors.push(email.error || 'Enter a valid email address.');
    }
    if (u.contactPhoneNumber?.trim()) {
      const phone = normalizeUsPhone(u.contactPhoneNumber);
      if (!phone.ok) errors.push(phone.error || 'Enter a valid US phone number.');
    }
    if ((u.preferredCommunication || []).includes('text') && u.phoneType !== 'Mobile') errors.push('Preferred Communication "Text" requires Phone Type to be Mobile.');
    if (u.allowSharedAccess) {
      const limit = Math.floor(Number(u.sharedUserLimit ?? 0));
      if (!Number.isFinite(limit) || limit <= 0 || limit > 10) errors.push('Shared User Limit must be an integer between 1 and 10 when shared access is enabled.');
    }
    return errors;
  };

  const getUserFieldErrors = (u: any, requireAuthFields = false): Record<string, string> => {
    const fieldErrors: Record<string, string> = {};
    const role = u.userRole ?? 'shared';
    const normalizedUsername = (u.username || u.email || '').trim();
    if (requireAuthFields) {
      if (!u.name?.trim()) fieldErrors.name = 'Name is required.';
      if (!normalizedUsername) fieldErrors.email = 'Email is required.';
      if (!u.password?.trim()) fieldErrors.password = 'Password is required.';
    }
    if (!u.userRole) fieldErrors.userRole = 'User Role is required.';
    if (role !== 'admin') {
      if (!u.email?.trim()) fieldErrors.email = 'Email is required for non-admin users.';
      if (!u.contactPhoneNumber?.trim()) fieldErrors.contactPhoneNumber = 'Contact Phone Number is required for non-admin users.';
      if (!u.phoneType) fieldErrors.phoneType = 'Phone Type is required for non-admin users.';
      if (!u.eventRole?.trim()) fieldErrors.eventRole = 'Event Role is required for non-admin users.';
      if (!u.eventName?.trim()) fieldErrors.eventName = 'Event Name is required for non-admin users.';
      if (!u.eventDate?.trim()) fieldErrors.eventDate = 'Event Date is required for non-admin users.';
    }
    if (u.email?.trim()) {
      const email = normalizeEmail(u.email);
      if (!email.ok) fieldErrors.email = email.error || 'Enter a valid email address.';
    }
    if (u.contactPhoneNumber?.trim()) {
      const phone = normalizeUsPhone(u.contactPhoneNumber);
      if (!phone.ok) fieldErrors.contactPhoneNumber = phone.error || 'Enter a valid US phone number.';
    }
    if ((u.preferredCommunication || []).includes('text') && u.phoneType !== 'Mobile') fieldErrors.preferredCommunication = 'Preferred Communication "Text" requires Phone Type to be Mobile.';
    if (u.allowSharedAccess) {
      const limit = Math.floor(Number(u.sharedUserLimit ?? 0));
      if (!Number.isFinite(limit) || limit <= 0 || limit > 10) fieldErrors.sharedUserLimit = 'Shared User Limit must be an integer between 1 and 10.';
    }
    return fieldErrors;
  };

  const imageUploadInputRef = useRef<HTMLInputElement>(null);
  const imageUploadCallbackRef = useRef<((dataUrl: string) => void) | null>(null);

  const handleImageUpload = (callback: (dataUrl: string) => void) => {
    imageUploadCallbackRef.current = callback;
    imageUploadInputRef.current?.click();
  };

  const handleImageUploadChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const callback = imageUploadCallbackRef.current;
    if (!file || !callback) return;
    if (file.size > 5 * 1024 * 1024) {
      showInfo('File too large', 'Maximum image size is 5MB.', 'warning');
      return;
    }
    void uploadImage(file, { bucket: 'venue-images', organizationId: organizationId || undefined })
      .then((ref) => callback(ref))
      .catch(() => showInfo('Upload failed', 'Could not upload the image.', 'warning'));
  };

  const handleCreateUser = async () => {
    const usernameFromEmail = (newUser.email || '').trim().toLowerCase();
    const normalizedDraft = {
      ...newUser,
      username: (newUser.username || usernameFromEmail).trim(),
      preferredCommunication: newUser.preferredCommunication || [],
      allowSharedAccess: !!newUser.allowSharedAccess,
      sharedUserLimit: newUser.allowSharedAccess ? Math.max(1, Math.min(10, Math.floor(Number(newUser.sharedUserLimit || 1)))) : 0,
    };
    const errors = validateUserForm(normalizedDraft, true);
    const fieldErrors = getUserFieldErrors(normalizedDraft, true);
    if (!usernameFromEmail) errors.push('Email is required.');
    else if (users.some((u) => (u.email || u.username || '').trim().toLowerCase() === usernameFromEmail)) errors.push('Email already exists.');
    if (errors.length > 0) {
      setCreateUserFieldErrors(fieldErrors);
      showInfo('Please review the user details', errors.join('\n'), 'warning');
      return;
    }
    setCreateUserFieldErrors({});
    const legacyRole = mapUserRoleToLegacyRole(normalizedDraft.userRole);
    const effectiveUsername = usernameFromEmail || normalizedDraft.username;
    const email = normalizeEmail(normalizedDraft.email, { required: true });
    const phone = normalizeUsPhone(normalizedDraft.contactPhoneNumber, { required: normalizedDraft.userRole !== 'admin' });
    if (!email.ok || !phone.ok) {
      setCreateUserFieldErrors({
        ...fieldErrors,
        ...(email.ok ? {} : { email: email.error || 'Enter a valid email address.' }),
        ...(phone.ok ? {} : { contactPhoneNumber: phone.error || 'Enter a valid US phone number.' }),
      });
      showInfo('Please review the user details', [email.error, phone.error].filter(Boolean).join('\n'), 'warning');
      return;
    }
    const created = await createUser(effectiveUsername, normalizedDraft.password || '', normalizedDraft.name || '', legacyRole, email.value);
    if (!created) {
      showInfo('Unable to create user', 'The username or email may already exist.', 'warning');
      return;
    }
    const updatedUsers = getAllUsers().map((u) => u.username.toLowerCase() === effectiveUsername.toLowerCase()
      ? {
          ...u,
          email: normalizedDraft.email || '',
          contactPhoneNumber: normalizedDraft.contactPhoneNumber || '',
          phoneType: normalizedDraft.phoneType || 'Mobile',
          preferredCommunication: normalizedDraft.preferredCommunication || [],
          eventRole: normalizedDraft.eventRole || '',
          eventName: normalizedDraft.eventName || '',
          userRole: normalizedDraft.userRole || 'shared',
          isMasterUser: normalizedDraft.isMasterUser || false,
          parentUserId: normalizedDraft.parentUserId,
          allowSharedAccess: normalizedDraft.allowSharedAccess || false,
          sharedUserLimit: normalizedDraft.allowSharedAccess ? normalizedDraft.sharedUserLimit : 0,
          userStatus: normalizedDraft.userStatus || 'active',
          eventDate: normalizedDraft.eventDate || '',
          phone: phone.value,
          jobTitle: normalizedDraft.eventRole || '',
          department: normalizedDraft.eventName || '',
        }
      : u);
    handleSaveUsers(updatedUsers);
    setNewUser({
      username: '', password: '', name: '', role: 'staff', email: '', phone: '', contactPhoneNumber: '', phoneType: 'Mobile',
      preferredCommunication: [], eventRole: '', eventName: '', userRole: 'master', isMasterUser: false, parentUserId: undefined,
      allowSharedAccess: false, sharedUserLimit: 0, userStatus: 'active', eventDate: '', jobTitle: '', department: '', assignedRoles: [],
    });
    setShowCreateUserModal(false);
    showSuccess('User created!');
  };

  const handleDeleteUser = (userId: string, label?: string) => {
    const displayName = label || users.find((u) => u.id === userId)?.name || userId;
    confirmAction(
      {
        title: 'Delete user?',
        message: `Delete user "${displayName}"? This cannot be undone.`,
        kind: 'danger',
        confirmLabel: 'Delete User',
      },
      () => {
        deleteUser(userId);
        setUsersState(getAllUsers());
        showSuccess('User deleted!');
      },
    );
  };

  const handleImpersonate = () => undefined;

  const handleUpdateTemplateWithCurrentLayout = (templateId: string) => {
    if (!currentLayout) {
      showInfo('No current layout', 'Please design a layout first.', 'warning');
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const updatedTemplate: LayoutTemplate = {
      ...template,
      tables: currentLayout.tables.map((t) => ({ id: t.id, type: 'table' as const, specId: t.specId, x: t.x, y: t.y, rotation: t.rotation, label: t.label, guests: t.guests || [], hasLinen: t.hasLinen, linenColor: t.linenColor, customCapacity: t.customCapacity })),
      fixtures: currentLayout.fixtures.map((f) => ({ id: f.id, type: 'fixture' as const, specId: f.specId, x: f.x, y: f.y, rotation: f.rotation, label: f.label, isExterior: f.isExterior })),
      venueId: currentLayout.venueId,
    };
    handleSaveTemplates(templates.map((t) => t.id === templateId ? updatedTemplate : t));
    setEditingTemplateId(null);
  };

  const handleCreateTemplateFromLayout = () => {
    if (!currentLayout) {
      showInfo('No current layout', 'Please design a layout first, then come back to save it as a template.', 'warning');
      return;
    }
    const newTemplate: LayoutTemplate = {
      id: createEntityId('template', templates.map((template) => template.id)),
      name: 'New Template from Layout',
      description: 'Created from current layout',
      venueId: currentLayout.venueId,
      category: currentLayout.category || 'reception',
      tables: currentLayout.tables.map((t) => ({ id: t.id, type: 'table' as const, specId: t.specId, x: t.x, y: t.y, rotation: t.rotation, label: t.label, guests: t.guests || [], hasLinen: t.hasLinen, linenColor: t.linenColor, customCapacity: t.customCapacity })),
      fixtures: currentLayout.fixtures.map((f) => ({ id: f.id, type: 'fixture' as const, specId: f.specId, x: f.x, y: f.y, rotation: f.rotation, label: f.label, isExterior: f.isExterior })),
      isMasterTemplate: false,
      createdAt: new Date().toISOString(),
    };
    handleSaveTemplates([...templates, newTemplate]);
  };

  const handleLoadForEdit = (template: LayoutTemplate) => {
    if (onLoadTemplateForEdit) {
      onLoadTemplateForEdit(template);
      onClose();
    }
  };

  const handleReset = () => {
    confirmAction(
      {
        title: 'Reset all settings?',
        message: 'This will reset all admin-managed settings to factory defaults. This cannot be undone.',
        kind: 'danger',
        confirmLabel: 'Reset Everything',
      },
      () => {
        resetToDefaults();
        setVenuesState(getVenues());
        setTableSpecsState(getTableSpecs());
        setFixtureTypesState(getFixtureTypes());
        setGuidelinesState(getGuidelines());
        setTemplatesState(getTemplates());
        setLinenColorsState(getLinenColors());
        setWallStylesState(getWallStyles());
        setChairSpecsState(getChairSpecs());
        setSpacingSettingsState(getSpacingSettings());
        showSuccess('Reset to defaults!');
      },
    );
  };

  const renderShapePreview = (shape: ShapeType, color: string = '#4A1942') => {
    const size = 48;
    switch (shape) {
      case 'circle': return <circle cx={size / 2} cy={size / 2} r={size / 2 - 4} fill={color} stroke="#333" strokeWidth="1" />;
      case 'rectangle': return <rect x="4" y="8" width={size - 8} height={size - 16} fill={color} stroke="#333" strokeWidth="1" />;
      case 'oval': return <ellipse cx={size / 2} cy={size / 2} rx={size / 2 - 4} ry={size / 3} fill={color} stroke="#333" strokeWidth="1" />;
      case 'triangle': return <polygon points={`${size / 2},4 ${size - 4},${size - 4} 4,${size - 4}`} fill={color} stroke="#333" strokeWidth="1" />;
      case 'semicircle': return <path d={`M 4,${size / 2} A ${size / 2 - 4},${size / 2 - 4} 0 0,1 ${size - 4},${size / 2} L 4,${size / 2}`} fill={color} stroke="#333" strokeWidth="1" />;
      case 'hexagon': {
        const h = size / 2, r = size / 2 - 4;
        return <polygon points={Array.from({ length: 6 }, (_, i) => `${h + r * Math.cos((i * 60 - 90) * Math.PI / 180)},${h + r * Math.sin((i * 60 - 90) * Math.PI / 180)}`).join(' ')} fill={color} stroke="#333" strokeWidth="1" />;
      }
      case 'octagon': {
        const h = size / 2, r = size / 2 - 4;
        return <polygon points={Array.from({ length: 8 }, (_, i) => `${h + r * Math.cos((i * 45 - 90) * Math.PI / 180)},${h + r * Math.sin((i * 45 - 90) * Math.PI / 180)}`).join(' ')} fill={color} stroke="#333" strokeWidth="1" />;
      }
      default: return <rect x="4" y="4" width={size - 8} height={size - 8} fill={color} stroke="#333" strokeWidth="1" />;
    }
  };

  const tableTypes = tableSpecs.filter((t) => !t.isSeatingType);
  const seatingTypes = tableSpecs.filter((t) => t.isSeatingType);
  const getSeatingDimensions = (chairType: string | undefined, chairsPerRow: number, rowCount: number, rowSpacingFt: number) => {
    const chair = getChairSpecs().find((c) => c.id === (chairType || 'white-plastic'));
    const chairWidth = chair?.width || 1.5;
    const chairDepth = chair?.depth || chair?.width || 1.5;
    const chairGap = Math.max(0.2, chairWidth * 0.15);
    const width = Math.max(1, chairsPerRow) * chairWidth + Math.max(0, Math.max(1, chairsPerRow) - 1) * chairGap;
    const height = Math.max(1, rowCount) * chairDepth + Math.max(0, Math.max(1, rowCount) - 1) * Math.max(0.5, rowSpacingFt);
    return { width: Number(width.toFixed(2)), height: Number(height.toFixed(2)) };
  };

  const catalogDefinitions = (kind: CatalogKind): CatalogDefinition[] => {
    if (kind === 'table') return getTableSpecs();
    if (kind === 'fixture') return getFixtureTypes();
    if (kind === 'chair') return getChairSpecs();
    return getDecorItems();
  };

  const archiveCatalogDefinition = (kind: CatalogKind, definitionId: string, close = true) => {
    if (kind === 'table') {
      persistTableSpecs(getTableSpecs().map((item) => item.id === definitionId
        ? { ...item, archived: true }
        : item));
    } else if (kind === 'fixture') {
      persistFixtureTypes(getFixtureTypes().map((item) => item.id === definitionId
        ? { ...item, archived: true }
        : item));
    } else if (kind === 'chair') {
      persistChairSpecs(getChairSpecs().map((item) => item.id === definitionId
        ? { ...item, archived: true }
        : item));
    } else {
      persistDecorItems(getDecorItems().map((item) => item.id === definitionId
        ? { ...item, archived: true }
        : item));
    }
    if (close) setPendingCatalogRemoval(null);
  };

  const confirmCatalogRevision = () => {
    if (!pendingCatalogRevision) return;
    const { kind, source, proposed, changes } = pendingCatalogRevision;
    const latestDefinitions = catalogDefinitions(kind);
    const latest = latestDefinitions.find((definition) => definition.id === source.id);
    if (!latest) {
      setPendingCatalogRevision(null);
      showInfo('Revision blocked', 'The source catalog definition no longer exists.', 'warning');
      return;
    }
    if (catalogPhysicalChanges(kind, source, latest).length > 0) {
      setPendingCatalogRevision(null);
      showInfo(
        'Revision conflict',
        'This catalog definition changed after the revision prompt opened. Review the latest values and try again.',
        'warning',
      );
      return;
    }
    const mergedProposal = { ...latest } as CatalogDefinition;
    changes.forEach((change) => {
      (mergedProposal as unknown as Record<string, unknown>)[change.field]
        = (proposed as unknown as Record<string, unknown>)[change.field];
    });
    const revisionResult = createCatalogRevision(
      latest,
      mergedProposal,
      latestDefinitions,
    );
    const nextDefinitions = [
      ...latestDefinitions.map((definition) => definition.id === latest.id
        ? revisionResult.archivedSource
        : definition),
      revisionResult.revision,
    ];
    if (kind === 'table') {
      persistTableSpecs(nextDefinitions as TableSpec[]);
      const revision = revisionResult.revision as TableSpec;
      if (revision.isSeatingType) {
        setExpandedSeatingTypes((current) => new Set([...current, revision.id]));
      } else {
        setExpandedTables((current) => new Set([...current, revision.id]));
      }
    } else if (kind === 'fixture') {
      persistFixtureTypes(nextDefinitions as FixtureType[]);
    } else if (kind === 'chair') {
      persistChairSpecs(nextDefinitions as ChairSpec[]);
      setExpandedChairs((current) => new Set([...current, revisionResult.revision.id as any]));
    } else {
      persistDecorItems(nextDefinitions as DecorItem[]);
    }
    setPendingCatalogRevision(null);
    showSuccess(`${revisionResult.revision.name} revision ${revisionResult.revision.catalogRevision} created. Existing layouts remain on the archived source.`);
  };

  const replacementCandidates = pendingCatalogRemoval
    ? catalogDefinitions(pendingCatalogRemoval.kind).filter((candidate) =>
        candidate.id !== pendingCatalogRemoval.definition.id
        && !candidate.archived
        && !catalogReplacementCompatibilityIssue(
          pendingCatalogRemoval.kind,
          pendingCatalogRemoval.definition,
          candidate,
        ))
    : [];

  const buildCatalogReplacementReview = (replacementId: string): CatalogReplacementReview => {
    if (!pendingCatalogRemoval) {
      return {
        blockers: [{ sourceId: 'catalog', sourceLabel: 'Catalog', message: 'The deletion request is no longer active.' }],
        warnings: [],
        incompatibleArrangementIds: [],
        affectedSourceIds: [],
        affectedInstances: 0,
      };
    }
    const replacement = catalogDefinitions(pendingCatalogRemoval.kind)
      .find((candidate) => candidate.id === replacementId);
    if (!replacement) {
      return {
        blockers: [{ sourceId: 'catalog', sourceLabel: 'Catalog', message: 'The selected replacement no longer exists.' }],
        warnings: [],
        incompatibleArrangementIds: [],
        affectedSourceIds: [],
        affectedInstances: 0,
      };
    }
    return reviewCatalogReplacement({
      kind: pendingCatalogRemoval.kind,
      oldId: pendingCatalogRemoval.definition.id,
      replacementId,
      sourceDefinition: pendingCatalogRemoval.definition,
      replacementDefinition: replacement,
      sources: buildCatalogSources(),
      venues: getVenues(),
      tableSpecs: getTableSpecs(),
      fixtureTypes: getFixtureTypes(),
      chairSpecs: getChairSpecs(),
      decorItems: getDecorItems(),
      arrangements: getDecorArrangements(),
    });
  };

  const applyReviewedCatalogReplacement = (
    replacementId: string,
    review: CatalogReplacementReview,
  ) => {
    if (!pendingCatalogRemoval || review.blockers.length > 0) return;
    const { kind, definition } = pendingCatalogRemoval;
    const options = {
      oldTableSpec: kind === 'table' ? definition as TableSpec : undefined,
      incompatibleArrangementIds: review.incompatibleArrangementIds,
    };
    const result = applyCatalogReplacementToStoredData(
      kind,
      definition.id,
      replacementId,
      options,
    );
    onReplaceWorkingCatalogReferences?.(kind, definition.id, replacementId, options);
    archiveCatalogDefinition(kind, definition.id, false);
    setTableSpecsState(getTableSpecs());
    setFixtureTypesState(getFixtureTypes());
    setChairSpecsState(getChairSpecs());
    setDecorItemsState(getDecorItems());
    setDecorArrangementsState(getDecorArrangements());
    setPendingCatalogRemoval(null);
    showSuccess(
      `Replacement applied to ${result.persistentLayoutsUpdated + (currentLayout ? 1 : 0)} reviewed layout source${result.persistentLayoutsUpdated === 0 && !currentLayout ? '' : 's'}. The original remains archived.`,
    );
  };

  if (!canAccessThisPanel) {
    return (
      <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl bg-white shadow-xl p-6">
          <h2 className="text-xl font-semibold text-red-700">Access denied</h2>
          <p className="mt-2 text-sm text-gray-600">You do not have permission to access the admin panel.</p>
          <button type="button" onClick={onClose} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Close</button>
        </div>
      </div>
    );
  }

  const commonProps: AdminCommonProps = {
    config,
    venues,
    setVenues,
    tables: tableSpecs,
    setTables: handleSaveTables,
    fixtures: fixtureTypes,
    setFixtures: handleSaveFixtures,
    chairs: chairSpecs,
    setChairs: handleSaveChairs,
    wallStyles,
    setWallStyles: handleSaveWallStyles,
    linenColors,
    setLinenColors: handleSaveLinenColors,
    templates,
    setTemplates: handleSaveTemplates,
    guidelines,
    setGuidelines: handleSaveGuidelines,
    users,
    setUsers: handleSaveUsers,
    eventQuestions,
    setEventQuestions,
    decorItems,
    setDecorItems: setDecorItemsState,
    decorCategories,
    setDecorCategories: setDecorCategoriesState,
    decorArrangements,
    setDecorArrangements: setDecorArrangementsState,
    decorPackages,
    setDecorPackages: setDecorPackagesState,
    layoutState,
    directMessages,
    handlers: {},
    user,
    organizationId,
    isAdmin,
    selectedMessageMasterUserId,
    setSelectedMessageMasterUserId,
    buildMessageThreadId,
    setShowCreateUserModal,
    setShowEditUserModal,
    setEditingUser,
    handleSaveUsers,
    handleDeleteUser,
    handleImpersonate,
    submissionWorkflow,
    showUserDirectMessagesSection,
    setShowUserDirectMessagesSection,
    showUserPendingApprovalsSection,
    setShowUserPendingApprovalsSection,
    showUserEventRolesSection,
    setShowUserEventRolesSection,
    showUserAccountsSection,
    setShowUserAccountsSection,
    newEventRoleName,
    setNewEventRoleName,
    handleAddEventRole,
    eventRoles,
    editingEventRoleName,
    editingEventRoleValue,
    setEditingEventRoleValue,
    handleSaveEventRoleEdit,
    setEditingEventRoleName,
    handleStartEditEventRole,
    handleDeleteEventRole,
    handleImageUpload,
    showSuccess,
    showInfo,
    confirmAction,
    createPasswordRecord,
    tableTypes,
    tableSpecs,
    setTableSpecs: handleSaveTables,
    fixtureTypes,
    setFixtureTypes: handleSaveFixtures,
    chairSpecs,
    setChairSpecs: handleSaveChairs,
    defaultWallStyles,
    defaultPatternColors,
    patternOptions,
    layoutCategories,
    venueCategories: layoutCategories,
    seatingTypes,
    expandedSeatingTypes,
    setExpandedSeatingTypes,
    getSeatingDimensions,
    toggleSeatingTypeExpanded,
    expandAllSeatingTypes,
    collapseAllSeatingTypes,
    shapeOptions,
    chairLayoutOptions,
    getChairSpecs,
    setShowTableTypesSection,
    showTableTypesSection,
    setShowSeatingTypesSection,
    showSeatingTypesSection,
    setShowLodgingFixturesSection,
    showLodgingFixturesSection,
    expandAllLodgingFixtures,
    collapseAllLodgingFixtures,
    toggleLodgingFixtureExpanded,
    expandedLodgingFixtures,
    setShowExteriorFixturesSection,
    showExteriorFixturesSection,
    expandAllExteriorFixtures,
    collapseAllExteriorFixtures,
    toggleExteriorFixtureExpanded,
    expandedExteriorFixtures,
    setShowVenueFixturesSection,
    showVenueFixturesSection,
    expandAllVenueFixtures,
    collapseAllVenueFixtures,
    toggleVenueFixtureExpanded,
    expandedVenueFixtures,
    setShowDrawingTool,
    renderShapePreview,
    handleSaveVenues,
    collapseAllVenues,
    expandAllVenues,
    toggleVenueExpanded,
    setCustomShapeVenueId,
    setLodgingVenueId,
    handleSaveTables,
    collapseAllTables,
    expandAllTables,
    toggleTableExpanded,
    handleSaveFixtures,
    setChairSpecsState,
    handleSaveWallStyles,
    handleSaveLinenColors,
    handleSaveGuidelines,
    handleSaveTemplates,
    handleSaveConfig,
    handleSaveSpacing,
    spacingSettings,
    setSpacingSettingsState,
    expandedVenues,
    setExpandedVenues,
    expandedTables,
    setExpandedTables,
    expandedChairs,
    setExpandedChairs,
    toggleChairExpanded,
    expandedWalls,
    setExpandedWalls,
    toggleWallExpanded,
    expandedLinens,
    setExpandedLinens,
    toggleLinenExpanded,
    expandAllLinens,
    collapseAllLinens,
    expandedTemplates,
    setExpandedTemplates,
    toggleTemplateExpanded,
    expandedGuidelines,
    setExpandedGuidelines,
    toggleGuidelineExpanded,
    expandedUsers,
    setExpandedUsers,
    toggleUserExpanded,
    onClose,
    currentLayout,
    onLoadTemplateForEdit,
    createUser,
    deleteUser,
    getAllUsers,
    canAccessThisPanel,
    EVENT_ROLES_STORAGE_KEY,
    EVENT_QUESTIONS_STORAGE_KEY,
    DEFAULT_EVENT_ROLES,
    setVenuesState,
    setTableSpecsState,
    setFixtureTypesState,
    setGuidelinesState,
    setTemplatesState,
    setLinenColorsState,
    setConfigState,
    setUsersState,
    setWallStylesState,
    successMessage,
    setSuccessMessage,
    showDrawingTool,
    logoInputRef,
    customShapeVenueId,
    expandedBrandingSections,
    setExpandedBrandingSections,
    showCreateUserModal,
    showEditUserModal,
    editingUser,
    setEventRoles,
    newQuestion,
    setNewQuestion,
    editingQuestionId,
    setEditingQuestionId,
    questionError,
    setQuestionError,
    showWelcomePreview,
    setShowWelcomePreview,
    showAccessControl,
    setShowAccessControl,
    rbac,
    allRoles,
    AVAILABLE_WELCOME_FEATURES,
    currentWelcomeFeatures,
    masterUsers,
    validateEventQuestion,
    handleAddEventQuestion,
    handleUpdateEventQuestion,
    handleDeleteEventQuestion,
    handleCreateUser,
    newUser,
    setNewUser,
    getUserFieldErrors,
    createUserFieldErrors,
    setCreateUserFieldErrors,
    editingTemplateId,
    setEditingTemplateId,
    handleUpdateTemplateWithCurrentLayout,
    handleCreateTemplateFromLayout,
    handleLoadForEdit,
    handleReset,
  };

  // Ordered admin categories (the group names shown in the category rail). The
  // venue does NOT configure the guest portal — that lives in the Couples Portal —
  // so there is no venue-side Guest Portal section here.
  const CATEGORY_ORDER = ADMIN_NAV_GROUPS;

  const tabs: AdminTabDefinition[] = [
    // Venues & Inventory
    { id: 'venues', label: '🏛️ Venues', icon: '🏛️', Component: VenueManagement, props: commonProps, group: 'Venues & Inventory' },
    { id: 'seating', label: '🪑 Tables, Chairs & Linens', icon: '🪑', Component: SeatingAndLinensManagement, props: commonProps, group: 'Venues & Inventory' },
    { id: 'structures', label: '📦 Fixtures & Walls', icon: '📦', Component: StructuresManagement, props: commonProps, group: 'Venues & Inventory' },
    {
      id: 'decor',
      label: '🎀 Decor',
      icon: '🎀',
      group: 'Venues & Inventory',
      Component: AdminDecorSection,
      props: {
        config,
        decorItems,
        setDecorItems: (items: DecorItem[]) =>
          guardCatalogRemoval('decor', decorItems, items, persistDecorItems),
        decorCategories,
        setDecorCategories: (categories: any[]) => { setDecorCategories(categories); setDecorCategoriesState(categories); },
        decorArrangements,
        setDecorArrangements: (arrangements: any[]) => { setDecorArrangements(arrangements); setDecorArrangementsState(arrangements); },
        decorPackages,
        setDecorPackages: (packages: any[]) => { setDecorPackages(packages); setDecorPackagesState(packages); },
        onShowSuccess: showSuccess,
        confirmAction,
      },
    },

    // Layout Content
    { id: 'spacing', label: '📐 Spacing', icon: '📐', Component: SpacingManagement, props: commonProps, group: 'Layout Content' },
    { id: 'templates', label: '📋 Templates', icon: '📋', Component: TemplateManagement, props: commonProps, group: 'Layout Content' },
    { id: 'guidelines', label: '💡 Guidelines', icon: '💡', Component: GuidelineManagement, props: commonProps, group: 'Layout Content' },

    // Couples Portal
    { id: 'couples', label: '💍 Couples', icon: '💍', Component: CoupleManagement, props: { config, venues, user, isAdmin, onShowSuccess: showSuccess }, group: 'Couples Portal' },
    { id: 'packages', label: '🎁 Packages & Add-ons', icon: '🎁', Component: PackageManagement, props: { onShowSuccess: showSuccess, venues }, group: 'Couples Portal' },
    { id: 'wayfinding', label: '🗺️ Wayfinding & Rules', icon: '🗺️', Component: VenueWayfindingManagement, props: { config, venues, onShowSuccess: showSuccess, onOpenVenueMap }, group: 'Couples Portal' },
    { id: 'event-questions', label: '❓ Event Questions', icon: '❓', Component: EventQuestionsManagement, props: commonProps, group: 'Couples Portal' },

    // Branding, Access, & Configuration
    { id: 'branding', label: '🎨 Branding', icon: '🎨', Component: BrandingManagement, props: commonProps, group: 'Branding, Access, & Configuration' },
    { id: 'users', label: '👥 Users', icon: '👥', Component: UserManagement, props: commonProps, group: 'Branding, Access, & Configuration' },
    { id: 'access-control', label: '🔐 Access Control', icon: '🔐', Component: AccessControlPanel, props: { inline: true, onClose: () => goToTab('overview') }, group: 'Branding, Access, & Configuration' },
    { id: 'invites', label: '📨 Invite Members', icon: '📨', Component: InviteMembers, props: {}, group: 'Branding, Access, & Configuration' },
    { id: 'platform-chat', label: '💬 Platform Chat', icon: '💬', Component: PlatformVenueChatPanel, props: { senderSide: 'venue', organizationName: 'platform administration' }, group: 'Branding, Access, & Configuration' },
    { id: 'communication-templates', label: '💬 Communication Templates', icon: '💬', Component: CommunicationTemplatesManagement, props: commonProps, group: 'Branding, Access, & Configuration' },
    { id: 'operations-settings', label: '🛠️ Operations & Checklists', icon: '🛠️', Component: OperationsSettingsManagement, props: commonProps, group: 'Branding, Access, & Configuration' },

    // System & Backup
    { id: 'security-audit', label: '🛡️ Security & Audit', icon: '🛡️', Component: SecurityAuditManagement, props: commonProps, group: 'System & Backup' },
    {
      id: 'backup',
      label: '💾 Backup & Restore',
      icon: '💾',
      Component: BackupManagement,
      group: 'System & Backup',
      props: { user, onDataRestored: () => emitDataChanged('all') },
    },
  ];

  const searching = tabSearch.trim().length > 0;
  const filteredTabs = tabs.filter((tab) => {
    const q = tabSearch.trim().toLowerCase();
    if (!q) return true;
    return `${tab.label} ${tab.id} ${tab.group}`.toLowerCase().includes(q);
  });
  const isOverview = activeTab === 'overview' && !searching;
  const activeTabConfig =
    (!isOverview && tabs.find((tab) => tab.id === activeTab)) ||
    (searching ? filteredTabs[0] : undefined) ||
    tabs[0];
  const ActiveComponent = activeTabConfig.Component;
  const activeCategory = isOverview ? '' : activeTabConfig.group;

  // Categories in fixed display order, each carrying its sections.
  const categories = CATEGORY_ORDER.map((c) => ({
    ...c,
    tabs: tabs.filter((t) => t.group === c.label),
  })).map((c) => ({
    ...c,
    tabs: searching ? c.tabs.filter((t) => filteredTabs.some((ft) => ft.id === t.id)) : c.tabs,
  })).filter((c) => c.tabs.length > 0);

  const overviewKpis: { id: string; icon: string; label: string; value: number; title: string }[] = [
    { id: 'venues', icon: '🏛️', label: 'Venues', value: venues.length, title: 'Switch to Venues' },
    { id: 'seating', icon: '🪑', label: 'Seating', value: tableSpecs.length, title: 'Switch to Tables & Seating' },
    { id: 'packages', icon: '🎁', label: 'Packages', value: getWeddingPackages().length, title: 'Switch to Packages' },
    { id: 'couples', icon: '💍', label: 'Couples', value: getCoupleEvents().length, title: 'Switch to Couples' },
    { id: 'templates', icon: '📋', label: 'Templates', value: templates.length, title: 'Switch to Templates' },
    { id: 'users', icon: '👥', label: 'Users', value: users.length, title: 'Switch to Users' },
  ];

  const brand = config.primaryColor || '#4A1942';
  const groupIsOpen = (label: string) => searching || expandedGroups.has(label);

  return (
    <div className={inline ? "relative w-full h-full flex overflow-hidden" : "fixed inset-0 bg-black/50 flex items-center justify-center p-2 sm:p-4"} style={inline ? undefined : { zIndex: 10000 }}>
      <div className={inline ? "relative w-full h-full flex overflow-hidden" : "relative bg-white rounded-xl shadow-2xl w-full max-w-[96rem] h-[95vh] flex overflow-hidden"}>
        <aside
          className="relative flex shrink-0 select-none flex-col border-r border-gray-200 bg-white"
          style={{
            width: sidebarCollapsed ? 72 : sidebarWidth,
            color: config.textColor,
          }}
          aria-label="Admin sections"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-gray-50/70 p-3.5">
            {sidebarCollapsed ? (
              <div className="flex w-full flex-col items-center gap-2">
                {config.logoUrl ? (
                  <img
                    src={config.logoUrl}
                    alt={config.venueName}
                    className="h-9 w-9 rounded-lg border border-gray-200 bg-white object-contain p-0.5 shadow-sm"
                    title={config.venueName}
                  />
                ) : (
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-white shadow-sm"
                    style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                    title={config.venueName}
                  >
                    🏛️
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-200"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  ▶
                </button>
              </div>
            ) : (
              <div className="min-w-0 w-full space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {config.logoUrl ? (
                      <img
                        src={config.logoUrl}
                        alt={config.venueName}
                        className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white object-contain p-0.5 shadow-sm"
                      />
                    ) : (
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-white shadow-sm"
                        style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                      >
                        🏛️
                      </div>
                    )}
                    <div className="min-w-0">
                      <div
                        className="truncate text-sm font-extrabold text-gray-900"
                        style={{ fontFamily: config.headingFontFamily }}
                      >
                        {config.venueName || 'Seven Paths Manor'}
                      </div>
                      <div className="truncate text-[11px] font-medium text-gray-500">
                        {config.tagline || 'Wedding Venue Intelligence'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed(true)}
                    className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-gray-200"
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                  >
                    ◀
                  </button>
                </div>
                {(config.supportEmail || config.websiteUrl) && (
                  <div className="flex flex-wrap items-center gap-2.5 border-t border-gray-200/80 pt-2 text-xs text-gray-600">
                    {config.supportEmail && (
                      <a
                        href={`mailto:${config.supportEmail}`}
                        className="flex shrink-0 items-center gap-1 font-medium text-gray-600 hover:underline"
                        title={`Email: ${config.supportEmail}`}
                      >
                        <span>✉️</span>
                        <span>Email</span>
                      </a>
                    )}
                    {config.websiteUrl && (
                      <>
                        {config.supportEmail && <span className="text-gray-300">•</span>}
                        <a
                          href={sanitizeHref(config.websiteUrl) || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex shrink-0 items-center gap-1 font-medium text-gray-600 hover:underline"
                          title={`Website: ${config.websiteUrl}`}
                        >
                          <span>🌐</span>
                          <span>Website</span>
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <nav className="flex-1 space-y-3 overflow-y-auto p-2" aria-label="Admin categories">
            <button
              type="button"
              onClick={() => goToTab('overview')}
              title="Overview"
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                isOverview ? 'font-bold text-white shadow-sm' : 'font-medium text-gray-700 hover:bg-gray-100'
              } ${sidebarCollapsed ? 'justify-center' : ''}`}
              style={isOverview ? { backgroundColor: brand } : undefined}
              aria-current={isOverview ? 'page' : undefined}
            >
              <span aria-hidden="true">📊</span>
              {!sidebarCollapsed && <span>Overview</span>}
            </button>
            {categories.map((cat) => {
              const open = groupIsOpen(cat.label);
              const groupActive = cat.label === activeCategory;
              return (
                <div key={cat.label}>
                  <button
                    type="button"
                    onClick={() => {
                      if (sidebarCollapsed) {
                        setSidebarCollapsed(false);
                        setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          next.add(cat.label);
                          return next;
                        });
                        return;
                      }
                      toggleGroup(cat.label);
                    }}
                    title={cat.description}
                    aria-expanded={open}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      groupActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
                    } ${sidebarCollapsed ? 'justify-center' : ''}`}
                    style={groupActive ? { color: brand } : undefined}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <span aria-hidden="true">{cat.icon}</span>
                      {!sidebarCollapsed && <span>{cat.label}</span>}
                    </span>
                    {!sidebarCollapsed && (
                      <span className="flex items-center gap-1">
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600">{cat.tabs.length}</span>
                        <span aria-hidden="true">{open ? '▼' : '▶'}</span>
                      </span>
                    )}
                  </button>
                  {open && !sidebarCollapsed && (
                    <div className="mt-1 space-y-0.5">
                      {cat.tabs.map((tab) => {
                        const active = !isOverview && tab.id === activeTabConfig.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => goToTab(tab.id)}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${
                              active ? 'font-semibold text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'
                            }`}
                            style={active ? { backgroundColor: brand } : undefined}
                            aria-current={active ? 'page' : undefined}
                          >
                            <span aria-hidden="true">{tab.icon}</span>
                            <span className="truncate">{tab.label.replace(`${tab.icon} `, '')}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          {!sidebarCollapsed && (
            <div
              onMouseDown={handleSidebarMouseDown}
              className="absolute top-0 right-0 bottom-0 z-30 w-2 cursor-col-resize transition-colors hover:bg-[#4A1942]/30 active:bg-[#4A1942]"
              style={{ backgroundColor: isResizing ? (config.primaryColor || '#4A1942') : undefined }}
              title="Hold mouse button and drag to resize sidebar"
            />
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-slate-50">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h2 className="text-base font-bold text-gray-900 truncate" style={{ fontFamily: config.headingFontFamily }}>
                ⚙️ Admin &amp; System Settings
              </h2>
              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] px-2 py-0.5 rounded-full font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Healthy
              </span>
              <span className="bg-purple-100 text-purple-800 text-[11px] px-2 py-0.5 rounded-full font-semibold">
                Workspace Data
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => goToTab('communication-templates')}
                className="text-xs font-semibold hover:underline"
                style={{ color: config.primaryColor }}
              >
                💬 Templates ({getCommunicationTemplates().length})
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => goToTab('operations-settings')}
                className="text-xs font-semibold hover:underline"
                style={{ color: config.primaryColor }}
              >
                🛠️ Checklists ({getOperationsChecklistDefaults().length})
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => goToTab('security-audit')}
                className="text-xs font-semibold hover:underline"
                style={{ color: config.primaryColor }}
              >
                🛡️ Security
              </button>
              <label htmlFor="admin-tab-search" className="sr-only">Find an admin section</label>
              <div className="relative w-52">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-400 text-xs">🔍</span>
                <input
                  id="admin-tab-search"
                  type="search"
                  value={tabSearch}
                  onChange={(e) => setTabSearch(e.target.value)}
                  placeholder="Quick find an admin setting..."
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#4A1942]/20 focus:border-[#4A1942]"
                />
              </div>
              {tabSearch && (
                <span className="text-[11px] text-gray-500 whitespace-nowrap">
                  <strong>{filteredTabs.length}</strong> found
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm bg-gray-100 hover:bg-gray-200 text-gray-800"
                aria-label="Close admin panel and return to Home"
                title="Close and return to Home"
              >
                <span>←</span>
                <span>Home</span>
                <span className="text-gray-400 font-normal ml-0.5">✕</span>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {searching && filteredTabs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-gray-500">
                <div className="text-3xl mb-3">🔎</div>
                <p className="text-lg font-semibold text-gray-700">No admin sections match &ldquo;{tabSearch}&rdquo;</p>
                <p className="text-sm mt-1">Try a broader term like venue, guest, user, or branding.</p>
              </div>
            ) : isOverview ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Admin overview</p>
                  <h3 className="mt-1 text-lg font-bold text-gray-900">Venue configuration</h3>
                  <p className="mt-1 text-sm text-gray-600">Use the sidebar to open a settings area, or jump from a count below.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {overviewKpis.map((kpi) => (
                    <button
                      key={kpi.id}
                      type="button"
                      onClick={() => goToTab(kpi.id)}
                      title={kpi.title}
                      aria-label={`${kpi.label}: ${kpi.value}`}
                      className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-gray-400"
                    >
                      <div className="text-xs font-semibold text-gray-500">{kpi.icon} {kpi.label}: <strong>{kpi.value}</strong></div>
                      <div className="mt-1 text-2xl font-extrabold text-gray-900">{kpi.value}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <ActiveComponent {...activeTabConfig.props} />
              </div>
            )}
          </div>
        </div>

        {dialog && (
          <ModalDialog
            title={dialog.title}
            description={dialog.kind === 'danger' ? 'Please confirm this destructive action.' : undefined}
            onClose={() => setDialog(null)}
            className="max-w-lg"
          >
            <div className="space-y-4">
              <p className="whitespace-pre-line text-sm text-gray-700">{dialog.message}</p>
              <div className="flex justify-end gap-2">
                {dialog.onConfirm && (
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {dialog.cancelLabel || 'Cancel'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const onConfirm = dialog.onConfirm;
                    setDialog(null);
                    void onConfirm?.();
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                    dialog.kind === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#4A1942] hover:bg-[#5c2a64]'
                  }`}
                >
                  {dialog.confirmLabel || 'OK'}
                </button>
              </div>
            </div>
          </ModalDialog>
        )}

        {pendingCatalogRevision && (
          <CatalogRevisionDialog
            kind={pendingCatalogRevision.kind}
            source={pendingCatalogRevision.source}
            proposed={pendingCatalogRevision.proposed}
            summary={pendingCatalogRevision.summary}
            changes={pendingCatalogRevision.changes}
            onConfirm={confirmCatalogRevision}
            onClose={() => setPendingCatalogRevision(null)}
          />
        )}

        {pendingCatalogRemoval && (
          <CatalogLifecycleDialog
            kind={pendingCatalogRemoval.kind}
            definition={pendingCatalogRemoval.definition}
            summary={pendingCatalogRemoval.summary}
            candidates={replacementCandidates}
            reviewReplacement={buildCatalogReplacementReview}
            onArchive={() => archiveCatalogDefinition(
              pendingCatalogRemoval.kind,
              pendingCatalogRemoval.definition.id,
            )}
            onReplace={applyReviewedCatalogReplacement}
            onClose={() => setPendingCatalogRemoval(null)}
          />
        )}

        <input
          id="admin-image-upload"
          ref={imageUploadInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Upload admin image"
          onChange={handleImageUploadChange}
        />

        {successMessage && (
          <div className="absolute bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
            ✅ {successMessage}
          </div>
        )}

        {customShapeVenueId && venues.find((v) => v.id === customShapeVenueId) && (
          <VenueGeometryEditor
            venue={venues.find((v) => v.id === customShapeVenueId)!}
            sources={buildVenueGeometrySources(venues.find((v) => v.id === customShapeVenueId)!)}
            onClose={() => setCustomShapeVenueId(null)}
            onApply={(nextVenue, baselineGeometrySignature) => {
              const latestVenues = getVenues();
              const latestVenue = latestVenues.find((venue) => venue.id === customShapeVenueId);
              if (!latestVenue) throw new Error('This venue no longer exists. The geometry draft was not applied.');
              if (venueGeometrySignature(latestVenue) !== baselineGeometrySignature) {
                throw new Error('Venue geometry changed after this draft opened. Close and reopen the editor before applying.');
              }
              const mergedVenue = mergeVenueGeometry(latestVenue, nextVenue);
              handleSaveVenues(latestVenues.map((venue) =>
                venue.id === customShapeVenueId ? mergedVenue : venue));
              setCustomShapeVenueId(null);
            }}
          />
        )}

        {lodgingVenueId && venues.find((v) => v.id === lodgingVenueId) && (
          <LodgingBuilder
            venue={venues.find((v) => v.id === lodgingVenueId)!}
            onClose={() => setLodgingVenueId(null)}
            onSave={(floors) => {
              handleSaveVenues(venues.map((v) => v.id === lodgingVenueId ? { ...v, floors } : v));
              setLodgingVenueId(null);
            }}
          />
        )}

        {showDrawingTool && (
          <DrawingTool
            onClose={() => setShowDrawingTool(false)}
            onSave={(payload) => {
              const { imageDataUrl, name, fixtureType, objects, drawingWidth, drawingHeight } = payload;
              const newFixture: FixtureType = {
                id: createEntityId('fixture-custom', fixtureTypes.map((fixture) => fixture.id)),
                name: name || (fixtureType === 'architectural' ? 'Custom Landscape Feature' : 'Custom Venue Fixture'),
                shape: 'custom',
                width: fixtureType === 'architectural' ? 10 : 4,
                height: fixtureType === 'architectural' ? 10 : 4,
                icon: fixtureType === 'architectural' ? '🎨' : '🖼️',
                color: fixtureType === 'architectural' ? '#90EE90' : '#E5E5E5',
                category: fixtureType === 'architectural' ? 'exterior' : 'interior',
                imageUrl: imageDataUrl,
                customDrawing: { objects, drawingWidth, drawingHeight },
              };
              handleSaveFixtures([...fixtureTypes, newFixture]);
              setShowDrawingTool(false);
              showSuccess(`Custom ${fixtureType === 'architectural' ? 'landscape feature' : 'venue fixture'} "${name}" created!`);
            }}
          />
        )}

        {showWelcomePreview && (
          <WelcomeModal isAdmin={false} isGuest={false} onClose={() => setShowWelcomePreview(false)} />
        )}
      </div>
    </div>
  );

  function handleSaveChairs(updated: ChairSpec[]) {
    guardCatalogRemoval('chair', chairSpecs, updated, persistChairSpecs);
  }
}

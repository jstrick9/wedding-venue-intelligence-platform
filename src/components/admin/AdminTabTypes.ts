import type { ComponentType, Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react';
import type {
  ChairSpec,
  DecorArrangement,
  DecorCategoryDef,
  DecorItem,
  DecorPackage,
  EventQuestion,
  EventQuestionAnswerType,
  EventQuestionGroup,
  FixtureType,
  Guideline,
  LayoutCategoryInfo,
  LayoutTemplate,
  PatternColors,
  PatternType,
  PlacedFixture,
  PlacedTable,
  PlacedDecor,
  CeremonyChairRow,
  ShapeType,
  TableSpec,
  User,
  Venue,
  WallStyle,
  SpacingSettings,
} from '../../types';
import type { LinenColor } from '../../data/venueData';
import type { Config } from '../../config';
import type { useDirectMessages } from '../../hooks/useDirectMessages';
import type { useSubmissionWorkflow } from '../../hooks/useSubmissionWorkflow';
import type { useRBAC } from '../../hooks/useRBAC';
import type { createPasswordRecord } from '../../utils/auth';

export type AdminDialogKind = 'info' | 'warning' | 'danger' | 'success';

export interface AdminDialogOptions {
  title: string;
  message: string;
  kind?: AdminDialogKind;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface AdminCurrentLayout {
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  decor?: PlacedDecor[];
  ceremonyRows?: CeremonyChairRow[];
  venueId: string;
  category?: string;
}

/**
 * Draft shape for the create-user form (mirrors AdminPanel's newUser state).
 * Previously typed as Record<string, unknown>, which pushed `unknown` into
 * every form input that read it (Review #250).
 */
export interface NewUserDraft {
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'basic' | 'staff' | 'guest';
  email: string;
  phone: string;
  contactPhoneNumber: string;
  phoneType: 'Mobile' | 'Home' | 'Work' | 'Other';
  preferredCommunication: ('call' | 'text' | 'email')[];
  eventRole: string;
  eventName: string;
  userRole: 'admin' | 'master' | 'shared' | 'read-only' | 'staff';
  isMasterUser: boolean;
  parentUserId: string | undefined;
  allowSharedAccess: boolean;
  sharedUserLimit: number;
  userStatus: 'invited' | 'pending' | 'active' | 'suspended' | 'disabled';
  eventDate: string;
  jobTitle: string;
  department: string;
  assignedRoles: string[];
}

export interface AdminCommonProps {
  config: Config;
  venues: Venue[];
  setVenues: (venues: Venue[]) => void;
  tables: TableSpec[];
  setTables: (tables: TableSpec[]) => void;
  fixtures: FixtureType[];
  setFixtures: (fixtures: FixtureType[]) => void;
  chairs: ChairSpec[];
  setChairs: (chairs: ChairSpec[]) => void;
  wallStyles: WallStyle[];
  setWallStyles: (styles: WallStyle[]) => void;
  linenColors: LinenColor[];
  setLinenColors: (colors: LinenColor[]) => void;
  templates: LayoutTemplate[];
  setTemplates: (templates: LayoutTemplate[]) => void;
  guidelines: Guideline[];
  setGuidelines: (guidelines: Guideline[]) => void;
  users: User[];
  setUsers: (users: User[]) => void;
  eventQuestions: EventQuestion[];
  setEventQuestions: Dispatch<SetStateAction<EventQuestion[]>>;
  decorItems: DecorItem[];
  setDecorItems: Dispatch<SetStateAction<DecorItem[]>>;
  decorCategories: DecorCategoryDef[];
  setDecorCategories: Dispatch<SetStateAction<DecorCategoryDef[]>>;
  decorArrangements: DecorArrangement[];
  setDecorArrangements: Dispatch<SetStateAction<DecorArrangement[]>>;
  decorPackages: DecorPackage[];
  setDecorPackages: Dispatch<SetStateAction<DecorPackage[]>>;
  layoutState?: unknown;
  directMessages: ReturnType<typeof useDirectMessages>;
  handlers: Record<string, unknown>;
  user: User | null;
  /** Active Supabase organization scope, when cloud mode is enabled. */
  organizationId?: string | null;
  isAdmin: boolean;
  selectedMessageMasterUserId: string;
  setSelectedMessageMasterUserId: Dispatch<SetStateAction<string>>;
  buildMessageThreadId: (eventName: string, userId: string) => string;
  setShowCreateUserModal: Dispatch<SetStateAction<boolean>>;
  setShowEditUserModal: Dispatch<SetStateAction<boolean>>;
  setEditingUser: Dispatch<SetStateAction<User | null>>;
  handleSaveUsers: (updated: User[]) => void;
  handleDeleteUser: (userId: string, label?: string) => void;
  handleImpersonate: () => void;
  submissionWorkflow: ReturnType<typeof useSubmissionWorkflow>;
  showUserDirectMessagesSection: boolean;
  setShowUserDirectMessagesSection: Dispatch<SetStateAction<boolean>>;
  showUserPendingApprovalsSection: boolean;
  setShowUserPendingApprovalsSection: Dispatch<SetStateAction<boolean>>;
  showUserEventRolesSection: boolean;
  setShowUserEventRolesSection: Dispatch<SetStateAction<boolean>>;
  showUserAccountsSection: boolean;
  setShowUserAccountsSection: Dispatch<SetStateAction<boolean>>;
  newEventRoleName: string;
  setNewEventRoleName: Dispatch<SetStateAction<string>>;
  handleAddEventRole: () => void;
  eventRoles: string[];
  editingEventRoleName: string | null;
  editingEventRoleValue: string;
  setEditingEventRoleValue: Dispatch<SetStateAction<string>>;
  handleSaveEventRoleEdit: () => void;
  setEditingEventRoleName: Dispatch<SetStateAction<string | null>>;
  handleStartEditEventRole: (role: string) => void;
  handleDeleteEventRole: (role: string) => void;
  handleImageUpload: (callback: (dataUrl: string) => void) => void;
  showSuccess: (message: string) => void;
  showInfo: (title: string, message: string, kind?: AdminDialogKind) => void;
  confirmAction: (options: AdminDialogOptions, onConfirm: () => void | Promise<void>) => void;
  createPasswordRecord: typeof createPasswordRecord;
  tableTypes: TableSpec[];
  tableSpecs: TableSpec[];
  setTableSpecs: (specs: TableSpec[]) => void;
  fixtureTypes: FixtureType[];
  setFixtureTypes: (types: FixtureType[]) => void;
  chairSpecs: ChairSpec[];
  setChairSpecs: (specs: ChairSpec[]) => void;
  defaultWallStyles: WallStyle[];
  defaultPatternColors: Record<PatternType, PatternColors>;
  patternOptions: PatternType[];
  layoutCategories: LayoutCategoryInfo[];
  venueCategories: LayoutCategoryInfo[];
  seatingTypes: TableSpec[];
  expandedSeatingTypes: Set<string>;
  setExpandedSeatingTypes: Dispatch<SetStateAction<Set<string>>>;
  getSeatingDimensions: (chairType: string | undefined, chairsPerRow: number, rowCount: number, rowSpacingFt: number) => { width: number; height: number };
  toggleSeatingTypeExpanded: (id: string) => void;
  expandAllSeatingTypes: () => void;
  collapseAllSeatingTypes: () => void;
  shapeOptions: ShapeType[];
  chairLayoutOptions: Array<{ id: string; name: string; description: string }>;
  getChairSpecs: () => ChairSpec[];
  setShowTableTypesSection: Dispatch<SetStateAction<boolean>>;
  showTableTypesSection: boolean;
  setShowSeatingTypesSection: Dispatch<SetStateAction<boolean>>;
  showSeatingTypesSection: boolean;
  setShowLodgingFixturesSection: Dispatch<SetStateAction<boolean>>;
  showLodgingFixturesSection: boolean;
  expandAllLodgingFixtures: () => void;
  collapseAllLodgingFixtures: () => void;
  toggleLodgingFixtureExpanded: (id: string) => void;
  expandedLodgingFixtures: Set<string>;
  setShowExteriorFixturesSection: Dispatch<SetStateAction<boolean>>;
  showExteriorFixturesSection: boolean;
  expandAllExteriorFixtures: () => void;
  collapseAllExteriorFixtures: () => void;
  toggleExteriorFixtureExpanded: (id: string) => void;
  expandedExteriorFixtures: Set<string>;
  setShowVenueFixturesSection: Dispatch<SetStateAction<boolean>>;
  showVenueFixturesSection: boolean;
  expandAllVenueFixtures: () => void;
  collapseAllVenueFixtures: () => void;
  toggleVenueFixtureExpanded: (id: string) => void;
  expandedVenueFixtures: Set<string>;
  setShowDrawingTool: Dispatch<SetStateAction<boolean>>;
  renderShapePreview: (shape: ShapeType, color?: string) => ReactNode;
  handleSaveVenues: (updated: Venue[]) => void;
  collapseAllVenues: () => void;
  expandAllVenues: () => void;
  toggleVenueExpanded: (id: string) => void;
  setCustomShapeVenueId: Dispatch<SetStateAction<string | null>>;
  setLodgingVenueId: Dispatch<SetStateAction<string | null>>;
  handleSaveTables: (updated: TableSpec[]) => void;
  collapseAllTables: () => void;
  expandAllTables: () => void;
  toggleTableExpanded: (id: string) => void;
  handleSaveFixtures: (updated: FixtureType[]) => void;
  setChairSpecsState: Dispatch<SetStateAction<ChairSpec[]>>;
  handleSaveWallStyles: (updated: WallStyle[]) => void;
  handleSaveLinenColors: (updated: LinenColor[]) => void;
  handleSaveGuidelines: (updated: Guideline[]) => void;
  handleSaveTemplates: (updated: LayoutTemplate[]) => void;
  handleSaveConfig: (updated: Config) => void;
  handleSaveSpacing: (updated: SpacingSettings) => void;
  spacingSettings: SpacingSettings;
  setSpacingSettingsState: Dispatch<SetStateAction<SpacingSettings>>;
  expandedVenues: Set<string>;
  setExpandedVenues: Dispatch<SetStateAction<Set<string>>>;
  expandedTables: Set<string>;
  setExpandedTables: Dispatch<SetStateAction<Set<string>>>;
  expandedChairs: Set<string>;
  setExpandedChairs: Dispatch<SetStateAction<Set<string>>>;
  toggleChairExpanded: (id: string) => void;
  expandedWalls: Set<string>;
  setExpandedWalls: Dispatch<SetStateAction<Set<string>>>;
  toggleWallExpanded: (id: string) => void;
  expandedLinens: Set<string>;
  setExpandedLinens: Dispatch<SetStateAction<Set<string>>>;
  toggleLinenExpanded: (id: string) => void;
  expandAllLinens: () => void;
  collapseAllLinens: () => void;
  expandedTemplates: Set<string>;
  setExpandedTemplates: Dispatch<SetStateAction<Set<string>>>;
  toggleTemplateExpanded: (id: string) => void;
  expandedGuidelines: Set<string>;
  setExpandedGuidelines: Dispatch<SetStateAction<Set<string>>>;
  toggleGuidelineExpanded: (id: string) => void;
  expandedUsers: Set<string>;
  setExpandedUsers: Dispatch<SetStateAction<Set<string>>>;
  toggleUserExpanded: (id: string) => void;
  onClose: () => void;
  currentLayout?: AdminCurrentLayout;
  onLoadTemplateForEdit?: (template: LayoutTemplate) => void;
  createUser: (username: string, password: string, name: string, role: User['role'], email?: string) => Promise<boolean>;
  deleteUser: (userId: string) => boolean;
  getAllUsers: () => User[];
  canAccessThisPanel: boolean;
  EVENT_ROLES_STORAGE_KEY: string;
  EVENT_QUESTIONS_STORAGE_KEY: string;
  DEFAULT_EVENT_ROLES: string[];
  setVenuesState: Dispatch<SetStateAction<Venue[]>>;
  setTableSpecsState: Dispatch<SetStateAction<TableSpec[]>>;
  setFixtureTypesState: Dispatch<SetStateAction<FixtureType[]>>;
  setGuidelinesState: Dispatch<SetStateAction<Guideline[]>>;
  setTemplatesState: Dispatch<SetStateAction<LayoutTemplate[]>>;
  setLinenColorsState: Dispatch<SetStateAction<LinenColor[]>>;
  setConfigState: Dispatch<SetStateAction<Config>>;
  setUsersState: Dispatch<SetStateAction<User[]>>;
  setWallStylesState: Dispatch<SetStateAction<WallStyle[]>>;
  successMessage: string;
  setSuccessMessage: Dispatch<SetStateAction<string>>;
  showDrawingTool: boolean;
  logoInputRef: MutableRefObject<HTMLInputElement | null>;
  customShapeVenueId: string | null;
  expandedBrandingSections: Set<string>;
  setExpandedBrandingSections: Dispatch<SetStateAction<Set<string>>>;
  showCreateUserModal: boolean;
  showEditUserModal: boolean;
  editingUser: User | null;
  setEventRoles: Dispatch<SetStateAction<string[]>>;
  newQuestion: { text: string; group: EventQuestionGroup; answerType: EventQuestionAnswerType; optionsText: string };
  setNewQuestion: Dispatch<SetStateAction<{ text: string; group: EventQuestionGroup; answerType: EventQuestionAnswerType; optionsText: string }>>;
  editingQuestionId: string | null;
  setEditingQuestionId: Dispatch<SetStateAction<string | null>>;
  questionError: string;
  setQuestionError: Dispatch<SetStateAction<string>>;
  showWelcomePreview: boolean;
  setShowWelcomePreview: Dispatch<SetStateAction<boolean>>;
  showAccessControl: boolean;
  setShowAccessControl: Dispatch<SetStateAction<boolean>>;
  rbac: ReturnType<typeof useRBAC>;
  allRoles: ReturnType<ReturnType<typeof useRBAC>['getAllRoles']>;
  AVAILABLE_WELCOME_FEATURES: string[];
  currentWelcomeFeatures: string[];
  masterUsers: User[];
  validateEventQuestion: (q: { text: string; answerType: EventQuestionAnswerType; optionsText: string }) => string | null;
  handleAddEventQuestion: () => void;
  handleUpdateEventQuestion: (id: string, updates: Partial<EventQuestion>) => void;
  handleDeleteEventQuestion: (id: string) => void;
  handleCreateUser: () => Promise<void>;
  newUser: NewUserDraft;
  setNewUser: Dispatch<SetStateAction<NewUserDraft>>;
  getUserFieldErrors?: (u: any, requireAuthFields?: boolean) => Record<string, string>;
  createUserFieldErrors: Record<string, string>;
  setCreateUserFieldErrors: Dispatch<SetStateAction<Record<string, string>>>;
  editingTemplateId: string | null;
  setEditingTemplateId: Dispatch<SetStateAction<string | null>>;
  handleUpdateTemplateWithCurrentLayout: (templateId: string) => void;
  handleCreateTemplateFromLayout: () => void;
  handleLoadForEdit: (template: LayoutTemplate) => void;
  handleReset: () => void;
}

export interface AdminTabDefinition {
  id: string;
  label: string;
  icon: string;
  Component: ComponentType<any>;
  props: any;
  /** Optional grouping label used to visually organize the admin tab bar. */
  group?: string;
}

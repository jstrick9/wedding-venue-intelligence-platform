export interface Point {
  x: number;
  y: number;
}

export interface DrawingObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Point[];
  rotation?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  text?: string;
  radius?: number;
  /** Venue-map publication audience when this object is used as a map layer. */
  audience?: VenueMapAudience;
  /** Wedding event-space ids this map layer applies to; absent/empty means all events. */
  eventSpaceIds?: string[];
}

export interface EntryPoint {
  id: string;
  x: number;
  y: number;
  type: 'single' | 'double' | 'sliding' | 'open';
  width: number;
  rotation: number;
  label?: string;
}

export interface PowerOutlet {
  id: string;
  x: number;
  y: number;
  type: '110V' | '220V' | 'generator';
  label?: string;
}

export type LodgingFurnitureType = 'bed-king' | 'bed-queen' | 'bed-double' | 'bed-twin' | 'nightstand' | 'dresser' | 'chair' | 'sofa' | 'sleeper-sofa' | 'couch' | 'toilet' | 'shower' | 'bath-shower' | 'sink' | 'refrigerator' | 'pool-table' | 'custom';

export interface LodgingFurniture {
  id: string;
  type: LodgingFurnitureType;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  color?: string;
  label?: string;
}

export interface LodgingFloor {
  id: string;
  name: string;
  level: number;
  width: number;
  height: number;
  rooms: LodgingRoom[];
}

// Shape types
export type ShapeType = 'circle' | 'rectangle' | 'triangle' | 'semicircle' | 'oval' | 'hexagon' | 'octagon' | 'l-shape' | 't-shape' | 'u-shape' | 'custom' | 'polygon';

export type ItemCategoryType = 'table' | 'room' | 'furniture';

// Pattern types
export type PatternType = 'solid' | 'checkered' | 'gravel' | 'concrete' | 'grass' | 'wood' | 'tile' | 'brick' | 'marble' | 'water' | 'carpet';

// Pattern colors for customizable patterns
export interface PatternColors {
  color1: string; // Primary/background color
  color2: string; // Secondary/accent color
  color3?: string; // Third accent color for patterns that need it
  // Aliases for easier access
  primary?: string;
  secondary?: string;
  accent?: string;
}

// Layout category types
export type LayoutCategory = 'reception' | 'ceremony' | 'cocktail' | 'lodging' | 'rehearsal-dinner' | 'outdoor' | 'other';

// Venue environment type (indoor/outdoor)
export type VenueEnvironment = 'indoor' | 'outdoor' | 'both';

// Door type for indoor venues
export type DoorType = 'single' | 'double' | 'sliding' | 'french' | 'barn' | 'accordion';
export type DoorOpenDirection = 'inward' | 'outward' | 'left' | 'right' | 'both';
export type DoorPosition = 'top' | 'bottom' | 'left' | 'right';

// Indoor feature type including custom
export type IndoorFeatureType = 'door' | 'window' | 'column' | 'pillar' | 'partition' | 'fireplace' | 'stage' | 'bar-counter' | 'bar' | 'screen' | 'custom';

// Indoor architectural feature (doors, windows, columns, etc.)
export interface IndoorFeature {
  id: string;
  type: IndoorFeatureType;
  name: string;
  // Position - can be wall-based OR coordinate-based
  wall?: DoorPosition; // which wall the feature is on (optional for custom positioning)
  wallPosition?: DoorPosition; // alias for wall
  positionPercent?: number; // 0-100, where on the wall it's located (50 = center)
  // Coordinate-based positioning (alternative to wall positioning)
  x?: number; // x position relative to venue (in feet)
  y?: number; // y position relative to venue (in feet)
  rotation?: number; // rotation in degrees
  // Dimensions
  width: number; // in feet
  height: number; // in feet (for windows, columns)
  depth?: number; // how far it extends into the room (for stages, bars)
  // Door-specific properties
  doorType?: DoorType;
  openDirection?: DoorOpenDirection;
  openAngle?: number; // 0-180 degrees, how far the door opens
  isOpen?: boolean; // Whether to show the door as open
  // Window-specific properties
  windowType?: 'small' | 'large' | 'bay';
  // Column-specific properties
  columnType?: 'round' | 'square';
  // Styling
  color: string;
  borderColor?: string;
  borderWidth?: number;
  pattern?: PatternType;
  patternColors?: PatternColors;
  icon?: string;
  imageUrl?: string;
  // Display options
  showLabel?: boolean;
  showIcon?: boolean;
  label?: string;
  // Custom feature template reference
  templateId?: string;
}

// Outdoor/exterior feature types
export type OutdoorFeatureType = 
  | 'tree' | 'tree-group' | 'tree-cluster' | 'bush' | 'flower-bed' | 'hedge' 
  | 'pond' | 'fountain' | 'stream' | 'waterfall'
  | 'pathway' | 'stone-pathway' | 'stepping-stones' | 'bridge'
  | 'fence' | 'gate' | 'arbor' | 'pergola' | 'gazebo'
  | 'lawn' | 'garden' | 'planter'
  | 'lighting' | 'lamp-post' | 'string-lights'
  | 'bench' | 'statue' | 'rock' | 'boulder'
  | 'parking' | 'driveway' | 'sign'
  | 'custom';

// Outdoor feature definition
export interface OutdoorFeature {
  id: string;
  type: OutdoorFeatureType;
  name: string;
  // Position on canvas (exterior area)
  x: number;
  y: number;
  rotation?: number;
  // Dimensions
  width: number;
  height: number;
  // Styling
  color: string;
  secondaryColor?: string; // For multi-color features (flowers, trees)
  borderColor?: string;
  borderWidth?: number;
  pattern?: PatternType;
  patternColors?: PatternColors;
  shape?: ShapeType;
  // Visual
  icon?: string;
  imageUrl?: string;
  showLabel?: boolean;
  showIcon?: boolean;
  label?: string;
  // Grouping
  count?: number; // For tree-group, flower-bed, etc.
  spacing?: number; // Space between items in a group
  // Custom feature template reference
  templateId?: string;
}

// User roles
export type UserRole = 'admin' | 'basic' | 'guest' | 'staff';

export type StaffTaskStatus = 'not-started' | 'in-progress' | 'completed' | 'blocked';
export type StaffTaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type StaffTaskPhase = 'pre-event' | 'during-event' | 'post-event';

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
}

export interface StaffTask {
  id: string;
  title: string;
  description?: string;
  phase: StaffTaskPhase;
  status: StaffTaskStatus;
  priority: StaffTaskPriority;
  assignedStaff: string[]; // User IDs
  assignedAreas: string[]; // Area IDs
  dueTime?: string;
  estimatedMinutes?: number;
  tags: string[];
  checklist: ChecklistItem[];
  notes?: string;
  completedAt?: string;
  completedBy?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface StaffArea {
  id: string;
  name: string;
  description?: string;
  venueId?: string;
  color: string;
  icon: string;
  assignedStaff: string[]; // User IDs
}

export interface StaffShift {
  id: string;
  staffId: string;
  role: 'coordinator' | 'setup' | 'cleaning' | 'parking' | 'other';
  areaId?: string;
  startTime: string;
  endTime: string;
  venueId?: string;
  eventName?: string;
  /** Optional link to a venue calendar event id. */
  calendarEventId?: string;
  notes?: string;
}

export interface OperationsExport {
  tasks: StaffTask[];
  areas: StaffArea[];
  shifts: StaffShift[];
  exportedAt: string;
  version: string;
}

// User type
export interface User {
  id: string;
  /** Backward-compatible login identifier. New records should keep username and email in sync when email is used for login. */
  username: string;
  email: string;
  /** Legacy plaintext password. Keep empty for new/updated users; retained only for migration. */
  password: string;
  passwordHash?: string;
  passwordSalt?: string;
  passwordAlgorithm?: 'pbkdf2-sha256';
  passwordUpdatedAt?: string;
  sessionVersion?: number;
  failedLoginCount?: number;
  lockedUntil?: string;
  role: UserRole;
  name: string;
  phone?: string;
  contactPhoneNumber?: string;
  phoneType?: 'Mobile' | 'Home' | 'Work' | 'Other';
  preferredCommunication?: ('call' | 'text' | 'email')[];
  eventRole?: string;
  eventName?: string;
  assignedRoles?: string[];
  userRole?: 'admin' | 'master' | 'shared' | 'read-only' | 'staff';
  isMasterUser?: boolean;
  parentUserId?: string;
  allowSharedAccess?: boolean;
  sharedUserLimit?: number;
  userStatus?: 'invited' | 'pending' | 'active' | 'suspended' | 'disabled';
  eventDate?: string;
  invitationSentDate?: string;
  invitationStatus?: 'not_sent' | 'sent' | 'accepted' | 'expired';
  invitationToken?: string;
  invitationLink?: string;
  invitationExpires?: string;
  imageUrl?: string;
  jobTitle?: string;
  department?: string;
  assignedEventIds?: string[];
  assignedEventRoles?: Record<string, string>;
  notes?: string;
  isActive: boolean;
  requiresPasswordChange?: boolean;
  lastLogin?: string;
  loginCount?: number;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  permissions?: UserPermissions;
}

// User permissions for granular access control
export interface UserPermissions {
  canCreateTemplates?: boolean;
  canEditTemplates?: boolean;
  canDeleteTemplates?: boolean;
  canManageGuests?: boolean;
  canPrint?: boolean;
  canExport?: boolean;
  canViewAllLayouts?: boolean;
  canInviteUsers?: boolean;
  canManageSharedUsers?: boolean;
  canEditLayout?: boolean;
  canViewLayout?: boolean;
}

// Event Questions module types
export type EventQuestionGroup =
  | 'Ceremony'
  | 'Reception'
  | 'Lodging'
  | 'Rehearsal Dinner'
  | 'Other Activities/Events';

export type EventQuestionAnswerType = 'dropdown' | 'integer' | 'text';

export interface EventQuestionWorkflow {
  whenAnswerEquals?: string | number;
  nextQuestionId?: string;
}

export interface EventQuestion {
  id: string;
  text: string;
  group: EventQuestionGroup;
  answerType: EventQuestionAnswerType;
  options?: string[];
  required?: boolean;
  workflow?: EventQuestionWorkflow[];
}

export interface EventAnswer {
  userId: User['id'];
  eventId: string;
  questionId: EventQuestion['id'];
  answerValue: string | number;
}

// Image item for multi-image galleries
export interface ImageItem {
  id: string;
  url: string;
  label: string;
}

// Lodging room type for multi-room venue layouts
export interface LodgingRoom {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  shape?: 'rectangle' | 'custom';
  polygonPoints?: Point[];
  capacity: number; // Maximum number of occupants
  assignedGuests: string[]; // IDs of assigned guests
  color?: string;
  label?: string;
  furniture?: LodgingFurniture[];
}

// Venue type with category
export interface Venue {
  id: string;
  name: string;
  width: number;
  height: number;
  shape?: ShapeType; // Venue shape (rectangle, l-shape, etc.)
  isCustomShape?: boolean; // Indicates if using custom polygon
  shapePoints?: Point[]; // Polygon points for custom shape
  customPath?: string; // For complex custom polygonal shapes
  capacity: number;
  description?: string;
  category: LayoutCategory;
  floors?: LodgingFloor[]; // Used for multi-floor lodging venues
  rooms?: LodgingRoom[]; // Legacy/single-floor rooms for lodging layouts
  color?: string;
  showBorder?: boolean; // Whether to show a border around the venue
  borderColor?: string;
  borderWidth?: number; // Border width in pixels
  pattern?: PatternType;
  patternColors?: PatternColors;
  imageUrl?: string;
  images?: ImageItem[]; // Multiple images with labels (up to 10)
  // Entry and Exit points
  entryPoints?: EntryPoint[];
  // Power outlets
  powerOutlets?: PowerOutlet[];
  // Canvas size (total area including exterior features)
  canvasWidth?: number;
  canvasHeight?: number;
  // Venue position on the canvas (where the venue rectangle is placed)
  venueX?: number;
  venueY?: number;
  // Canvas styling
  canvasFillColor?: string;
  canvasBorderColor?: string;
  exteriorPadding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  isMaster?: boolean; // Master venue layout - visible to basic users
  version?: string; // Version name for non-master variants
  // Venue environment type
  environment?: VenueEnvironment; // indoor, outdoor, or both
  // Indoor architectural features (doors, windows, columns, etc.)
  indoorFeatures?: IndoorFeature[];
  // Outdoor/exterior features (trees, ponds, pathways, etc.)
  outdoorFeatures?: OutdoorFeature[];
  // Master layout - includes tables and fixtures that come pre-placed on the venue
    masterLayout?: {
    tables: PlacedTable[];
    fixtures: PlacedFixture[];
    decor: PlacedDecor[];
    savedAt: string;
  };
}

// Chair types available
export type ChairType = 'white-plastic' | 'wingback' | 'chiavari' | 'folding' | 'banquet' | 'ghost' | 'crossback' | 'none';

// Chair specification
export interface ChairSpec {
  id: ChairType;
  name: string;
  color: string;
  width: number; // in feet
  depth: number; // in feet
  icon: string;
  imageUrl?: string;
  images?: ImageItem[]; // Multiple images with labels (up to 10)
  inventoryCount?: number; // Total inventory available (undefined = unlimited)
}

// Default chair specifications
export const defaultChairSpecs: ChairSpec[] = [
  { id: 'white-plastic', name: 'White Plastic', color: '#FFFFFF', width: 1.5, depth: 1.5, icon: '🪑' },
  { id: 'wingback', name: 'Wingback', color: '#8B4513', width: 2, depth: 2, icon: '🛋️' },
  { id: 'chiavari', name: 'Chiavari', color: '#D4AF37', width: 1.5, depth: 1.5, icon: '🪑' },
  { id: 'folding', name: 'Folding Chair', color: '#808080', width: 1.5, depth: 1.5, icon: '🪑' },
  { id: 'banquet', name: 'Banquet Chair', color: '#4A1942', width: 1.75, depth: 1.75, icon: '🪑' },
  { id: 'ghost', name: 'Ghost Chair', color: '#E8E8E8', width: 1.5, depth: 1.5, icon: '🪑' },
  { id: 'crossback', name: 'Crossback', color: '#CD853F', width: 1.75, depth: 1.75, icon: '🪑' },
  { id: 'none', name: 'No Chairs', color: 'transparent', width: 0, depth: 0, icon: '' },
];

// Chair layout options for rectangular tables
export type RectangularChairLayout = 
  | 'long-sides-only'      // Chairs on long sides only (e.g., 4+4 for 8 chairs)
  | 'all-sides'            // Chairs on all 4 sides (e.g., 3+3+1+1 for 8 chairs)
  | 'head-table'           // Chairs on one long side only (for head tables)
  | 'custom';              // User-defined placement

// Chair row style for ceremonies
export type ChairRowStyle = 
  | 'straight'             // Straight rows
  | 'curved'               // Curved/arc rows
  | 'diagonal-left'        // Diagonal angled left
  | 'diagonal-right'       // Diagonal angled right
  | 'stadium'              // Stadium style (angled toward center)
  | 'semicircle';          // Semi-circle arrangement

// Ceremony chair row type
export interface CeremonyChairRow {
  id: string;
  x: number;
  y: number;
  chairCount: number;
  chairType: ChairType;
  rowStyle: ChairRowStyle;
  spacing: number; // Space between chairs in feet
  rowWidth: number; // Total width of the row in feet
  rotation: number; // Overall row rotation
  facingDirection: number; // Direction chairs face (0 = up, 90 = right, 180 = down, 270 = left)
  curveRadius?: number; // For curved/semicircle rows
  label?: string; // e.g., "Row A", "Row 1"
}

// Table specification
export interface TableSpec {
  id: string;
  name: string;
  shape: ShapeType;
  width: number;
  height: number;
  capacity: number;
  isSeatingType?: boolean; // Chair-only seating arrangement (no table surface)
  seatingStyle?: 'straight-row' | 'curved-row' | 'stadium' | 'semicircle-row';
  seatingRowCount?: number; // Number of rows for seating-only types
  seatingRowSpacing?: number; // Spacing between seating rows in feet
  venueCategories?: LayoutCategory[]; // If set, only available for these venue categories
  color?: string;
  pattern?: PatternType;
  patternColors?: PatternColors;
  imageUrl?: string;
  images?: ImageItem[]; // Multiple images with labels (up to 10)
  customPath?: string; // SVG path for custom shapes
  polygonPoints?: Point[]; // Custom polygon points
  linenColor?: 'white' | 'black'; // Default linen color
  defaultChairType?: ChairType; // Default chair type for this table
  showChairs?: boolean; // Whether to show chairs by default
  allowedChairTypes?: ChairType[]; // Which chair types are allowed for this table (admin sets this)
  defaultChairLayout?: RectangularChairLayout; // Default chair layout for rectangular tables
  inventoryCount?: number; // Total inventory available (undefined = unlimited)
  isRoom?: boolean; // If true, functions as a Lodging Room boundary
  allowAsDecorBase?: boolean; // If true, can be used as a base object in Decor Designer
}

// Wall style type
export interface WallStyle {
  id: string;
  name: string;
  color: string;
  icon: string;
  pattern?: PatternType;
  imageUrl?: string;
  images?: ImageItem[]; // Multiple images with labels (up to 10)
  enabled: boolean;
}

// Fixture type (interior or exterior)
export type LodgingUtilityType = 'furniture' | 'appliances' | 'electronics' | 'entry-exit' | 'utilities' | 'rooms' | 'other';

export interface FixtureType {
  id: string;
  name: string;
  /** Descriptive label for search/display (e.g. "17' 11\" opening" for screens). Present on defaultFixtureTypes data since inception but missing from the type until Review #251. */
  description?: string;
  shape: ShapeType;
  width: number;
  height: number;
  venueCategories?: LayoutCategory[]; // If set, only available for these venue categories
  color?: string;
  fontColor?: string; // Text/label color for the fixture
  showBorder?: boolean; // Whether to show a border (admin toggle)
  borderColor?: string; // Border color for the fixture
  borderWidth?: number; // Border width in pixels
  pattern?: PatternType;
  patternColors?: PatternColors;
  hasVariants?: boolean; // Whether this fixture has selectable variants
  variants?: { id: string; name: string; color: string; icon?: string }[]; // Available variants
  icon?: string;
  showIconOnCanvas?: boolean; // Whether to show the icon when placed on the canvas (default true)
  isExterior?: boolean;
  category?: 'interior' | 'exterior' | 'lodging' | 'both';
  lodgingType?: LodgingUtilityType;
  visibleToUsers?: boolean; // If false, admin-only fixture (for venue fixtures defaults to false only when explicitly set)
  isSelectable?: boolean; // If false, basic/guest users cannot select/use this fixture
  isLocked?: boolean; // If true, non-admin users cannot move this fixture
  isPermanent?: boolean; // If true, no users can move this fixture
  ignoreSpacingRules?: boolean; // If true, admin spacing rules do not apply to this venue fixture
  imageUrl?: string;
  images?: ImageItem[]; // Multiple images with labels (up to 10)
  customPath?: string; // SVG path for custom shapes
  inventoryCount?: number; // Total inventory available (undefined = unlimited)
  wallStyleId?: string; // Reference to a wall style for wall fixtures
  isRoom?: boolean; // If true, this fixture acts as a lodging room boundary/assignment target
  capacity?: number; // Maximum guests/occupants for room-style fixtures
  customDrawing?: {
    objects: DrawingObject[];
    drawingWidth: number;
    drawingHeight: number;
  };
  allowAsDecorBase?: boolean; // If true, can be used as a base object in Decor Designer
}

// Placed table on canvas
export interface PlacedTable {
  id: string;
  type: 'table';
  specId: string;
  x: number;
  y: number;
  rotation: number;
  label: string;
  guests: string[];
  hasLinen?: boolean; // Whether the table has a linen
  linenColor?: 'white' | 'black' | 'ivory' | 'navy' | 'burgundy' | 'sage' | 'blush' | 'gold' | 'silver' | 'dusty-blue' | 'terracotta' | 'lavender' | 'forest' | 'coral' | 'charcoal'; // Linen color
  customCapacity?: number; // Override default capacity
  showChairs?: boolean; // Whether to show chairs around the table
  chairType?: ChairType; // Type of chair to display
  chairCount?: number; // Number of chairs (defaults to capacity)
  chairLayout?: RectangularChairLayout; // Layout for rectangular tables
  floor?: number; // 1-indexed floor number
  appliedArrangementId?: string; // ID of a DecorArrangement applied to this table
}

// Placed fixture on canvas
export interface PlacedFixture {
  id: string;
  type: 'fixture';
  specId: string;
  x: number;
  y: number;
  rotation: number;
  label: string;
  isExterior?: boolean;
  variant?: string; // For fixtures with variants (e.g., 'greenery' or 'drapery' for walls)
  variantColor?: string; // Custom color for variants
  guests?: string[]; // Assigned guests for room-style lodging fixtures
  customCapacity?: number; // Optional override up to fixture capacity
  floor?: number; // 1-indexed floor number
  appliedArrangementId?: string; // ID of a DecorArrangement applied to this fixture
}

// Spacing settings for collision detection
export interface SpacingSettings {
  minItemSpacing: number; // Minimum spacing between items (in feet)
  minWallSpacing: number; // Minimum spacing from venue walls (in feet)
  minFixtureSpacing: number; // Minimum spacing from fixtures (in feet)
  minTableSpacing: number; // Minimum spacing between tables (in feet)
  enableCollisionDetection: boolean; // Whether to enforce collision detection
  showCollisionWarnings: boolean; // Whether to show visual warnings for collisions
}

// Guest
export interface Guest {
  id: string;
  name: string;
  tableId?: string;
  roomId?: string; // For lodging assignments
  seatNumber?: number;
  group?: string;
  email?: string;
  phone?: string;
  dietaryRestrictions?: string;
  accessibility?: boolean;
  rsvpStatus?: 'pending' | 'confirmed' | 'declined';
  mealChoice?: 'standard' | 'vegetarian' | 'vegan' | 'gluten-free' | 'kids' | 'other';
  plusOne?: boolean;
  plusOneName?: string;
  relationship?: 'bride-family' | 'groom-family' | 'bride-friend' | 'groom-friend' | 'couple-friend' | 'work' | 'other';
  ageGroup?: 'adult' | 'child' | 'infant';
  specialNeeds?: string;
  giftReceived?: boolean;
  thankYouSent?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Layout
export interface Layout {
  id: string;
  name: string;
  venueId: string;
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  decor: PlacedDecor[]; // Added for decor system
  ceremonyRows?: CeremonyChairRow[]; // For ceremony layouts
  createdAt: string;
  updatedAt: string;
  category?: LayoutCategory;
  isTemplate?: boolean;
  isMaster?: boolean;
  createdBy?: string;
}

// Layout template (admin created)
export interface LayoutTemplate {
  id: string;
  name: string;
  description?: string;
  category: LayoutCategory;
  venueId: string;
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  ceremonyRows?: CeremonyChairRow[]; // For ceremony layouts
  thumbnailUrl?: string;
  createdAt: string;
  createdBy?: string;
  isMasterTemplate?: boolean; // Master template that basic users can use
}

// Guideline
export interface Guideline {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  category?: 'important' | 'spacing' | 'safety' | 'tips' | 'general';
  icon?: string;
}

// App configuration
export interface Config {
  logoUrl?: string;
  venueName: string;
  tagline: string;
  location: string;
  websiteUrl: string;
  supportEmail: string;
  phone?: string;
  primaryColor: string;
  primaryDark: string;
  primaryLight: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headerTextColor: string;
  bodyTextColor: string;
  accentTextColor: string;
  fontFamily: string;
  headingFontFamily: string;
  welcomeLogoUrl?: string;
  /** Public login-page background customization. */
  loginBackgroundType?: 'solid' | 'gradient' | 'pattern' | 'animated';
  loginBackgroundColor?: string;
  loginBackgroundSecondaryColor?: string;
  loginBackgroundPattern?: 'dots' | 'grid' | 'diagonal' | 'confetti';
  loginBackgroundAnimation?: 'none' | 'drift' | 'shimmer' | 'float';
  loginBackgroundOverlayOpacity?: number;
  loginWelcomeMessage?: string;
  /** Platform-admin venue-administrator invite email (plain-text template; HTML button is added by send-email). */
  venueAdminInviteSubject?: string;
  venueAdminInviteBody?: string;
  /** Lifetime in days for a brand-new venue-admin invite token. */
  venueAdminInviteTtlDays?: number;
  /** Lifetime in days for a reissued venue-admin invite token. */
  venueAdminReissueTtlDays?: number;
  welcomeTitle?: string;
  showWelcomeByDefault?: boolean;
  welcomeFeatures?: string[];
}

export interface AppConfig extends Config {}

// Layout categories with metadata
export interface LayoutCategoryInfo {
  id: LayoutCategory;
  name: string;
  description: string;
  icon: string;
  color: string;
}

// Alignment types for items
export type AlignmentType = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';

// Alignment settings
export interface AlignmentSettings {
  enabled: boolean;
  snapToGrid: boolean;
  showGuides: boolean;
  alignToItems: boolean;
  snapThreshold: number; // Distance in feet to trigger snap
}

// Default alignment settings
export const defaultAlignmentSettings: AlignmentSettings = {
  enabled: true,
  snapToGrid: true,
  showGuides: true,
  alignToItems: true,
  snapThreshold: 0.5
};

// --- Decor System Types ---

export type DecorCategory = 
  | 'florals' 
  | 'vases' 
  | 'candles' 
  | 'centerpieces' 
  | 'table-numbers' 
  | 'signage' 
  | 'lighting' 
  | 'backdrop' 
  | 'arch' 
  | 'aisle' 
  | 'custom';

export interface DecorCategoryDef {
  id: DecorCategory | string;
  name: string;
  color: string;
  icon?: string;
  description?: string;
}

export type DecorParentType = 'decor' | 'table' | 'fixture' | 'venue' | 'canvas';

export interface DecorItem {
  id: string;
  name: string;
  categoryId: string; // References DecorCategoryDef.id
  description?: string;
  icon?: string;
  width: number; // feet
  height: number; // feet
  widthInches?: number; // additional inches
  heightInches?: number; // additional inches
  color?: string;
  imageUrl?: string;
  tags?: string[];
  costPerUnit?: number;
  supplier?: string;
  inventoryCount?: number; // Total stock
  isTemplate?: boolean;
  createdAt: string;
  images?: ImageItem[];
  customDrawing?: {
    objects: DrawingObject[];
    drawingWidth: number;
    drawingHeight: number;
  };
}

// A specific arrangement of decor (e.g., a "Rustic Centerpiece Set" for a round table)
export interface DecorArrangement {
  id: string;
  name: string; // e.g., "Main Reception Table Design"
  userId: string; // Added to track owner for uniqueness check
  baseType: 'table' | 'fixture' | 'arch' | 'other';
  baseSpecId?: string; // If tied to a specific table size
  items: Array<{
    decorItemId: string;
    x: number; // relative to center of base
    y: number; // relative to center of base
    rotation: number;
    scaleX: number;
    scaleY: number;
    zIndex: number;
  }>;
  createdAt: string;
  createdBy?: string;
  isPackage?: boolean; // If true, can be chosen as a style
  style?: 'Rustic' | 'Contemporary' | 'Seasonal' | 'Modern' | 'Gold' | 'Silver' | 'Premium';
}

export interface RSVPSubmission {
  id: string;
  guestId: string;
  eventName?: string;
  eventKey?: string;
  fullName: string;
  email: string;
  phone?: string;
  attending: boolean;
  attendingDays?: string[];
  /** Guest event ids the guest will attend (per-event itinerary RSVP). */
  attendingEvents?: string[];
  mealChoice?: string;
  plusOneName?: string;
  plusOneMealChoice?: string;
  dietaryNotes?: string;
  specialNeeds?: string;
  notes?: string;
  submittedAt: string;
  /** Opaque portal token used to submit to the server-side backend (when enabled). */
  token?: string;
}

/** A single entry on the guest-facing event schedule. */
/** A meal choice offered in the guest RSVP. */
export interface PortalMealOption {
  value: string;
  label: string;
}

/** Default meal options used when a venue hasn't configured its own. */
export const DEFAULT_MEAL_OPTIONS: PortalMealOption[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'chicken', label: 'Chicken' },
  { value: 'beef', label: 'Beef' },
  { value: 'fish', label: 'Fish' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'kids', label: 'Kids' },
  { value: 'other', label: 'Other' },
];

export interface PortalScheduleItem {
  id: string;
  title: string;
  description?: string;
  location?: string;
  venueId?: string;
  startTime: string;   // ISO-8601
  endTime?: string;    // ISO-8601
  isHighlight?: boolean;
  /** 0-based day index for multi-day events */
  dayIndex?: number;
}

/** A named point-of-interest used in the wayfinding tab. */
export interface PortalWayfindingPoint {
  id: string;
  label: string;
  description?: string;
}

export interface GuestPortalConfig {
  eventTitle: string;
  eventStartDate: string;
  eventEndDate?: string;
  isMultiDay?: boolean;
  heroImageUrl?: string;
  welcomeMessage?: string;
  rsvpMessage?: string;
  rsvpDeadlineDate?: string;
  portalPasswordHash?: string;
  portalPasswordSalt?: string;
  portalPassword?: string;
  showMap?: boolean;
  showSchedule?: boolean;
  showWayfinding?: boolean;
  showRSVP?: boolean;
  showLodging?: boolean;
  enabledVenueCategories?: string[];
  /** Schedule items published to guests (B-09 fix). */
  scheduleItems?: PortalScheduleItem[];
  /** Meal choices offered in the RSVP (value + display label). */
  mealOptions?: PortalMealOption[];
  /** Named wayfinding destinations (B-09 fix). */
  wayfindingPoints?: PortalWayfindingPoint[];
  /**
   * Hours after event-end date before the portal closes (B-06 fix).
   * Defaults to 24 so access closes on the calendar day after the event ends.
   */
  accessGracePeriodHours?: number;
  /**
   * Theme/accent color for this couple's guest portal (e.g. "love & blush" pink).
   * When unset, the portal falls back to the venue's brand primary color so the
   * venue brand ties through by default; the couple can override to brand their
   * own portal.
   */
  themeColor?: string;
}

export interface GuestPortalGuestRecord extends Guest {
  token?: string;
  roomId?: string;
  tableId?: string;
  eventName?: string;
  eventKey?: string;
  allowPortalAccess?: boolean;
  allowLodgingAccess?: boolean;
  /** Guest event ids this guest is invited to (per-guest itinerary). */
  guestEventIds?: string[];
  tokenIssuedAt?: string;
  tokenExpiresAt?: string;
  tokenRevokedAt?: string;
  /** New invitations require a bound personal Auth account; absent on historical token-only links. */
  personalAccountRequired?: boolean;
}

// ── Couples / Events platform ────────────────────────────────────────────────
// A booked couple's event. The wedding venue creates one when a couple books; the
// couple then logs into their own couples portal, invites collaborators (planner,
// parents), picks venue spaces, answers the venue's questions, and manages their own
// guest portal. These entities layer on top of the existing venue workspace.

export type CoupleEventStatus = 'invited' | 'active' | 'completed';

export type CoupleCollaboratorRole = 'couple' | 'planner' | 'family' | 'vendor';

export interface CoupleCollaborator {
  id: string;
  name: string;
  email: string;
  role: CoupleCollaboratorRole;
  /** Opaque invitation secret paired with this collaborator's personal account. */
  inviteToken: string;
  inviteIssuedAt?: string;
  inviteExpiresAt?: string;
  revokedAt?: string;
  /** New invitations require a bound personal Auth account; absent on historical token-only links. */
  personalAccountRequired?: boolean;
  accepted?: boolean;
  invitedAt: string;
}

export interface CoupleEventDay {
  id: string;
  label: string;
  date: string;
}

export type CoupleLayoutStatus = 'none' | 'draft' | 'pending' | 'approved' | 'changes_requested' | 'rejected';

export interface LayoutReviewPin {
  id: string;
  x: number;
  y: number;
  comment: string;
  createdAt: string;
  authorName?: string;
  resolved?: boolean;
}

/** A layout the couple has drawn for one of their venue spaces (for venue approval). */
export interface CoupleSpaceLayout {
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  decor: PlacedDecor[];
  updatedAt: string;
}

/** Per-space design record: status, notes, and (optionally) a drawn layout. */
export interface CoupleSpaceLayoutRecord {
  status: 'draft' | 'designed' | 'submitted';
  notes?: string;
  layout?: CoupleSpaceLayout;
  reviewPins?: LayoutReviewPin[];
}

export interface CoupleLayoutReview {
  action: 'approve' | 'request_changes' | 'reject';
  byUserId?: string;
  byName: string;
  comment?: string;
  at: string;
}

export interface CoupleEvent {
  id: string;
  coupleName: string;
  /** Fixed email used by the primary couple's personal invite account. */
  primaryEmail?: string;
  /** New invitations require a bound personal Auth account; absent on historical token-only links. */
  personalAccountRequired?: boolean;
  /** Token embedded in the venue→couple invitation link. */
  inviteToken: string;
  /** When the current couple token was issued. */
  inviteIssuedAt?: string;
  /** Access closes at the end of the day after the final event day. */
  inviteExpiresAt?: string;
  status: CoupleEventStatus;
  eventDate?: string;
  eventEndDate?: string;
  guestCount?: number;
  /** Named days of the event (e.g. Rehearsal Dinner Friday, Ceremony Saturday). */
  days?: CoupleEventDay[];
  /** Venue ids the couple is eligible to use / has selected for their spaces. */
  availableSpaces: string[];
  selectedSpaces: string[];
  /** Per-space layout design status + notes + optional drawn layout, keyed by venue id. */
  spaceLayouts?: Record<string, CoupleSpaceLayoutRecord>;
  /** Current layout-submission status for this couple event (approval work queue). */
  layoutStatus: CoupleLayoutStatus;
  layoutComment?: string;
  layoutHistory: CoupleLayoutReview[];
  collaborators: CoupleCollaborator[];
  /** The venue-configured wedding package this couple booked (id). */
  packageId?: string;
  /** Paid add-ons the couple has added after booking (lodging, activities, etc.). */
  addOns?: CoupleAddOn[];
  /** Whether the couple has booked Seven Paths Manor's Day of Coordination service. */
  venueCoordinationBooked?: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoupleSession {
  v: 1;
  eventId: string;
  collaboratorId: string;
  role: CoupleCollaboratorRole;
  coupleName: string;
  expiresAt: string;
}

// ── Couple's own event checklist ─────────────────────────────────────────────
// The couple (or their planner) creates their own prep checklist, often derived
// from their approved layouts and chosen decor. The venue keeps a separate
// setup/staffing plan (CoupleSetupTask) for what the venue itself must do.
export interface CoupleChecklistItem {
  id: string;
  coupleEventId: string;
  title: string;
  done: boolean;
  /** Free-form phase/group label (e.g. "Planning", "Setup", "Day-of", "Take-down"). */
  phase?: string;
  /** Optional date relative to the event (ISO date or free text). */
  dueDate?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Couple vendors ───────────────────────────────────────────────────────────
// The couple can pick from the venue's preferred vendor list (read-only picks)
// and/or add their own custom vendors.
export type CoupleVendorSource = 'preferred' | 'custom';

export interface CoupleVendor {
  id: string;
  coupleEventId: string;
  name: string;
  category: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  notes?: string;
  /** 'preferred' = picked from the venue's preferred list; 'custom' = couple-added. */
  source: CoupleVendorSource;
  /** The venue vendor id when source === 'preferred'. */
  venueVendorId?: string;
  status: 'requested' | 'contacted' | 'booked' | 'declined';
  cost?: number;
  createdAt: string;
}

// ── Venue per-couple setup & staffing ────────────────────────────────────────
// The venue controls its own setup/staffing per couple event: what needs doing
// (moving tables/chairs, decor install, etc.), which space/day, who, and when —
// driven by what the couple selected (their spaces, days, decor, vendors).
export type CoupleSetupStatus = 'not-started' | 'in-progress' | 'done';
export interface CoupleSetupTask {
  id: string;
  coupleEventId: string;
  title: string;
  /** Which venue space (id) the task concerns, if any. */
  spaceId?: string;
  /** Which event day (0-based index) the task belongs to, if any. */
  dayIndex?: number;
  assignee?: string;
  /** Scheduled start (ISO date-time) for completing setup before the event. */
  scheduledFor?: string;
  status: CoupleSetupStatus;
  notes?: string;
  /** Set when auto-suggested from a package; the venue can edit/accept as-is. */
  suggested?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Venue-configured wedding packages ────────────────────────────────────────
// The venue defines the packages it sells (single-day, multi-day, full weekend),
// each with season-based pricing, guest limits, overnight lodging, and the items
// included in the rental. A booked couple is assigned one package and can later
// add paid add-ons (lodging, horse & carriage, activities, etc.).
export type WeddingPackageDuration = 'single-day' | 'multi-day' | 'full-weekend';

export interface WeddingSeasonPrice {
  nonPeak: number;
  peak: number;
  premier: number;
}

/** The venue's catalog of items that a package can include (used for the included
 *  list and to auto-suggest setup tasks). These mirror a full-service venue's
 *  typical rental inclusions. */
export interface WeddingPackage {
  id: string;
  name: string;
  description?: string;
  durationType: WeddingPackageDuration;
  price: WeddingSeasonPrice;
  /** Included guest count (beyond this, guests are add-ons). */
  maxGuests: number;
  /** Number of overnight guests included (0 for non-lodging packages). */
  maxOvernightGuests: number;
  /** Whether on-site lodging is included with this package. */
  lodgingIncluded: boolean;
  /** Venue ids of lodging included when lodgingIncluded is true. */
  includedLodgingVenueIds?: string[];
  /** The included-items checklist (from INCLUDED_ITEM catalog + custom). */
  includedItems: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Venue-configured add-ons ─────────────────────────────────────────────────
export type PackageAddOnCategory =
  | 'lodging'
  | 'activity'
  | 'service'
  | 'ceremony-reception'
  | 'animal'
  | 'photography'
  | 'city'
  | 'guest'
  | 'time'
  | 'other';

export interface PackageAddOn {
  id: string;
  name: string;
  category: PackageAddOnCategory;
  price: number;
  /** Pricing note, e.g. "per hour", "per group of 10", "max 2 hours". */
  priceNote?: string;
  description?: string;
  /** Optional venue/lodging id this add-on refers to (e.g. a lodging property). */
  venueVendorId?: string;
  active: boolean;
  createdAt: string;
}

/** An add-on a couple has added to their booked package. */
export interface CoupleAddOn {
  addOnId: string;
  /** Optional quantity/unit (e.g. hours, nights, guests). */
  qty?: number;
  addedAt: string;
}

// ── Per-couple guest events (itinerary) ──────────────────────────────────────
// These are the events a couple invites their guests to (rehearsal dinner,
// ceremony, cocktail hour, reception, overnight lodging, activities, etc.).
// Derived from the couple's package + add-ons, with editable capacities. Each
// guest is assigned to the specific events they're invited to; the guest's portal
// itinerary shows only their assigned events and they RSVP per event.
export type CoupleGuestEventKind =
  | 'rehearsal-dinner'
  | 'ceremony'
  | 'cocktail-hour'
  | 'reception'
  | 'lodging'
  | 'activity'
  | 'custom';

export interface CoupleGuestEvent {
  id: string;
  coupleEventId: string;
  title: string;
  kind: CoupleGuestEventKind;
  /** Which event day (0-based index) the event falls on, if multi-day. */
  dayIndex?: number;
  /** Optional ISO start time. */
  startTime?: string;
  location?: string;
  description?: string;
  /** Max guests this event can accommodate (e.g. rehearsal dinner limited count). */
  capacity: number;
  /** Whether this event was auto-created from the package/add-ons. */
  derived: boolean;
  createdAt: string;
}

// ── Venue calendar events (dashboard) ───────────────────────────────────────
// Events the venue tracks on its calendar: booked couple events, plus venue-run
// events (monthly open houses, other events) and internal staffing/work items.
export type VenueCalendarCategory = 'couple' | 'open-house' | 'staffing' | 'blocked' | 'other';

export interface VenueCalendarEvent {
  id: string;
  title: string;
  category: VenueCalendarCategory;
  /** Event date (YYYY-MM-DD). */
  date: string;
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  /** Optional venue space id the event is in. */
  spaceId?: string;
  /** For couple category, the linked CoupleEvent id. */
  coupleEventId?: string;
  /** Staff user ids assigned to this event (staffing view). */
  assignees?: string[];
  notes?: string;
  createdBy?: string;
  createdAt: string;
  /** Recurrence rule, e.g. "weekly", "monthly", "yearly". When set, the event
   *  repeats on the same day-of-week/day-of-month of `date`. */
  recurrence?: 'weekly' | 'monthly' | 'yearly';
}

// ── Venue-controlled wayfinding, rain contingency & rules ──────────────────
// The venue (not the couple) defines the full property map, its spaces/parking/entry
// points, rain-contingency backups, and the venue rules/regulations. The couple's
// guest portal surfaces the subset relevant to the couple (their selected spaces +
// parking/entry + applicable rain-contingency spaces) and the venue rules.

export type VenueMapPointKind = 'space' | 'parking' | 'entry' | 'amenity' | 'path';

/** Publication audience for venue-map objects. Legacy objects default to public. */
export type VenueMapAudience = 'public' | 'couple' | 'staff';
export type VenueMapViewer = 'guest' | 'couple' | 'staff';
/** Whether an Entry / Exit pin is appropriate as a normal guest arrival. */
export type VenueMapArrivalRole = 'unknown' | 'guest-arrival' | 'exit-only' | 'both';
export type VenueMapRouteAccessibility = 'unknown' | 'step-free' | 'not-step-free';
/** Venue-authored routing rank. Emergency-only routes are excluded from routine directions. */
export type VenueMapRoutePriority = 'preferred' | 'standard' | 'secondary' | 'emergency-only';

export interface VenueMapPoint {
  id: string;
  label: string;
  description?: string;
  /** SVG coordinates (0..width / 0..height). */
  x: number;
  y: number;
  kind: VenueMapPointKind;
  /** Who may receive and render this point. Defaults to public for legacy maps. */
  audience?: VenueMapAudience;
  /** Wedding event-space ids this point applies to; absent/empty means all events. */
  eventSpaceIds?: string[];
  /** Entry / Exit classification. Omitted legacy values are treated as unclassified. */
  arrivalRole?: VenueMapArrivalRole;
  /** When kind === 'space', the venue id this point represents. */
  venueId?: string;
  /** Optional real-world GPS coordinates for "Open in Maps". */
  lat?: number;
  lng?: number;
}

export interface RainContingency {
  id: string;
  /** Outdoor venue id that needs a rain backup. */
  outdoorVenueId: string;
  /** Indoor venue id used as the backup. */
  indoorVenueId: string;
  note?: string;
}

/** The whole-property SVG map the venue builds. */
export interface VenueMapConfig {
  /** Canonical coordinate-frame width, inclusive range 20–500. */
  width: number;
  /** Canonical coordinate-frame height, inclusive range 20–500. */
  height: number;
  points: VenueMapPoint[];
  rainContingencies: RainContingency[];
  /** A named walkway/path drawn as an ordered polyline between point ids. */
  routes: VenueMapRoute[];
  /** Optional base map image (data URI or URL) for aerial/property maps. */
  backgroundImageUrl?: string;
  /** Opacity of the background image (0.1 to 1.0). */
  backgroundOpacity?: number;
  /** Portal-only status: a configured published base image is not currently available. */
  backgroundImageUnavailable?: boolean;
  /** Custom drawing shapes and property zone boxes/polylines. */
  drawings?: DrawingObject[];
  updatedAt: string;
}

/** A drawn route/path connecting map points, rendered as a polyline. */
export interface VenueMapRoute {
  id: string;
  name: string;
  /** Who may receive and render this route. Defaults to public for legacy maps. */
  audience?: VenueMapAudience;
  /** Wedding event-space ids this route applies to; absent/empty means all events. */
  eventSpaceIds?: string[];
  /** Verified mobility status; unknown routes must never be represented as step-free. */
  accessibility?: VenueMapRouteAccessibility;
  /** Operational routing rank; legacy routes default to standard. */
  priority?: VenueMapRoutePriority;
  /** Venue-authored route guidance or cautions shown with guest directions. */
  notes?: string;
  /** Ordered map-point ids the route connects (drawn in sequence). */
  pointIds: string[];
}

export interface VenueRulesConfig {
  rules: string[];
  updatedAt: string;
}

/** A day's weather forecast (venue/coordinator-entered, or from a free API). */
export interface DayWeatherForecast {
  condition: string; // e.g. "Sunny", "Partly Cloudy", "Rain"
  tempHigh?: number;
  tempLow?: number;
  rainChance?: number; // 0-100
}

/** Venue-level weather forecasts keyed by event date (YYYY-MM-DD). */
export interface VenueWeatherConfig {
  /** Location label, e.g. "Charlotte, NC" — used by the optional API hook. */
  location?: string;
  forecasts: Record<string, DayWeatherForecast>;
  updatedAt: string;
}

/** A message in the venue↔couple chat thread for a couple event. */
export interface CoupleMessage {
  id: string;
  coupleEventId: string;
  senderId: string;
  senderName: string;
  /** 'venue' for messages from the venue, 'couple' for messages from the couple/collaborators. */
  senderSide: 'venue' | 'couple';
  message: string;
  createdAt: string;
}

export interface PlacedDecor {
  id: string;
  decorItemId: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  zIndex: number;
  notes?: string;
  parentId?: string;
  parentType: DecorParentType;
  groupId?: string;
}

export interface DecorGroup {
  id: string;
  name: string;
  itemIds: string[];
  isLocked?: boolean;
}

export interface DecorPackage {
  id: string;
  name: string;
  style: string;
  description?: string;
  arrangements: Array<{
    arrangementId: string;
    targetCategory: LayoutCategory;
  }>;
}

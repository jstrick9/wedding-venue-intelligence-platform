import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const addTableMock = vi.fn();
const updateTableMock = vi.fn();
const checkTableCollisionMock = vi.fn();
const checkFixtureCollisionMock = vi.fn();
const getTableFootprintPolygonMock = vi.fn();
const getFixtureFootprintPolygonMock = vi.fn();
const addFixtureMock = vi.fn();
const updateFixtureMock = vi.fn();
const duplicateItemMock = vi.fn();
const showToastMock = vi.fn();

const squareFootprint = ({ x, y }: { x: number; y: number }) => [
  { x: x - 1, y: y - 1 },
  { x: x + 1, y: y - 1 },
  { x: x + 1, y: y + 1 },
  { x: x - 1, y: y + 1 },
];

vi.mock('./components/Header', () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock('./components/Sidebar', () => ({
  Sidebar: (props: any) => (
    <div>
      <span data-testid="placement-mode">{props.currentDragItem ? `${props.currentDragItem.type}:${props.currentDragItem.specId}` : 'select-and-move'}</span>
      <button onClick={() => props.onDragStart('table', 'table-spec-1', false)}>start-drag-table</button>
      <button onClick={() => props.onDragStart('table', 'missing-table-spec', false)}>start-missing-table</button>
      <button onClick={() => props.onDragStart('fixture', 'fixture-spec-1', false)}>start-drag-fixture</button>
      <button onClick={() => props.onDragStart('fixture', 'lodging-spec-1', false)}>start-drag-lodging</button>
      <button onClick={() => props.onDragStart('fixture', 'exterior-spec-1', true)}>start-drag-exterior</button>
      <button onClick={() => props.onKeepAddingChange?.(true)}>enable-keep-adding</button>
      <button onClick={() => props.onCancelPlacement?.()}>cancel-placement</button>
      <button onClick={() => props.onDragEnd?.()}>end-drag</button>
    </div>
  ),
}));

vi.mock('./components/FloorPlanCanvas', () => ({
  FloorPlanCanvas: (props: any) => (
    <div>
      <button onClick={() => props.onDrop({ x: 7.6, y: 7.6 }, false)}>drop-item</button>
      <button onClick={() => props.onClickToPlace({ x: 7.6, y: 7.6 }, false)}>click-place-item</button>
      <button onClick={() => props.onDrop({ x: 80, y: 60 }, true)}>drop-exterior-zone</button>
      <button onClick={() => props.onDrop({ x: 80, y: 60 }, false)}>drop-far-indoor</button>
      <button onClick={() => props.onMove('tbl1', { x: 7.6, y: 7.6 }, false, true)}>keyboard-nudge-table</button>
      <button onClick={() => props.onMove('fixture1', { x: 39, y: 15 }, false, true)}>move-rotated-fixture</button>
      <button onClick={() => props.onMove('lodging1', { x: 40, y: 15 }, false, true)}>move-lodging-outside</button>
      <button onClick={() => props.onMove('exterior1', { x: 120, y: 50 }, true, true)}>move-exterior-outside</button>
    </div>
  ),
}));

vi.mock('./components/PropertiesPanel', () => ({
  PropertiesPanel: (props: any) => (
    <div>
      <button onClick={() => props.onUpdateTable('tbl1', { x: 7.6, y: 7.6 })}>properties-move-table</button>
      <button onClick={() => props.onUpdateTable('tbl1', { rotation: 45 })}>properties-rotate-table</button>
      <button onClick={() => props.onUpdateFixture('fixture1', { x: 39, y: 15, rotation: 45 })}>properties-move-fixture</button>
      <button onClick={() => props.onDuplicateItem('tbl1')}>duplicate-table</button>
      <button onClick={() => props.onDuplicateItem('fixture1')}>duplicate-fixture</button>
      <button onClick={() => props.onDuplicateItem('exterior1')}>duplicate-exterior</button>
      <button onClick={() => props.onRepairCatalogReference('orphan1', 'table-spec-1')}>repair-orphan-table</button>
    </div>
  ),
}));

vi.mock('./components/AdminPanel', () => ({ AdminPanel: () => null }));
vi.mock('./components/PrintView', () => ({ PrintView: () => null }));
vi.mock('./components/TemplateSelector', () => ({ TemplateSelector: () => null }));
vi.mock('./components/WelcomeModal', () => ({ WelcomeModal: () => null }));
vi.mock('./components/DirectMessagePanel', () => ({ DirectMessagePanel: () => null }));
vi.mock('./components/SubmissionStatusPanel', () => ({ SubmissionStatusPanel: () => null }));
vi.mock('./components/EventQuestionsWizard', () => ({ EventQuestionsWizard: () => null }));
vi.mock('./components/AppErrorBoundary', () => ({ AppErrorBoundary: ({ children }: any) => <>{children}</> }));

vi.mock('./components/Toast', () => ({
  ToastContainer: () => null,
  showToast: (...args: any[]) => showToastMock(...args),
}));

vi.mock('./hooks/useSubmissionWorkflow', () => ({
  useSubmissionWorkflow: () => ({
    getByMasterAndEvent: () => null,
    submit: vi.fn(),
  }),
}));

const layoutStateMockFactory = () => ({
  venues: [
    {
      id: 'v1',
      name: 'Venue 1',
      category: 'reception',
      width: 40,
      height: 30,
      capacity: 200,
      shape: 'rectangle',
      exteriorPadding: { top: 40, right: 30, bottom: 30, left: 40 },
      canvasWidth: 120,
      canvasHeight: 100,
    },
  ],
  currentVenue: {
    id: 'v1',
    name: 'Venue 1',
    category: 'reception',
    width: 40,
    height: 30,
    capacity: 200,
    shape: 'rectangle',
    exteriorPadding: { top: 40, right: 30, bottom: 30, left: 40 },
    canvasWidth: 120,
    canvasHeight: 100,
  },
  layout: {
    name: 'Test Layout',
    venueId: 'v1',
    category: 'reception',
    tables: [
      { id: 'tbl1', specId: 'table-spec-1', x: 2, y: 2, showChairs: true, chairType: 'white-plastic', chairLayout: 'all-sides' },
      { id: 'orphan1', specId: 'deleted-table', x: 14, y: 9, rotation: 30, label: 'Legacy', guests: [], customCapacity: 6 },
    ],
    fixtures: [
      { id: 'fixture1', type: 'fixture', specId: 'fixture-spec-1', x: 8, y: 8, rotation: 45, label: 'Indoor Item', isExterior: false },
      { id: 'lodging1', type: 'fixture', specId: 'lodging-spec-1', x: 12, y: 12, rotation: 0, label: 'Lodging Item', isExterior: false },
      { id: 'exterior1', type: 'fixture', specId: 'exterior-spec-1', x: 20, y: 20, rotation: 30, label: 'Exterior Item', isExterior: true },
    ],
    decor: [],
  },
  guests: [],
  selectedId: null,
  warnings: [],
  layoutDirty: false,
  markLayoutClean: vi.fn(),
  setSelectedId: vi.fn(),
  setOnVenueChange: vi.fn(),
  changeVenue: vi.fn(),
  refreshVenues: vi.fn(),
  addTable: addTableMock,
  addFixture: addFixtureMock,
  updateTable: updateTableMock,
  updateFixture: updateFixtureMock,
  removeItem: vi.fn(),
  duplicateItem: duplicateItemMock,
  clearLayout: vi.fn(),
  saveLayout: vi.fn(),
  loadLayout: vi.fn(),
  loadTemplate: vi.fn(),
  saveMasterLayout: vi.fn(),
  clearMasterLayout: vi.fn(),
  addGuest: vi.fn(),
  updateGuest: vi.fn(),
  removeGuest: vi.fn(),
  assignGuestToTable: vi.fn(),
  assignGuestToRoom: vi.fn(),
  importGuestsFromCSV: vi.fn(),
  exportGuestsToCSV: vi.fn(),
  getDecorArrangements: vi.fn(() => []),
  getDecorItems: vi.fn(() => []),
});

vi.mock('./hooks/useLayoutState', () => ({
  useLayoutState: () => layoutStateMockFactory(),
  getSavedLayouts: () => [],
  setSavedLayouts: vi.fn(),
  getTemplates: () => [],
  getTableSpecs: () => [{ id: 'table-spec-1', name: 'Round Table', shape: 'circle', width: 5, height: 5, capacity: 10 }],
  getFixtureTypes: () => [
    { id: 'fixture-spec-1', name: 'Indoor Item', width: 4, height: 2, category: 'venue' },
    { id: 'lodging-spec-1', name: 'Lodging Item', width: 8, height: 8, category: 'lodging' },
    { id: 'exterior-spec-1', name: 'Exterior Item', width: 6, height: 4, category: 'exterior', isExterior: true },
  ],
  getDecorArrangements: () => [],
  getDecorItems: () => [],
  getLinenColors: () => [],
  getChairSpecs: () => [],
}));

vi.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test', username: 'testadmin', role: 'admin', name: 'Test Admin', isActive: true, createdAt: new Date().toISOString() },
    organizationId: null,
    isAdmin: true,
    isBasicUser: false,
    isGuest: false,
    isPlatformAdmin: false,
    login: vi.fn(),
    logout: vi.fn(),
    continueAsGuest: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    getAllUsers: vi.fn(() => []),
    refreshSession: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('./components/VenueDashboard', () => ({
  VenueDashboard: () => <div data-testid="dashboard-stub" />,
}));

vi.mock('./utils/collisionDetection', () => ({
  checkTableCollision: (...args: any[]) => checkTableCollisionMock(...args),
  checkFixtureCollision: (...args: any[]) => checkFixtureCollisionMock(...args),
  getTableFootprintPolygon: (...args: any[]) => getTableFootprintPolygonMock(...args),
  getFixtureFootprintPolygon: (...args: any[]) => getFixtureFootprintPolygonMock(...args),
}));

const mockConfig = {
  primaryColor: '#4A1942',
  primaryDark: '#3d1a45',
  primaryLight: '#6f2a67',
  accentColor: '#C0C0C0',
  backgroundColor: '#f8f8f8',
  textColor: '#111111',
  headerTextColor: '#ffffff',
  bodyTextColor: '#111111',
  accentTextColor: '#4A1942',
  fontFamily: 'Inter, sans-serif',
  headingFontFamily: 'Playfair Display, serif',
  showWelcomeByDefault: false,
};
vi.mock('./config', () => ({
  getConfig: () => mockConfig,
  useBrandingConfig: () => mockConfig,
}));

import AuthenticatedApp from './components/AuthenticatedApp';
import { ModalProvider } from './contexts/ModalContext';
import { STORAGE_KEYS } from './constants/storageKeys';

function renderStudio() {
  window.location.hash = '#/studio';
  localStorage.setItem(
    STORAGE_KEYS.UI_PREFS,
    JSON.stringify({ snapToGrid: true, gridSize: 5, showGrid: false, sidebarCollapsed: false, sidebarWidth: 280, gridContrast: 0.45 }),
  );
  return render(
    <ModalProvider>
      <AuthenticatedApp />
    </ModalProvider>,
  );
}

describe('App grid/snap + authoritative collision integration', () => {
  beforeEach(() => {
    addTableMock.mockReset();
    addFixtureMock.mockReset();
    updateTableMock.mockReset();
    updateFixtureMock.mockReset();
    duplicateItemMock.mockReset();
    checkTableCollisionMock.mockReset().mockReturnValue({ collides: false });
    checkFixtureCollisionMock.mockReset().mockReturnValue({ collides: false });
    getTableFootprintPolygonMock.mockReset().mockImplementation(squareFootprint);
    getFixtureFootprintPolygonMock.mockReset().mockImplementation(squareFootprint);
    showToastMock.mockReset();
    localStorage.clear();
  });

  it('blocks drag+snap placement on collision and shows non-blocking toast', async () => {
    checkTableCollisionMock.mockReturnValue({ collides: true, details: 'blocked by spacing' });
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('start-drag-table'));
    await user.click(await screen.findByText('drop-item'));

    expect(addTableMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith('blocked by spacing', 'warning', { duration: 1500, dismissible: false });
    expect(checkTableCollisionMock).toHaveBeenCalled();
    const firstArg = checkTableCollisionMock.mock.calls[0][0];
    expect(firstArg.x).toBe(10);
    expect(firstArg.y).toBe(10);
  });

  it('blocks click-to-place on collision and shows toast', async () => {
    checkTableCollisionMock.mockReturnValue({ collides: true, details: 'cannot place here' });
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('start-drag-table'));
    await user.click(await screen.findByText('click-place-item'));

    expect(addTableMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith('cannot place here', 'warning', { duration: 1500, dismissible: false });
  });

  it('blocks properties x/y table edits on collision', async () => {
    checkTableCollisionMock.mockReturnValue({ collides: true, details: 'collision from properties' });
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('properties-move-table'));

    expect(updateTableMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith('collision from properties', 'warning', { duration: 1500, dismissible: false });
  });

  it('repairs a historical orphaned table without moving or relabeling it', async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('repair-orphan-table'));

    expect(updateTableMock).toHaveBeenCalledWith(
      'orphan1',
      expect.objectContaining({
        id: 'orphan1', specId: 'table-spec-1', x: 14, y: 9,
        rotation: 30, label: 'Legacy', customCapacity: 6, chairCount: 6,
      }),
    );
    expect(showToastMock).toHaveBeenCalledWith(
      'Catalog reference repaired with Round Table.',
      'success',
    );
  });

  it('does not grid-snap an exact keyboard nudge', async () => {
    checkTableCollisionMock.mockReturnValue({ collides: false });
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('keyboard-nudge-table'));

    expect(checkTableCollisionMock).toHaveBeenCalled();
    expect(checkTableCollisionMock.mock.calls[0][0]).toMatchObject({ x: 7.6, y: 7.6 });
    expect(updateTableMock).toHaveBeenCalledWith('tbl1', { x: 7.6, y: 7.6 });
  });

  it('enforces the physical venue boundary before optional collision checks', async () => {
    getTableFootprintPolygonMock.mockReturnValue([
      { x: -2, y: 5 }, { x: 2, y: 5 }, { x: 2, y: 9 }, { x: -2, y: 9 },
    ]);
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('start-drag-table'));
    await user.click(screen.getByText('drop-item'));

    expect(addTableMock).not.toHaveBeenCalled();
    expect(checkTableCollisionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('placement-mode')).toHaveTextContent('table:table-spec-1');
    expect(showToastMock).toHaveBeenCalledWith(
      'The full table and chair footprint must stay inside the venue boundary.',
      'warning',
      { duration: 1500, dismissible: false },
    );
  });

  it('keeps boundary checks active for exact keyboard movement', async () => {
    getTableFootprintPolygonMock.mockReturnValue([
      { x: -1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: -1, y: 3 },
    ]);
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('keyboard-nudge-table'));

    expect(updateTableMock).not.toHaveBeenCalled();
    expect(checkTableCollisionMock).not.toHaveBeenCalled();
  });

  it('uses the proposed rotation when validating a property edit', async () => {
    getTableFootprintPolygonMock.mockImplementation((candidate: { x: number; y: number; rotation?: number }) => (
      candidate.rotation === 45
        ? [{ x: -1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 5 }, { x: -1, y: 5 }]
        : squareFootprint(candidate)
    ));
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('properties-rotate-table'));

    expect(getTableFootprintPolygonMock).toHaveBeenCalledWith(expect.objectContaining({ rotation: 45 }));
    expect(updateTableMock).not.toHaveBeenCalled();
    expect(checkTableCollisionMock).not.toHaveBeenCalled();
  });

  it('keeps lodging fixtures inside the venue even though they skip spacing collisions', async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('move-lodging-outside'));

    expect(getFixtureFootprintPolygonMock).toHaveBeenCalledWith(expect.objectContaining({
      specId: 'lodging-spec-1', x: 40, y: 15, isExterior: false,
    }));
    expect(updateFixtureMock).not.toHaveBeenCalled();
    expect(checkFixtureCollisionMock).not.toHaveBeenCalled();
  });

  it('keeps exterior fixtures inside the full canvas boundary', async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('move-exterior-outside'));

    expect(getFixtureFootprintPolygonMock).toHaveBeenCalledWith(expect.objectContaining({
      specId: 'exterior-spec-1', x: 120, y: 50, isExterior: true,
    }));
    expect(updateFixtureMock).not.toHaveBeenCalled();
    expect(checkFixtureCollisionMock).not.toHaveBeenCalled();
  });

  it('allows an exterior catalog item in canvas space outside the venue footprint', async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('start-drag-exterior'));
    await user.click(screen.getByText('drop-exterior-zone'));

    expect(addFixtureMock).toHaveBeenCalledWith(
      'exterior-spec-1',
      { x: 80, y: 60 },
      true,
    );
    expect(checkFixtureCollisionMock).toHaveBeenCalledWith(
      expect.objectContaining({ specId: 'exterior-spec-1', isExterior: true }),
      expect.any(Array),
      expect.any(Array),
      expect.any(Object),
      undefined,
    );
  });

  it('keeps one-shot placement active after rejection and exits after success', async () => {
    const user = userEvent.setup();
    renderStudio();

    getTableFootprintPolygonMock.mockReturnValue([
      { x: -1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: -1, y: 3 },
    ]);
    await user.click(await screen.findByText('start-drag-table'));
    await user.click(screen.getByText('drop-item'));
    expect(screen.getByTestId('placement-mode')).toHaveTextContent('table:table-spec-1');

    getTableFootprintPolygonMock.mockImplementation(squareFootprint);
    await user.click(screen.getByText('drop-item'));
    expect(addTableMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('placement-mode')).toHaveTextContent('select-and-move');
  });

  it('retains placement after success only when Keep adding is enabled', async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('enable-keep-adding'));
    await user.click(screen.getByText('start-drag-table'));
    await user.click(screen.getByText('drop-item'));

    expect(addTableMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('placement-mode')).toHaveTextContent('table:table-spec-1');
  });

  it('preserves guided placement across native dragend but supports Escape and explicit cancel', async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('start-drag-table'));
    await user.click(screen.getByText('end-drag'));
    expect(screen.getByTestId('placement-mode')).toHaveTextContent('table:table-spec-1');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('placement-mode')).toHaveTextContent('select-and-move');

    await user.click(screen.getByText('start-drag-table'));
    await user.click(screen.getByText('cancel-placement'));
    expect(screen.getByTestId('placement-mode')).toHaveTextContent('select-and-move');
  });

  it('exits placement when a missing catalog record makes the attempt irreparable', async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('start-missing-table'));
    await user.click(screen.getByText('drop-item'));

    expect(addTableMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('placement-mode')).toHaveTextContent('select-and-move');
    expect(showToastMock).toHaveBeenCalledWith(
      'This table cannot be placed because its catalog definition is missing.',
      'warning',
    );
  });

  it('duplicates to the first exact in-bounds candidate while retaining rotation', async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('duplicate-exterior'));

    expect(getFixtureFootprintPolygonMock).toHaveBeenCalledWith(expect.objectContaining({
      x: 23, y: 20, rotation: 30, isExterior: true,
    }));
    expect(duplicateItemMock).toHaveBeenCalledWith('exterior1', { x: 23, y: 20 });
  });

  it('blocks duplication when every nearby candidate is outside its boundary', async () => {
    getTableFootprintPolygonMock.mockReturnValue([
      { x: -5, y: -5 }, { x: -1, y: -5 }, { x: -1, y: -1 }, { x: -5, y: -1 },
    ]);
    const user = userEvent.setup();
    renderStudio();

    await user.click(await screen.findByText('duplicate-table'));

    expect(duplicateItemMock).not.toHaveBeenCalled();
    expect(checkTableCollisionMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith(
      'No collision-free location is available nearby for this table copy.',
      'warning',
      { duration: 1500, dismissible: false },
    );
  });

});

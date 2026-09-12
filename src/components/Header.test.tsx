import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

vi.mock('../config', () => ({
  getConfig: () => ({
    venueName: 'Seven Paths Manor',
    websiteUrl: '',
    supportEmail: '',
    logoUrl: '',
    primaryColor: '#4A1942',
    primaryDark: '#3d1a45',
    headerTextColor: '#FFFFFF',
  }),
  useBrandingConfig: () => ({
    venueName: 'Seven Paths Manor',
    websiteUrl: '',
    supportEmail: '',
    logoUrl: '',
    primaryColor: '#4A1942',
    primaryDark: '#3d1a45',
    headerTextColor: '#FFFFFF',
  }),
}));

const venues = [
  {
    id: 'v1',
    name: 'Reception Hall',
    category: 'reception',
    width: 50,
    height: 30,
    capacity: 150,
    isMaster: true,
  },
  {
    id: 'v2',
    name: 'Lodge',
    category: 'lodging',
    width: 30,
    height: 20,
    capacity: 40,
    isMaster: true,
  },
] as any;

function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props: React.ComponentProps<typeof Header> = {
    currentVenue: venues[0],
    venues,
    selectedVenueCategories: [],
    onChangeVenue: vi.fn(),
    onChangeVenueCategories: vi.fn(),
    onSaveLayout: vi.fn(),
    onSaveMasterLayout: vi.fn(),
    onClearMasterLayout: vi.fn(),
    onPrint: vi.fn(),
    onShowTemplates: vi.fn(),
    onShowAdmin: vi.fn(),
    onOpenOperations: vi.fn(),
    onLogout: vi.fn(),
    userName: 'Jane',
    isAdmin: false,
    isStaff: false,
    savedLayouts: [
      {
        id: 'layout-1',
        name: 'My Layout',
        venueId: 'v1',
        tables: [],
        fixtures: [],
        decor: [],
        guests: [],
        createdAt: new Date().toISOString(),
      } as any,
    ],
    onLoadSavedLayout: vi.fn(),
    onDeleteSavedLayout: vi.fn(),
    mobileMenuOpen: false,
    setMobileMenuOpen: vi.fn(),
    currentUser: {
      id: 'u1',
      role: 'basic',
      name: 'Jane',
      isActive: true,
    } as any,
    ...overrides,
  };

  return {
    ...render(<Header {...props} />),
    props,
  };
}

describe('Header', () => {
  it('shows admin button only for admin users', () => {
    const { rerender } = render(
      <Header
        currentVenue={venues[0]}
        venues={venues}
        selectedVenueCategories={[]}
        onChangeVenue={vi.fn()}
        onChangeVenueCategories={vi.fn()}
        onSaveLayout={vi.fn()}
        onSaveMasterLayout={vi.fn()}
        onClearMasterLayout={vi.fn()}
        onPrint={vi.fn()}
        onShowTemplates={vi.fn()}
        onShowAdmin={vi.fn()}
        onOpenOperations={vi.fn()}
        onLogout={vi.fn()}
        userName="Jane"
        isAdmin={false}
        isStaff={false}
        savedLayouts={[] as any}
        onLoadSavedLayout={vi.fn()}
        onDeleteSavedLayout={vi.fn()}
        mobileMenuOpen={false}
        setMobileMenuOpen={vi.fn()}
        currentUser={{ id: 'u1', role: 'basic', name: 'Jane', isActive: true } as any}
      />,
    );

    expect(screen.queryByRole('button', { name: /admin & system settings/i })).not.toBeInTheDocument();

    rerender(
      <Header
        currentVenue={venues[0]}
        venues={venues}
        selectedVenueCategories={[]}
        onChangeVenue={vi.fn()}
        onChangeVenueCategories={vi.fn()}
        onSaveLayout={vi.fn()}
        onSaveMasterLayout={vi.fn()}
        onClearMasterLayout={vi.fn()}
        onPrint={vi.fn()}
        onShowTemplates={vi.fn()}
        onShowAdmin={vi.fn()}
        onOpenOperations={vi.fn()}
        onLogout={vi.fn()}
        userName="Admin"
        isAdmin={true}
        isStaff={false}
        savedLayouts={[] as any}
        onLoadSavedLayout={vi.fn()}
        onDeleteSavedLayout={vi.fn()}
        mobileMenuOpen={false}
        setMobileMenuOpen={vi.fn()}
        currentUser={{ id: 'u2', role: 'admin', name: 'Admin', isActive: true } as any}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    expect(screen.getByRole('button', { name: /admin & system settings/i })).toBeInTheDocument();
  });

  it('opens save layout dialog and saves layout name', async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole('button', { name: /menu/i }));
    await user.click(screen.getByRole('button', { name: /save layout/i }));

    const dialog = screen.getByRole('dialog', { name: /save layout/i });
    expect(dialog).toBeInTheDocument();

    const input = within(dialog).getByPlaceholderText(
      /enter layout name/i,
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Wedding Plan' } });
    expect(input.value).toBe('Wedding Plan');

    const buttons = within(dialog).getAllByRole('button');
    const saveButton = buttons.find(
      (button) => button.textContent?.trim() === 'Save Layout',
    );

    expect(saveButton).toBeTruthy();
    if (!saveButton) throw new Error('Save Layout action button not found');

    fireEvent.click(saveButton);

    expect(props.onSaveLayout).toHaveBeenCalledWith('Wedding Plan');
  });

  it('opens load layout dialog', async () => {
    const user = userEvent.setup();

    renderHeader();

    await user.click(screen.getByRole('button', { name: /menu/i }));
    await user.click(screen.getByRole('button', { name: /load layout/i }));

    const dialog = screen.getByRole('dialog', { name: /load layout/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('My Layout')).toBeInTheDocument();
  });

  it('offers overwrite vs new-copy when saving a layout name that already exists', async () => {
    const user = userEvent.setup();
    const onSaveLayout = vi.fn();
    const onSaveLayoutOverwrite = vi.fn();
    renderHeader({ onSaveLayout, onSaveLayoutOverwrite });

    await user.click(screen.getByRole('button', { name: /menu/i }));
    await user.click(screen.getByRole('button', { name: /save layout/i }));

    const dialog = screen.getByRole('dialog', { name: /save layout/i });
    const input = within(dialog).getByPlaceholderText(/enter layout name/i);
    fireEvent.change(input, { target: { value: 'My Layout' } }); // exists in fixture

    // Both overwrite and new-copy are available for the colliding name.
    await user.click(screen.getByRole('button', { name: /overwrite existing/i }));
    expect(onSaveLayoutOverwrite).toHaveBeenCalledWith('My Layout');
    expect(onSaveLayout).not.toHaveBeenCalled();
  });

  it('confirms before clearing the master layout', async () => {
    const user = userEvent.setup();
    const onClearMasterLayout = vi.fn();
    renderHeader({
      isAdmin: true,
      currentVenue: {
        ...venues[0],
        masterLayout: { tables: [], fixtures: [], decor: [], savedAt: new Date().toISOString() },
      } as any,
      onClearMasterLayout,
    });

    await user.click(screen.getByRole('button', { name: /menu/i }));
    await user.click(screen.getByRole('button', { name: /clear master layout/i }));

    // Confirmation appears; clear does not happen yet.
    expect(screen.getByText(/clear master layout/i)).toBeInTheDocument();
    expect(onClearMasterLayout).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /clear master$/i }));
    expect(onClearMasterLayout).toHaveBeenCalledTimes(1);
  });

  it('confirms before deleting a saved layout', async () => {
    const user = userEvent.setup();
    const onDeleteSavedLayout = vi.fn();
    renderHeader({ onDeleteSavedLayout });

    await user.click(screen.getByRole('button', { name: /menu/i }));
    await user.click(screen.getByRole('button', { name: /load layout/i }));
    await user.click(screen.getByRole('button', { name: /delete saved layout my layout/i }));

    // Confirmation dialog appears; deleting does not happen yet.
    expect(screen.getByText(/delete saved layout/i)).toBeInTheDocument();
    expect(onDeleteSavedLayout).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /delete$/i }));
    expect(onDeleteSavedLayout).toHaveBeenCalledWith('layout-1');
  });

  it('labels a basic master user accurately in the signed-in line', async () => {
    const user = userEvent.setup();
    renderHeader({
      currentUser: {
        id: 'u1',
        role: 'basic',
        userRole: 'master',
        name: 'Jane',
        isActive: true,
      } as any,
    });

    await user.click(screen.getByRole('button', { name: /menu/i }));

    expect(screen.getByText(/Signed in as: Jane \(Master\)/)).toBeInTheDocument();
  });

  it('does not render Website or Email links in the Design Studio header', () => {
    renderHeader();

    expect(screen.queryByText(/Website/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Email/i)).not.toBeInTheDocument();
  });
});
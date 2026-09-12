import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPanel } from './AdminPanel';
import {
  getTableSpecs,
  setFixtureTypes,
  setTableSpecs,
  setVenues,
} from '../hooks/useLayoutState';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1', username: 'admin', role: 'admin', name: 'Admin User',
      isActive: true, createdAt: new Date().toISOString(),
    },
    isAdmin: true,
    isBasicUser: false,
    isGuest: false,
    organizationId: 'org-1',
    login: vi.fn(), logout: vi.fn(), continueAsGuest: vi.fn(), createUser: vi.fn(),
    updateUser: vi.fn(), deleteUser: vi.fn(), getAllUsers: vi.fn(() => []),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const oldTable = {
  id: 'old-table', name: 'Old Round', shape: 'circle' as const,
  width: 5, height: 5, capacity: 8,
};
const newTable = {
  id: 'new-table', name: 'New Round', shape: 'circle' as const,
  width: 5, height: 5, capacity: 8,
};

async function openTables(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Venues & Inventory/i }));
  await user.click(screen.getByRole('button', { name: /tables, chairs & linens/i }));
}

async function requestOldTableDeletion(user: ReturnType<typeof userEvent.setup>) {
  const oldHeading = screen.getByText('Old Round');
  const card = oldHeading.closest('.bg-white');
  if (!card) throw new Error('Old table card not found');
  await user.click(card.querySelector('button[title="Delete"]')!);
  await user.click(screen.getByRole('button', { name: 'Delete Table' }));
}

describe('AdminPanel catalog lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    setTableSpecs([oldTable, newTable]);
    setFixtureTypes([]);
    setVenues([{
      id: 'venue-1', name: 'Hall', width: 60, height: 40,
      capacity: 100, category: 'reception',
    }]);
  });

  it('creates a new active revision instead of mutating a referenced table footprint', async () => {
    const user = userEvent.setup();
    render(
      <AdminPanel
        onClose={() => undefined}
        currentLayout={{
          venueId: 'venue-1', category: 'reception', fixtures: [], decor: [], ceremonyRows: [],
          tables: [{
            id: 'placed-1', type: 'table', specId: 'old-table', x: 10, y: 10,
            rotation: 0, label: 'Placed', guests: [], chairCount: 8,
          }],
        }}
      />,
    );
    await openTables(user);
    const heading = screen.getByText('Old Round');
    const card = heading.closest('.bg-white')!;
    await user.click(heading);
    const widthInput = card.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: '7' } });

    const revisionDialog = screen.getByRole('dialog', { name: /Create a new table revision/i });
    expect(revisionDialog).toBeInTheDocument();
    expect(getTableSpecs().find((spec) => spec.id === 'old-table')?.width).toBe(5);
    await user.click(within(revisionDialog).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create active revision' }));

    const family = getTableSpecs().filter((spec) =>
      (spec.catalogFamilyId || spec.id) === 'old-table');
    expect(family).toHaveLength(2);
    expect(family.find((spec) => spec.id === 'old-table')).toMatchObject({
      width: 5, archived: true, catalogRevision: 1,
    });
    expect(family.find((spec) => !spec.archived)).toMatchObject({
      width: 7, archived: false, catalogRevision: 2,
    });
    expect(await screen.findByText('Historical revision')).toBeInTheDocument();
    expect(screen.getByText('Current revision')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();

    fireEvent.change(widthInput, { target: { value: '6' } });
    expect(screen.getByRole('dialog', { name: /Historical table revision is read-only/i })).toBeInTheDocument();
    expect(getTableSpecs().find((spec) => spec.id === 'old-table')?.width).toBe(5);
    expect(getTableSpecs().find((spec) => !spec.archived && spec.catalogFamilyId === 'old-table')?.width).toBe(7);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    const historicalCard = screen.getByText('Historical revision').closest('.bg-white');
    expect(historicalCard).not.toBeNull();
    await user.click(within(historicalCard as HTMLElement).getByTitle('Duplicate'));
    const independentCopy = getTableSpecs().find((spec) => spec.name === 'Old Round (Copy)');
    expect(independentCopy?.archived).toBe(false);
    expect(independentCopy).not.toHaveProperty('catalogFamilyId');
    expect(independentCopy).not.toHaveProperty('catalogRevision');
  });

  it('blocks deletion of a referenced table and archives it safely', async () => {
    const user = userEvent.setup();
    render(
      <AdminPanel
        onClose={() => undefined}
        currentLayout={{
          venueId: 'venue-1', category: 'reception', fixtures: [], decor: [], ceremonyRows: [],
          tables: [{
            id: 'placed-1', type: 'table', specId: 'old-table', x: 10, y: 10,
            rotation: 0, label: 'Placed', guests: [], chairCount: 8,
          }],
        }}
      />,
    );
    await openTables(user);
    await requestOldTableDeletion(user);

    expect(screen.getByRole('dialog', { name: /Referenced table cannot be deleted/i })).toBeInTheDocument();
    expect(screen.getByText(/Deletion was blocked to protect existing layouts/i)).toBeInTheDocument();
    expect(getTableSpecs().find((spec) => spec.id === 'old-table')?.archived).not.toBe(true);

    await user.click(screen.getByRole('button', { name: 'Archive Old Round' }));
    expect(getTableSpecs().find((spec) => spec.id === 'old-table')?.archived).toBe(true);
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('requires review acknowledgement before applying a coordinate-preserving replacement', async () => {
    const user = userEvent.setup();
    const replaceWorking = vi.fn();
    render(
      <AdminPanel
        onClose={() => undefined}
        onReplaceWorkingCatalogReferences={replaceWorking}
        currentLayout={{
          venueId: 'venue-1', category: 'reception', fixtures: [], decor: [], ceremonyRows: [],
          tables: [{
            id: 'placed-1', type: 'table', specId: 'old-table', x: 10, y: 10,
            rotation: 45, label: 'Placed', guests: [], chairCount: 8,
          }],
        }}
      />,
    );
    await openTables(user);
    await requestOldTableDeletion(user);

    await user.selectOptions(screen.getByLabelText('Compatible replacement'), 'new-table');
    const apply = screen.getByRole('button', { name: 'Apply reviewed replacement' });
    expect(apply).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(apply).toBeEnabled();
    await user.click(apply);

    expect(replaceWorking).toHaveBeenCalledWith(
      'table', 'old-table', 'new-table', expect.objectContaining({ incompatibleArrangementIds: [] }),
    );
    expect(getTableSpecs().find((spec) => spec.id === 'old-table')?.archived).toBe(true);
  });
});

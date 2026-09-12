import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrandingManagement } from './BrandingManagement';
import { CoupleManagement } from './CoupleManagement';
import { VenueManagement } from './VenueManagement';
import { CustomVenueBuilder } from '../CustomVenueBuilder';
import { PackageManagement } from './PackageManagement';
import { GuestPortalManagement } from './GuestPortalManagement';
import { VenueWayfindingManagement } from './VenueWayfindingManagement';
import type { Config } from '../../types';

const emeraldConfig: Config = {
  logoUrl: '',
  venueName: 'Emerald Manor',
  tagline: 'Weddings Reimagined',
  location: 'Spring Hope, NC',
  websiteUrl: 'https://www.sevenpathsmanor.com',
  supportEmail: 'weddings@sevenpathsmanor.com',
  phone: '',
  primaryColor: '#10b981',
  primaryDark: '#047857',
  primaryLight: '#34d399',
  accentColor: '#059669',
  backgroundColor: '#f8fafc',
  textColor: '#1e293b',
  fontFamily: 'Inter, system-ui, sans-serif',
  headingFontFamily: 'Inter, system-ui, sans-serif',
  headerTextColor: '#FFFFFF',
  bodyTextColor: '#334155',
  accentTextColor: '#10b981',
};

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', role: 'admin', name: 'Sarah Admin' },
  }),
}));

vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return {
    ...actual,
    useBrandingConfig: () => emeraldConfig,
  };
});

describe('Venue Portal (#/admin) — Complete Universal Branding Audit & Home/Landing Page Preview (#163)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const dummyProps: any = {
    config: emeraldConfig,
    venues: [
      {
        id: 'v1',
        name: 'Grand Ballroom',
        width: 80,
        height: 60,
        capacity: 250,
        category: 'reception',
        color: '#ffffff',
        borderColor: '#10b981',
      },
    ],
    setVenues: () => {},
    tables: [],
    setTables: () => {},
    fixtures: [],
    setFixtures: () => {},
    chairs: [],
    setChairs: () => {},
    wallStyles: [],
    setWallStyles: () => {},
    linenColors: [],
    setLinenColors: () => {},
    templates: [],
    setTemplates: () => {},
    guidelines: [],
    setGuidelines: () => {},
    users: [],
    setUsers: () => {},
    eventQuestions: [],
    setEventQuestions: () => {},
    decorItems: [],
    setDecorItems: () => {},
    decorCategories: [],
    setDecorCategories: () => {},
    decorArrangements: [],
    setDecorArrangements: () => {},
    decorPackages: [],
    setDecorPackages: () => {},
    layoutState: {} as any,
    directMessages: { unreadCountForRole: () => 0 } as any,
    handlers: {} as any,
    user: { id: 'admin-1', role: 'admin', name: 'Sarah Admin' },
    isAdmin: true,
    selectedMessageMasterUserId: '',
    setSelectedMessageMasterUserId: () => {},
    buildMessageThreadId: () => 'thread-1',
    setShowCreateUserModal: () => {},
    setShowEditUserModal: () => {},
    setEditingUser: () => {},
    handleSaveUsers: () => {},
    handleDeleteUser: () => {},
    handleImpersonate: () => {},
    submissionWorkflow: { pendingCount: 0, review: () => {}, submissions: [] } as any,
    expandedBrandingSections: new Set(['logo', 'preview']),
    setExpandedBrandingSections: vi.fn(),
    expandedVenues: new Set(['v1']),
    setExpandedVenues: vi.fn(),
    layoutCategories: [
      { id: 'reception', label: 'Reception' },
      { id: 'ceremony', label: 'Ceremony' },
    ],
    patternOptions: ['wood', 'concrete', 'grass', 'tile', 'custom'],
    showSuccess: () => {},
    showInfo: () => {},
    confirmAction: () => {},
  };

  it('renders BrandingManagement with dynamic Upload Logo button styling and Home/Landing Page Venue Preview', () => {
    render(<BrandingManagement {...dummyProps} />);

    // 1. Verify Upload Logo button has inline gradient matching primaryColor (#10b981)
    const uploadBtn = screen.getByRole('button', { name: /Upload Logo/i });
    expect(uploadBtn.getAttribute('style')).toContain('linear-gradient(135deg, rgb(16, 185, 129), rgb(4, 120, 87))');

    // 2. Verify Live Preview header exists
    expect(screen.getByText(/Live Preview/i)).toBeInTheDocument();

    // Check preview contents
    expect(screen.getByText(/Welcome back to Emerald Manor/i)).toBeInTheDocument();
    expect(screen.getByText(/Today's Wedding Schedule & Quick Strip/i)).toBeInTheDocument();
  });

  it('renders CoupleManagement with consistent BrandedSectionHeader instead of bright pink header', () => {
    render(<CoupleManagement {...dummyProps} onShowSuccess={() => {}} />);

    // Check that Couples Portal header renders as BrandedSectionHeader (left border 4px solid #10b981)
    const titleEl = screen.getByText('Couples Portal');
    const headerEl = titleEl.closest('div[style*="border-left"]');
    expect(headerEl).not.toBeNull();
    expect(headerEl?.getAttribute('style')).toContain('rgb(16, 185, 129)');
  });

  it('renders VenueManagement with dynamically styled safe Geometry and Lodging buttons', () => {
    render(<VenueManagement {...dummyProps} />);

    const shapeBtn = screen.getByRole('button', { name: /Edit Geometry/i });
    expect(shapeBtn.getAttribute('style')).toContain('linear-gradient(135deg, rgb(16, 185, 129), rgb(52, 211, 153))');

    const lodgingBtn = screen.getByRole('button', { name: /^🏨 Lodging$/i });
    expect(lodgingBtn.getAttribute('style')).toContain('linear-gradient(135deg, rgb(5, 150, 105), rgb(4, 120, 87))');
  });

  it('renders CustomVenueBuilder (Shape Builder) with dynamic branding on header and section titles', () => {
    render(
      <CustomVenueBuilder
        venue={dummyProps.venues[0]}
        onSave={() => {}}
        onClose={() => {}}
      />
    );

    const builderModeTitle = screen.getByText('Builder Mode');
    expect(builderModeTitle.getAttribute('style')).toContain('color: rgb(16, 185, 129)');

    const headerEl = screen.getByText('✏️ Venue Shape Builder').parentElement?.parentElement;
    expect(headerEl?.getAttribute('style')).toContain('linear-gradient(135deg, rgb(16, 185, 129), rgb(4, 120, 87))');
  });

  it('renders PackageManagement, GuestPortalManagement, and VenueWayfindingManagement with consistent BrandedSectionHeader', () => {
    const { rerender } = render(<PackageManagement {...dummyProps} onShowSuccess={() => {}} />);
    expect(screen.getByText('Wedding Packages & Add-ons')).toBeInTheDocument();
    let headerEl = screen.getByText('Wedding Packages & Add-ons').closest('div[style*="border-left"]');
    expect(headerEl?.getAttribute('style')).toContain('rgb(16, 185, 129)');

    rerender(<GuestPortalManagement {...dummyProps} onShowSuccess={() => {}} />);
    expect(screen.getByText('Guest Portal Configuration')).toBeInTheDocument();
    headerEl = screen.getByText('Guest Portal Configuration').closest('div[style*="border-left"]');
    expect(headerEl?.getAttribute('style')).toContain('rgb(16, 185, 129)');

    rerender(<VenueWayfindingManagement {...dummyProps} onShowSuccess={() => {}} />);
    expect(screen.getByText('Venue Wayfinding & Rules')).toBeInTheDocument();
    headerEl = screen.getByText('Venue Wayfinding & Rules').closest('div[style*="border-left"]');
    expect(headerEl?.getAttribute('style')).toContain('rgb(16, 185, 129)');
  });
});

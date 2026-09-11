import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CouplesPortal from './CouplesPortal';
import {
  createCoupleEvent,
  saveCoupleSession,
  getCoupleEvents,
  resolveCoupleInviteToken,
  addCoupleCollaborator,
} from '../services/couples/coupleService';
import type { CoupleCollaboratorRole } from '../types';
import { saveVenueMapConfig } from '../services/wayfinding/venueWayfindingService';

vi.mock('../hooks/useLayoutState', () => ({
  getVenues: () => [
    { id: 'ceremony', name: 'Ceremony Garden', category: 'outdoor', environment: 'outdoor', width: 60, height: 40, capacity: 100 },
    { id: 'reception', name: 'Reception Hall', category: 'reception', environment: 'indoor', width: 80, height: 60, capacity: 200 },
  ],
}));

describe('CouplesPortal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function setupSession(coupleName: string, extra: Partial<Parameters<typeof createCoupleEvent>[0]> = {}) {
    const ev = createCoupleEvent({ coupleName, ...extra });
    // Resolving the invite token creates the implicit owner collaborator.
    const owner = resolveCoupleInviteToken(ev.inviteToken)!;
    saveCoupleSession(owner.event.id, owner.collaborator.id);
    return getCoupleEvents()[0];
  }

  it('renders the couple overview from a saved session', () => {
    setupSession('Smith & Johnson', { eventDate: '2026-06-06', guestCount: 120 });
    render(<CouplesPortal onExitPortal={() => {}} />);
    expect(screen.getAllByText('Smith & Johnson').length).toBeGreaterThan(0);
    expect(screen.getByText('👥 120 guests')).toBeTruthy();
  });

  it('lets a couple select venue spaces', () => {
    setupSession('A & B', { availableSpaces: ['ceremony', 'reception'] });
    render(<CouplesPortal onExitPortal={() => {}} />);
    fireEvent.click(screen.getByText('Venue Spaces'));

    expect(screen.getByText('Ceremony Garden')).toBeTruthy();
    fireEvent.click(screen.getByText('Ceremony Garden'));
    const updated = getCoupleEvents()[0];
    expect(updated.selectedSpaces).toContain('ceremony');
  });

  it('shows the interactive venue map and lets a couple open a space', () => {
    // Seed a venue map config (points for ceremony + reception spaces).
    saveVenueMapConfig({
      width: 100, height: 80, points: [
        { id: 'p1', label: 'Ceremony Garden', kind: 'space', x: 20, y: 20, venueId: 'ceremony' },
        { id: 'p2', label: 'Reception Hall', kind: 'space', x: 60, y: 40, venueId: 'reception' },
        { id: 'p3', label: 'Private Planning Suite', kind: 'amenity', x: 50, y: 20, audience: 'couple' },
        { id: 'p4', label: 'Service Yard', kind: 'amenity', x: 80, y: 70, audience: 'staff' },
      ], rainContingencies: [], routes: [], updatedAt: new Date().toISOString(),
    });

    setupSession('Map & Co', { availableSpaces: ['ceremony', 'reception'] });
    render(<CouplesPortal onExitPortal={() => {}} />);
    fireEvent.click(screen.getByText('Venue Spaces'));

    // The map section renders.
    expect(screen.getByRole('heading', { name: /Venue map/ })).toBeTruthy();
    expect(screen.getByText(/Tap a pin.*Map location actions list.*open a space layout/i)).toBeTruthy();
    expect(screen.getAllByText(/Private Planning Suite/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Private Planning Suite/ })).toBeNull();
    expect(screen.queryByText(/Service Yard/)).toBeNull();
  });

  it('shows venue-authored rain-plan guidance with the couple backup', () => {
    saveVenueMapConfig({
      width: 100,
      height: 80,
      points: [],
      routes: [],
      drawings: [],
      rainContingencies: [{
        id: 'rain-ceremony',
        outdoorVenueId: 'ceremony',
        indoorVenueId: 'reception',
        note: 'Use the covered east walkway and enter beside the coat room.',
      }],
      updatedAt: new Date().toISOString(),
    });

    setupSession('Rain & Shine', { availableSpaces: ['ceremony', 'reception'] });
    render(<CouplesPortal onExitPortal={() => {}} />);
    fireEvent.click(screen.getByText('Venue Spaces'));

    expect(screen.getByText('Ceremony Garden → Reception Hall')).toBeInTheDocument();
    expect(screen.getByText(/Use the covered east walkway/i)).toBeInTheDocument();
  });

  it('shows a published shape-only venue map before interactive pins are added', () => {
    saveVenueMapConfig({
      width: 100,
      height: 80,
      points: [],
      routes: [],
      drawings: [{
        id: 'garden-zone',
        type: 'zone',
        x: 10,
        y: 10,
        width: 40,
        height: 25,
        text: 'Ceremony lawn',
        audience: 'public',
      }],
      rainContingencies: [],
      updatedAt: new Date().toISOString(),
    });

    setupSession('Map First', { availableSpaces: ['ceremony'] });
    render(<CouplesPortal onExitPortal={() => {}} />);
    fireEvent.click(screen.getByText('Venue Spaces'));

    expect(screen.getByRole('heading', { name: /Venue map/ })).toBeInTheDocument();
    expect(screen.getAllByText('Ceremony lawn').length).toBeGreaterThan(0);
    expect(screen.getByText(/Interactive space pins have not been added yet/i))
      .toBeInTheDocument();
  });

  it('shows invalid invite state for a bad token', () => {
    render(<CouplesPortal coupleToken="bad-token" onExitPortal={() => {}} />);
    expect(screen.getByText('Invitation not found')).toBeTruthy();
  });

  it('renders the checklist and vendors tabs', () => {
    setupSession('Check & Co');
    render(<CouplesPortal onExitPortal={() => {}} />);
    expect(screen.getByText('Checklist')).toBeTruthy();
    expect(screen.getByText('Vendors')).toBeTruthy();
    fireEvent.click(screen.getByText('Checklist'));
    expect(screen.getByText(/Your event checklist/i)).toBeTruthy();
    fireEvent.click(screen.getByText('Vendors'));
    expect(screen.getByText(/Your vendors/i)).toBeTruthy();
  });

  it('renders the package tab', () => {
    setupSession('Pkg & Co');
    render(<CouplesPortal onExitPortal={() => {}} />);
    expect(screen.getByText('Package')).toBeTruthy();
    fireEvent.click(screen.getByText('Package'));
    expect(screen.getByText(/Your wedding package/i)).toBeTruthy();
    expect(screen.getByText(/Add-ons you can add/i)).toBeTruthy();
  });

  function setupRoleSession(role: CoupleCollaboratorRole) {
    const ev = createCoupleEvent({ coupleName: 'Role & Test', availableSpaces: ['ceremony', 'reception'] });
    const collaborator = addCoupleCollaborator(ev.id, {
      name: 'Helper',
      email: 'helper@example.com',
      role,
    })!;
    saveCoupleSession(ev.id, collaborator.id);
    return getCoupleEvents()[0];
  }

  it('restricts a vendor to view-only (no space/guest/portal edits)', () => {
    setupRoleSession('vendor');
    render(<CouplesPortal onExitPortal={() => {}} />);

    fireEvent.click(screen.getByText('Venue Spaces'));
    expect(screen.getByText(/View-only — your role cannot change the selected spaces/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Guests'));
    expect(screen.getByText(/View-only — your role cannot add, edit, or remove guests/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Portal Settings'));
    expect(screen.getByText(/View-only — only the couple can change portal settings/i)).toBeTruthy();
  });

  it('lets a vendor chat but not edit portal settings', () => {
    setupRoleSession('vendor');
    render(<CouplesPortal onExitPortal={() => {}} />);
    fireEvent.click(screen.getByText('Portal Settings'));
    // Read-only summary shown, no save button.
    expect(screen.queryByText('💾 Save portal settings')).toBeNull();
  });

  it('lets a planner manage guests but not portal settings', () => {
    setupRoleSession('planner');
    render(<CouplesPortal onExitPortal={() => {}} />);

    fireEvent.click(screen.getByText('Guests'));
    expect(screen.queryByText(/View-only — your role cannot add, edit, or remove guests/i)).toBeNull();
    // Add-guest form present for a planner.
    expect(screen.getByPlaceholderText('Guest name')).toBeTruthy();

    fireEvent.click(screen.getByText('Portal Settings'));
    expect(screen.getByText(/View-only — only the couple can change portal settings/i)).toBeTruthy();
  });

  it('lets the couple edit portal settings (save button present)', () => {
    setupSession('Owner & Couple');
    render(<CouplesPortal onExitPortal={() => {}} />);
    fireEvent.click(screen.getByText('Portal Settings'));
    expect(screen.getByText('💾 Save portal settings')).toBeTruthy();
  });

  it('renders the Timeline tab in Couples Portal and allows couple/planner to view and manage timeline', () => {
    setupSession('Owner & Couple');
    render(<CouplesPortal onExitPortal={() => {}} />);
    const timelineTab = screen.getByText('Timeline');
    fireEvent.click(timelineTab);
    expect(screen.getByText(/Self-Managed \/ Planner Timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/No events scheduled for Wedding Day/i)).toBeInTheDocument();
  });
});

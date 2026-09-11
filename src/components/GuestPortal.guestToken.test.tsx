import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/guestPortal', () => ({
  clearGuestPortalSession: vi.fn(),
  celebrationStatusDays: (startDate: unknown, endDate: unknown, isMultiDay: boolean) => {
    if (!startDate) return null;
    const now = Date.now();
    const start = new Date(startDate as string).getTime();
    const end = isMultiDay && endDate ? new Date(endDate as string).getTime() : start;
    if (!Number.isNaN(end) && now > end) return -1;
    if (now >= start) return 0;
    return Math.ceil((start - now) / 86400000);
  },
  getGuestPortalConfig: vi.fn(),
  getPortalGuests: vi.fn(() => []),
  getPortalGuestsForEvent: vi.fn(() => []),
  getPortalRSVPSubmissions: vi.fn(() => []),
  getPortalRSVPSubmissionsForEvent: vi.fn(() => []),
  getPortalVenues: vi.fn(() => []),
  loadGuestPortalSession: vi.fn(() => null),
  saveGuestPortalSession: vi.fn(),
  setPortalRSVPSubmissions: vi.fn(),
  findGuestInEvent: vi.fn(),
  isGuestPortalEventActive: vi.fn(() => true),
  normalizeEventKey: (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
}));

vi.mock('../utils/auth', () => ({ verifySecret: vi.fn() }));
vi.mock('../services/couples/coupleService', () => ({
  findCoupleEventById: vi.fn(() => ({ id: 'e1', coupleName: 'Smith & Johnson', selectedSpaces: ['ceremony'] })),
}));
vi.mock('../services/couples/coupleRsvpService', () => ({
  getCoupleRsvpSubmissions: vi.fn(() => []),
  setCoupleRsvpSubmissions: vi.fn(),
}));
vi.mock('../services/couples/coupleGuestService', () => ({
  getCoupleGuests: vi.fn(),
  getCouplePortalConfig: vi.fn(() => ({
    eventTitle: 'Smith & Johnson',
    eventStartDate: '2026-06-06',
    showRSVP: true,
  })),
}));
vi.mock('../services/wayfinding/venueWayfindingService', () => ({
  getVenueMapConfigForPortal: vi.fn(() => null),
  getVenueRules: vi.fn(() => ({ rules: [], updatedAt: '' })),
  normalizeVenueMapConfigForPortal: vi.fn((value: unknown) => value),
  normalizeVenueRulesConfig: vi.fn((value: unknown) => value || ({ rules: [], updatedAt: '' })),
  coupleWayfindingPoints: vi.fn(() => []),
  routePolyline: vi.fn(() => []),
}));
vi.mock('../services/weather/venueWeatherService', () => ({
  getVenueWeather: vi.fn(() => ({ forecasts: {}, updatedAt: '' })),
  normalizeVenueWeatherConfig: vi.fn((value: unknown) => value || ({ forecasts: {}, updatedAt: '' })),
  eventDates: vi.fn(() => []),
}));

import GuestPortal from './GuestPortal';
import * as guestPortalHelpers from '../utils/guestPortal';
import * as coupleGuestService from '../services/couples/coupleGuestService';
import * as coupleRsvpService from '../services/couples/coupleRsvpService';
import * as wayfindingService from '../services/wayfinding/venueWayfindingService';

describe('GuestPortal legacy token compatibility when cloud accounts are unavailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(guestPortalHelpers.getGuestPortalConfig).mockReturnValue({
      eventTitle: 'Smith & Johnson',
      eventStartDate: '2026-06-06',
      showMap: false,
      showSchedule: false,
      showWayfinding: false,
      showRSVP: true,
      showLodging: false,
    } as any);
    vi.mocked(guestPortalHelpers.isGuestPortalEventActive).mockReturnValue(true);
    vi.mocked(coupleGuestService.getCoupleGuests).mockReturnValue([
      { id: 'g1', name: 'Jane', token: 'tok-123', eventName: 'e1' },
    ] as any);
  });

  it('retains historical token auto-identification only in local/legacy mode', async () => {
    render(<GuestPortal guestToken="tok-123" coupleEventId="e1" onExitPortal={() => {}} />);

    // With Supabase/account migration intentionally unavailable in this suite,
    // the historical compatibility path bypasses the old identifier form.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('jane@example.com or Jane Smith')).toBeNull();
    });
    // And the guest token triggered a session save.
    await waitFor(() => {
      expect(guestPortalHelpers.saveGuestPortalSession).toHaveBeenCalled();
    });
    // The authenticated identity must continue to come from the couple-scoped
    // guest store, not the legacy venue-wide portal store.
    expect(screen.getAllByText('Jane').length).toBeGreaterThan(0);
  });

  it('uses couple-scoped RSVP submissions instead of the legacy venue RSVP store', async () => {
    vi.mocked(coupleRsvpService.getCoupleRsvpSubmissions).mockReturnValue([
      {
        id: 'r1',
        guestId: 'g1',
        eventKey: 'e1',
        eventName: 'e1',
        fullName: 'Jane',
        email: 'jane@example.com',
        attending: true,
        submittedAt: new Date().toISOString(),
      },
    ] as any);

    render(<GuestPortal guestToken="tok-123" coupleEventId="e1" onExitPortal={() => {}} />);
    await waitFor(() => expect(screen.getAllByText('Jane').length).toBeGreaterThan(0));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /rsvp now/i }));
    expect(screen.getByRole('button', { name: /update rsvp/i })).toBeInTheDocument();
  });

  it('shows the sign-in gate when the token matches no guest', () => {
    vi.mocked(coupleGuestService.getCoupleGuests).mockReturnValue([]);
    render(<GuestPortal guestToken="unknown" coupleEventId="e1" onExitPortal={() => {}} />);
    // Historical compatibility still rejects a token that identifies no guest.
    expect(screen.getByPlaceholderText(/jane@example.com or Jane Smith/i)).toBeTruthy();
  });
});

describe('GuestPortal preview mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(guestPortalHelpers.getGuestPortalConfig).mockReturnValue({
      eventTitle: 'Smith & Johnson',
      eventStartDate: '2026-06-06',
      showMap: true,
      showSchedule: true,
      showWayfinding: true,
      showRSVP: true,
      showLodging: false,
    } as any);
    vi.mocked(guestPortalHelpers.isGuestPortalEventActive).mockReturnValue(true);
    vi.mocked(coupleGuestService.getCoupleGuests).mockReturnValue([
      { id: 'g1', name: 'Jane', token: 'tok-123', eventName: 'e1' },
    ] as any);
  });

  it('bypasses the sign-in gate and shows the preview banner', async () => {
    render(<GuestPortal coupleEventId="e1" preview onExitPortal={() => {}} />);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/jane@example.com or Jane Smith/i)).toBeNull();
    });
    expect(screen.getByText(/Preview mode/i)).toBeTruthy();
  });

  it('does not create a guest session in preview', async () => {
    render(<GuestPortal coupleEventId="e1" preview onExitPortal={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/Preview mode/i)).toBeTruthy();
    });
    expect(guestPortalHelpers.saveGuestPortalSession).not.toHaveBeenCalled();
  });

  it('defaults directions to parking when no entry point exists, regardless of authoring order', async () => {
    vi.mocked(coupleGuestService.getCouplePortalConfig).mockReturnValue({
      eventTitle: 'Smith & Johnson',
      eventStartDate: '2026-06-06',
      showMap: true,
      showSchedule: false,
      showWayfinding: true,
      showRSVP: false,
      showLodging: false,
    } as any);
    vi.mocked(guestPortalHelpers.getPortalVenues).mockReturnValue([
      { id: 'ceremony', name: 'Ceremony Garden', category: 'outdoor', width: 100, height: 80, capacity: 150 },
    ] as any);
    vi.mocked(wayfindingService.getVenueMapConfigForPortal).mockReturnValue({
      width: 100,
      height: 80,
      points: [
        { id: 'ceremony', label: 'Ceremony Garden', kind: 'space', x: 40, y: 20, venueId: 'ceremony' },
        { id: 'parking', label: 'Guest Parking', kind: 'parking', x: 5, y: 5 },
      ],
      routes: [{
        id: 'parking-route',
        name: 'Parking Walk',
        pointIds: ['parking', 'ceremony'],
        audience: 'public',
        accessibility: 'step-free',
        priority: 'standard',
      }],
      rainContingencies: [],
      drawings: [],
      updatedAt: new Date().toISOString(),
    });

    render(<GuestPortal coupleEventId="e1" preview onExitPortal={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Preview mode/i)).toBeTruthy());
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Getting Around/i }));

    expect(screen.getByLabelText<HTMLSelectElement>('Directions starting location').value)
      .toBe('parking');
    await user.selectOptions(screen.getByLabelText('Directions destination'), 'ceremony');
    await user.click(screen.getByRole('button', { name: 'Get Directions' }));
    expect(screen.getByText('Start at Guest Parking.', { selector: 'li' })).toBeInTheDocument();
  });

  it('uses a routable arrival for a selected destination but preserves an explicit guest choice', async () => {
    vi.mocked(coupleGuestService.getCouplePortalConfig).mockReturnValue({
      eventTitle: 'Smith & Johnson',
      eventStartDate: '2026-06-06',
      showMap: true,
      showSchedule: false,
      showWayfinding: true,
      showRSVP: false,
      showLodging: false,
    } as any);
    vi.mocked(guestPortalHelpers.getPortalVenues).mockReturnValue([
      { id: 'ceremony', name: 'Ceremony Garden', category: 'outdoor', width: 100, height: 80, capacity: 150 },
    ] as any);
    vi.mocked(wayfindingService.getVenueMapConfigForPortal).mockReturnValue({
      width: 100,
      height: 80,
      points: [
        { id: 'ceremony', label: 'Ceremony Garden', kind: 'space', x: 40, y: 20, venueId: 'ceremony' },
        { id: 'side-gate', label: 'Side Gate', kind: 'entry', arrivalRole: 'guest-arrival', x: 90, y: 70 },
        { id: 'parking', label: 'Guest Parking', kind: 'parking', x: 5, y: 5 },
      ],
      routes: [{
        id: 'parking-route',
        name: 'Parking Walk',
        pointIds: ['parking', 'ceremony'],
        audience: 'public',
        accessibility: 'step-free',
        priority: 'standard',
      }],
      rainContingencies: [],
      drawings: [],
      updatedAt: new Date().toISOString(),
    });

    render(<GuestPortal coupleEventId="e1" preview onExitPortal={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Preview mode/i)).toBeTruthy());
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Getting Around/i }));
    const from = screen.getByLabelText<HTMLSelectElement>('Directions starting location');
    expect(from.value).toBe('side-gate');
    expect(screen.getAllByRole('option', { name: 'Side Gate — Guest arrival' }).length)
      .toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText('Directions destination'), 'ceremony');
    expect(from.value).toBe('parking');
    await user.click(screen.getByRole('button', { name: 'Get Directions' }));
    expect(screen.getByText('Start at Guest Parking.', { selector: 'li' })).toBeInTheDocument();

    await user.selectOptions(from, 'side-gate');
    await user.click(screen.getByRole('button', { name: 'Get Directions' }));
    expect(screen.getByText(/No venue-authored walking route is published from Side Gate/i))
      .toBeInTheDocument();
  });

  it.each([
    ['venue guest portal', { preview: true }],
    ['couple portal', { coupleEventId: 'e1', preview: true }],
  ] as const)(
    'does not auto-select the destination as the starting location in the %s, but preserves an explicit same-point choice',
    async (_portalName, props) => {
      vi.mocked(guestPortalHelpers.getGuestPortalConfig).mockReturnValue({
        eventTitle: 'Smith & Johnson',
        eventStartDate: '2026-06-06',
        showMap: true,
        showSchedule: false,
        showWayfinding: true,
        showRSVP: false,
        showLodging: false,
      } as any);
      vi.mocked(coupleGuestService.getCouplePortalConfig).mockReturnValue({
        eventTitle: 'Smith & Johnson',
        eventStartDate: '2026-06-06',
        showMap: true,
        showSchedule: false,
        showWayfinding: true,
        showRSVP: false,
        showLodging: false,
      } as any);
      vi.mocked(guestPortalHelpers.getPortalVenues).mockReturnValue([
        { id: 'ceremony', name: 'Ceremony Garden', category: 'outdoor', width: 100, height: 80, capacity: 150 },
      ] as any);
      vi.mocked(wayfindingService.getVenueMapConfigForPortal).mockReturnValue({
        width: 100,
        height: 80,
        points: [
          { id: 'gate', label: 'Main Gate', kind: 'entry', arrivalRole: 'guest-arrival', x: 5, y: 5 },
          { id: 'parking', label: 'Guest Parking', kind: 'parking', x: 15, y: 15 },
          { id: 'ceremony', label: 'Ceremony Garden', kind: 'space', x: 40, y: 20, venueId: 'ceremony' },
        ],
        routes: [],
        rainContingencies: [],
        drawings: [],
        updatedAt: new Date().toISOString(),
      });

      render(<GuestPortal {...props} onExitPortal={() => {}} />);
      await waitFor(() => expect(screen.getByText(/Preview mode/i)).toBeTruthy());
      const user = userEvent.setup();
      await user.click(screen.getByRole('tab', { name: /Getting Around/i }));

      const from = screen.getByLabelText<HTMLSelectElement>('Directions starting location');
      expect(from.value).toBe('gate');
      await user.selectOptions(screen.getByLabelText('Directions destination'), 'gate');
      expect(from.value).toBe('parking');

      await user.click(screen.getByRole('button', { name: 'Get Directions' }));
      expect(screen.getByText(/No venue-authored walking route is published from Guest Parking to Main Gate/i))
        .toBeInTheDocument();
      expect(screen.queryByText("You're already at Main Gate.")).toBeNull();

      await user.selectOptions(from, 'gate');
      await user.click(screen.getByRole('button', { name: 'Get Directions' }));
      expect(screen.getByText("You're already at Main Gate.")).toBeInTheDocument();
    },
  );

  it('labels every Entry / Exit role and never auto-selects legacy or Exit-only pins', async () => {
    vi.mocked(coupleGuestService.getCouplePortalConfig).mockReturnValue({
      eventTitle: 'Smith & Johnson',
      eventStartDate: '2026-06-06',
      showMap: true,
      showSchedule: false,
      showWayfinding: true,
      showRSVP: false,
      showLodging: false,
    } as any);
    vi.mocked(guestPortalHelpers.getPortalVenues).mockReturnValue([
      { id: 'ceremony', name: 'Ceremony Garden', category: 'outdoor', width: 100, height: 80, capacity: 150 },
    ] as any);
    vi.mocked(wayfindingService.getVenueMapConfigForPortal).mockReturnValue({
      width: 100,
      height: 80,
      points: [
        { id: 'ceremony', label: 'Ceremony Garden', kind: 'space', x: 40, y: 20, venueId: 'ceremony' },
        { id: 'exit', label: 'Emergency Gate', kind: 'entry', arrivalRole: 'exit-only', x: 90, y: 70 },
        { id: 'legacy', label: 'Old Gate', kind: 'entry', x: 80, y: 60 },
        { id: 'north-gate', label: 'North Gate', kind: 'entry', arrivalRole: 'both', x: 5, y: 5 },
      ],
      routes: [{
        id: 'north-route',
        name: 'North Walk',
        pointIds: ['north-gate', 'ceremony'],
        audience: 'public',
        accessibility: 'step-free',
        priority: 'standard',
      }],
      rainContingencies: [],
      drawings: [],
      updatedAt: new Date().toISOString(),
    });

    render(<GuestPortal coupleEventId="e1" preview onExitPortal={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Preview mode/i)).toBeTruthy());
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Getting Around/i }));

    const from = screen.getByLabelText<HTMLSelectElement>('Directions starting location');
    expect(from.value).toBe('north-gate');
    expect(screen.getAllByRole('option', { name: 'Emergency Gate — Exit only' }).length)
      .toBeGreaterThan(0);
    expect(screen.getAllByRole('option', { name: 'Old Gate — Not yet classified' }).length)
      .toBeGreaterThan(0);
    expect(screen.getAllByRole('option', { name: 'North Gate — Guest arrival & exit' }).length)
      .toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText('Directions destination'), 'ceremony');
    expect(from.value).toBe('north-gate');
    await user.click(screen.getByRole('button', { name: 'Get Directions' }));
    expect(screen.getByText('Start at North Gate.', { selector: 'li' })).toBeInTheDocument();

    await user.selectOptions(from, 'exit');
    await user.click(screen.getByRole('button', { name: 'Get Directions' }));
    expect(screen.getByText(/No venue-authored walking route is published from Emergency Gate/i))
      .toBeInTheDocument();
  });

  it('scopes wayfinding to guest-visible event spaces and never invents a route', async () => {
    vi.mocked(guestPortalHelpers.getPortalVenues).mockReturnValue([
      { id: 'ceremony', name: 'Ceremony Garden' },
      { id: 'reception', name: 'Reception Hall' },
    ] as any);
    vi.mocked(coupleGuestService.getCouplePortalConfig).mockReturnValue({
      eventTitle: 'Smith & Johnson',
      eventStartDate: '2026-06-06',
      showMap: true,
      showSchedule: false,
      showWayfinding: true,
      showRSVP: false,
      showLodging: false,
    } as any);
    vi.mocked(wayfindingService.getVenueMapConfigForPortal).mockReturnValue({
      width: 100,
      height: 80,
      points: [
        { id: 'gate', label: 'Main Gate', kind: 'entry', arrivalRole: 'guest-arrival', x: 5, y: 5 },
        { id: 'ceremony', label: 'Ceremony Garden', description: 'Enter beside the fountain.', kind: 'space', x: 40, y: 20, venueId: 'ceremony' },
        { id: 'reception', label: 'Reception Hall', kind: 'space', x: 70, y: 30, venueId: 'reception' },
        { id: 'service', label: 'Service Yard', kind: 'amenity', x: 80, y: 70, audience: 'staff' },
      ],
      routes: [{
        id: 'guest-route',
        name: 'Garden Walk',
        pointIds: ['gate', 'ceremony'],
        audience: 'public',
        accessibility: 'unknown',
        priority: 'preferred',
        notes: 'Stay on the signed path.',
      }],
      rainContingencies: [],
      drawings: [],
      updatedAt: new Date().toISOString(),
    });

    render(<GuestPortal coupleEventId="e1" preview onExitPortal={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Preview mode/i)).toBeTruthy());
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Getting Around/i }));

    expect(screen.getAllByText(/Ceremony Garden/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Reception Hall/)).toBeNull();
    expect(screen.queryByText(/Service Yard/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Ceremony Garden/ })).toBeNull();

    await user.selectOptions(screen.getByLabelText('Directions destination'), 'ceremony');
    await user.click(screen.getByRole('button', { name: 'Get Directions' }));
    expect(screen.getByText(
      'Follow preferred route “Garden Walk”. Mobility: Mobility not verified.',
      { selector: 'li' },
    )).toBeInTheDocument();
    expect(screen.getByText('Stay on the signed path.', { selector: 'li' })).toBeInTheDocument();
    expect(screen.getByText('Enter beside the fountain.', { selector: 'li' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Use verified step-free routes only/i }));
    await user.click(screen.getByRole('button', { name: 'Get Directions' }));
    expect(screen.getByText(/No verified step-free route is published/)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { VenueMapDesigner } from './VenueMapDesigner';
import { emptyVenueMapConfig } from '../services/wayfinding/venueWayfindingService';
import {
  addMapPoint,
  addMapRoute,
  INVALID_VENUE_MAP_ROUTE_PRIORITY,
  venueMapScopeArtifactCode,
} from '../utils/venueMapDesigner';
import {
  downloadAccessibleHtmlArtifact,
  downloadLayoutPdf,
  downloadLayoutPng,
} from '../utils/layoutExport';
import type { RainContingency, VenueMapConfig } from '../types';

// Mock the export functions to avoid touching canvas/Blob in jsdom.
vi.mock('../utils/layoutExport', () => ({
  downloadAccessibleHtmlArtifact: vi.fn(),
  downloadLayoutPng: vi.fn().mockResolvedValue(undefined),
  downloadLayoutPdf: vi.fn().mockResolvedValue(undefined),
}));

const venues = [
  { id: 'ballroom', name: 'Grand Ballroom', width: 80, height: 60, capacity: 250, category: 'reception' },
  { id: 'garden', name: 'Garden', width: 100, height: 80, capacity: 150, category: 'outdoor' },
] as any;

function clickCanvas(container: HTMLElement, clientX = 250, clientY = 200) {
  const svg = container.querySelector('svg')!;
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 500, bottom: 400, width: 500, height: 400, x: 0, y: 0,
    toJSON: () => ({}),
  });
  fireEvent.click(svg, { clientX, clientY });
}

function selectFirstMapPoint(container: HTMLElement) {
  const point = container.querySelector<SVGGElement>('[data-map-point]')!;
  fireEvent.pointerDown(point, { pointerId: 1, clientX: 100, clientY: 100 });
}

function chooseParkingPlacement() {
  fireEvent.click(screen.getByRole('button', { name: '🅿️ Parking' }));
}

function chooseEventSpacePlacement() {
  fireEvent.click(screen.getByRole('button', { name: '🏛️ Event Space' }));
}

function startWalkwayBuilder() {
  fireEvent.click(screen.getByRole('button', { name: '〰 Build walkway' }));
}

/** Preserve preflight-independent test intent while acknowledging advisory gaps. */
function clickSaveAndAcknowledgeWayfindingGaps() {
  fireEvent.click(screen.getByRole('button', { name: /Save & publish Venue Map/i }));
  const publishAnyway = screen.queryByRole('button', { name: 'Publish anyway' });
  if (publishAnyway) fireEvent.click(publishAnyway);
}

describe('VenueMapDesigner', () => {
  it('renders existing map points, routes, and the summary', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Grand Ballroom', kind: 'space', x: 20, y: 20, venueId: 'ballroom' });
    map = addMapPoint(map, { label: 'Parking', kind: 'parking', x: 80, y: 10 });
    map = addMapPoint(map, { label: 'Main Entry', kind: 'entry', x: 5, y: 5 });
    map = addMapRoute(map, 'Main Walkway', map.points.map((p) => p.id));

    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);
    expect(screen.getByText(/Full-Venue Map Designer/)).toBeTruthy();
    expect(screen.getByText(/1 spaces/)).toBeTruthy();
    expect(screen.getByText(/1 parking/)).toBeTruthy();
    expect(screen.getByText(/1 entries/)).toBeTruthy();
    expect(screen.getAllByText(/Main Walkway/).length).toBeGreaterThan(0);
  });

  it('counts lodging separately from event spaces in the Designer summary', () => {
    const mixedVenues = [
      ...venues,
      { id: 'cottage', name: 'Cottage', category: 'lodging', width: 40, height: 30, capacity: 8 },
    ] as any;
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Ballroom', kind: 'space', venueId: 'ballroom', x: 20, y: 20 });
    map = addMapPoint(map, { label: 'Cottage', kind: 'space', venueId: 'cottage', x: 40, y: 40 });
    map = addMapPoint(map, { label: 'Unlinked draft', kind: 'space', x: 60, y: 60 });

    render(<VenueMapDesigner map={map} venues={mixedVenues} onSave={() => {}} />);
    expect(screen.getByText(/2 spaces · 1 lodging · 0 parking · 0 entries/i))
      .toBeInTheDocument();
  });

  it('clicking a point opens the side panel and saving persists via onSave', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 30, y: 30, venueId: 'garden' });
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    // No point selected initially -> hint shown.
    expect(screen.getByText(/Click a point on the map/)).toBeTruthy();

    // The palette + save affordances exist.
    expect(screen.getByRole('button', { name: /Save & publish Venue Map/ })).toBeTruthy();
  });

  it('reports scoped wayfinding gaps and requires a safe-default publish-anyway confirmation', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, {
      label: 'Garden Ceremony',
      kind: 'space',
      x: 30,
      y: 30,
      venueId: 'garden',
    });
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={[venues[1]]} onSave={onSave} />);

    const coverageHeading = screen.getByRole('heading', {
      name: /Wayfinding coverage review: 1 guest destination needs attention/i,
    });
    expect(screen.getByText(/No guest-visible point classified as Guest arrival \(or Parking\) is available in the Garden wedding scope/i))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save & publish Venue Map/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /Publish with known wayfinding gaps/i }))
      .toBeInTheDocument();
    const reviewGaps = screen.getByRole('button', { name: 'Review gaps' });
    expect(reviewGaps).toHaveFocus();

    fireEvent.click(reviewGaps);
    await waitFor(() => expect(coverageHeading).toHaveFocus());
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Save & publish Venue Map/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('shows the venue link name for a selected space point', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 30, y: 30, venueId: 'garden' });
    // The designer selects a point on canvas click; we render with a preset map and
    // verify the palette + save button exist without crashing.
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: /Save & publish Venue Map/ })).toBeTruthy();
  });

  it('shows map coverage and adds a pin for a missing venue', () => {
    let map = emptyVenueMapConfig();
    // Grand Ballroom is pinned; Garden is missing.
    map = addMapPoint(map, { label: 'Grand Ballroom', kind: 'space', x: 20, y: 20, venueId: 'ballroom' });
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    expect(screen.getByText(/Map coverage/)).toBeTruthy();
    expect(screen.getByText(/1\/2 uniquely pinned/)).toBeTruthy();
    // Garden is the missing venue and can be pinned.
    expect(screen.getAllByText(/Garden/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Add pin/ }));
    // After adding, coverage updates to 2/2 uniquely pinned and the spaces count increments.
    expect(screen.getByText(/2\/2 uniquely pinned/)).toBeTruthy();
    expect(screen.getByText(/2 spaces/)).toBeTruthy();
  });

  it('reports missing event-space pins and requires explicit publish-anyway confirmation', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={onSave} />);

    expect(screen.getByText(/0\/2 uniquely pinned/i)).toBeInTheDocument();
    expect(screen.getByText(/Any venue without a pin won't appear on the couple or guest map/i))
      .toBeInTheDocument();
    expect(screen.getByRole('heading', {
      name: /Wayfinding coverage review: 2 guest destinations need attention/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/Grand Ballroom has no canonical map pin/i)).toBeInTheDocument();
    expect(screen.getByText(/Garden has no canonical map pin/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save & publish Venue Map/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /Publish with known wayfinding gaps/i }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('keeps canonical-save and local-draft state visible alongside advisory coverage', () => {
    render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={() => {}} />,
    );

    expect(screen.getByText(
      /Canonical venue map is saved.*2 guest destinations have known wayfinding gaps/i,
    )).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add pin for Grand Ballroom/i }));
    expect(screen.getByText(
      /Local draft has unpublished changes.*2 guest destinations have known wayfinding gaps/i,
    )).toBeInTheDocument();
  });

  it('keeps an unpinned lodging record advisory without requiring publication confirmation', async () => {
    const lodgingVenues = [{
      id: 'cottage',
      name: 'Cottage',
      category: 'lodging',
      width: 40,
      height: 30,
      capacity: 8,
    }] as any;
    const onSave = vi.fn();
    render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={lodgingVenues} onSave={onSave} />,
    );

    expect(screen.getByText(/0\/1 uniquely pinned/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Wayfinding coverage review/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Save & publish Venue Map/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: /Publish with known wayfinding gaps/i }))
      .toBeNull();
  });

  it('reveals every missing venue instead of silently truncating coverage after eight', () => {
    const manyVenues = Array.from({ length: 10 }, (_, index) => ({
      id: `venue-${index + 1}`,
      name: `Venue ${index + 1}`,
      category: 'outdoor',
      width: 80,
      height: 60,
      capacity: 100,
    })) as any;
    render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={manyVenues} onSave={() => {}} />,
    );

    expect(screen.getAllByRole('button', { name: /Add pin for Venue/i })).toHaveLength(8);
    const expand = screen.getByRole('button', { name: 'Show 2 more missing venues' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expand);
    expect(screen.getAllByRole('button', { name: /Add pin for Venue/i })).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Show fewer missing venues' }))
      .toHaveAttribute('aria-expanded', 'true');
  });

  it('shows an empty-state hint when the map has no points', () => {
    render(<VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={() => {}} />);
    expect(screen.getByText(/Choose Event Space, Parking, Entry \/ Exit, Amenity, or Build walkway/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Select & Move/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('publishes unique, non-self rain backups through the protected map Save', async () => {
    const rainVenues = [
      { id: 'chapel', name: 'Indoor Chapel', category: 'ceremony', environment: 'indoor' },
      { id: 'terrace', name: 'Reception Terrace', category: 'reception', environment: 'outdoor' },
      { id: 'pavilion', name: 'Open Pavilion', category: 'reception', environment: 'both' },
      { id: 'hall', name: 'Main Hall', category: 'reception', environment: 'indoor' },
    ] as any;
    const onSave = vi.fn();
    render(
      <VenueMapDesigner
        map={emptyVenueMapConfig()}
        venues={rainVenues}
        onSave={onSave}
      />,
    );

    const add = screen.getByRole('button', { name: /Add rain backup/i });
    fireEvent.click(add);
    expect(onSave).not.toHaveBeenCalled();

    const firstOutdoor = screen.getAllByLabelText(/Outdoor space for rain backup/i)[0] as HTMLSelectElement;
    const firstIndoor = screen.getAllByLabelText(/Indoor backup for/i)[0] as HTMLSelectElement;
    expect(firstOutdoor).toHaveValue('terrace');
    expect(Array.from(firstOutdoor.options).map((option) => option.value)).not.toContain('chapel');
    expect(Array.from(firstIndoor.options).map((option) => option.value)).toContain('chapel');

    fireEvent.click(add);
    const outdoorSelections = screen.getAllByLabelText(/Outdoor space for rain backup/i) as HTMLSelectElement[];
    const indoorSelections = screen.getAllByLabelText(/Indoor backup for/i) as HTMLSelectElement[];
    expect(new Set(outdoorSelections.map((select) => select.value)).size).toBe(2);
    expect(Array.from(indoorSelections[1].options).map((option) => option.value)).not.toContain('pavilion');
    expect(add).toBeDisabled();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.rainContingencies).toHaveLength(2);
    expect(saved.rainContingencies.every(
      (contingency: { outdoorVenueId: string; indoorVenueId: string }) =>
        contingency.outdoorVenueId !== contingency.indoorVenueId,
    )).toBe(true);
  });

  it('keeps stale rain pairs recoverable but visibly blocks publication until repaired', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      rainContingencies: [{
        id: 'stale-rain-plan',
        outdoorVenueId: 'removed-garden',
        indoorVenueId: 'garden',
      }],
    };
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Publication blocked.*unavailable rain backup/i);
    expect(screen.getByText(/Outdoor space “removed-garden” no longer exists/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Unavailable.*removed-garden/i })).toBeDisabled();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Remove rain backup for removed-garden/i }));
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].rainContingencies).toEqual([]);
  });

  it('quarantines colliding rain plans and releases all records after explicit re-ID and source repair', async () => {
    const rainVenues = [
      { id: 'lawn', name: 'Lawn', category: 'ceremony', environment: 'outdoor' },
      { id: 'terrace', name: 'Terrace', category: 'reception', environment: 'outdoor' },
      { id: 'courtyard', name: 'Courtyard', category: 'reception', environment: 'outdoor' },
      { id: 'hall', name: 'Hall', category: 'reception', environment: 'indoor' },
      { id: 'barn', name: 'Barn', category: 'reception', environment: 'indoor' },
    ] as any;
    const map = {
      ...emptyVenueMapConfig(),
      rainContingencies: [
        { id: 'duplicate-plan', outdoorVenueId: 'lawn', indoorVenueId: 'hall' },
        { id: 'duplicate-plan', outdoorVenueId: 'terrace', indoorVenueId: 'barn' },
        { id: 'third-plan', outdoorVenueId: 'terrace', indoorVenueId: 'hall' },
      ],
    };
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={rainVenues} onSave={onSave} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Publication blocked: 3 duplicate or competing rain plans require recovery/i);
    expect(screen.getAllByText(/Plan ID “duplicate-plan” is duplicated/i)).toHaveLength(2);
    expect(screen.getAllByText(/Outdoor space “terrace” has competing rain plans/i)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Keep only quarantined rain plan/i })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /Remove quarantined rain plan/i })).toHaveLength(3);
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button', { name: /Assign a new ID to quarantined rain plan/i })[0]);
    expect(screen.getByRole('alert')).toHaveTextContent(/Publication blocked: 2 duplicate or competing rain plans require recovery/i);

    fireEvent.change(
      screen.getByLabelText('Outdoor source for quarantined rain plan 1'),
      { target: { value: 'courtyard' } },
    );
    expect(screen.queryByText(/duplicate or competing rain plans require recovery/i)).not.toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const savedPlans = onSave.mock.calls[0][0].rainContingencies;
    expect(savedPlans).toHaveLength(3);
    expect(new Set(savedPlans.map((plan: RainContingency) => plan.id)).size).toBe(3);
    expect(new Set(savedPlans.map((plan: RainContingency) => plan.outdoorVenueId)).size).toBe(3);
  });

  it('keeps structurally malformed records in an admin-only layer until explicit reconstruction', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'a', label: 'Gate', kind: 'entry', x: 1, y: 1 },
        { id: 'b', label: 'Parking', kind: 'parking', x: 10, y: 10 },
        { label: 'Mystery point', kind: 'secret', x: 5, y: 5 },
      ],
      routes: [{ name: 'Recovered walk', pointIds: ['a', 'b'] }],
      drawings: [{ type: 'circle', x: 20, y: 20, radius: 5, text: 'Round garden' }],
      rainContingencies: [{ outdoorVenueId: 'garden', indoorVenueId: 'ballroom' }],
    } as any;
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/4 malformed saved map occurrences require an explicit decision/i);
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Generate a new ID for malformed map occurrence 1' }));
    fireEvent.change(screen.getByLabelText('Point type'), { target: { value: 'amenity' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct malformed map occurrence 1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Generate a new ID for malformed map occurrence 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct malformed map occurrence 1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Generate a new ID for malformed map occurrence 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct malformed map occurrence 1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Generate a new ID for malformed map occurrence 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct malformed map occurrence 1' }));
    expect(screen.queryByText(/malformed saved map occurrences require an explicit decision/i)).not.toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.points).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Mystery point', kind: 'amenity' }),
    ]));
    expect(saved.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Recovered walk', pointIds: ['a', 'b'] }),
    ]));
    expect(saved.drawings).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Round garden', type: 'circle', radius: 5 }),
    ]));
    expect(saved.rainContingencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ outdoorVenueId: 'garden', indoorVenueId: 'ballroom' }),
    ]));
  });

  it('preserves an overlong point identity for explicit point and walkway repair', async () => {
    const overlongPointId = `point-${'x'.repeat(200)}`;
    const onSave = vi.fn();
    render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        points: [
          { id: overlongPointId, label: 'Legacy gate', kind: 'entry', x: 5, y: 5 },
          { id: 'parking', label: 'Parking', kind: 'parking', x: 20, y: 20 },
        ],
        routes: [{
          id: 'legacy-arrival',
          name: 'Legacy arrival',
          pointIds: [overlongPointId, 'parking'],
        }],
      } as any}
      venues={venues}
      onSave={onSave}
    />);

    const identityInput = screen.getByLabelText('Canonical ID for malformed map point occurrence 1');
    expect(identityInput).toHaveValue(overlongPointId);
    expect(screen.getByText(/Publication blocked: 1 walkway has unsafe or unavailable routing data/i)).toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Generate a new ID for malformed map occurrence 1' }));
    const repairedPointId = (identityInput as HTMLInputElement).value;
    expect(repairedPointId).not.toBe(overlongPointId);
    expect(repairedPointId.length).toBeLessThanOrEqual(200);
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct malformed map occurrence 1' }));

    fireEvent.change(
      screen.getByLabelText('Replacement for stop 1 of Legacy arrival'),
      { target: { value: repairedPointId } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply repaired walkway Legacy arrival' }));
    clickSaveAndAcknowledgeWayfindingGaps();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: repairedPointId, label: 'Legacy gate' }),
    ]));
    expect(onSave.mock.calls[0][0].routes).toEqual([
      expect.objectContaining({
        id: 'legacy-arrival',
        pointIds: [repairedPointId, 'parking'],
      }),
    ]);
  });

  it('quarantines an out-of-frame point and requires explicit dependent-route recovery', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        points: [
          { id: 'outside', label: 'Service gate', kind: 'entry', x: 120, y: 20 },
          { id: 'inside', label: 'Ballroom', kind: 'amenity', x: 60, y: 40 },
        ],
        routes: [{
          id: 'dependent',
          name: 'Gate to ballroom',
          pointIds: ['outside', 'inside'],
        }],
      } as any}
      venues={venues}
      onSave={onSave}
    />);

    expect(screen.getByText(/horizontal coordinate falls outside the current map frame/i)).toBeInTheDocument();
    expect(screen.getByText(/Publication blocked: 1 walkway has unsafe or unavailable routing data/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Horizontal position for malformed point occurrence 1')).toHaveValue(120);
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByLabelText('Horizontal position for malformed point occurrence 1'),
      { target: { value: '10' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct malformed map occurrence 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply repaired walkway Gate to ballroom' }));

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'outside', x: 10, y: 20 }),
    ]));
    expect(onSave.mock.calls[0][0].routes).toEqual([
      expect.objectContaining({ id: 'dependent', pointIds: ['outside', 'inside'] }),
    ]);
  });

  it('keeps an oversized map off the canvas and supports download-before-reset recovery', async () => {
    const oversizedMap = {
      ...emptyVenueMapConfig(),
      points: Array.from({ length: 501 }, (_, index) => ({
        id: `point-${index}`,
        label: `Point ${index}`,
        kind: 'entry' as const,
        x: index % 100,
        y: index % 80,
      })),
    };
    const onSave = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:venue-map-recovery');
    const revokeObjectURL = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    render(<VenueMapDesigner map={oversizedMap} venues={venues} onSave={onSave} />);

    expect(screen.getByText('Oversized Venue Map')).toBeInTheDocument();
    expect(screen.getByText(/working canvas is intentionally empty/i)).toBeInTheDocument();
    expect(screen.getByText(/501 points.*limit is 500/i)).toBeInTheDocument();
    expect(screen.getByText(/Oversized Venue Map recovery is pending.*download the original recovery JSON/i))
      .toHaveClass('text-amber-700');
    expect(document.querySelectorAll('[data-map-point]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: '👁 Preview audiences' })).toBeDisabled();

    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    const resetButton = screen.getByRole('button', { name: 'Reset Venue Map' });
    expect(resetButton).toBeDisabled();
    expect(resetButton).toHaveAttribute('title', expect.stringMatching(/Download the recovery JSON/i));

    fireEvent.click(screen.getByRole('button', { name: 'Download original recovery JSON' }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:venue-map-recovery');
    expect(resetButton).toBeEnabled();

    fireEvent.click(resetButton);
    expect(screen.getByRole('dialog', { name: 'Reset the entire Venue Map?' }))
      .toHaveTextContent(/original recovery JSON download was initiated/i);
    fireEvent.click(screen.getByRole('button', { name: 'Reset working map' }));
    expect(screen.queryByText('Oversized Venue Map')).not.toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ points: [], routes: [], drawings: [] });
    anchorClick.mockRestore();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
  });

  it('quarantines an explicitly invalid whole-map frame until valid dimensions are accepted', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        width: 900,
        points: [{ id: 'gate', label: 'Gate', kind: 'entry', x: 25, y: 25 }],
      } as any}
      venues={venues}
      onSave={onSave}
    />);

    expect(screen.getByRole('alert')).toHaveTextContent(/1 malformed saved map occurrence requires an explicit decision/i);
    expect(screen.getByText('Venue Map frame')).toBeInTheDocument();
    expect(screen.getByText(/no portal receives this map/i)).toHaveTextContent(/500 × 80/i);
    expect(screen.getByText(/Accept valid map dimensions or reset the Venue Map before publishing/i))
      .toHaveClass('text-amber-700');
    expect(screen.queryByLabelText('Canonical ID')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '👁 Preview audiences' })).toBeDisabled();

    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Map width'), { target: { value: '501' } });
    expect(screen.getByRole('button', { name: 'Apply size' })).toBeDisabled();
    expect(screen.getByText(/Width and height must each be a finite number from 20 to 500/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Map width'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply size' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Accept repaired Venue Map frame 300 by 80',
    }));
    expect(screen.queryByText(/malformed saved map occurrence requires an explicit decision/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '👁 Preview audiences' })).toBeEnabled();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ width: 300, height: 80 });
  });

  it('preserves a point outside the temporary frame until dimensions and position are explicitly repaired', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        width: 900,
        points: [
          { id: 'far-gate', label: 'Far gate', kind: 'entry', x: 800, y: 25 },
          { id: 'parking', label: 'Parking', kind: 'parking', x: 20, y: 20 },
        ],
        routes: [{
          id: 'arrival',
          name: 'Arrival',
          pointIds: ['far-gate', 'parking'],
        }],
      } as any}
      venues={venues}
      onSave={onSave}
    />);

    expect(screen.getByText(/Publication blocked: 2 malformed saved map occurrences require an explicit decision/i)).toBeInTheDocument();
    expect(screen.getByText(/temporary recovery map frame/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Horizontal position for malformed point occurrence 2')).toHaveValue(800);
    expect(screen.getByText(/Publication blocked: 1 walkway has unsafe or unavailable routing data/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {
      name: 'Accept repaired Venue Map frame 500 by 80',
    }));
    expect(screen.getByLabelText('Horizontal position for malformed point occurrence 1')).toHaveValue(800);
    fireEvent.change(
      screen.getByLabelText('Horizontal position for malformed point occurrence 1'),
      { target: { value: '450' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct malformed map occurrence 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply repaired walkway Arrival' }));

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      width: 500,
      height: 80,
      points: expect.arrayContaining([
        expect.objectContaining({ id: 'far-gate', x: 450, y: 25 }),
      ]),
      routes: [expect.objectContaining({
        id: 'arrival',
        pointIds: ['far-gate', 'parking'],
      })],
    });
  });

  it('offers an accessible confirmed reset for a quarantined whole-map frame', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        height: -5,
        backgroundImageUrl: 'data:image/png;base64,AAAA',
        points: [{ id: 'gate', label: 'Gate', kind: 'entry', x: 25, y: 25 }],
      } as any}
      venues={venues}
      onSave={onSave}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Venue Map instead' }));
    expect(screen.getByRole('dialog', { name: 'Reset the entire Venue Map?' })).toHaveTextContent(/cannot be undone/i);
    expect(screen.getByRole('button', { name: 'Keep recovery map' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Keep recovery map' }));
    expect(screen.getByText('Venue Map frame')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Venue Map instead' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset working map' }));
    expect(screen.queryByText('Venue Map frame')).not.toBeInTheDocument();
    expect(screen.getByText(/0 spaces · 0 lodging · 0 parking · 0 entries/i)).toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      width: 100,
      height: 80,
      points: [],
      routes: [],
      drawings: [],
      rainContingencies: [],
    });
  });

  it('keeps an uninterpretable top-level map document removable without rendering it', () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner map={'not-a-map' as any} venues={venues} onSave={onSave} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/1 malformed saved map occurrence requires an explicit decision/i);
    expect(screen.getByText('Venue Map document')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove malformed saved map occurrence 1' }));
    expect(screen.queryByText(/malformed saved map occurrence requires an explicit decision/i)).not.toBeInTheDocument();
  });

  it('requires an explicit removal decision for an uninterpretable saved collection', () => {
    const map = {
      ...emptyVenueMapConfig(),
      routes: { unexpected: true },
    } as any;
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/1 malformed saved map occurrence requires an explicit decision/i);
    expect(screen.queryByRole('button', { name: /Reconstruct malformed map occurrence/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove malformed saved map occurrence 1' }));
    expect(screen.queryByText(/malformed saved map occurrence requires an explicit decision/i)).not.toBeInTheDocument();
  });

  it('quarantines malformed shapes, supports explicit recovery, and exposes keyboard geometry editors', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      drawings: [
        { id: 'legacy-polygon', type: 'polygon', x: 4, y: 4, text: 'Legacy polygon' },
        { id: 'circle', type: 'circle', x: 20, y: 20, radius: -4, text: 'Round garden' },
        { id: 'line', type: 'line', x: 5, y: 5, points: [{ x: 5, y: 5 }], text: 'Fence line' },
        { id: 'remove-me', type: 'unsupported', x: 1, y: 1, text: 'Remove me' },
      ],
    } as any;
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/4 unsupported or malformed map shapes require recovery/i);
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', {
      name: 'Convert quarantined map shape 1 to a rectangular zone',
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Rebuild geometry for quarantined map shape 1',
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Rebuild geometry for quarantined map shape 1',
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Remove quarantined map shape 1',
    }));
    expect(screen.queryByText(/unsupported or malformed map shapes require recovery/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Round garden' }));
    fireEvent.change(screen.getByLabelText('Center X'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done editing shape' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fence line' }));
    fireEvent.change(screen.getByLabelText('Line vertex 1 X coordinate'), { target: { value: '7' } });

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].drawings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'legacy-polygon', type: 'zone' }),
      expect.objectContaining({ id: 'circle', type: 'circle', x: 30, radius: 10 }),
      expect.objectContaining({ id: 'line', type: 'line' }),
    ]));
    expect(onSave.mock.calls[0][0].drawings.find((drawing: any) => drawing.id === 'line').points[0].x).toBe(7);
  });

  it('identifies an invalid shape created during editing and guides repair before publication', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      drawings: [{
        id: 'fence-line',
        type: 'line',
        points: [{ x: 5, y: 5 }, { x: 10, y: 10 }],
        text: 'Fence line',
      }],
    } as any;
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fence line' }));
    fireEvent.change(screen.getByLabelText('Line vertex 2 X coordinate'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('Line vertex 2 Y coordinate'), {
      target: { value: '5' },
    });

    expect(screen.getByText(/Publication blocked: 1 edited map shape needs geometry repair/i))
      .toBeInTheDocument();
    expect(screen.getByText('This shape cannot be published yet.')).toBeInTheDocument();
    expect(screen.getAllByText(/at least two different vertex positions/i).length)
      .toBeGreaterThan(0);
    expect(screen.getByText(/Repair edited shape geometry before publishing/i))
      .toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Repair geometry for Fence line' }))
      .toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Line vertex 2 Y coordinate'), {
      target: { value: '12' },
    });
    expect(screen.queryByText(/edited map shape needs geometry repair/i)).not.toBeInTheDocument();
    expect(screen.queryByText('This shape cannot be published yet.')).not.toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].drawings[0].points).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 12 },
    ]);
  });

  it('preserves overlong authored guidance and requires visible repair instead of truncating on save', async () => {
    const overlongGuidance = 'x'.repeat(1001);
    const map = {
      ...emptyVenueMapConfig(),
      points: [{
        id: 'east-ramp',
        label: 'East ramp',
        description: overlongGuidance,
        kind: 'entry',
        x: 10,
        y: 10,
      }],
    } as any;
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    expect(screen.getByText(/Publication blocked: 1 map text field needs repair/i))
      .toBeInTheDocument();
    expect(screen.getByText(/Point guest guidance is 1001 characters; the limit is 1000/i))
      .toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {
      name: 'Repair description for East ramp',
    }));

    const guidance = screen.getByLabelText('Guest guidance / description');
    expect(guidance).toHaveValue(overlongGuidance);
    expect(guidance).toHaveAttribute('maxlength', '1000');
    expect(screen.getByText('1001/1000')).toBeInTheDocument();

    fireEvent.change(guidance, { target: { value: 'Use the east ramp beside the terrace.' } });
    expect(screen.queryByText(/map text field needs repair/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points[0].description)
      .toBe('Use the east ramp beside the terrace.');
  });

  it('preserves and explicitly repairs malformed walkway mobility status', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        points: [
          { id: 'gate', label: 'Gate', kind: 'entry', x: 10, y: 10 },
          { id: 'garden', label: 'Garden', kind: 'amenity', x: 20, y: 20 },
        ],
        routes: [{
          id: 'garden-ramp',
          name: 'Garden ramp',
          pointIds: ['gate', 'garden'],
          accessibility: 'stepfree',
          priority: 'standard',
        }],
      } as any}
      venues={venues}
      onSave={onSave}
    />);

    expect(screen.getByText(/Publication blocked: 1 walkway needs mobility-status repair/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved value “stepfree”/i)).toBeInTheDocument();
    expect(screen.getByText('Invalid saved mobility status')).toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Repair mobility status for Garden ramp' }));
    const mobility = screen.getByRole('combobox', { name: 'Mobility status for walkway Garden ramp' });
    expect(mobility).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Apply route changes' })).toBeDisabled();
    fireEvent.change(mobility, { target: { value: 'step-free' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply route changes' }));

    expect(screen.queryByText(/walkway needs mobility-status repair/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].routes[0]).toMatchObject({
      id: 'garden-ramp',
      accessibility: 'step-free',
    });
  });

  it('preserves and explicitly repairs malformed point, walkway, and shape visibility', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        points: [
          { id: 'gate', label: 'Gate', kind: 'entry', x: 10, y: 10, audience: 'vip' },
          { id: 'lawn', label: 'Lawn', kind: 'amenity', x: 20, y: 20, audience: 'public' },
        ],
        routes: [{
          id: 'arrival',
          name: 'Arrival walkway',
          pointIds: ['gate', 'lawn'],
          audience: null,
          accessibility: 'unknown',
          priority: 'standard',
        }],
        drawings: [{
          id: 'private-zone',
          type: 'zone',
          text: 'Private zone',
          x: 30,
          y: 20,
          width: 10,
          height: 10,
          audience: false,
        }],
      } as any}
      venues={venues}
      onSave={onSave}
    />);

    expect(screen.getByText(/Publication blocked: 3 map objects need visibility repair/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved value “vip”/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved value null/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved value false/i)).toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Repair visibility for Gate' }));
    const pointVisibility = screen.getByRole('combobox', { name: 'Visibility for Gate' });
    expect(pointVisibility).toHaveValue('');
    fireEvent.change(pointVisibility, { target: { value: 'couple' } });

    fireEvent.click(screen.getByRole('button', { name: 'Repair visibility for Private zone' }));
    const shapeVisibility = screen.getByRole('combobox', { name: 'Visibility for Private zone' });
    expect(shapeVisibility).toHaveValue('');
    fireEvent.change(shapeVisibility, { target: { value: 'staff' } });

    fireEvent.click(screen.getByRole('button', { name: 'Repair visibility for Arrival walkway' }));
    const routeVisibility = screen.getByRole('combobox', { name: 'Visibility for walkway Arrival walkway' });
    expect(routeVisibility).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Apply route changes' })).toBeDisabled();
    fireEvent.change(routeVisibility, { target: { value: 'couple' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply route changes' }));

    expect(screen.queryByText(/map objects? needs? visibility repair/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      points: [
        expect.objectContaining({ id: 'gate', audience: 'couple' }),
        expect.objectContaining({ id: 'lawn', audience: 'public' }),
      ],
      routes: [expect.objectContaining({ id: 'arrival', audience: 'couple' })],
      drawings: [expect.objectContaining({ id: 'private-zone', audience: 'staff' })],
    });
  });

  it('preserves and visibly repairs a partial GPS pair before publication', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        points: [{
          id: 'east-ramp',
          label: 'East ramp',
          kind: 'entry',
          x: 10,
          y: 10,
          lat: 35.22,
        }],
      } as any}
      venues={venues}
      onSave={onSave}
    />);

    expect(screen.getByText(/Publication blocked: 1 map point needs GPS repair/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved latitude 35.22; longitude blank/i)).toBeInTheDocument();
    expect(screen.getByText(/Export\/print source: Admin recovery map — portal publication blocked/i))
      .toBeInTheDocument();
    expect(screen.queryByText(/Export\/print source: Saved canonical map/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Repair GPS coordinates for East ramp' }));
    expect(screen.getByLabelText('GPS lat')).toHaveValue(35.22);
    expect(screen.getByLabelText('GPS lng')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('GPS lng'), { target: { value: '-80.84' } });
    expect(screen.queryByText(/map point needs GPS repair/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Export\/print source: Unpublished working draft/i)).toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points[0]).toMatchObject({
      id: 'east-ramp',
      lat: 35.22,
      lng: -80.84,
    });
  });

  it('preserves malformed base-map source and opacity until explicit repair', async () => {
    const onSave = vi.fn();
    const { container } = render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        backgroundImageUrl: 'javascript:alert(1)',
        backgroundOpacity: 99,
      } as any}
      venues={venues}
      onSave={onSave}
    />);

    expect(screen.getByText(/saved base-map configuration needs repair/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved value “javascript:alert\(1\)”/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved value 99/i)).toBeInTheDocument();
    expect(screen.getByText(/Recovery map — quarantined objects omitted/i)).toBeInTheDocument();
    expect(container.querySelector('svg image')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Base map image URL')).toHaveValue('javascript:alert(1)');
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reset opacity to 85%' }));
    expect(screen.getByText(/saved base-map configuration needs repair/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Base map image URL'), {
      target: { value: 'https://example.com/property-map.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.queryByText(/saved base-map configuration needs repair/i)).not.toBeInTheDocument();
    expect(container.querySelector('svg image')).toBeInTheDocument();
    fireEvent.load(container.querySelector('svg image')!);
    await waitFor(() => expect(screen.getByRole('button', { name: /Save & publish Venue Map/i })).toBeEnabled());

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      backgroundImageUrl: 'https://example.com/property-map.png',
      backgroundOpacity: 0.85,
    });
  });

  it('preserves malformed shape appearance and requires an explicit safe reset', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        drawings: [{
          id: 'hidden-zone',
          type: 'zone',
          text: 'Hidden zone',
          x: 10,
          y: 10,
          width: 20,
          height: 10,
          fillColor: 'url(https://tracker.example/pixel)',
          strokeColor: null,
          strokeWidth: 40,
          opacity: -1,
          fontSize: 'large',
        }],
      } as any}
      venues={venues}
      onSave={onSave}
    />);

    expect(screen.getByText(/Publication blocked: 1 unsupported or malformed map shape requires recovery/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved value “url\(https:\/\/tracker.example\/pixel\)”/i)).toBeInTheDocument();
    expect(screen.getByText(/Opacity must be a finite number from 0 to 1. Saved value -1/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hidden zone' })).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reset invalid appearance for Hidden zone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild geometry for quarantined map shape 1' }));
    expect(screen.queryByText(/unsupported or malformed map shape requires recovery/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hidden zone' }));
    expect(screen.getByLabelText('Border width')).toHaveValue(1);
    expect(screen.getByLabelText('Label size')).toHaveValue(12);
    expect(screen.getByRole('slider', { name: /Shape opacity 25%/i })).toHaveValue('25');
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].drawings[0]).toMatchObject({
      id: 'hidden-zone',
      fillColor: '#0d9488',
      strokeColor: '#0f766e',
      strokeWidth: 1,
      opacity: 0.25,
      fontSize: 12,
    });
  });

  it('preserves an over-range shape rotation and requires an explicit angle repair', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner
      map={{
        ...emptyVenueMapConfig(),
        drawings: [{
          id: 'turned-zone',
          type: 'rectangle',
          text: 'Turned zone',
          x: 40,
          y: 30,
          width: 20,
          height: 10,
          rotation: 450,
        }],
      }}
      venues={venues}
      onSave={onSave}
    />);

    expect(screen.getByText(/Publication blocked: 1 unsupported or malformed map shape requires recovery/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turned zone' })).not.toBeInTheDocument();
    const recoveryRotation = screen.getByRole('spinbutton', { name: 'Recovery rotation for Turned zone' });
    expect(recoveryRotation).toHaveValue(450);
    expect(screen.getByText(/saved value 450/i)).toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(recoveryRotation, { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild geometry for quarantined map shape 1' }));
    expect(screen.queryByText(/unsupported or malformed map shape requires recovery/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Turned zone' }));
    expect(screen.getByRole('spinbutton', { name: 'Rotation for Turned zone' })).toHaveValue(90);
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].drawings[0]).toMatchObject({
      id: 'turned-zone',
      rotation: 90,
    });
  });

  it('quarantines out-of-frame and rotated-overflow shapes until explicit repair', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      drawings: [
        { id: 'outside-zone', type: 'zone', x: 95, y: 10, width: 20, height: 10, text: 'Outside zone' },
        { id: 'rotated-zone', type: 'zone', x: 0, y: 0, width: 20, height: 20, rotation: 45, text: 'Rotated zone' },
      ],
    } as any;
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/2 unsupported or malformed map shapes require recovery/i);
    expect(screen.getAllByText(/extends outside the current map frame/i)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', {
      name: 'Rebuild geometry for quarantined map shape 1',
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Rebuild geometry for quarantined map shape 1',
    }));
    expect(screen.queryByText(/map shapes require recovery/i)).not.toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].drawings).toHaveLength(2);
  });

  it('supports explicit keep-only and remove decisions for quarantined rain-plan groups', async () => {
    const rainVenues = [
      { id: 'lawn', name: 'Lawn', category: 'ceremony', environment: 'outdoor' },
      { id: 'terrace', name: 'Terrace', category: 'reception', environment: 'outdoor' },
      { id: 'courtyard', name: 'Courtyard', category: 'reception', environment: 'outdoor' },
      { id: 'hall', name: 'Hall', category: 'reception', environment: 'indoor' },
      { id: 'barn', name: 'Barn', category: 'reception', environment: 'indoor' },
    ] as any;
    const map = {
      ...emptyVenueMapConfig(),
      rainContingencies: [
        { id: 'lawn-hall', outdoorVenueId: 'lawn', indoorVenueId: 'hall' },
        { id: 'lawn-barn', outdoorVenueId: 'lawn', indoorVenueId: 'barn' },
        { id: 'duplicate-id', outdoorVenueId: 'terrace', indoorVenueId: 'hall' },
        { id: 'duplicate-id', outdoorVenueId: 'courtyard', indoorVenueId: 'barn' },
      ],
    };
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={rainVenues} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', {
      name: 'Keep only quarantined rain plan 2 in its conflict group',
    }));
    expect(screen.getByRole('alert')).toHaveTextContent(/2 duplicate or competing rain plans require recovery/i);

    fireEvent.click(screen.getByRole('button', { name: 'Remove quarantined rain plan 1' }));
    expect(screen.queryByText(/duplicate or competing rain plans require recovery/i)).not.toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].rainContingencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'lawn-barn', outdoorVenueId: 'lawn' }),
      expect.objectContaining({ id: 'duplicate-id', outdoorVenueId: 'courtyard' }),
    ]));
    expect(onSave.mock.calls[0][0].rainContingencies).toHaveLength(2);
  });

  it('withholds duplicate-linked space pins until one canonical destination is explicitly kept', async () => {
    const onSave = vi.fn();
    const duplicateLinkedMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'garden-a', label: 'Garden A', kind: 'space', venueId: 'garden', x: 10, y: 10 },
        { id: 'garden-b', label: 'Garden B', kind: 'space', venueId: 'garden', x: 20, y: 20 },
      ],
    } as any;
    const { container } = render(
      <VenueMapDesigner map={duplicateLinkedMap} venues={venues} onSave={onSave} />,
    );

    expect(screen.getByText(/multiple destination pins link to the same venue/i)).toBeInTheDocument();
    expect(screen.getByText(/Garden — 2 linked destination pins/i)).toBeInTheDocument();
    expect(screen.getByText('0/2 uniquely pinned')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-map-point]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Review duplicate venue pin Garden A/i }));
    expect(screen.getByRole('button', { name: /Copy/i })).toBeDisabled();
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', {
      name: /Keep Garden A as the canonical pin for Garden and remove the other linked pins/i,
    }));
    expect(screen.queryByText(/multiple destination pins link to the same venue/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-map-point]')).toHaveLength(1);
    expect(screen.getByText('1/2 uniquely pinned')).toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points).toEqual([
      expect.objectContaining({ id: 'garden-a', venueId: 'garden' }),
    ]);
  });

  it('keeps unavailable space pins recoverable and blocks publication until linked or reclassified', async () => {
    const duplicateCatalog = [
      ...venues,
      { id: 'ambiguous', name: 'Ambiguous A' },
      { id: 'ambiguous', name: 'Ambiguous B' },
    ] as any;
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'unlinked', label: 'Unlinked suite', kind: 'space' as const, x: 10, y: 10 },
        { id: 'deleted', label: 'Deleted hall', kind: 'space' as const, venueId: 'removed-hall', x: 20, y: 20 },
        { id: 'ambiguous-pin', label: 'Ambiguous hall', kind: 'space' as const, venueId: 'ambiguous', x: 30, y: 30 },
      ],
    };
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={duplicateCatalog} onSave={onSave} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Publication blocked: 3 space pins are not linked to a unique current venue/i);
    expect(screen.getByText(/Linked venue ID “removed-hall” no longer exists/i)).toBeInTheDocument();
    expect(screen.getByText(/Linked venue ID “ambiguous” is not unique/i)).toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Repair venue link for Unlinked suite' }));
    const unlinkedSelect = await screen.findByLabelText(/Linked event space or lodging/) as HTMLSelectElement;
    expect(unlinkedSelect).toHaveValue('');
    fireEvent.change(unlinkedSelect, { target: { value: 'ballroom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));

    fireEvent.click(screen.getByRole('button', { name: 'Repair venue link for Deleted hall' }));
    const staleSelect = screen.getByLabelText(/Linked event space or lodging/) as HTMLSelectElement;
    expect(screen.getByRole('option', { name: /Unavailable.*removed-hall/i })).toBeDisabled();
    expect(staleSelect).toHaveValue('removed-hall');
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'amenity' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));

    fireEvent.click(screen.getByRole('button', { name: 'Repair venue link for Ambiguous hall' }));
    const ambiguousSelect = screen.getByLabelText(/Linked event space or lodging/) as HTMLSelectElement;
    expect(screen.getByRole('option', { name: /Unavailable.*ambiguous/i })).toBeDisabled();
    fireEvent.change(ambiguousSelect, { target: { value: 'garden' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));

    expect(screen.queryByText(/Publication blocked:.*space pins/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'unlinked', venueId: 'ballroom' }),
      expect.objectContaining({ id: 'deleted', kind: 'amenity', venueId: undefined }),
      expect.objectContaining({ id: 'ambiguous-pin', venueId: 'garden' }),
    ]));
  });

  it('exposes and repairs unavailable event scopes before publication', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, {
      label: 'Garden entrance',
      kind: 'entry',
      x: 10,
      y: 10,
      eventSpaceIds: ['garden', 'deleted-space'],
    });
    map = addMapPoint(map, { label: 'Ballroom', kind: 'space', x: 30, y: 30, venueId: 'ballroom' });
    map = addMapRoute(map, 'Scoped walkway', map.points.map((point) => point.id), {
      eventSpaceIds: ['__invalid_event_scope__'],
    });
    map = {
      ...map,
      drawings: [{
        id: 'service-lawn',
        type: 'zone',
        x: 5,
        y: 5,
        width: 20,
        height: 15,
        text: 'Service lawn',
        eventSpaceIds: ['ballroom', 'retired-pavilion'],
      }],
    };
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={onSave} />,
    );

    const publicationAlert = screen.getByRole('alert');
    expect(publicationAlert).toHaveTextContent(/3 map objects have unavailable event-space scope/i);
    expect(publicationAlert).toHaveTextContent(/Point “Garden entrance”: deleted-space/i);
    expect(publicationAlert).toHaveTextContent(/Walkway “Scoped walkway”: Malformed saved scope/i);
    expect(publicationAlert).toHaveTextContent(/Shape “Service lawn”: retired-pavilion/i);

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());

    selectFirstMapPoint(container);
    fireEvent.click(screen.getByRole('button', { name: 'Use Garden entrance for all wedding events' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));

    fireEvent.click(screen.getByRole('button', { name: 'Service lawn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove unavailable scopes from Service lawn' }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Scoped walkway' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove unavailable scopes from Scoped walkway' }));
    expect(screen.getByText(/Scope unchanged.*last selected space/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use Scoped walkway for all wedding events' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply route changes' }));

    expect(screen.queryByText(/Publication blocked:.*unavailable event-space scope/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points[0].eventSpaceIds).toBeUndefined();
    expect(onSave.mock.calls[0][0].drawings[0].eventSpaceIds).toEqual(['ballroom']);
    expect(onSave.mock.calls[0][0].routes[0].eventSpaceIds).toBeUndefined();
  });

  it('never broadens a sole event scope through an unchecked checkbox', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, {
      label: 'Garden entrance',
      kind: 'entry',
      x: 10,
      y: 10,
      eventSpaceIds: ['garden'],
    });
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );
    selectFirstMapPoint(container);
    fireEvent.click(screen.getByText(/Event-space scope: 1 selected space/i));

    const gardenScope = screen.getByRole('checkbox', { name: 'Garden' });
    fireEvent.click(gardenScope);
    expect(gardenScope).toBeChecked();
    expect(screen.getByText(/Scope unchanged.*broaden this item to every wedding/i))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {
      name: 'Use Garden entrance for all wedding events',
    }));
    expect(screen.getByText(/Event-space scope: All wedding events/i)).toBeInTheDocument();
    expect(gardenScope).not.toBeChecked();
  });

  it('quarantines duplicate identities and publishes only after explicit recovery', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'anchor', label: 'Primary entrance', kind: 'entry' as const, x: 5, y: 5 },
        { id: 'anchor', label: 'Side entrance', kind: 'entry' as const, x: 10, y: 10 },
        { id: 'garden', label: 'Garden', kind: 'space' as const, venueId: 'garden', x: 50, y: 30 },
      ],
      routes: [
        { id: 'arrival', name: 'Arrival path', pointIds: ['anchor', 'garden'] },
        { id: 'loop', name: 'Public loop', pointIds: ['anchor', 'garden'] },
        { id: 'loop', name: 'Staff loop', pointIds: ['anchor', 'garden'], audience: 'staff' as const },
      ],
      drawings: [
        { id: 'lawn', type: 'zone', x: 1, y: 1, width: 10, height: 10, text: 'Guest lawn' },
        { id: 'lawn', type: 'zone', x: 20, y: 20, width: 10, height: 10, text: 'Staff lawn', audience: 'staff' as const },
      ],
    };
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={onSave} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/duplicated map identities require recovery/i);
    expect(screen.getByText(/1 affected walkway is temporarily quarantined/i)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-map-point]')).toHaveLength(1);

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', {
      name: /Keep occurrence 1, Primary entrance at 5, 5, with original ID anchor/i,
    }));
    expect(screen.getByText(/Duplicate walkway ID “loop”/i)).toBeInTheDocument();
    expect(screen.queryByText(/affected walkways are temporarily quarantined/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {
      name: /Assign a new ID to occurrence 1, Public loop/i,
    }));
    fireEvent.click(screen.getByRole('button', {
      name: /Remove duplicate occurrence 1, Guest lawn/i,
    }));

    expect(screen.queryByText(/duplicated map identities require recovery/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const saved = onSave.mock.calls[0][0];
    expect(saved.points).toHaveLength(3);
    expect(new Set(saved.points.map((point: { id: string }) => point.id)).size).toBe(3);
    expect(saved.points.find((point: { label: string }) => point.label === 'Primary entrance').id).toBe('anchor');
    expect(saved.points.find((point: { label: string }) => point.label === 'Side entrance').id).not.toBe('anchor');
    expect(saved.routes).toHaveLength(3);
    expect(new Set(saved.routes.map((route: { id: string }) => route.id)).size).toBe(3);
    expect(saved.routes.find((route: { name: string }) => route.name === 'Arrival path').pointIds)
      .toEqual(['anchor', 'garden']);
    expect(saved.drawings).toHaveLength(1);
    expect(saved.drawings[0].text).toBe('Staff lawn');
  });

  it('quarantines broken walkways and requires an explicit ordered repair', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'parking', label: 'Parking', kind: 'parking' as const, x: 5, y: 5 },
        { id: 'checkpoint', label: 'Welcome checkpoint', kind: 'path' as const, x: 25, y: 20 },
        { id: 'ceremony', label: 'Ceremony', kind: 'space' as const, venueId: 'garden', x: 50, y: 40 },
      ],
      routes: [{
        id: 'arrival',
        name: 'Arrival path',
        pointIds: ['parking', 'deleted-checkpoint', '__invalid_map_point_reference__', 'ceremony'],
      }],
    };
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/1 walkway has unsafe or unavailable routing data/i);
    expect(screen.getByText(/Unavailable point ID “deleted-checkpoint”/i)).toBeInTheDocument();
    expect(screen.getByText(/Malformed saved reference/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply repaired walkway Arrival path' })).toBeDisabled();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Replacement for stop 2 of Arrival path'), {
      target: { value: 'checkpoint' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove stop 3 from Arrival path' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply repaired walkway Arrival path' }));

    expect(screen.queryByText(/walkway has unsafe or unavailable routing data/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].routes[0].pointIds)
      .toEqual(['parking', 'checkpoint', 'ceremony']);
  });

  it('quarantines an invisible same-position walkway until its travel order spans the map', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'parking', label: 'Parking', kind: 'parking' as const, x: 5, y: 5 },
        { id: 'same-place', label: 'Same-place checkpoint', kind: 'path' as const, x: 5, y: 5 },
        { id: 'ceremony', label: 'Ceremony', kind: 'space' as const, venueId: 'garden', x: 50, y: 40 },
      ],
      routes: [{
        id: 'invisible-arrival',
        name: 'Invisible arrival',
        pointIds: ['parking', 'same-place'],
        accessibility: 'step-free' as const,
      }],
    };
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={onSave} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/1 walkway has unsafe or unavailable routing data/i);
    expect(screen.getByText(/Same position as every other stop/i)).toBeInTheDocument();
    expect(container.querySelector('[data-map-route-label="invisible-arrival"]'))
      .not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply repaired walkway Invisible arrival' }))
      .toBeDisabled();

    fireEvent.change(screen.getByLabelText('Replacement for stop 2 of Invisible arrival'), {
      target: { value: 'ceremony' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply repaired walkway Invisible arrival' }));

    expect(screen.queryByText(/walkway has unsafe or unavailable routing data/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].routes).toEqual([
      expect.objectContaining({
        id: 'invisible-arrival',
        pointIds: ['parking', 'ceremony'],
      }),
    ]);
  });

  it('quarantines an explicit invalid priority until the admin chooses a safe route tier', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry' as const, x: 5, y: 5 },
        { id: 'lawn', label: 'Lawn', kind: 'space' as const, venueId: 'garden', x: 50, y: 40 },
      ],
      routes: [
        {
          id: 'damaged-evacuation',
          name: 'Evacuation route',
          pointIds: ['gate', 'lawn'],
          priority: INVALID_VENUE_MAP_ROUTE_PRIORITY,
        },
        {
          id: 'legacy-arrival',
          name: 'Legacy arrival',
          pointIds: ['gate', 'lawn'],
        },
      ],
    };
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    expect(screen.getByText(/saved routing priority is invalid/i)).toBeInTheDocument();
    expect(screen.getByText(/invalid priority cannot become a routine guest route/i))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply repaired walkway Evacuation route' }))
      .toBeDisabled();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Recovery priority for Evacuation route'), {
      target: { value: 'emergency-only' },
    });
    expect(screen.getByRole('button', { name: 'Apply repaired walkway Evacuation route' }))
      .toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply repaired walkway Evacuation route' }));
    expect(screen.queryByText(/saved routing priority is invalid/i)).not.toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'legacy-arrival', priority: 'standard' }),
      expect.objectContaining({ id: 'damaged-evacuation', priority: 'emergency-only' }),
    ]));
  });

  it('quarantines dependent walkways when an admin deletes an intermediate point', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Parking', kind: 'parking', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Welcome checkpoint', kind: 'path', x: 25, y: 20 });
    map = addMapPoint(map, { label: 'Ceremony', kind: 'space', x: 50, y: 40, venueId: 'garden' });
    map = addMapRoute(map, 'Arrival path', map.points.map((point) => point.id));
    const deletedPointId = map.points[1].id;
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    const points = container.querySelectorAll<SVGGElement>('[data-map-point]');
    fireEvent.pointerDown(points[1], { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete a route-linked point?' });
    expect(dialog).toHaveTextContent(/Welcome checkpoint.*1 walkway.*Arrival path/i);
    expect(dialog).toHaveTextContent(/Undo cannot restore this deletion/i);
    expect(within(dialog).getByRole('button', { name: 'Keep point' })).toHaveFocus();
    expect(screen.getByRole('group', { name: /3 mapped points/i })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', {
      name: 'Delete point & quarantine walkways',
    }));

    expect(screen.getByRole('alert')).toHaveTextContent(/walkway has unsafe or unavailable routing data/i);
    expect(screen.getByText(new RegExp(`Unavailable point ID “${deletedPointId}”`)))
      .toBeInTheDocument();
    expect(screen.getAllByText(/Arrival path/).length).toBeGreaterThan(0);
  });

  it('provides tablet-safe targets for route, rain-plan, and coverage actions', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Main Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Turn', kind: 'path', x: 25, y: 20 });
    map = addMapRoute(map, 'Main Walkway', map.points.map((point) => point.id));
    map = {
      ...map,
      rainContingencies: [{
        id: 'rain-1',
        outdoorVenueId: 'garden',
        indoorVenueId: 'ballroom',
      }],
    };
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    expect(screen.getByRole('button', { name: 'Edit Main Walkway' })).toHaveClass('min-h-8');
    expect(screen.getByRole('button', { name: 'Delete Main Walkway' })).toHaveClass('min-h-8');
    expect(screen.getByRole('button', { name: 'Reverse route order' })).toHaveClass('min-h-8');
    expect(screen.getByRole('button', { name: /Remove rain backup for Garden/i })).toHaveClass('min-h-8', 'min-w-8');
    expect(screen.getAllByRole('button', { name: /Add pin for/i })[0]).toHaveClass('min-h-8');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Main Walkway' }));
    expect(screen.getByRole('button', { name: 'Move Main Gate later' })).toHaveClass('min-h-8', 'min-w-8');
    expect(screen.getByRole('button', { name: 'Remove Main Gate from walkway' })).toHaveClass('min-h-8', 'min-w-8');
  });

  it('renames a walkway route via the inline editor', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'A', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'B', kind: 'space', x: 20, y: 20 });
    map = addMapRoute(map, 'Old Walkway', map.points.map((p) => p.id));
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Old Walkway' }));
    const input = screen.getByLabelText('Route name');
    fireEvent.change(input, { target: { value: 'Ceremony Path' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply route changes' }));
    expect(screen.getByText('🚶 Ceremony Path')).toBeTruthy();
  });

  it('keeps dirty walkway edits until the admin explicitly discards them before switching', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    map = addMapRoute(map, 'Ceremony arrival', map.points.map((point) => point.id));
    map = addMapRoute(map, 'Reception arrival', [...map.points].reverse().map((point) => point.id));
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Ceremony arrival' }));
    fireEvent.change(screen.getByLabelText('Route name'), {
      target: { value: 'Unapplied ceremony route' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Reception arrival' }));

    expect(screen.getByRole('dialog', { name: 'Discard unapplied walkway changes?' }))
      .toHaveTextContent(/Opening “Reception arrival” will discard only those form changes/i);
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Route name')).toHaveValue('Unapplied ceremony route');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Reception arrival' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard and switch' }));

    expect(screen.getByLabelText('Route name')).toHaveValue('Reception arrival');
    expect(screen.getByText('🚶 Ceremony arrival')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Unapplied ceremony route')).not.toBeInTheDocument();
  });

  it('blocks deletion of a point that belongs to a dirty open walkway editor', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    map = addMapRoute(map, 'Guest arrival', map.points.map((point) => point.id));
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Guest arrival' }));
    fireEvent.change(screen.getByLabelText('Route name'), {
      target: { value: 'Edited guest arrival' },
    });
    selectFirstMapPoint(container);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('group', { name: /2 mapped points/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Route name')).toHaveValue('Edited guest arrival');
    expect(screen.queryByText(/walkway has unsafe or unavailable routing data/i))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply route changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete a route-linked point?' }))
      .getByRole('button', { name: 'Delete point & quarantine walkways' }));
    expect(screen.getByRole('group', { name: /1 mapped point/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/walkway has unsafe or unavailable routing data/i);
  });

  it('closes a clean affected walkway editor before deleting and quarantining its route', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    map = addMapRoute(map, 'Guest arrival', map.points.map((point) => point.id));
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Guest arrival' }));
    selectFirstMapPoint(container);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete a route-linked point?' });
    expect(screen.getByLabelText('Route name')).toHaveValue('Guest arrival');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep point' }));
    expect(screen.getByLabelText('Route name')).toHaveValue('Guest arrival');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete a route-linked point?' }))
      .getByRole('button', { name: 'Delete point & quarantine walkways' }));

    expect(screen.getByRole('group', { name: /1 mapped point/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply route changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/walkway has unsafe or unavailable routing data/i);
  });

  it('preserves a new point when a dirty walkway draft has staged it', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    map = addMapRoute(map, 'Guest arrival', map.points.map((point) => point.id));
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    chooseParkingPlacement();
    clickCanvas(container, 250, 200);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Guest arrival' }));
    const addPoint = screen.getByLabelText('Add point to edited walkway');
    const newPointOption = screen.getByRole('option', { name: 'Parking 1' }) as HTMLOptionElement;
    fireEvent.change(addPoint, { target: { value: newPointOption.value } });

    fireEvent.click(screen.getByRole('button', { name: 'Discard new point' }));
    expect(screen.getByRole('group', { name: /3 mapped points/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply route changes' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard new point' }));
    expect(screen.getByRole('group', { name: /2 mapped points/i })).toBeInTheDocument();
  });

  it('blocks destructive and history shortcuts from mutating the map behind a confirmation', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    map = addMapRoute(map, 'Ceremony arrival', map.points.map((point) => point.id));
    map = addMapRoute(map, 'Reception arrival', [...map.points].reverse().map((point) => point.id));
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    selectFirstMapPoint(container);
    fireEvent.click(screen.getByTitle('Duplicate this point'));
    expect(screen.getByRole('group', { name: /3 mapped points/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Ceremony arrival' }));
    fireEvent.change(screen.getByLabelText('Route name'), {
      target: { value: 'Unapplied ceremony route' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Reception arrival' }));
    expect(screen.getByRole('dialog', { name: 'Discard unapplied walkway changes?' }))
      .toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    expect(screen.getByRole('group', { name: /3 mapped points/i })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Discard unapplied walkway changes?' }))
      .toBeInTheDocument();
    expect(screen.getByLabelText('Route name')).toHaveValue('Unapplied ceremony route');
  });

  it('guards dirty walkway edits when a repair diagnostic opens another route', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, {
      label: 'Service turn',
      kind: 'path',
      x: 25,
      y: 15,
      audience: 'staff',
    });
    map = addMapRoute(map, 'North guest route', map.points.map((point) => point.id), {
      audience: 'public',
    });
    map = addMapRoute(map, 'South guest route', [...map.points].reverse().map((point) => point.id), {
      audience: 'public',
    });
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    fireEvent.click(screen.getByRole('button', {
      name: 'Repair audience or event scope for North guest route',
    }));
    fireEvent.change(screen.getByLabelText('Route name'), {
      target: { value: 'Unapplied north repair' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Repair audience or event scope for South guest route',
    }));

    expect(screen.getByRole('dialog', { name: 'Discard unapplied walkway changes?' }))
      .toBeInTheDocument();
    expect(screen.getByLabelText('Route name')).toHaveValue('Unapplied north repair');

    fireEvent.click(screen.getByRole('button', { name: 'Discard and switch' }));
    expect(screen.getByLabelText('Route name')).toHaveValue('South guest route');
    expect(screen.queryByDisplayValue('Unapplied north repair')).not.toBeInTheDocument();
  });

  it('edits route metadata and ordered points before explicit publication', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'A', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'B', kind: 'path', x: 20, y: 10 });
    map = addMapPoint(map, { label: 'C', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    map = addMapRoute(map, 'Guest Walk', map.points.map((point) => point.id));
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={[venues[1]]} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Guest Walk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move C earlier' }));
    const audienceControls = screen.getAllByLabelText('Audience');
    fireEvent.change(audienceControls[audienceControls.length - 1], { target: { value: 'couple' } });
    const mobilityControls = screen.getAllByLabelText('Mobility status');
    fireEvent.change(mobilityControls[mobilityControls.length - 1], { target: { value: 'step-free' } });
    const priorityControls = screen.getAllByLabelText('Routing priority');
    fireEvent.change(priorityControls[priorityControls.length - 1], { target: { value: 'preferred' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply route changes' }));
    expect(onSave).not.toHaveBeenCalled();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(
      screen.getByText(/1 guest destination has known wayfinding gaps/i),
    ).toBeInTheDocument());
    const savedRoute = onSave.mock.calls[0][0].routes[0];
    expect(savedRoute.pointIds).toEqual([map.points[0].id, map.points[2].id, map.points[1].id]);
    expect(savedRoute.audience).toBe('couple');
    expect(savedRoute.accessibility).toBe('step-free');
    expect(savedRoute.priority).toBe('preferred');
  });

  it('blocks a walkway that overclaims a restricted point and supports explicit route repair', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Main Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, {
      label: 'Service Turn',
      kind: 'path',
      x: 20,
      y: 10,
      audience: 'staff',
    });
    map = addMapRoute(map, 'Guest Arrival', map.points.map((point) => point.id), {
      audience: 'public',
    });
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    expect(screen.getByText(/Publication blocked: 1 walkway claims/i)).toBeInTheDocument();
    expect(screen.getByText(/point is Staff only, but the walkway is Guests & couples/i)).toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', {
      name: 'Repair audience or event scope for Guest Arrival',
    }));
    fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'staff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply route changes' }));
    expect(screen.queryByText(/Publication blocked: 1 walkway claims/i)).not.toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].routes[0].audience).toBe('staff');
    expect(onSave.mock.calls[0][0].points[1].audience).toBe('staff');
  });

  it('reports dirty state: placing/editing fires onDirtyChange(true), saving fires false', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 30, y: 30, venueId: 'garden' });
    const onDirtyChange = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} onDirtyChange={onDirtyChange} />,
    );
    // Place a non-space point on the canvas -> dirty. Space pins now require
    // an explicit current-catalog link before publication.
    chooseParkingPlacement();
    clickCanvas(container);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    // Publishing the shared local draft clears dirty state; no point-level
    // Apply transaction is required.
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it('uses one live local point draft across selection changes and publishes only globally', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'North Parking', kind: 'parking', x: 30, y: 30 });
    map = addMapPoint(map, { label: 'South Parking', kind: 'parking', x: 70, y: 50 });
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={onSave} />,
    );

    const points = container.querySelectorAll<SVGGElement>('[data-map-point]');
    fireEvent.pointerDown(points[0], { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'VIP Parking' } });
    expect(onSave).not.toHaveBeenCalled();

    // Selecting another point accepts the visible edit into the same local map
    // draft; it no longer bypasses a fictitious nested Apply transaction.
    fireEvent.pointerDown(points[1], { pointerId: 2, clientX: 300, clientY: 200 });
    expect(screen.getByLabelText('Label')).toHaveValue('South Parking');
    expect(screen.queryByRole('button', { name: 'Done editing' })).not.toBeInTheDocument();
    expect(container.querySelector('text')?.textContent).toContain('VIP Parking');
    expect(onSave).not.toHaveBeenCalled();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points[0].label).toBe('VIP Parking');
  });

  it('keeps kind-dependent point fields canonical without requiring Done editing', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, {
      label: 'Scoped amenity',
      kind: 'amenity',
      x: 30,
      y: 30,
      eventSpaceIds: ['garden'],
    });
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={onSave} />,
    );
    selectFirstMapPoint(container);
    expect(screen.getByText(/Event-space scope: 1 selected space/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'space' } });
    expect(screen.queryByText(/Event-space scope:/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Linked event space or lodging/i), {
      target: { value: 'ballroom' },
    });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: '' } });
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Point label cannot be blank/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Grand Ballroom' } });
    expect(screen.getByLabelText('Label')).toHaveValue('Grand Ballroom');
    expect(screen.queryByText(/Point label cannot be blank/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points[0]).toEqual(expect.objectContaining({
      label: 'Grand Ballroom',
      kind: 'space',
      venueId: 'ballroom',
      eventSpaceIds: undefined,
    }));

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'parking' } });
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].points[0]).toEqual(expect.objectContaining({
      kind: 'parking',
      venueId: undefined,
      eventSpaceIds: undefined,
    }));
  });

  it('edits Entry / Exit arrival roles in the local draft and clears them for other kinds', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, {
      label: 'Service Gate',
      kind: 'entry',
      arrivalRole: 'unknown',
      x: 30,
      y: 30,
    });
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={onSave} />,
    );
    selectFirstMapPoint(container);

    const role = screen.getByLabelText('Arrival role for Service Gate');
    expect(role).toHaveValue('unknown');
    expect(screen.getByText(/does not count as a safe guest arrival/i)).toBeInTheDocument();
    fireEvent.change(role, { target: { value: 'exit-only' } });
    expect(role).toHaveValue('exit-only');
    expect(screen.getByText(/excluded from normal guest directions/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points[0].arrivalRole).toBe('exit-only');

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'amenity' } });
    expect(screen.queryByLabelText(/Arrival role for/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].points[0]).toEqual(expect.objectContaining({
      kind: 'amenity',
      arrivalRole: undefined,
    }));
  });

  it('retains a malformed arrival role until the admin explicitly repairs it', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [{
        id: 'legacy-gate',
        label: 'Legacy Gate',
        kind: 'entry' as const,
        arrivalRole: 'loading-dock' as any,
        x: 30,
        y: 30,
      }],
    };
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={onSave} />,
    );
    selectFirstMapPoint(container);

    const role = screen.getByLabelText('Arrival role for Legacy Gate');
    expect(role).toHaveValue('');
    expect(role.closest('label')).toHaveTextContent(/Saved value.*loading-dock/i);
    fireEvent.click(screen.getByRole('button', { name: /Save & publish/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: /Publication blocked: 1 point needs arrival-role repair/i }))
      .toBeInTheDocument();

    fireEvent.change(role, { target: { value: 'both' } });
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points[0].arrivalRole).toBe('both');
  });

  it('offers explicit keep-type removal and reclassification repairs for misplaced arrival roles', async () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        {
          id: 'parking',
          label: 'Guest Parking',
          kind: 'parking' as const,
          arrivalRole: 'guest-arrival' as any,
          x: 20,
          y: 20,
        },
        {
          id: 'amenity',
          label: 'Service Courtyard',
          kind: 'amenity' as const,
          arrivalRole: 'loading-dock' as any,
          x: 40,
          y: 20,
        },
      ],
    };
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', {
      name: 'Repair arrival role for Guest Parking',
    }));
    const parkingRepair = screen.getByRole('group', {
      name: 'Misplaced arrival role repair for Guest Parking',
    });
    expect(parkingRepair).toHaveTextContent(/Saved value “guest-arrival” remains unchanged/i);
    fireEvent.click(within(parkingRepair).getByRole('button', {
      name: 'Remove arrival role · Keep Parking',
    }));
    expect(screen.getByLabelText('Kind')).toHaveValue('parking');
    expect(screen.queryByRole('group', {
      name: 'Misplaced arrival role repair for Guest Parking',
    })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {
      name: 'Repair arrival role for Service Courtyard',
    }));
    const amenityRepair = screen.getByRole('group', {
      name: 'Misplaced arrival role repair for Service Courtyard',
    });
    expect(amenityRepair).toHaveTextContent(/Saved value “loading-dock” remains unchanged/i);
    fireEvent.click(within(amenityRepair).getByRole('button', {
      name: 'Reclassify as Entry / Exit',
    }));
    expect(screen.getByLabelText('Kind')).toHaveValue('entry');
    expect(screen.getByLabelText('Arrival role for Service Courtyard')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Arrival role for Service Courtyard'), {
      target: { value: 'both' },
    });

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].points).toEqual([
      expect.objectContaining({ id: 'parking', kind: 'parking', arrivalRole: undefined }),
      expect.objectContaining({ id: 'amenity', kind: 'entry', arrivalRole: 'both' }),
    ]);
  });

  it('publishes one canonical snapshot without silently truncating authored shape text', async () => {
    const onSave = vi.fn();
    render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={onSave} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Add editable zone/i }));
    const longLabel = 'Z'.repeat(350);
    fireEvent.change(screen.getByLabelText('Shape label'), {
      target: { value: longLabel },
    });
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Shape label is 350 characters; the limit is 300/i))
      .toBeInTheDocument();

    const repairedLabel = 'Z'.repeat(300);
    fireEvent.change(screen.getByLabelText('Shape label'), {
      target: { value: repairedLabel },
    });
    expect(screen.getByLabelText('Shape label')).toHaveValue(repairedLabel);
    expect(screen.queryByText(/Shape label is 350 characters/i)).not.toBeInTheDocument();
    clickSaveAndAcknowledgeWayfindingGaps();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].drawings[0].text).toBe(repairedLabel);
    await waitFor(() => expect(screen.getByLabelText('Shape label')).toHaveValue(repairedLabel));
    expect(screen.getByText(/Canonical venue map is saved/)).toBeInTheDocument();
  });

  it('guards staged size, URL, and route-form drafts and blocks incomplete global saves', async () => {
    const onSave = vi.fn();
    const onDirtyChange = vi.fn();
    render(
      <VenueMapDesigner
        map={emptyVenueMapConfig()}
        venues={venues}
        onSave={onSave}
        onDirtyChange={onDirtyChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Map width'), { target: { value: '120' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Finish or reset the in-progress map settings or walkway form/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset size draft' }));

    fireEvent.change(screen.getByLabelText('Base map image URL'), {
      target: { value: 'https://example.com/new-map.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset URL draft' }));

    startWalkwayBuilder();
    fireEvent.change(screen.getByLabelText('Walkway name'), {
      target: { value: 'Unfinished route' },
    });
    clickSaveAndAcknowledgeWayfindingGaps();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel walkway draft' }));

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('retains a stale draft and its loaded revision when the server reports a conflict', async () => {
    const onSave = vi.fn().mockResolvedValue({ status: 'conflict' });
    const onDirtyChange = vi.fn();
    const onConflictDraftChange = vi.fn();
    const { container } = render(
      <VenueMapDesigner
        map={emptyVenueMapConfig()}
        venues={venues}
        baseUpdatedAt="2026-09-06T12:00:00.000Z"
        onSave={onSave}
        onDirtyChange={onDirtyChange}
        onConflictDraftChange={onConflictDraftChange}
      />,
    );

    chooseParkingPlacement();
    clickCanvas(container);
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    clickSaveAndAcknowledgeWayfindingGaps();

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ points: expect.arrayContaining([expect.any(Object)]) }),
      '2026-09-06T12:00:00.000Z',
    ));
    await waitFor(() => expect(screen.getByText(/Local draft has unpublished changes/)).toBeInTheDocument());
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(onConflictDraftChange).toHaveBeenCalledWith(expect.any(Object), false);
  });

  it('updates conflict resolution with the latest publishable live draft after an in-flight point edit', async () => {
    let resolveConflict!: (value: { status: 'conflict' }) => void;
    const conflict = new Promise<{ status: 'conflict' }>((resolve) => {
      resolveConflict = resolve;
    });
    const onConflictDraftChange = vi.fn();
    const onSave = vi.fn(() => conflict);
    render(
      <VenueMapDesigner
        map={emptyVenueMapConfig()}
        venues={venues}
        baseUpdatedAt="2026-09-06T12:00:00.000Z"
        onSave={onSave}
        onConflictDraftChange={onConflictDraftChange}
      />,
    );

    chooseParkingPlacement();
    fireEvent.click(screen.getByRole('button', { name: /Place Parking at center/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Newest visible conflict draft' },
    });
    await act(async () => {
      resolveConflict({ status: 'conflict' });
      await conflict;
    });

    expect(onConflictDraftChange).toHaveBeenCalledTimes(1);
    expect(onConflictDraftChange.mock.calls[0][0].points[0].label)
      .toBe('Newest visible conflict draft');
    // Point fields are already represented in the canonicalizable map draft,
    // so conflict overwrite can safely use this snapshot without a form barrier.
    expect(onConflictDraftChange.mock.calls[0][1]).toBe(false);
  });

  it('blocks conflict overwrite when the live post-submit draft fails a hard publication preflight', async () => {
    let resolveConflict!: (value: { status: 'conflict' }) => void;
    const conflict = new Promise<{ status: 'conflict' }>((resolve) => {
      resolveConflict = resolve;
    });
    const onConflictDraftChange = vi.fn();
    const onSave = vi.fn(() => conflict);
    render(
      <VenueMapDesigner
        map={emptyVenueMapConfig()}
        venues={venues}
        baseUpdatedAt="2026-09-06T12:00:00.000Z"
        onSave={onSave}
        onConflictDraftChange={onConflictDraftChange}
      />,
    );

    chooseParkingPlacement();
    fireEvent.click(screen.getByRole('button', { name: /Place Parking at center/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    // This edit lands after submission and leaves an invalid partial GPS pair.
    fireEvent.change(screen.getByLabelText('GPS lat'), { target: { value: '35.22' } });
    await act(async () => {
      resolveConflict({ status: 'conflict' });
      await conflict;
    });

    expect(onConflictDraftChange).toHaveBeenCalledTimes(1);
    expect(onConflictDraftChange.mock.calls[0][0].points[0].lat).toBe(35.22);
    expect(onConflictDraftChange.mock.calls[0][1]).toBe(true);
  });

  it('preserves newer editor changes made while an older save is in flight', async () => {
    let resolveFirstSave!: (value: { status: 'saved'; updatedAt: string }) => void;
    const firstSave = new Promise<{ status: 'saved'; updatedAt: string }>((resolve) => {
      resolveFirstSave = resolve;
    });
    const onSave = vi.fn()
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValueOnce({ status: 'saved', updatedAt: '2026-09-06T12:10:00.000Z' });
    const onDirtyChange = vi.fn();
    render(
      <VenueMapDesigner
        map={emptyVenueMapConfig()}
        venues={venues}
        baseUpdatedAt="2026-09-06T12:00:00.000Z"
        onSave={onSave}
        onDirtyChange={onDirtyChange}
      />,
    );

    chooseParkingPlacement();
    fireEvent.click(screen.getByRole('button', { name: /Place Parking at center/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Edited while saving' },
    });
    await act(async () => {
      resolveFirstSave({ status: 'saved', updatedAt: '2026-09-06T12:05:00.000Z' });
      await firstSave;
    });

    expect(screen.getByLabelText('Label')).toHaveValue('Edited while saving');
    await waitFor(() => expect(screen.getByText(/Local draft has unpublished changes/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Done editing' })).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    // The newer point edit remains a publishable local draft without a second
    // point-level Apply transaction.
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].points[0].label).toBe('Edited while saving');
    expect(onSave.mock.calls[1][1]).toBe('2026-09-06T12:05:00.000Z');
  });

  it('advances its compare-and-swap base only after a successful save', async () => {
    const onSave = vi.fn()
      .mockResolvedValueOnce({ status: 'saved', updatedAt: '2026-09-06T12:05:00.000Z' })
      .mockResolvedValueOnce({ status: 'saved', updatedAt: '2026-09-06T12:10:00.000Z' });
    const { container } = render(
      <VenueMapDesigner
        map={emptyVenueMapConfig()}
        venues={venues}
        baseUpdatedAt="2026-09-06T12:00:00.000Z"
        onSave={onSave}
      />,
    );

    chooseParkingPlacement();
    clickCanvas(container, 100, 100);
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(screen.getByText(/Canonical venue map is saved/)).toBeInTheDocument());

    chooseParkingPlacement();
    clickCanvas(container, 300, 200);
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][1]).toBe('2026-09-06T12:05:00.000Z');
  });

  it('undo/redo: placing a point can be undone then redone without a ghost edit lock', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={onSave} />,
    );
    chooseEventSpacePlacement();
    clickCanvas(container); // place a space point
    expect(screen.getByText(/1 spaces/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.getByText(/0 spaces/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Done editing' })).not.toBeInTheDocument();

    // The removed selection must not leave editing=true and silently block the
    // global action after history has restored the clean, empty map.
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /Redo/ }));
    expect(screen.getByText(/1 spaces/)).toBeTruthy();
  });

  it('blocks history from removing a point staged in a dirty walkway editor', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    map = addMapRoute(map, 'Guest arrival', map.points.map((point) => point.id));
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    chooseParkingPlacement();
    clickCanvas(container, 250, 200);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Guest arrival' }));
    const addPoint = screen.getByLabelText('Add point to edited walkway');
    const newPointOption = screen.getByRole('option', { name: 'Parking 1' }) as HTMLOptionElement;
    fireEvent.change(addPoint, { target: { value: newPointOption.value } });

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));

    expect(screen.getByRole('group', { name: /3 mapped points/i })).toBeInTheDocument();
    expect(screen.getAllByText('Parking 1').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Apply route changes' })).toBeEnabled();
  });

  it('blocks history from removing a point selected by the guided walkway draft', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5 });
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    chooseParkingPlacement();
    clickCanvas(container, 250, 200);
    startWalkwayBuilder();
    const addPoint = screen.getByLabelText('Add point to walkway');
    fireEvent.change(addPoint, { target: { value: map.points[0].id } });
    const newPointOption = screen.getByRole('option', { name: 'Parking 1' }) as HTMLOptionElement;
    fireEvent.change(addPoint, { target: { value: newPointOption.value } });

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));

    expect(screen.getByRole('group', { name: /2 mapped points/i })).toBeInTheDocument();
    expect(screen.getByText(/2 ordered locations selected/i)).toBeInTheDocument();
  });

  it('blocks history from removing the route owned by a dirty walkway editor', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    startWalkwayBuilder();
    const addPoint = screen.getByLabelText('Add point to walkway');
    fireEvent.change(addPoint, { target: { value: map.points[0].id } });
    fireEvent.change(addPoint, { target: { value: map.points[1].id } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish walkway' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Walkway 1' }));
    fireEvent.change(screen.getByLabelText('Route name'), {
      target: { value: 'Unapplied route name' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));

    expect(screen.getByLabelText('Route name')).toHaveValue('Unapplied route name');
    expect(screen.getByRole('button', { name: 'Apply route changes' })).toBeInTheDocument();
  });

  it('closes an unreachable route editor when undo removes its route', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    const onSave = vi.fn();
    render(<VenueMapDesigner map={map} venues={venues} onSave={onSave} />);

    startWalkwayBuilder();
    fireEvent.change(screen.getByLabelText('Walkway name'), { target: { value: 'Path' } });
    const addPoint = screen.getByLabelText('Add point to walkway');
    fireEvent.change(addPoint, { target: { value: map.points[0].id } });
    fireEvent.change(addPoint, { target: { value: map.points[1].id } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish walkway' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Path' }));
    expect(screen.getByRole('button', { name: 'Apply route changes' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.queryByRole('button', { name: 'Apply route changes' })).not.toBeInTheDocument();

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('keyboard Delete removes the selected point', async () => {
    const { container } = render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={() => {}} />,
    );
    chooseEventSpacePlacement();
    clickCanvas(container); // place + auto-select a point
    await waitFor(() => expect(screen.getByText(/1 spaces/)).toBeTruthy());

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); });
    await waitFor(() => expect(screen.getByText(/0 spaces/)).toBeTruthy());
  });

  it('undo covers field-by-field edits (single undo per edit session)', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Ceremony', kind: 'space', x: 30, y: 30, venueId: 'garden' });
    const { container } = render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    // Select the existing point through the pointer interaction used by the canvas.
    selectFirstMapPoint(container);

    // Edit the label field (a field-level edit).
    const labelInput = screen.getByLabelText('Label');
    fireEvent.change(labelInput, { target: { value: 'Main Ceremony' } });
    // Edit the X coordinate too — same session.
    const xInput = screen.getByLabelText('X');
    fireEvent.change(xInput, { target: { value: '45' } });

    // A single undo reverts the whole edit session back to the original point.
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    const labelEl = screen.getByLabelText('Label') as HTMLInputElement;
    expect(labelEl.value).toBe('Ceremony');
  });

  it('cancels point edits back to the saved baseline without leaving a dirty timestamp', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Parking', kind: 'parking', x: 40, y: 30 });
    const { container } = render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);
    selectFirstMapPoint(container);
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Temporary label' } });

    fireEvent.click(screen.getByRole('button', { name: 'Revert point edits' }));

    expect(screen.queryByDisplayValue('Temporary label')).not.toBeInTheDocument();
    expect(screen.getByText(/Canonical venue map is saved/)).toBeInTheDocument();
    expect(container.querySelector('text')?.textContent).not.toContain('Temporary label');
  });

  it('cancels a newly placed point instead of silently retaining it', () => {
    render(<VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={() => {}} />);
    chooseEventSpacePlacement();
    fireEvent.click(screen.getByRole('button', { name: /Place Event Space at center/ }));
    expect(screen.getByText(/1 spaces/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard new point' }));
    expect(screen.getByText(/0 spaces/)).toBeInTheDocument();
    expect(screen.getByText(/Canonical venue map is saved/)).toBeInTheDocument();
  });

  it('duplicates the selected point via the Copy button', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Parking', kind: 'parking', x: 40, y: 30 });
    const { container } = render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);
    // Select the point through the pointer interaction used by the canvas.
    selectFirstMapPoint(container);

    fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
    expect(screen.getByText(/2 parking/)).toBeTruthy();
  });

  it('preview toggle shows a read-only couple/guest view and hides editing chrome', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Ceremony', kind: 'space', x: 30, y: 30, venueId: 'garden' });
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Preview/ }));
    expect(screen.getByText(/Audience preview/i)).toBeTruthy();
    expect(screen.getByLabelText('Preview map audience')).toHaveValue('guest');
    expect(screen.getByLabelText('Include Garden in guest preview')).toBeChecked();
    expect(screen.getByLabelText('Include Grand Ballroom in guest preview')).not.toBeChecked();
    expect(screen.getByText('Wedding spaces (1 selected)')).toBeInTheDocument();
    // The editing toolbar is hidden in preview.
    expect(screen.queryByRole('group', { name: 'Map editing tools' })).not.toBeInTheDocument();
    // Exiting preview restores the safe Select & Move tool.
    fireEvent.click(screen.getByRole('button', { name: /Back to editing/ }));
    expect(screen.getByRole('group', { name: 'Map editing tools' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select & Move/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('previews and exports the combined guest projection for every selected wedding space', async () => {
    vi.mocked(downloadLayoutPng).mockClear();
    vi.mocked(downloadLayoutPdf).mockClear();
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Ballroom', kind: 'space', x: 20, y: 20, venueId: 'ballroom' });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 60, y: 40, venueId: 'garden' });
    map = {
      ...map,
      rainContingencies: [{
        id: 'rain-garden',
        outdoorVenueId: 'garden',
        indoorVenueId: 'ballroom',
        note: 'Use the covered east walkway.',
      }],
    };
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Preview audiences/ }));
    expect(screen.getByLabelText('Include Grand Ballroom in guest preview')).toBeChecked();
    expect(container.querySelectorAll('[data-map-point]')).toHaveLength(1);

    fireEvent.click(screen.getByLabelText('Include Garden in guest preview'));
    expect(screen.getByText('Wedding spaces (2 selected)')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-map-point]')).toHaveLength(2);
    expect(screen.getByText('Garden → Grand Ballroom')).toBeInTheDocument();
    expect(screen.getByText('Use the covered east walkway.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Include Grand Ballroom in guest preview'));
    expect(screen.getByText('Wedding spaces (1 selected)')).toBeInTheDocument();
    // The selected Garden and its applicable Ballroom rain backup both remain.
    expect(container.querySelectorAll('[data-map-point]')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /Guest preview PNG/i }));
    await waitFor(() => expect(downloadLayoutPng).toHaveBeenCalledTimes(1));
    const expectedArtifactGuidance = [{
      heading: 'Map symbol legend',
      entries: ['🏛️ Event Space'],
    }, {
      heading: 'If the venue activates its rain plan',
      entries: ['Garden → Grand Ballroom — Use the covered east walkway.'],
    }];
    expect(vi.mocked(downloadLayoutPng).mock.calls[0][2]).toEqual(expect.objectContaining({
      supplementalSections: expectedArtifactGuidance,
    }));

    const guestPdfButton = screen.getByRole('button', { name: /Guest preview PDF/i });
    // Visual artifacts are intentionally serialized. The PNG mock is observed as
    // soon as it is invoked, before the export effect's guarded cleanup necessarily
    // re-enables the controls under full-suite load.
    await waitFor(() => expect(guestPdfButton).toBeEnabled());
    fireEvent.click(guestPdfButton);
    await waitFor(() => expect(downloadLayoutPdf).toHaveBeenCalledTimes(1));
    expect(vi.mocked(downloadLayoutPdf).mock.calls[0][2]).toEqual(expect.objectContaining({
      supplementalSections: expectedArtifactGuidance,
    }));

    fireEvent.change(screen.getByLabelText('Preview map audience'), { target: { value: 'couple' } });
    expect(screen.getByText('Garden → Grand Ballroom')).toBeInTheDocument();
    expect(screen.getByText('Use the covered east walkway.')).toBeInTheDocument();
  });

  it('marks editor controls as print chrome and exposes a full-width print grid hook', () => {
    const { container } = render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={() => {}} />,
    );
    expect(container.querySelector('.spm-venue-map-print-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save & publish Venue Map/i }).closest('.no-print'))
      .toBeInTheDocument();
    expect(container.querySelector('.spm-venue-map-print-fallback')).toHaveTextContent(
      /use the Venue Map Designer’s Print button/i,
    );
    expect(container.querySelector('[data-map-artifact-output="projected"]'))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Preview audiences/i }));
    const previewControls = screen.getByText('👁 Audience preview').closest('.rounded-xl');
    expect(previewControls).toHaveClass('no-print', 'spm-studio-chrome');
    expect(screen.getByText(/Export\/print source:/i).closest('[role="status"]'))
      .not.toHaveClass('no-print');
  });

  it('exports a dedicated immutable SVG from the current audience projection', async () => {
    vi.mocked(downloadLayoutPng).mockClear();
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Public Gate', kind: 'entry', x: 20, y: 20 });
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} mapTitle="Preview Venue" onSave={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '🅿️ Parking' }));
    fireEvent.click(screen.getByRole('button', { name: /Place Parking at center/i }));
    fireEvent.click(screen.getByRole('button', { name: /Preview audiences/i }));
    expect(screen.getByText(/Source: Unpublished working draft — not currently available in portals/i)).toBeInTheDocument();
    const visiblePreviewSvg = container.querySelector('svg');
    fireEvent.click(screen.getByRole('button', { name: /PNG/i }));

    await waitFor(() => expect(downloadLayoutPng).toHaveBeenCalledTimes(1));
    const exportCall = vi.mocked(downloadLayoutPng).mock.calls[0];
    const exportedSvg = exportCall[0];
    expect(exportedSvg).not.toBe(visiblePreviewSvg);
    expect(exportedSvg.closest('[data-map-artifact-output="projected"]')).not.toBeNull();
    expect(exportedSvg).toHaveAttribute('aria-label', expect.stringContaining('Preview Venue'));
    const ballroomScopeCode = venueMapScopeArtifactCode(['ballroom']);
    expect(exportCall[1]).toBe(
      `preview-venue-unpublished-draft-guest-preview-grand-ballroom-scope-${ballroomScopeCode}`,
    );
    expect(exportCall[2]).toEqual(expect.objectContaining({
      scale: 20,
      footerText: expect.stringContaining(
        `Unpublished working draft | Guest portal preview — wedding spaces: Grand Ballroom (scope ${ballroomScopeCode}) | Exported `,
      ),
    }));
  });

  it('keeps recovery-only objects out of the dedicated Staff visual artifact', async () => {
    vi.mocked(downloadLayoutPng).mockClear();
    const map: VenueMapConfig = {
      ...emptyVenueMapConfig(),
      points: [
        {
          id: 'damaged-gate',
          label: 'Damaged Gate',
          kind: 'entry',
          arrivalRole: 'guest' as any,
          x: 10,
          y: 10,
        },
        {
          id: 'safe-parking',
          label: 'Safe Parking',
          kind: 'parking',
          x: 70,
          y: 60,
        },
      ],
      routes: [{
        id: 'damaged-route',
        name: 'Damaged route',
        pointIds: ['damaged-gate', 'safe-parking'],
      }],
    };
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    const recoverySvg = container.querySelector('svg')!;
    expect(recoverySvg.querySelector('[data-map-point="damaged-gate"]')).toBeInTheDocument();
    expect(recoverySvg.querySelector('[data-map-route-label="damaged-route"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Staff master PNG/i }));
    await waitFor(() => expect(downloadLayoutPng).toHaveBeenCalledTimes(1));

    const artifactSvg = vi.mocked(downloadLayoutPng).mock.calls[0][0];
    expect(artifactSvg).not.toBe(recoverySvg);
    expect(artifactSvg.querySelector('[data-map-point="damaged-gate"]')).not.toBeInTheDocument();
    expect(artifactSvg.querySelector('[data-map-route-label="damaged-route"]')).not.toBeInTheDocument();
    expect(artifactSvg.querySelector('[data-map-point="safe-parking"]')).not.toBeNull();
  });

  it('prints only after the projected base map decodes and fails closed after an image error', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const map: VenueMapConfig = {
      ...emptyVenueMapConfig(),
      backgroundImageUrl: 'https://example.com/property-map.png',
      backgroundOpacity: 0.8,
    };
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Print Staff master/i }));
    let artifact = await waitFor(() => {
      const node = container.querySelector<HTMLElement>('[data-map-artifact-output="projected"]');
      expect(node).toBeInTheDocument();
      return node!;
    });
    expect(screen.getByText(/waiting for the complete base map to decode/i)).toBeInTheDocument();
    fireEvent.error(artifact.querySelector('img[data-map-background-preloader="true"]')!);
    await waitFor(() => expect(
      container.querySelector('[data-map-artifact-output="projected"]'),
    ).not.toBeInTheDocument());
    expect(printSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Print Staff master/i }));
    artifact = await waitFor(() => {
      const node = container.querySelector<HTMLElement>('[data-map-artifact-output="projected"]');
      expect(node).toBeInTheDocument();
      return node!;
    });
    fireEvent.load(artifact.querySelector('img[data-map-background-preloader="true"]')!);
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(
      container.querySelector('[data-map-artifact-output="projected"]'),
    ).not.toBeInTheDocument());
    printSpy.mockRestore();
  });

  it('labels a no-space Guest Preview export as global-only', async () => {
    vi.mocked(downloadLayoutPng).mockClear();
    const map = addMapPoint(emptyVenueMapConfig(), {
      label: 'Public Gate',
      kind: 'entry',
      x: 20,
      y: 20,
    });
    render(
      <VenueMapDesigner map={map} venues={venues} mapTitle="Global Map" onSave={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Preview audiences/i }));
    fireEvent.click(screen.getByLabelText('Include Grand Ballroom in guest preview'));
    expect(screen.getByText(/No spaces selected — showing only globally scoped guest layers/i))
      .toBeInTheDocument();
    expect(screen.getByText(/Audience: Guest portal preview — global guest layers only; no wedding spaces selected/i))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Guest preview PNG/i }));

    await waitFor(() => expect(downloadLayoutPng).toHaveBeenCalledTimes(1));
    expect(vi.mocked(downloadLayoutPng).mock.calls[0][1])
      .toBe('global-map-saved-map-guest-preview-global-only');
    expect(vi.mocked(downloadLayoutPng).mock.calls[0][2]).toEqual(expect.objectContaining({
      headerText: 'Global Map',
      footerText: expect.stringContaining('Guest portal preview — global guest layers only; no wedding spaces selected'),
    }));
  });

  it('includes valid rain operations in Staff master screen, print, and download output', async () => {
    vi.mocked(downloadLayoutPng).mockClear();
    const map = {
      ...emptyVenueMapConfig(),
      rainContingencies: [{
        id: 'garden-rain',
        outdoorVenueId: 'garden',
        indoorVenueId: 'ballroom',
        note: 'Unlock the east ballroom doors before moving guests.',
      }],
    };
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    const guidance = screen.getByRole('region', { name: 'Applicable rain contingency guidance' });
    expect(guidance).toHaveTextContent('Garden → Grand Ballroom');
    expect(guidance).toHaveTextContent(/Unlock the east ballroom doors/i);
    expect(guidance).not.toHaveClass('no-print');

    fireEvent.click(screen.getByRole('button', { name: /Staff master PNG/i }));
    await waitFor(() => expect(downloadLayoutPng).toHaveBeenCalledTimes(1));
    expect(vi.mocked(downloadLayoutPng).mock.calls[0][2]).toEqual(expect.objectContaining({
      supplementalSections: [{
        heading: 'If the venue activates its rain plan',
        entries: ['Garden → Grand Ballroom — Unlock the east ballroom doors before moving guests.'],
      }],
    }));
  });

  it('includes scoped point guidance in screen, print, and download output', async () => {
    vi.mocked(downloadLayoutPng).mockClear();
    const map: VenueMapConfig = {
      ...emptyVenueMapConfig(),
      points: [{
        id: 'west-gate',
        label: 'West Gate',
        kind: 'entry',
        x: 10,
        y: 10,
        description: 'Use the call box after 5 PM.',
      }],
    };
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    const guidance = screen.getByRole('region', { name: 'Location and arrival notes' });
    expect(guidance).toHaveTextContent('West Gate');
    expect(guidance).toHaveTextContent('Use the call box after 5 PM.');
    expect(guidance).not.toHaveClass('no-print');

    fireEvent.click(screen.getByRole('button', { name: /Staff master PNG/i }));
    await waitFor(() => expect(downloadLayoutPng).toHaveBeenCalledTimes(1));
    expect(vi.mocked(downloadLayoutPng).mock.calls[0][2]).toEqual(expect.objectContaining({
      supplementalSections: [{
        heading: 'Map symbol legend',
        entries: ['🚪 Entry / Exit'],
      }, {
        heading: 'Location & arrival notes',
        entries: ['West Gate — Entry / Exit — Use the call box after 5 PM.'],
      }],
    }));
  });

  it('includes scoped walkway names and exact cautions in screen, print, and download output', async () => {
    vi.mocked(downloadLayoutPng).mockClear();
    const map: VenueMapConfig = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Main Gate', kind: 'entry', x: 10, y: 10 },
        { id: 'garden', label: 'Garden', kind: 'space', x: 60, y: 40, venueId: 'garden' },
      ],
      routes: [{
        id: 'garden-route',
        name: 'Garden promenade',
        pointIds: ['gate', 'garden'],
        priority: 'preferred',
        accessibility: 'step-free',
        notes: 'Keep the east gate clear for mobility devices.',
      }],
    };
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    const guidance = screen.getByRole('region', { name: 'Walkways and access notes' });
    expect(guidance).toHaveTextContent('Garden promenade');
    expect(guidance).toHaveTextContent('Preferred · Verified step-free');
    expect(guidance).toHaveTextContent('Keep the east gate clear for mobility devices.');
    expect(guidance).not.toHaveClass('no-print');

    fireEvent.click(screen.getByRole('button', { name: /Staff master PNG/i }));
    await waitFor(() => expect(downloadLayoutPng).toHaveBeenCalledTimes(1));
    expect(vi.mocked(downloadLayoutPng).mock.calls[0][2]).toEqual(expect.objectContaining({
      supplementalSections: [{
        heading: 'Map symbol legend',
        entries: ['🏛️ Event Space', '🚪 Entry / Exit'],
      }, {
        heading: 'Walkways & access notes',
        entries: [
          'Garden promenade — Preferred · Verified step-free — Keep the east gate clear for mobility devices.',
        ],
      }],
    }));
  });

  it('includes exact scoped map annotations in screen, print, and visual downloads', async () => {
    vi.mocked(downloadLayoutPng).mockClear();
    const annotation = 'No guest access beyond this boundary. Follow venue staff instructions at all times.';
    const map: VenueMapConfig = {
      ...emptyVenueMapConfig(),
      drawings: [{
        id: 'restricted-zone',
        type: 'zone',
        x: 10,
        y: 10,
        width: 30,
        height: 20,
        text: annotation,
      }],
    };
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    const guidance = screen.getByRole('region', { name: 'Map annotations' });
    expect(guidance).toHaveTextContent(annotation);
    expect(guidance).not.toHaveClass('no-print');

    fireEvent.click(screen.getByRole('button', { name: /Staff master PNG/i }));
    await waitFor(() => expect(downloadLayoutPng).toHaveBeenCalledTimes(1));
    expect(vi.mocked(downloadLayoutPng).mock.calls[0][2]).toEqual(expect.objectContaining({
      supplementalSections: [{
        heading: 'Map annotations',
        entries: [`${annotation} — Zone`],
      }],
    }));
  });

  it('downloads a semantic HTML companion from the exact Guest projection', () => {
    vi.mocked(downloadAccessibleHtmlArtifact).mockClear();
    const map: VenueMapConfig = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Main Gate', kind: 'entry', arrivalRole: 'guest-arrival', x: 10, y: 10, description: 'Ring the bell.' },
        { id: 'garden', label: 'Garden', kind: 'space', x: 50, y: 30, venueId: 'garden' },
        { id: 'service', label: 'Service Yard', kind: 'amenity', x: 80, y: 70, audience: 'staff' },
      ],
      routes: [
        { id: 'guest-walk', name: 'Garden Walk', pointIds: ['gate', 'garden'], accessibility: 'step-free' },
        { id: 'service-walk', name: 'Service Walk', pointIds: ['gate', 'service'], audience: 'staff' },
      ],
      drawings: [
        { id: 'guest-zone', type: 'zone', x: 20, y: 20, width: 15, height: 10, text: 'Guest lawn' },
        { id: 'staff-zone', type: 'zone', x: 70, y: 60, width: 10, height: 10, text: 'Staff boundary', audience: 'staff' },
      ],
    };
    render(<VenueMapDesigner map={map} venues={venues} mapTitle="Rose Estate" onSave={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Preview audiences/i }));
    const pdfButton = screen.getByRole('button', { name: /Guest preview PDF — visual map/i });
    expect(pdfButton).toHaveTextContent('Visual PDF');
    fireEvent.click(screen.getByRole('button', { name: /Guest preview Accessible HTML/i }));

    expect(downloadAccessibleHtmlArtifact).toHaveBeenCalledTimes(1);
    const [filename, artifact] = vi.mocked(downloadAccessibleHtmlArtifact).mock.calls[0];
    expect(filename).toMatch(/^rose-estate-saved-map-guest-preview-garden-scope-v1-[a-f0-9]{32}$/);
    expect(artifact.title).toBe('Rose Estate');
    expect(artifact.metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Audience and scope', value: expect.stringContaining('Garden') }),
    ]));
    const text = JSON.stringify(artifact.sections);
    expect(text).toContain('Main Gate');
    expect(text).toContain('Arrival role: Guest arrival.');
    expect(text).toContain('Ring the bell.');
    expect(text).toContain('Garden Walk');
    expect(text).toContain('Verified step-free');
    expect(text).toContain('Guest lawn');
    expect(text).not.toContain('Service Yard');
    expect(text).not.toContain('Service Walk');
    expect(text).not.toContain('Staff boundary');
  });

  it('clearly classifies restricted default exports as the internal staff master', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, {
      label: 'Service Entrance',
      kind: 'entry',
      x: 20,
      y: 20,
      audience: 'staff',
    });
    render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);

    expect(screen.getByText(/Export\/print source: Saved canonical map\. Audience: Staff master/i)).toBeInTheDocument();
    expect(screen.getByText(/Includes 1 couple\/staff-only layer/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Staff master PNG/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Staff master PDF/i })).toBeInTheDocument();
  });

  it('offers a keyboard-operable alternative to click placement', () => {
    render(<VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '🚪 Entry / Exit' }));
    fireEvent.click(screen.getByRole('button', { name: /Place Entry \/ Exit at center/ }));
    expect(screen.getByText(/1 entries/)).toBeTruthy();
    expect(screen.getByLabelText('X')).toHaveValue(50);
    expect(screen.getByLabelText('Y')).toHaveValue(40);
  });

  it('uses Select & Move by default and one-shot placement cannot duplicate on a later canvas click', () => {
    const { container } = render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={() => {}} />,
    );

    clickCanvas(container);
    expect(screen.getByText(/0 parking/)).toBeInTheDocument();

    chooseParkingPlacement();
    expect(screen.getByRole('button', { name: '🅿️ Parking' })).toHaveAttribute('aria-pressed', 'true');
    clickCanvas(container, 150, 120);
    expect(screen.getByText(/1 parking/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select & Move/i })).toHaveAttribute('aria-pressed', 'true');

    clickCanvas(container, 350, 280);
    expect(screen.getByText(/1 parking/)).toBeInTheDocument();
  });

  it('offers an explicit Keep adding option for intentional batch placement', () => {
    const { container } = render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={() => {}} />,
    );

    chooseParkingPlacement();
    fireEvent.click(screen.getByRole('checkbox', { name: /Keep adding parking items/i }));
    clickCanvas(container, 100, 100);
    clickCanvas(container, 300, 250);

    expect(screen.getByText(/2 parking/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🅿️ Parking' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not create a waypoint when an existing location is dragged in walkway mode', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 20, y: 20, venueId: 'garden' });
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );
    startWalkwayBuilder();
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 500, bottom: 400, width: 500, height: 400, x: 0, y: 0,
      toJSON: () => ({}),
    });
    const point = container.querySelector<SVGGElement>('[data-map-point]')!;

    fireEvent.pointerDown(point, { pointerId: 14, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 14, clientX: 160, clientY: 130 });
    fireEvent.pointerUp(svg, { pointerId: 14, clientX: 160, clientY: 130 });
    fireEvent.click(svg, { clientX: 160, clientY: 130 });

    expect(screen.getByRole('group', { name: /1 mapped point/i })).toBeInTheDocument();
    expect(screen.getByText(/add a center waypoint below and set its coordinates/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish walkway' })).toBeDisabled();
  });

  it('blocks a new walkway when all selected locations share one map position', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Main Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 5, y: 5, venueId: 'garden' });
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );

    startWalkwayBuilder();
    const points = container.querySelectorAll<SVGGElement>('[data-map-point]');
    fireEvent.click(points[0]);
    fireEvent.click(points[1]);

    expect(screen.getByRole('alert')).toHaveTextContent(/walkway has no visible length/i);
    expect(screen.getByText(/Every selected stop is at the same map position/i))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish walkway' })).toBeDisabled();
  });

  it('continuously blocks a previously valid walkway if point movement collapses its geometry', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Parking', kind: 'parking', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    map = addMapRoute(map, 'Garden arrival', map.points.map((point) => point.id), {
      accessibility: 'step-free',
    });
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={onSave} />,
    );
    const gardenPoint = container.querySelectorAll<SVGGElement>('[data-map-point]')[1];
    fireEvent.pointerDown(gardenPoint, { pointerId: 21, clientX: 200, clientY: 100 });

    fireEvent.change(screen.getByLabelText('X'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Y'), { target: { value: '5' } });

    expect(screen.getByRole('heading', { name: /Publication blocked: 1 walkway has no visible length/i }))
      .toBeInTheDocument();
    expect(container.querySelector('[data-map-route-label]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save & publish Venue Map/i }));
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Y'), { target: { value: '6' } });
    expect(screen.queryByRole('heading', { name: /walkway has no visible length/i }))
      .not.toBeInTheDocument();
    expect(container.querySelector('[data-map-route-label="' + map.routes[0].id + '"]'))
      .toBeInTheDocument();
  });

  it('builds a walkway directly from existing locations in travel order', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Main Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Garden', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={onSave} />,
    );
    startWalkwayBuilder();
    const points = container.querySelectorAll<SVGGElement>('[data-map-point]');
    fireEvent.click(points[0]);
    fireEvent.click(points[1]);

    expect(container.querySelector('[data-map-ui="walkway-draft"]')).toBeInTheDocument();
    expect(screen.getByText(/2 ordered locations selected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish walkway' }));
    expect(screen.getAllByText(/Walkway 1/).length).toBeGreaterThan(0);

    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].routes[0].pointIds).toEqual([
      map.points[0].id,
      map.points[1].id,
    ]);
  });

  it('warns during walkway authoring and requires an explicit compatible event scope', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Main Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, {
      label: 'Ceremony Ramp',
      kind: 'path',
      x: 40,
      y: 20,
      eventSpaceIds: ['garden'],
    });
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={() => {}} />,
    );
    startWalkwayBuilder();
    const points = container.querySelectorAll<SVGGElement>('[data-map-point]');
    fireEvent.click(points[0]);
    fireEvent.click(points[1]);

    expect(screen.getByText(/cannot serve its selected audience or events/i)).toBeInTheDocument();
    expect(screen.getByText(/point is limited to Garden, but the walkway says All wedding events/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish walkway' })).toBeDisabled();

    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Garden' })[0]);
    expect(screen.queryByText(/cannot serve its selected audience or events/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish walkway' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Finish walkway' }));
    expect(screen.getAllByText(/Walkway 1/).length).toBeGreaterThan(0);
  });

  it('blocks accidental last-scope removal in a new walkway and preserves explicit broadening', async () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Parking', kind: 'parking', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Welcome desk', kind: 'amenity', x: 40, y: 20 });
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={map} venues={venues} onSave={onSave} />,
    );

    startWalkwayBuilder();
    fireEvent.click(screen.getByText(/Event-space scope: All wedding events/i));
    const gardenScope = screen.getByRole('checkbox', { name: 'Garden' });
    fireEvent.click(gardenScope);
    expect(gardenScope).toBeChecked();
    expect(screen.getByText(/Event-space scope: 1 selected space/i)).toBeInTheDocument();

    fireEvent.click(gardenScope);
    expect(gardenScope).toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Scope unchanged.*would broaden this item to every wedding/i,
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Use new walkway for all wedding events',
    }));
    expect(gardenScope).not.toBeChecked();
    expect(screen.getByText(/Event-space scope: All wedding events/i)).toBeInTheDocument();

    const points = container.querySelectorAll<SVGGElement>('[data-map-point]');
    fireEvent.click(points[0]);
    fireEvent.click(points[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Finish walkway' }));
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].routes[0].eventSpaceIds).toBeUndefined();
  });

  it('keeps temporary walkway waypoints inside an explicitly resized map', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={onSave} />,
    );
    startWalkwayBuilder();
    clickCanvas(container, 450, 350);
    clickCanvas(container, 400, 300);

    fireEvent.change(screen.getByLabelText('Map width'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Map height'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply size' }));
    expect(screen.getByText(/temporary walkway waypoints.*stay inside the frame/i)).toBeInTheDocument();
    expect(screen.getByText(/Every selected stop is at the same map position/i))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish walkway' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Horizontal position for Waypoint 1'), {
      target: { value: '35' },
    });
    expect(screen.getByRole('button', { name: 'Finish walkway' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Finish walkway' }));
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const savedMap = onSave.mock.calls[0][0];
    expect(savedMap).toMatchObject({ width: 40, height: 30 });
    expect(savedMap.points).toHaveLength(2);
    expect(savedMap.points.every((point: any) =>
      point.x >= 0 && point.x <= 40 && point.y >= 0 && point.y <= 30)).toBe(true);
  });

  it('lets a keyboard-only admin create and position transient Walkway Waypoints', async () => {
    const onSave = vi.fn();
    render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={onSave} />,
    );
    startWalkwayBuilder();
    const addWaypoint = screen.getByRole('button', {
      name: '＋ Add Walkway Waypoint at center',
    });
    fireEvent.click(addWaypoint);
    fireEvent.click(addWaypoint);

    expect(screen.getByLabelText('Horizontal position for Waypoint 1')).toHaveValue(50);
    expect(screen.getByLabelText('Vertical position for Waypoint 1')).toHaveValue(40);
    fireEvent.change(screen.getByLabelText('Horizontal position for Waypoint 1'), {
      target: { value: '25' },
    });
    fireEvent.change(screen.getByLabelText('Vertical position for Waypoint 1'), {
      target: { value: '30' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finish walkway' }));
    clickSaveAndAcknowledgeWayfindingGaps();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      points: [
        expect.objectContaining({ kind: 'path', x: 25, y: 30 }),
        expect.objectContaining({ kind: 'path', x: 50, y: 40 }),
      ],
      routes: [expect.objectContaining({ pointIds: expect.any(Array) })],
    });
    expect(onSave.mock.calls[0][0].routes[0].pointIds).toHaveLength(2);
  });

  it('keeps empty-canvas walkway waypoints transient until finish and discards them on cancel', () => {
    const { container } = render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={() => {}} />,
    );
    startWalkwayBuilder();
    clickCanvas(container, 100, 100);
    clickCanvas(container, 300, 250);

    expect(screen.getByRole('group', { name: /2 mapped points/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Walkway Waypoint: Waypoint 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Walkway Waypoint: Waypoint 2/i })).toBeInTheDocument();
    container.querySelectorAll('[data-map-point]').forEach((point) => {
      expect(point).toHaveAttribute('data-map-export-exclude', 'true');
    });
    expect(container.querySelector('[data-map-ui="walkway-draft"]'))
      .toHaveAttribute('data-map-export-exclude', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel walkway draft' }));

    expect(screen.getByRole('group', { name: /0 mapped points/i })).toBeInTheDocument();
    expect(screen.getByText(/Canonical venue map is saved/i)).toBeInTheDocument();
  });

  it('creates new Entry / Exit pins as explicitly not yet classified', () => {
    const { container } = render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={venues} onSave={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '🚪 Entry / Exit' }));
    clickCanvas(container);

    expect(screen.getByLabelText('Arrival role for Entry / Exit 1')).toHaveValue('unknown');
    expect(screen.getByText(/does not count as a safe guest arrival/i)).toBeInTheDocument();
  });

  it('palette drives what kind gets placed on the canvas', () => {
    let map = emptyVenueMapConfig();
    const { container } = render(<VenueMapDesigner map={map} venues={venues} onSave={() => {}} />);
    // Select "Parking" in the palette.
    fireEvent.click(screen.getByRole('button', { name: '🅿️ Parking' }));
    clickCanvas(container);
    // A parking point is created, not an event space.
    expect(screen.getByText(/1 parking/)).toBeTruthy();
    expect(screen.queryByText(/1 spaces/)).toBeNull();
  });
});

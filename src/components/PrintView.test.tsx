import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrintView } from './PrintView';
import { setTableSpecs } from '../hooks/useLayoutState';
import { Venue, PlacedTable, PlacedFixture, Guest } from '../types';

describe('PrintView (Print / Export Polish)', () => {
  const sampleVenue: Venue = {
    id: 'v1',
    name: 'Grand Ballroom',
    width: 60,
    height: 40,
    capacity: 150,
    category: 'reception',
    color: '#ffffff',
  };

  const sampleTables: PlacedTable[] = [
    {
      id: 't1',
      type: 'table',
      specId: 'round-60',
      x: 10,
      y: 10,
      rotation: 0,
      label: 'Table 1',
      guests: ['g1'],
      chairCount: 8,
    },
  ];

  const sampleFixtures: PlacedFixture[] = [
    {
      id: 'f1',
      type: 'fixture',
      specId: 'dance-floor',
      x: 20,
      y: 20,
      rotation: 0,
      label: 'Dance Floor',
    },
  ];

  const sampleGuests: Guest[] = [
    {
      id: 'g1',
      name: 'Alice Smith',
      email: 'alice@example.com',
      rsvpStatus: 'confirmed',
      tableId: 't1',
      seatNumber: 1,
      mealChoice: 'vegetarian',
      dietaryRestrictions: 'nut allergy',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    setTableSpecs([
      { id: 'round-60', name: 'Round 60"', shape: 'circle', width: 5, height: 5, capacity: 8, showChairs: true },
    ]);
  });

  it('renders with .spm-print-view root class so print CSS scopes cleanly to floor plan', () => {
    const onClose = vi.fn();
    const { container } = render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={onClose}
      />,
    );

    const root = container.querySelector('.spm-print-view');
    expect(root).not.toBeNull();
  });

  it('hides top action bar in print mode via no-print and print:hidden classes', () => {
    const { container } = render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={vi.fn()}
      />,
    );

    const actionBar = container.querySelector('.no-print');
    expect(actionBar).not.toBeNull();
    expect(actionBar?.className).toContain('print:hidden');
  });

  it('calls window.print() when the Print button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={vi.fn()}
      />,
    );

    const printBtn = screen.getByRole('button', { name: /print/i });
    fireEvent.click(printBtn);
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('shows venue-operational stats without couple-facing guest assignment data', () => {
    render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Grand Ballroom/)).toBeInTheDocument();
    expect(screen.getByText(/Evening Gala/)).toBeInTheDocument();
    expect(screen.getAllByText(/Table 1/).length).toBeGreaterThan(0);
    expect(screen.getByText('Venue Items')).toBeInTheDocument();
    expect(screen.getByText(/Guest assignments are managed in the couple-facing portal/i)).toBeInTheDocument();
    expect(screen.queryByText(/Alice Smith/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nut allergy/)).not.toBeInTheDocument();
    expect(screen.queryByText('Total Guests')).not.toBeInTheDocument();
    expect(screen.queryByText('Seated')).not.toBeInTheDocument();
  });

  it('computes total capacity from placed tables', () => {
    render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={vi.fn()}
      />,
    );

    // Table 1 has custom chairCount = 8.
    const configuredSeats = screen.getByText('Configured Seats').closest('.rounded-lg');
    expect(configuredSeats).not.toBeNull();
    expect(within(configuredSeats as HTMLElement).getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Venue Maximum')).toBeInTheDocument();
  });

  it('embeds the canonical Studio SVG without rebuilding or dropping geometry', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 120 90');
    svg.innerHTML = `
      <polygon data-venue-shape="custom" points="10,10 90,10 70,70 10,60"></polygon>
      <g data-table-id="t1" transform="rotate(37 12.5 12.5)">
        <circle data-chair-index="0" cx="8" cy="8" r="1"></circle>
      </g>
      <g data-decor-id="decor-1" transform="translate(3 4)"></g>
      <g data-ceremony-row-id="row-1"></g>
    `;
    render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={vi.fn()}
        exportSvgRef={{ current: svg }}
      />,
    );

    const canonical = screen.getByLabelText('Canonical floor plan');
    expect(canonical.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 120 90');
    expect(canonical.querySelector('[data-venue-shape="custom"]')).not.toBeNull();
    expect(canonical.querySelector('[data-table-id="t1"]')?.getAttribute('transform')).toBe('rotate(37 12.5 12.5)');
    expect(canonical.querySelector('[data-chair-index="0"]')).not.toBeNull();
    expect(canonical.querySelector('[data-decor-id="decor-1"]')).not.toBeNull();
    expect(canonical.querySelector('[data-ceremony-row-id="row-1"]')).not.toBeNull();
  });

  it('fails closed instead of showing a lossy reconstructed floor plan', () => {
    render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Canonical floor plan unavailable/i);
    expect(screen.queryByLabelText('Canonical floor plan')).not.toBeInTheDocument();
  });

  it('shows a warning toast when PNG export is clicked without an SVG ref ready', () => {
    render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={vi.fn()}
      />,
    );

    const pngBtn = screen.getByRole('button', { name: /png/i });
    fireEvent.click(pngBtn);
    expect(screen.getByRole('button', { name: /png/i })).toBeInTheDocument();
  });

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders print sheet toggles checked by default and shows Linen Color Key & Setup Checklist', () => {
    render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/Dietary & Meal notes/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Linen color key/i)).toBeChecked();
    expect(screen.getByLabelText(/Room setup checklist/i)).toBeChecked();

    expect(screen.getByRole('heading', { name: /Linen Color Key/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Room Setup Checklist/i })).toBeInTheDocument();
    expect(screen.queryByText(/nut allergy/i)).not.toBeInTheDocument();
  });

  it('toggles the venue-operational Linen Color Key and Room Setup Checklist', () => {
    render(
      <PrintView
        venue={sampleVenue}
        tables={sampleTables}
        fixtures={sampleFixtures}
        guests={sampleGuests}
        layoutName="Evening Gala"
        onClose={vi.fn()}
      />,
    );

    const linenCheckbox = screen.getByLabelText(/Linen color key/i);
    const checklistCheckbox = screen.getByLabelText(/Room setup checklist/i);

    expect(screen.queryByText(/Alice Smith/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nut allergy/i)).not.toBeInTheDocument();

    // Uncheck linen key
    fireEvent.click(linenCheckbox);
    expect(screen.queryByRole('heading', { name: /Linen Color Key/i })).not.toBeInTheDocument();

    // Uncheck setup checklist
    fireEvent.click(checklistCheckbox);
    expect(screen.queryByRole('heading', { name: /Room Setup Checklist/i })).not.toBeInTheDocument();

    // Recheck setup checklist
    fireEvent.click(checklistCheckbox);
    expect(screen.getByRole('heading', { name: /Room Setup Checklist/i })).toBeInTheDocument();
  });
});

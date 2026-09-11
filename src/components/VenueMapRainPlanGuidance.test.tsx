import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VenueMapRainPlanGuidance } from './VenueMapRainPlanGuidance';

const venues = [
  { id: 'garden', name: 'Ceremony Garden', category: 'outdoor', width: 60, height: 40, capacity: 100 },
  { id: 'ballroom', name: 'Grand Ballroom', category: 'reception', width: 80, height: 60, capacity: 180 },
] as any;

describe('VenueMapRainPlanGuidance', () => {
  it('delivers the applicable backup pair and venue-authored guest guidance', () => {
    render(
      <VenueMapRainPlanGuidance
        venues={venues}
        rainContingencies={[{
          id: 'rain-garden',
          outdoorVenueId: 'garden',
          indoorVenueId: 'ballroom',
          note: 'Enter through the east ballroom doors and follow the blue signs.',
        }]}
      />,
    );

    expect(screen.getByRole('region', { name: 'Applicable rain contingency guidance' }))
      .toBeInTheDocument();
    expect(screen.getByText('Ceremony Garden → Grand Ballroom')).toBeInTheDocument();
    expect(screen.getByText(/Enter through the east ballroom doors/i)).toBeInTheDocument();
  });

  it('renders nothing when the scoped projection has no applicable rain plan', () => {
    const { container } = render(
      <VenueMapRainPlanGuidance venues={venues} rainContingencies={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

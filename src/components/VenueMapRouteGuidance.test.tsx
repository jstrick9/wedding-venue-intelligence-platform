import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VenueMapRoute } from '../types';
import {
  buildVenueMapRouteGuidanceItems,
  VenueMapRouteGuidance,
} from './VenueMapRouteGuidance';

const routes: VenueMapRoute[] = [
  {
    id: 'service',
    name: 'Service lane',
    pointIds: ['a', 'b'],
    priority: 'secondary',
    accessibility: 'not-step-free',
    notes: 'Loose gravel after the loading gate.',
  },
  {
    id: 'guest',
    name: 'Garden promenade',
    pointIds: ['a', 'b'],
    priority: 'preferred',
    accessibility: 'step-free',
  },
];

describe('VenueMapRouteGuidance', () => {
  it('orders venue-preferred routes first and preserves exact guidance', () => {
    expect(buildVenueMapRouteGuidanceItems(routes)).toEqual([
      {
        id: 'guest',
        name: 'Garden promenade',
        priority: 'Preferred',
        accessibility: 'Verified step-free',
        note: undefined,
      },
      {
        id: 'service',
        name: 'Service lane',
        priority: 'Secondary',
        accessibility: 'Not step-free',
        note: 'Loose gravel after the loading gate.',
      },
    ]);
  });

  it('renders a visible route key with mobility status and cautions', () => {
    render(<VenueMapRouteGuidance routes={routes} />);
    const region = screen.getByRole('region', { name: 'Walkways and access notes' });
    expect(region).toHaveTextContent('Garden promenade');
    expect(region).toHaveTextContent('Preferred · Verified step-free');
    expect(region).toHaveTextContent('Service lane');
    expect(region).toHaveTextContent('Secondary · Not step-free');
    expect(region).toHaveTextContent('Loose gravel after the loading gate.');
  });

  it('omits an empty route key', () => {
    const { container } = render(<VenueMapRouteGuidance routes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

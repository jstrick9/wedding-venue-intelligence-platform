import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VenueMapPoint } from '../types';
import {
  buildVenueMapPointGuidanceItems,
  VenueMapPointGuidance,
} from './VenueMapPointGuidance';

const points: VenueMapPoint[] = [
  {
    id: 'gate',
    label: 'West Gate',
    kind: 'entry',
    x: 10,
    y: 10,
    description: 'Use the call box after 5 PM.',
  },
  {
    id: 'parking',
    label: 'Guest Parking',
    kind: 'parking',
    x: 20,
    y: 20,
  },
];

describe('VenueMapPointGuidance', () => {
  it('retains only exact non-empty point guidance', () => {
    expect(buildVenueMapPointGuidanceItems(points)).toEqual([{
      id: 'gate',
      name: 'West Gate',
      kind: 'Entry / Exit',
      icon: '🚪',
      guidance: 'Use the call box after 5 PM.',
    }]);
  });

  it('renders a visible location key without empty point cards', () => {
    render(<VenueMapPointGuidance points={points} />);
    const region = screen.getByRole('region', { name: 'Location and arrival notes' });
    expect(region).toHaveTextContent('West Gate');
    expect(region).toHaveTextContent('Entry / Exit');
    expect(region).toHaveTextContent('Use the call box after 5 PM.');
    expect(region).not.toHaveTextContent('Guest Parking');
  });

  it('omits an empty point-guidance key', () => {
    const { container } = render(<VenueMapPointGuidance points={[points[1]]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

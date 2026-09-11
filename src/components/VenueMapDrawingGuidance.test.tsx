import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DrawingObject } from '../types';
import {
  buildVenueMapDrawingGuidanceItems,
  VenueMapDrawingGuidance,
} from './VenueMapDrawingGuidance';

const drawings: DrawingObject[] = [
  {
    id: 'restricted-zone',
    type: 'zone',
    x: 10,
    y: 10,
    width: 20,
    height: 15,
    text: 'No guest access beyond this boundary. Follow venue staff instructions.',
  },
  { id: 'unlabeled-line', type: 'line', x: 0, y: 0, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] },
];

describe('VenueMapDrawingGuidance', () => {
  it('retains exact non-empty annotation text and its shape type', () => {
    expect(buildVenueMapDrawingGuidanceItems(drawings)).toEqual([{
      id: 'restricted-zone',
      type: 'Zone',
      text: 'No guest access beyond this boundary. Follow venue staff instructions.',
    }]);
  });

  it('renders complete annotations visibly and omits unlabeled shapes', () => {
    render(<VenueMapDrawingGuidance drawings={drawings} />);
    const region = screen.getByRole('region', { name: 'Map annotations' });
    expect(region).toHaveTextContent('No guest access beyond this boundary. Follow venue staff instructions.');
    expect(region).toHaveTextContent('Zone');
    expect(region.querySelectorAll('li')).toHaveLength(1);
  });

  it('omits an empty annotation key', () => {
    const { container } = render(<VenueMapDrawingGuidance drawings={[drawings[1]]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VenueMapDesigner } from './VenueMapDesigner';
import { emptyVenueMapConfig } from '../services/wayfinding/venueWayfindingService';

const mockVenues: any[] = [
  { id: 'v1', name: 'Grand Ballroom', category: 'reception' },
  { id: 'v2', name: 'Rose Garden', category: 'ceremony' },
];

function clickSaveAndAcknowledgeCoverage() {
  fireEvent.click(screen.getByRole('button', { name: /Save & publish Venue Map/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }));
}

describe('VenueMapDesigner base image and map-native zones', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders canonical base-map and zone controls and applies a valid HTTPS image URL to the draft', () => {
    const map = emptyVenueMapConfig();
    const { container } = render(<VenueMapDesigner map={map} venues={mockVenues} onSave={() => {}} />);

    expect(screen.getByText('🖼️ Base Map Image')).toBeInTheDocument();
    expect(screen.getByText('🎨 Property shapes')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('https://example.com/property-aerial.png'), {
      target: { value: 'https://example.com/map.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(container.querySelector('image')).toHaveAttribute('href', 'https://example.com/map.png');
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText(/Unpublished working draft/)).toBeInTheDocument();
  });

  it('records one undo step for each continuous base-map opacity gesture', () => {
    const map = {
      ...emptyVenueMapConfig(),
      backgroundImageUrl: 'data:image/png;base64,public-safe-map',
      backgroundOpacity: 0.85,
    };
    render(<VenueMapDesigner map={map} venues={mockVenues} onSave={() => {}} />);
    const slider = screen.getByRole('slider', { name: 'Base map opacity slider' });

    expect(screen.getByRole('button', { name: /Undo/ })).toBeDisabled();
    fireEvent.pointerDown(slider, { pointerId: 1 });
    fireEvent.change(slider, { target: { value: '70' } });
    fireEvent.change(slider, { target: { value: '60' } });
    fireEvent.pointerUp(slider, { pointerId: 1 });
    expect(slider).toHaveValue('60');

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    const restoredSlider = screen.getByRole('slider', { name: 'Base map opacity slider' });
    expect(restoredSlider).toHaveValue('85');

    fireEvent.keyDown(restoredSlider, { key: 'ArrowLeft', repeat: false });
    fireEvent.change(restoredSlider, { target: { value: '75' } });
    fireEvent.keyDown(restoredSlider, { key: 'ArrowLeft', repeat: true });
    fireEvent.change(restoredSlider, { target: { value: '65' } });
    fireEvent.keyUp(restoredSlider, { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.getByRole('slider', { name: 'Base map opacity slider' })).toHaveValue('85');
  });

  it('starts a fresh shape undo session after successful publication', async () => {
    const onSave = vi.fn();
    render(<VenueMapDesigner map={emptyVenueMapConfig()} venues={mockVenues} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Add editable zone/i }));
    fireEvent.change(screen.getByLabelText('Shape label'), {
      target: { value: 'Published ceremony lawn' },
    });
    clickSaveAndAcknowledgeCoverage();
    await waitFor(() => expect(screen.getByText(/Canonical venue map is saved/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Shape label'), {
      target: { value: 'New local shape label' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));

    expect(screen.getByLabelText('Shape label')).toHaveValue('Published ceremony lawn');
    expect(screen.getByText(/Canonical venue map is saved/)).toBeInTheDocument();
  });

  it('moves a selected shape directly on the canvas with one undo step', () => {
    const { container } = render(
      <VenueMapDesigner map={emptyVenueMapConfig()} venues={mockVenues} onSave={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Add editable zone/i }));
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 500, bottom: 400, width: 500, height: 400, x: 0, y: 0,
      toJSON: () => ({}),
    });
    const shape = screen.getByRole('button', { name: /Property zone: New map zone/i });
    expect(shape).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('X')).toHaveValue(38);
    expect(screen.getByLabelText('Y')).toHaveValue(32.8);

    fireEvent.pointerDown(shape, { pointerId: 31, clientX: 250, clientY: 200 });
    fireEvent.pointerMove(svg, { pointerId: 31, clientX: 275, clientY: 225 });
    fireEvent.pointerMove(svg, { pointerId: 31, clientX: 300, clientY: 250 });
    fireEvent.pointerUp(svg, { pointerId: 31, clientX: 300, clientY: 250 });
    expect(screen.getByLabelText('X')).toHaveValue(48);
    expect(screen.getByLabelText('Y')).toHaveValue(42.8);

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.getByLabelText('X')).toHaveValue(38);
    expect(screen.getByLabelText('Y')).toHaveValue(32.8);
  });

  it('adds one editable vector zone with audience and event-space controls, then clears it', () => {
    render(<VenueMapDesigner map={emptyVenueMapConfig()} venues={mockVenues} onSave={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Add editable zone/i }));
    expect(screen.getByDisplayValue('New map zone')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Shape label'), { target: { value: 'Ceremony Lawn' } });
    const xControl = screen.getByLabelText('X');
    expect(xControl).toHaveAttribute('max', '76');
    fireEvent.change(xControl, { target: { value: '99' } });
    expect(xControl).toHaveValue(76);
    const audienceControls = screen.getAllByLabelText('Audience');
    fireEvent.change(audienceControls[audienceControls.length - 1], { target: { value: 'couple' } });
    expect(screen.getAllByText('Ceremony Lawn').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Couples only').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Event-space scope: All wedding events/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Clear all shapes/i }));
    const dialog = screen.getByRole('dialog', { name: /Clear all property shapes/i });
    expect(dialog).toHaveTextContent(/1 shape.*1 couples only/i);
    expect(within(dialog).getByRole('button', { name: 'Keep shapes' })).toHaveFocus();
    expect(screen.getByDisplayValue('Ceremony Lawn')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all shapes' }));
    expect(screen.queryByDisplayValue('Ceremony Lawn')).not.toBeInTheDocument();
  });

  it('accepts a bounded raster upload without fabricating a success reference', async () => {
    const { container } = render(<VenueMapDesigner map={emptyVenueMapConfig()} venues={mockVenues} onSave={() => {}} />);
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'property.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText('Upload base map image file'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(container.querySelector('image')).toBeInTheDocument());
    expect(container.querySelector('image')?.getAttribute('href')).toMatch(/^data:image\/png;base64,/);
    expect(container.querySelector('image')?.getAttribute('href')).not.toContain('mock_basemap');
  });

  it('rejects unsafe upload formats without changing the map', () => {
    const { container } = render(<VenueMapDesigner map={emptyVenueMapConfig()} venues={mockVenues} onSave={() => {}} />);
    const file = new File(['<svg><script>alert(1)</script></svg>'], 'unsafe.svg', { type: 'image/svg+xml' });

    fireEvent.change(screen.getByLabelText('Upload base map image file'), {
      target: { files: [file] },
    });

    expect(container.querySelector('image')).not.toBeInTheDocument();
    expect(screen.getByText(/Canonical venue map is saved/)).toBeInTheDocument();
  });

  it('keeps the base image separate when zones are edited and saves only through the explicit map action', () => {
    const onSave = vi.fn();
    const map = {
      ...emptyVenueMapConfig(),
      backgroundImageUrl: 'data:image/png;base64,public-safe-map',
    };
    const { container } = render(<VenueMapDesigner map={map} venues={mockVenues} onSave={onSave} />);

    expect(screen.queryByRole('button', { name: /Drawing Studio/i })).not.toBeInTheDocument();
    fireEvent.load(container.querySelector('image')!);
    fireEvent.click(screen.getByRole('button', { name: /Add editable zone/i }));
    expect(onSave).not.toHaveBeenCalled();

    clickSaveAndAcknowledgeCoverage();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].backgroundImageUrl).toBe('data:image/png;base64,public-safe-map');
    expect(onSave.mock.calls[0][0].drawings).toHaveLength(1);
  });
});

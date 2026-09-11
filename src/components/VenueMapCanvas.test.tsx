import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, within } from '@testing-library/react';
import { VenueMapCanvas, clientPointToVenueMap } from './VenueMapCanvas';
import { emptyVenueMapConfig } from '../services/wayfinding/venueWayfindingService';
import { addMapPoint } from '../utils/venueMapDesigner';
import type { VenueMapConfig } from '../types';

function setCanvasRect(svg: SVGSVGElement, width = 500, height = 400) {
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe('VenueMapCanvas', () => {
  it('maps pointer coordinates through letterboxed xMidYMid meet content', () => {
    // A 100x80 map inside a 1000x400 viewport renders 500px wide, centered
    // with 250px side gutters. The visible center remains map coordinate 50,40.
    expect(clientPointToVenueMap(
      { left: 0, top: 0, width: 1000, height: 400 },
      100,
      80,
      500,
      200,
    )).toEqual({ x: 50, y: 40, inside: true });
    expect(clientPointToVenueMap(
      { left: 0, top: 0, width: 1000, height: 400 },
      100,
      80,
      100,
      200,
    ).inside).toBe(false);
  });

  it('keeps extreme aspect ratios readable in a keyboard-pannable bounded viewport', () => {
    const wideMap = {
      ...emptyVenueMapConfig(),
      width: 500,
      height: 20,
      points: [{ id: 'gate', label: 'Gate', kind: 'entry' as const, x: 5, y: 5 }],
    };
    const { container, rerender } = render(<VenueMapCanvas map={wideMap} />);
    const viewport = container.querySelector<HTMLElement>('[data-map-scroll-viewport]')!;
    const scrollBy = vi.fn();
    Object.defineProperty(viewport, 'scrollBy', { configurable: true, value: scrollBy });

    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveAttribute('aria-label', 'Scrollable venue map viewport');
    expect(viewport).toHaveClass('max-h-[70vh]', 'overflow-auto');
    expect(container.querySelector('svg')).toHaveStyle({ width: '6000px', maxWidth: 'none' });
    expect(screen.getByText(/extra-wide or extra-tall layout/i)).toBeInTheDocument();

    fireEvent.keyDown(viewport, { key: 'ArrowRight' });
    expect(scrollBy).toHaveBeenCalledWith({ left: 64, top: 0, behavior: 'smooth' });

    rerender(<VenueMapCanvas map={{ ...wideMap, width: 20, height: 500 }} />);
    expect(container.querySelector('svg')).toHaveStyle({ width: '240px', marginInline: 'auto' });

    rerender(<VenueMapCanvas map={emptyVenueMapConfig()} />);
    const standardViewport = container.querySelector<HTMLElement>('[data-map-scroll-viewport]')!;
    expect(standardViewport).not.toHaveAttribute('tabindex');
    expect(container.querySelector('svg')).not.toHaveStyle({ width: '6000px' });
  });

  it('renders labels for supported legacy circles and lines', () => {
    const map = {
      ...emptyVenueMapConfig(),
      drawings: [
        { id: 'circle', type: 'circle', x: 20, y: 20, radius: 5, text: 'Round garden', fontSize: 8 },
        { id: 'line', type: 'line', x: 0, y: 0, points: [{ x: 1, y: 1 }, { x: 10, y: 10 }], text: 'Fence line', fontSize: 9 },
      ],
    };
    const { container } = render(<VenueMapCanvas map={map} />);

    expect(container.querySelector('circle')).toBeInTheDocument();
    expect(container.querySelector('polyline')).toBeInTheDocument();
    const labels = [...container.querySelectorAll('svg text')];
    expect(labels.map((node) => node.textContent)).toContain('Round garden');
    expect(labels.find((node) => node.textContent === 'Round garden')).toHaveAttribute('font-size', '8');
    expect(labels.find((node) => node.textContent === 'Fence line')).toHaveAttribute('font-size', '9');
    const annotations = screen.getByRole('region', { name: 'Map annotations' });
    expect(annotations).toHaveTextContent('Round garden');
    expect(annotations).toHaveTextContent('Fence line');
    expect(container.querySelector('.sr-only')).not.toHaveTextContent('Round garden');
  });

  it('delivers exact point guidance visibly without duplicating it in hidden narration', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [{
        id: 'west-gate',
        label: 'West Gate',
        kind: 'entry' as const,
        x: 10,
        y: 10,
        description: 'Use the call box after 5 PM.',
      }],
    };
    const { container } = render(<VenueMapCanvas map={map} />);

    const guidance = screen.getByRole('region', { name: 'Location and arrival notes' });
    expect(guidance).toHaveTextContent('Use the call box after 5 PM.');
    expect(container.querySelector('.sr-only')).not.toHaveTextContent('Use the call box after 5 PM.');
  });

  it('places edge destination labels inward without changing their coordinates', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'right-parking', label: 'Right-edge parking', kind: 'parking' as const, x: 100, y: 40 },
        { id: 'top-entry', label: 'Top-edge entrance', kind: 'entry' as const, x: 5, y: 0 },
      ],
    };
    const { container } = render(<VenueMapCanvas map={map} />);
    const texts = [...container.querySelectorAll<SVGTextElement>('svg text')];
    const rightLabel = texts.find((node) => node.textContent?.includes('Right-edge parking'))!;
    const topLabel = texts.find((node) => node.textContent?.includes('Top-edge entrance'))!;

    expect(rightLabel).toHaveAttribute('text-anchor', 'end');
    expect(Number(rightLabel.getAttribute('x'))).toBeLessThan(100);
    expect(topLabel).toHaveAttribute('text-anchor', 'start');
    expect(Number(topLabel.getAttribute('y'))).toBeGreaterThan(0);
    expect(container.querySelector('[data-map-point="right-parking"] > circle'))
      .toHaveAttribute('cx', '100');
    expect(container.querySelector('[data-map-point="top-entry"] > circle'))
      .toHaveAttribute('cy', '0');
  });

  it('marks editor chrome and transient walkway objects for export and print exclusion', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'entry', label: 'Entry', kind: 'entry' as const, x: 10, y: 10 },
        { id: 'draft-waypoint', label: 'Walkway Waypoint', kind: 'path' as const, x: 30, y: 30 },
      ],
      drawings: [{
        id: 'garden-zone',
        type: 'zone' as const,
        x: 10,
        y: 10,
        width: 20,
        height: 15,
        text: 'Garden boundary',
      }],
    };
    const { container } = render(
      <VenueMapCanvas
        map={map}
        editable
        interactionMode="select"
        selectedPointId="entry"
        selectedDrawingId="garden-zone"
        highlightPointIds={['entry', 'draft-waypoint']}
        transientPointIds={['draft-waypoint']}
        onSelectDrawing={() => {}}
      />,
    );

    expect(container.querySelector('[data-map-selected-point-ring="entry"]'))
      .toHaveAttribute('data-map-export-exclude', 'true');
    expect(container.querySelector('[data-map-drawing="garden-zone"] [data-map-export-exclude="true"]'))
      .toBeInTheDocument();
    expect(container.querySelector('[data-map-ui="walkway-draft"]'))
      .toHaveAttribute('data-map-export-exclude', 'true');
    expect(container.querySelector('[data-map-point="draft-waypoint"]'))
      .toHaveAttribute('data-map-export-exclude', 'true');
    expect(container.querySelector('[data-map-point="entry"]'))
      .not.toHaveAttribute('data-map-export-exclude');
  });

  it('selects and moves property shapes by pointer and keyboard in Select & Move', () => {
    const map = {
      ...emptyVenueMapConfig(),
      drawings: [{
        id: 'garden-zone',
        type: 'zone',
        x: 10,
        y: 10,
        width: 20,
        height: 15,
        text: 'Garden boundary',
      }],
    };
    const onSelectDrawing = vi.fn();
    const onMoveDrawing = vi.fn();
    const { container } = render(
      <VenueMapCanvas
        map={map}
        editable
        interactionMode="select"
        selectedDrawingId="garden-zone"
        onSelectDrawing={onSelectDrawing}
        onMoveDrawing={onMoveDrawing}
      />,
    );
    const svg = container.querySelector('svg')!;
    setCanvasRect(svg);
    const shape = screen.getByRole('button', { name: /Property zone: Garden boundary/i });

    expect(shape).toHaveAttribute('aria-pressed', 'true');
    fireEvent.focus(shape);
    expect(container.querySelector('[data-map-drawing-focus-ring="garden-zone"]')).toBeInTheDocument();
    fireEvent.pointerDown(shape, { pointerId: 21, clientX: 75, clientY: 75 });
    fireEvent.pointerMove(svg, { pointerId: 21, clientX: 125, clientY: 125 });
    fireEvent.pointerUp(svg, { pointerId: 21, clientX: 125, clientY: 125 });
    expect(onSelectDrawing).toHaveBeenCalledWith('garden-zone');
    expect(onMoveDrawing).toHaveBeenCalledWith('garden-zone', 10, 10);

    fireEvent.keyDown(shape, { key: 'ArrowRight', shiftKey: true });
    expect(onMoveDrawing).toHaveBeenLastCalledWith('garden-zone', 5, 0);
  });

  it('keeps shapes pointer-transparent and unfocusable in creation modes', () => {
    const map = {
      ...emptyVenueMapConfig(),
      drawings: [{
        id: 'garden-zone',
        type: 'zone',
        x: 10,
        y: 10,
        width: 20,
        height: 15,
        text: 'Garden boundary',
      }],
    };
    const onPlacePoint = vi.fn();
    const onSelectDrawing = vi.fn();
    const { container } = render(
      <VenueMapCanvas
        map={map}
        editable
        interactionMode="place"
        placeKind="parking"
        onPlacePoint={onPlacePoint}
        onSelectDrawing={onSelectDrawing}
        onMoveDrawing={() => undefined}
      />,
    );
    const svg = container.querySelector('svg')!;
    setCanvasRect(svg);

    expect(container.querySelector('[data-map-drawing="garden-zone"]')).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('button', { name: /Garden boundary/i })).not.toBeInTheDocument();
    fireEvent.click(svg, { clientX: 100, clientY: 75 });
    expect(onPlacePoint).toHaveBeenCalledWith('parking', 20, 15);
    expect(onSelectDrawing).not.toHaveBeenCalled();
  });

  it('places the active palette kind at the clicked map coordinate', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Main Entry', kind: 'entry', x: 10, y: 10 });
    const onPlacePoint = vi.fn();
    const { container } = render(
      <VenueMapCanvas map={map} editable interactionMode="place" placeKind="parking" onPlacePoint={onPlacePoint} />,
    );
    const svg = container.querySelector('svg')!;
    setCanvasRect(svg);
    fireEvent.click(svg, { clientX: 250, clientY: 200 });
    expect(onPlacePoint).toHaveBeenCalledWith('parking', 50, 40);
  });

  it('shows the exact Entry / Exit arrival role on the map and accessible editor controls', () => {
    const map = addMapPoint(emptyVenueMapConfig(), {
      label: 'Service Gate',
      kind: 'entry',
      arrivalRole: 'exit-only',
      x: 10,
      y: 10,
    });
    const { container } = render(
      <VenueMapCanvas map={map} editable onSelectPoint={() => undefined} />,
    );

    expect(container.querySelector('[data-map-point] text')).toHaveTextContent(
      'Service Gate · Exit only',
    );
    expect(screen.getByRole('button', {
      name: /Entry \/ Exit · Exit only: Service Gate/i,
    })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Map points for editing').closest('summary')!);
    expect(screen.getByRole('button', {
      name: /Select Service Gate for editing\. Entry \/ Exit · Exit only/i,
    })).toBeInTheDocument();
  });

  it('allows placement over a full-size base image but not on an existing point', () => {
    let map: VenueMapConfig = { ...emptyVenueMapConfig(), backgroundImageUrl: 'data:image/png;base64,abc' };
    map = addMapPoint(map, { label: 'Parking', kind: 'parking', x: 20, y: 20 });
    const onPlacePoint = vi.fn();
    const { container } = render(
      <VenueMapCanvas map={map} editable interactionMode="place" placeKind="parking" onPlacePoint={onPlacePoint} />,
    );
    const svg = container.querySelector('svg')!;
    setCanvasRect(svg);
    fireEvent.click(container.querySelector('image')!, { clientX: 250, clientY: 200 });
    expect(onPlacePoint).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('[data-map-point] circle')!);
    expect(onPlacePoint).toHaveBeenCalledTimes(1);
  });

  it('defaults editable canvases to non-mutating Select and Move mode', () => {
    const onPlacePoint = vi.fn();
    const onSelectPoint = vi.fn();
    const { container } = render(
      <VenueMapCanvas
        map={emptyVenueMapConfig()}
        editable
        onPlacePoint={onPlacePoint}
        onSelectPoint={onSelectPoint}
      />,
    );
    const svg = container.querySelector('svg')!;
    setCanvasRect(svg);

    fireEvent.click(svg, { clientX: 250, clientY: 200 });

    expect(onPlacePoint).not.toHaveBeenCalled();
    expect(onSelectPoint).toHaveBeenCalledWith(null);
    expect(svg).toHaveStyle({ cursor: 'default' });
  });

  it('never converts a point drag release into an empty-canvas placement', () => {
    const map = addMapPoint(emptyVenueMapConfig(), {
      label: 'Garden', kind: 'space', x: 10, y: 10,
    });
    const onPlacePoint = vi.fn();
    const onMovePoint = vi.fn();
    const { container } = render(
      <VenueMapCanvas
        map={map}
        editable
        interactionMode="place"
        placeKind="path"
        onPlacePoint={onPlacePoint}
        onMovePoint={onMovePoint}
      />,
    );
    const svg = container.querySelector('svg')!;
    const point = container.querySelector<SVGGElement>('[data-map-point]')!;
    setCanvasRect(svg);

    fireEvent.pointerDown(point, { pointerId: 9, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 9, clientX: 110, clientY: 100 });
    fireEvent.pointerUp(svg, { pointerId: 9, clientX: 110, clientY: 100 });
    // Browsers may retarget the compatibility click to the SVG after capture.
    fireEvent.click(svg, { clientX: 110, clientY: 100 });

    expect(onMovePoint).toHaveBeenCalled();
    expect(onPlacePoint).not.toHaveBeenCalled();
  });

  it('ignores click-sized pointer jitter and activates a walkway point only when not dragged', () => {
    const map = addMapPoint(emptyVenueMapConfig(), {
      label: 'Main Gate', kind: 'entry', x: 10, y: 10,
    });
    const onMovePoint = vi.fn();
    const onActivatePoint = vi.fn();
    const { container } = render(
      <VenueMapCanvas
        map={map}
        editable
        interactionMode="walkway"
        onMovePoint={onMovePoint}
        onActivatePoint={onActivatePoint}
      />,
    );
    const svg = container.querySelector('svg')!;
    const point = container.querySelector<SVGGElement>('[data-map-point]')!;
    setCanvasRect(svg);

    fireEvent.pointerDown(point, { pointerId: 3, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 3, clientX: 52, clientY: 51 });
    fireEvent.pointerUp(svg, { pointerId: 3, clientX: 52, clientY: 51 });
    fireEvent.click(point);

    expect(onMovePoint).not.toHaveBeenCalled();
    expect(onActivatePoint).toHaveBeenCalledWith(map.points[0].id);
  });

  it('supports pointer dragging and keyboard point movement', () => {
    const map = addMapPoint(emptyVenueMapConfig(), {
      label: 'Main Gate', kind: 'entry', x: 10, y: 10,
    });
    const onMovePoint = vi.fn();
    const onSelectPoint = vi.fn();
    const { container } = render(
      <VenueMapCanvas
        map={map}
        editable
        onMovePoint={onMovePoint}
        onSelectPoint={onSelectPoint}
      />,
    );
    const svg = container.querySelector('svg')!;
    setCanvasRect(svg);
    const point = screen.getByRole('button', { name: /Entry \/ Exit · Not yet classified: Main Gate/i });

    fireEvent.pointerDown(point, { pointerId: 7, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 7, clientX: 100, clientY: 100 });
    expect(onSelectPoint).toHaveBeenCalledWith(map.points[0].id);
    expect(onMovePoint).toHaveBeenCalled();

    fireEvent.keyDown(point, { key: 'ArrowRight' });
    expect(onMovePoint).toHaveBeenLastCalledWith(map.points[0].id, 11, 10);
  });

  it('provides large editor selection targets independent of map aspect ratio', () => {
    let map = { ...emptyVenueMapConfig(), width: 500, height: 20 };
    map = addMapPoint(map, {
      label: 'Main Gate', kind: 'entry', x: 10, y: 10,
    });
    map = addMapPoint(map, {
      label: 'Path Node 1', kind: 'path', x: 250, y: 10,
    });
    const onSelectPoint = vi.fn();
    render(
      <VenueMapCanvas
        map={map}
        editable
        selectedPointId={map.points[0].id}
        onSelectPoint={onSelectPoint}
      />,
    );

    const summary = screen.getByText('Map points for editing').closest('summary')!;
    fireEvent.click(summary);
    const details = summary.closest('details')!;
    const selectedAction = within(details).getByRole('button', { name: /Select Main Gate for editing/i });
    const pathAction = within(details).getByRole('button', { name: /Select Path Node 1 for editing/i });
    expect(selectedAction).toHaveAttribute('aria-pressed', 'true');
    expect(pathAction).toHaveClass('min-h-11');
    expect(pathAction).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pathAction);
    expect(onSelectPoint).toHaveBeenCalledWith(map.points[1].id);
  });

  it('exposes read-only points as named keyboard actions', () => {
    const map = addMapPoint(emptyVenueMapConfig(), {
      label: 'Main Gate', kind: 'entry', x: 10, y: 10, lat: 35.2, lng: -80.8,
    });
    const onPointClick = vi.fn();
    render(<VenueMapCanvas map={map} onPointClick={onPointClick} />);
    const point = document.querySelector(`[data-map-point="${map.points[0].id}"]`)!;
    expect(point.getAttribute('aria-label')).toMatch(/Main Gate.*Open in maps\./i);
    fireEvent.focus(point);
    expect(document.querySelector(`[data-map-focus-ring="${map.points[0].id}"]`)).toBeInTheDocument();
    fireEvent.keyDown(point, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalledWith(map.points[0]);
    fireEvent.blur(point);
    expect(document.querySelector('[data-map-focus-ring]')).not.toBeInTheDocument();
  });

  it('provides the same filtered read-only action in a large touch-target list', () => {
    let map = addMapPoint(emptyVenueMapConfig(), {
      label: 'Main Gate', kind: 'entry', x: 10, y: 10, lat: 35.2, lng: -80.8,
    });
    map = addMapPoint(map, {
      label: 'No action', kind: 'amenity', x: 20, y: 20,
    });
    const onPointClick = vi.fn();
    render(
      <VenueMapCanvas
        map={map}
        onPointClick={onPointClick}
        isPointInteractive={(point) => point.lat !== undefined && point.lng !== undefined}
        pointActionLabel={() => 'Open directions.'}
      />,
    );

    const summary = screen.getByText('Map location actions').closest('summary')!;
    fireEvent.click(summary);
    const details = summary.closest('details')!;
    expect(details).toHaveClass('no-print', 'spm-studio-chrome');
    const action = within(details).getByRole('button', { name: /Main Gate.*Open directions/i });
    expect(action).toHaveClass('min-h-11');
    expect(within(details).queryByRole('button', { name: /No action/i })).not.toBeInTheDocument();
    fireEvent.click(action);
    expect(onPointClick).toHaveBeenCalledWith(map.points[0]);
  });

  it('does not expose no-op read-only points as buttons', () => {
    let map = addMapPoint(emptyVenueMapConfig(), {
      label: 'Main Gate', kind: 'entry', x: 10, y: 10, lat: 35.2, lng: -80.8,
    });
    map = addMapPoint(map, {
      label: 'Unmapped Restroom', kind: 'amenity', x: 20, y: 20,
    });
    const onPointClick = vi.fn();
    const { container } = render(
      <VenueMapCanvas
        map={map}
        onPointClick={onPointClick}
        isPointInteractive={(point) => point.lat !== undefined && point.lng !== undefined}
        pointActionLabel={() => 'Open directions.'}
      />,
    );

    expect(container.querySelectorAll('[data-map-point][role="button"]')).toHaveLength(1);
    const gate = container.querySelector(`[data-map-point="${map.points[0].id}"]`)!;
    expect(gate.getAttribute('aria-label')).toMatch(/Main Gate.*Open directions/i);
    fireEvent.keyDown(gate, { key: 'Enter' });
    fireEvent.click(container.querySelector(`[data-map-point="${map.points[1].id}"]`)!);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick).toHaveBeenCalledWith(map.points[0]);
  });

  it('keeps the visible map title outside authored spatial coordinates', () => {
    const { container } = render(
      <VenueMapCanvas map={emptyVenueMapConfig()} title="Rose & Pine Estate" />,
    );

    expect(container.querySelector('[data-map-external-title="true"]'))
      .toHaveTextContent('Rose & Pine Estate');
    expect(container.querySelector('svg > title')).toHaveTextContent('Rose & Pine Estate');
    expect(container.querySelector('svg [data-map-ui="title"]')).not.toBeInTheDocument();
  });

  it('renders a highlight ring and a legend for kinds present', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'A', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'B', kind: 'parking', x: 20, y: 20 });
    const id = map.points[0].id;
    const { container } = render(
      <VenueMapCanvas map={map} editable highlightPointIds={[id]} showLegend />,
    );
    expect(container.querySelectorAll('circle[stroke="#4A1942"]')).toHaveLength(1);
    const legend = screen.getByRole('region', { name: 'Map symbol legend' });
    expect(legend).toHaveTextContent('Parking');
    expect(legend).toHaveTextContent('Entry / Exit');
    expect(legend).not.toHaveTextContent('Event Space');
    expect(container.querySelector('svg [data-map-ui="legend"]')).not.toBeInTheDocument();
  });

  it('labels routine walkways at their geometric midpoint and delivers exact cautions', () => {
    const map: VenueMapConfig = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'left', label: 'Left', kind: 'entry', x: 80, y: 0 },
        { id: 'right', label: 'Right', kind: 'space', x: 100, y: 0 },
      ],
      routes: [{
        id: 'preferred-route',
        name: 'Upper promenade',
        pointIds: ['left', 'right'],
        priority: 'preferred',
        accessibility: 'step-free',
        notes: 'Keep the gate clear for wheelchairs.',
      }],
    };
    const { container } = render(<VenueMapCanvas map={map} />);
    const routeLabel = container.querySelector('[data-map-route-label="preferred-route"]')!;

    expect(routeLabel).toHaveTextContent('Preferred · ♿ Upper promenade');
    expect(routeLabel).toHaveAttribute('text-anchor', 'end');
    expect(Number(routeLabel.getAttribute('x'))).toBeLessThan(90);
    expect(Number(routeLabel.getAttribute('y'))).toBeGreaterThan(0);
    const routeKey = screen.getByRole('region', { name: 'Walkways and access notes' });
    expect(routeKey).toHaveTextContent('Keep the gate clear for wheelchairs.');
  });

  it('visibly and accessibly identifies emergency-only walkways', () => {
    const map: VenueMapConfig = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry', x: 5, y: 5 },
        { id: 'assembly', label: 'Assembly', kind: 'amenity', x: 30, y: 20 },
      ],
      routes: [{
        id: 'emergency',
        name: 'North Evacuation',
        pointIds: ['gate', 'assembly'],
        priority: 'emergency-only',
      }],
    };
    const { container } = render(<VenueMapCanvas map={map} />);

    expect(container.querySelector('polyline')).toHaveAttribute('stroke', '#b91c1c');
    expect(container.querySelector('[data-map-route-label="emergency"]'))
      .toHaveTextContent('Emergency only · North Evacuation');
    const routeKey = screen.getByRole('region', { name: 'Walkways and access notes' });
    expect(routeKey).toHaveTextContent('North Evacuation');
    expect(routeKey).toHaveTextContent('Emergency only · Mobility not verified');
  });
});

import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlacedTable, TableSpec, Venue } from '../types';
import type { GeometryImpactSource } from '../utils/venueGeometryImpact';
import { VenueGeometryEditor } from './VenueGeometryEditor';

const venue = {
  id: 'venue', name: 'Hall', category: 'reception', width: 20, height: 20,
  capacity: 100, color: '#fff', shape: 'rectangle', canvasWidth: 40,
  canvasHeight: 40, venueX: 10, venueY: 10,
} as Venue;
const spec: TableSpec = {
  id: 'table', name: 'Table', shape: 'rectangle', width: 4, height: 4,
  capacity: 0,
};
const placed: PlacedTable = {
  id: 'placed', type: 'table', specId: 'table', x: 15, y: 5,
  rotation: 0, label: 'Placed', guests: [], chairCount: 0,
};
const source: GeometryImpactSource = {
  id: 'working:venue', label: 'Current working layout', kind: 'working',
  tables: [placed], fixtures: [], decor: [],
};

function GeometryEditorHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Edit geometry</button>
      {open && (
        <VenueGeometryEditor
          venue={venue}
          sources={[]}
          onApply={vi.fn()}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

describe('VenueGeometryEditor draft and impact policy', () => {
  beforeEach(() => {
    localStorage.setItem('spm_tableSpecs', JSON.stringify([spec]));
    localStorage.setItem('spm_fixtureTypes', JSON.stringify([]));
    localStorage.setItem('spm_decor_arrangements', JSON.stringify([]));
  });

  it('contains keyboard focus and restores it to the opener on close', async () => {
    const user = userEvent.setup();
    render(<GeometryEditorHarness />);

    const opener = screen.getByRole('button', { name: 'Edit geometry' });
    await user.click(opener);
    const title = screen.getByRole('heading', { name: 'Edit venue & canvas geometry' });
    await waitFor(() => expect(title).toHaveFocus());

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Close venue geometry editor' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(opener).toHaveFocus();
  });

  it('gives the nested custom-outline dialog its own focus scope', async () => {
    const user = userEvent.setup();
    const customVenue = {
      ...venue,
      shape: 'custom' as const,
      isCustomShape: true,
      shapePoints: [
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
      ],
    };
    render(<VenueGeometryEditor venue={customVenue} sources={[]} onApply={vi.fn()} onClose={vi.fn()} />);

    const editOutline = screen.getByRole('button', { name: /Edit 4 custom outline points/i });
    await user.click(editOutline);
    const builder = screen.getByRole('dialog', { name: /Venue Shape Builder/i });
    await waitFor(() => expect(screen.getByRole('heading', { name: /Venue Shape Builder/i })).toHaveFocus());

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(builder).toContainElement(document.activeElement as HTMLElement);

    await user.click(screen.getByRole('button', { name: 'Close shape builder' }));
    expect(editOutline).toHaveFocus();
  });

  it('blocks a stale local draft when the same venue geometry changes externally', () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <VenueGeometryEditor venue={venue} sources={[]} onApply={onApply} onClose={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Width (ft)'), { target: { value: '30' } });

    rerender(
      <VenueGeometryEditor venue={{ ...venue, width: 25 }} sources={[]} onApply={onApply} onClose={vi.fn()} />,
    );

    expect(screen.getByText(/Venue geometry changed in another update/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply geometry' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('requires explicit repair for a historical furniture-only venue shape', async () => {
    const onApply = vi.fn();
    const historicalVenue = { ...venue, shape: 'circle' as const };
    render(<VenueGeometryEditor venue={historicalVenue} sources={[]} onApply={onApply} onClose={vi.fn()} />);

    expect(screen.getByRole('img', {
      name: /Rectangular compatibility preview for unsupported stored circle venue shape/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/the stored “circle” venue shape is not silently converted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply geometry' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /^Rectangle/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply geometry' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0][0].shape).toBe('rectangle');
  });

  it('converts an unsupported historical shape to an explicit Custom outline', async () => {
    const onApply = vi.fn();
    const historicalVenue = { ...venue, shape: 'circle' as const };
    render(<VenueGeometryEditor venue={historicalVenue} sources={[]} onApply={onApply} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /^Custom/i }));
    expect(screen.queryByText(/stored “circle” venue shape is not silently converted/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit 4 custom outline points/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Apply geometry' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0][0]).toMatchObject({
      shape: 'custom',
      isCustomShape: true,
      shapePoints: [
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
      ],
    });
    expect(onApply.mock.calls[0][0].customPath).toBeTruthy();
  });

  it('keeps geometry edits local until the explicit Apply action', async () => {
    const onApply = vi.fn();
    render(<VenueGeometryEditor venue={venue} sources={[]} onApply={onApply} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Width (ft)'), { target: { value: '30' } });
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/Footprint 20 × 20 ft → 30 × 20 ft/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply geometry' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0][0].width).toBe(30);
    expect(onApply.mock.calls[0][0].venueX).toBe(10);
  });

  it('recovers a custom-outline resize from transient invalid input using the last valid dimensions', async () => {
    const onApply = vi.fn();
    const customVenue = {
      ...venue,
      shape: 'custom' as const,
      isCustomShape: true,
      canvasWidth: 60,
      shapePoints: [
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
      ],
    };
    render(<VenueGeometryEditor venue={customVenue} sources={[]} onApply={onApply} onClose={vi.fn()} />);

    const width = screen.getByLabelText('Width (ft)');
    fireEvent.change(width, { target: { value: '' } });
    expect(screen.getByText(/Venue width must be a number/)).toBeInTheDocument();
    fireEvent.change(width, { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply geometry' }));

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0][0].shapePoints).toEqual([
      { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 },
    ]);
  });

  it('blocks self-intersecting custom outlines from being applied', () => {
    const malformed = {
      ...venue,
      shape: 'custom' as const,
      isCustomShape: true,
      shapePoints: [
        { x: 0, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 20, y: 0 },
      ],
    };
    render(<VenueGeometryEditor venue={malformed} sources={[]} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/edges cannot cross/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply geometry' })).toBeDisabled();
  });

  it('blocks Apply until newly affected layouts are reviewed and acknowledged', async () => {
    const onApply = vi.fn();
    render(<VenueGeometryEditor venue={venue} sources={[source]} onApply={onApply} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Width (ft)'), { target: { value: '12' } });
    expect(screen.getByText('1 affected item')).toBeInTheDocument();
    expect(screen.getByText('1', { selector: '.text-xl.font-bold.text-red-900' })).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: 'Apply geometry' });
    expect(apply).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/I reviewed the conflicts/));
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  });

  it('requires confirmation before discarding a dirty draft', () => {
    const onClose = vi.fn();
    render(<VenueGeometryEditor venue={venue} sources={[]} onApply={vi.fn()} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Height (ft)'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Discard geometry draft?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

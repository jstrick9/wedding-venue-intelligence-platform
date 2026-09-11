import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VenueMapDesigner } from './VenueMapDesigner';
import { emptyVenueMapConfig } from '../services/wayfinding/venueWayfindingService';

const uploadImageMock = vi.hoisted(() => vi.fn());

vi.mock('../services/storage/imageStorage', async (importActual) => {
  const actual = await importActual<typeof import('../services/storage/imageStorage')>();
  return { ...actual, uploadImage: uploadImageMock };
});

vi.mock('../services/platform', async (importActual) => {
  const actual = await importActual<typeof import('../services/platform')>();
  return { ...actual, getPlatformProvider: () => 'local' };
});

describe('VenueMapDesigner base-map upload races', () => {
  beforeEach(() => {
    uploadImageMock.mockReset();
  });

  it('merges a completed upload onto edits made while the upload was pending', async () => {
    let finishUpload!: (value: string) => void;
    uploadImageMock.mockReturnValue(new Promise<string>((resolve) => {
      finishUpload = resolve;
    }));
    const onSave = vi.fn();
    const onDirtyChange = vi.fn();

    const { container } = render(
      <VenueMapDesigner
        map={emptyVenueMapConfig()}
        venues={[]}
        onSave={onSave}
        onDirtyChange={onDirtyChange}
      />,
    );

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'property.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText('Upload base map image file'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText('Uploading…')).toBeInTheDocument();
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    });

    fireEvent.click(screen.getByRole('button', { name: '🅿️ Parking' }));
    fireEvent.click(screen.getByRole('button', { name: /Place Parking at center/i }));

    await act(async () => {
      finishUpload('data:image/png;base64,uploaded-map');
    });

    await waitFor(() => expect(screen.queryByText('Uploading…')).not.toBeInTheDocument());
    fireEvent.load(container.querySelector('image')!);
    // Point fields and placement already belong to the local working draft;
    // no secondary Apply/Done transaction is required before publication.
    fireEvent.click(screen.getByRole('button', { name: /Save & publish Venue Map/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      backgroundImageUrl: 'data:image/png;base64,uploaded-map',
    });
    expect(onSave.mock.calls[0][0].points).toHaveLength(1);
    expect(onSave.mock.calls[0][0].points[0].kind).toBe('parking');
  });

  it('disables competing background-source controls while an upload is pending', async () => {
    uploadImageMock.mockReturnValue(new Promise<string>(() => undefined));
    const map = {
      ...emptyVenueMapConfig(),
      backgroundImageUrl: 'https://example.com/existing.png',
    };

    render(<VenueMapDesigner map={map} venues={[]} onSave={() => undefined} />);

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'replacement.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText('Upload base map image file'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(screen.getByText('Uploading…')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Remove/i })).toBeDisabled();
    expect(screen.getByLabelText('Base map image URL')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save & publish Venue Map/i })).toBeDisabled();
  });
});

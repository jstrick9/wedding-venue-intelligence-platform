import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  uploadImage: vi.fn(),
  resolveImageRef: vi.fn(),
}));
const layoutExportMocks = vi.hoisted(() => ({
  downloadLayoutPng: vi.fn().mockResolvedValue(undefined),
}));
const toastMocks = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock('../services/platform', async (importActual) => {
  const actual = await importActual<typeof import('../services/platform')>();
  return { ...actual, getPlatformProvider: () => 'supabase' };
});

vi.mock('../services/storage/imageStorage', async (importActual) => {
  const actual = await importActual<typeof import('../services/storage/imageStorage')>();
  return {
    ...actual,
    uploadImage: storageMocks.uploadImage,
    resolveImageRef: storageMocks.resolveImageRef,
  };
});

vi.mock('../utils/layoutExport', async (importActual) => {
  const actual = await importActual<typeof import('../utils/layoutExport')>();
  return {
    ...actual,
    downloadLayoutPng: layoutExportMocks.downloadLayoutPng,
  };
});

vi.mock('./Toast', () => ({
  showToast: toastMocks.showToast,
}));

import { VenueMapDesigner } from './VenueMapDesigner';
import { emptyVenueMapConfig } from '../services/wayfinding/venueWayfindingService';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const MANAGED_REF = `sp://venue-map-images/${ORG_ID}/1700000000000-property.png`;

describe('VenueMapDesigner managed cloud base images', () => {
  beforeEach(() => {
    storageMocks.uploadImage.mockReset();
    storageMocks.resolveImageRef.mockReset();
    storageMocks.resolveImageRef.mockResolvedValue('https://signed.test/property.png');
    layoutExportMocks.downloadLayoutPng.mockClear();
    toastMocks.showToast.mockClear();
  });

  it('keeps a legacy image recoverable for admins but hides it in portal preview and blocks republishing', async () => {
    const onSave = vi.fn();
    const map = {
      ...emptyVenueMapConfig(),
      backgroundImageUrl: 'https://legacy.example.test/property.png',
      backgroundOpacity: 0.8,
    };
    const { container } = render(
      <VenueMapDesigner
        map={map}
        venues={[]}
        organizationId={ORG_ID}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/Private-map upload required/i);
    expect(container.querySelector('image')).toHaveAttribute('href', map.backgroundImageUrl);
    expect(screen.queryByLabelText('Base map image URL')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save & publish Venue Map/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Staff master PNG/i }));
    await waitFor(() => expect(toastMocks.showToast).toHaveBeenCalledWith(
      expect.stringMatching(/projected base map is unavailable/i),
      'warning',
    ));
    expect(layoutExportMocks.downloadLayoutPng).not.toHaveBeenCalled();
    expect(container.querySelector('[data-map-artifact-output="projected"]'))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Preview audiences/i }));
    expect(container.querySelector('image')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to editing/i }));

    fireEvent.click(screen.getByRole('button', { name: /Remove/i }));
    const save = screen.getByRole('button', { name: /Save & publish Venue Map/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundImageUrl: undefined }),
      undefined,
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: /Save & publish Venue Map/i })).toBeEnabled());
  });

  it('publishes an upload only when storage returns this venue’s managed map reference', async () => {
    storageMocks.uploadImage.mockResolvedValue(MANAGED_REF);
    const onSave = vi.fn();
    const { container } = render(
      <VenueMapDesigner
        map={emptyVenueMapConfig()}
        venues={[]}
        organizationId={ORG_ID}
        onSave={onSave}
      />,
    );

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'property.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText('Upload base map image file'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(storageMocks.uploadImage).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Uploading…')).not.toBeInTheDocument());
    const save = screen.getByRole('button', { name: /Save & publish Venue Map/i });
    await waitFor(() => expect(container.querySelector('image')).toHaveAttribute(
      'href',
      'https://signed.test/property.png',
    ));
    expect(save).toBeDisabled();
    expect(screen.getByText(/Base map is loading — publishing will unlock/i)).toBeInTheDocument();

    fireEvent.error(container.querySelector('image')!);
    await waitFor(() => expect(screen.getByText(/Base map failed to load — retry, replace, or remove/i)).toBeInTheDocument());
    expect(save).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Retry base map/i }));
    await waitFor(() => expect(container.querySelector('image')).toHaveAttribute(
      'href',
      'https://signed.test/property.png',
    ));
    fireEvent.load(container.querySelector('image')!);
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundImageUrl: MANAGED_REF }),
      undefined,
    ));
  });
});

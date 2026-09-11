import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VenueMapConfig } from '../types';
import { VenueMapCanvas } from './VenueMapCanvas';

const mocks = vi.hoisted(() => ({
  resolveImageRef: vi.fn(),
}));

vi.mock('../services/storage/imageStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/storage/imageStorage')>();
  return { ...actual, resolveImageRef: mocks.resolveImageRef };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mapWithImage = (ref: string): VenueMapConfig => ({
  width: 100,
  height: 80,
  points: [{
    id: 'gate',
    label: 'Main Gate',
    kind: 'entry',
    x: 10,
    y: 10,
    lat: 35.2,
    lng: -80.8,
  }],
  routes: [],
  drawings: [],
  rainContingencies: [],
  backgroundImageUrl: ref,
  updatedAt: '2026-09-08T12:00:00.000Z',
});

describe('VenueMapCanvas base-image availability', () => {
  beforeEach(() => {
    mocks.resolveImageRef.mockReset();
  });

  it('never renders a previous signed image under a newly selected reference', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    mocks.resolveImageRef
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { container, rerender } = render(
      <VenueMapCanvas map={mapWithImage('sp://venue-map-images/org/first.png')} />,
    );

    rerender(<VenueMapCanvas map={mapWithImage('sp://venue-map-images/org/second.png')} />);
    first.resolve('https://signed.test/first.png');
    await Promise.resolve();
    expect(container.querySelector('image')).toBeNull();

    second.resolve('https://signed.test/second.png');
    await waitFor(() => expect(container.querySelector('image')).toHaveAttribute(
      'href',
      'https://signed.test/second.png',
    ));
  });

  it('fails closed after signing failure, retains named actions, and retries', async () => {
    mocks.resolveImageRef
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce('https://signed.test/recovered.png');
    const onPointClick = vi.fn();
    const { container } = render(
      <VenueMapCanvas
        map={mapWithImage('sp://venue-map-images/org/map.png')}
        hideMapWhenBackgroundUnavailable
        onPointClick={onPointClick}
      />,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Spatial pins and walkways are hidden/i);
    expect(container.querySelector('svg')).not.toBeInTheDocument();

    const summary = screen.getByText('Map location actions').closest('summary')!;
    fireEvent.click(summary);
    const action = within(summary.closest('details')!).getByRole('button', { name: /Main Gate/i });
    fireEvent.click(action);
    expect(onPointClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'gate' }));

    const retryButton = screen.getByRole('button', { name: /Retry base map/i });
    expect(retryButton).toHaveClass('no-print', 'spm-studio-chrome');
    fireEvent.click(retryButton);
    const preloader = await waitFor(() => {
      const image = container.querySelector<HTMLImageElement>('[data-map-background-preloader="true"]');
      expect(image).toHaveAttribute('src', 'https://signed.test/recovered.png');
      return image!;
    });
    fireEvent.load(preloader);
    await waitFor(() => expect(container.querySelector('image')).toHaveAttribute(
      'href',
      'https://signed.test/recovered.png',
    ));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports actual decode readiness, handles SVG failures, and lets an unavailable map re-pull', async () => {
    mocks.resolveImageRef.mockResolvedValue('https://signed.test/corrupt.png');
    const onRetry = vi.fn();
    const onLoadStateChange = vi.fn();
    const { container, rerender } = render(
      <VenueMapCanvas
        map={mapWithImage('sp://venue-map-images/org/corrupt.png')}
        hideMapWhenBackgroundUnavailable
        onBackgroundLoadStateChange={onLoadStateChange}
      />,
    );
    await waitFor(() => expect(onLoadStateChange).toHaveBeenCalledWith({
      source: 'sp://venue-map-images/org/corrupt.png',
      state: 'loading',
    }));
    const preloader = await waitFor(() => {
      const image = container.querySelector<HTMLImageElement>('[data-map-background-preloader="true"]');
      expect(image).toHaveAttribute('src', 'https://signed.test/corrupt.png');
      return image!;
    });
    expect(container.querySelector('svg')).not.toBeInTheDocument();
    fireEvent.load(preloader);
    await waitFor(() => expect(onLoadStateChange).toHaveBeenCalledWith({
      source: 'sp://venue-map-images/org/corrupt.png',
      state: 'ready',
    }));
    await waitFor(() => expect(container.querySelector('image')).toBeInTheDocument());
    fireEvent.error(container.querySelector('image')!);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onLoadStateChange).toHaveBeenCalledWith({
      source: 'sp://venue-map-images/org/corrupt.png',
      state: 'error',
    });
    expect(container.querySelector('svg')).not.toBeInTheDocument();

    rerender(
      <VenueMapCanvas
        map={{
          ...mapWithImage('sp://venue-map-images/org/corrupt.png'),
          backgroundImageUrl: undefined,
          backgroundImageUnavailable: true,
        }}
        hideMapWhenBackgroundUnavailable
        onRetryBackgroundImage={onRetry}
      />,
    );
    expect(screen.getByText('Named map locations')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry base map/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('never places an unsafe source or an invalid source-opacity pair in SVG', () => {
    const { container, rerender } = render(
      <VenueMapCanvas
        map={{
          ...mapWithImage('javascript:alert(1)'),
          backgroundOpacity: 0.8,
        }}
      />,
    );
    expect(container.querySelector('image')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/base map is temporarily unavailable/i);

    rerender(
      <VenueMapCanvas
        map={{
          ...mapWithImage('data:image/png;base64,abc'),
          backgroundOpacity: 99,
        }}
      />,
    );
    expect(container.querySelector('image')).not.toBeInTheDocument();
    expect(mocks.resolveImageRef).not.toHaveBeenCalled();
  });

  it('keeps vectors visible to an admin for recovery when fail-closed mode is off', () => {
    const { container } = render(
      <VenueMapCanvas
        map={{
          ...mapWithImage('sp://venue-map-images/org/missing.png'),
          backgroundImageUrl: undefined,
          backgroundImageUnavailable: true,
        }}
        editable
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/venue-admin recovery/i);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

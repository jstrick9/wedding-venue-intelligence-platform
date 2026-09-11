import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAccessibleHtmlArtifact,
  buildPdfFromJpeg,
  cloneAndNormalizeSvg,
  inlineSvgImages,
  renderSvgToCanvas,
} from './layoutExport';

/** Minimal JPEG-ish byte blob (content doesn't matter for structure tests). */
function jpegBytes(len: number): Uint8Array {
  const b = new Uint8Array(len);
  for (let i = 0; i < len; i++) b[i] = (i * 7) % 256;
  return b;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('accessible HTML artifact', () => {
  it('creates semantic self-contained text and escapes every authored value', () => {
    const html = buildAccessibleHtmlArtifact({
      title: 'Rose <script>alert(1)</script> Estate',
      summary: 'Two locations & one route.',
      metadata: [{ label: 'Audience', value: 'Guest "A"' }],
      sections: [{
        heading: 'Locations',
        entries: [{
          heading: 'West <Gate>',
          details: ['Guidance: Use A&B\nthen ring the bell.'],
        }],
      }],
    });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<main>');
    expect(html).toContain('<h2>Locations</h2>');
    expect(html).toContain('Rose &lt;script&gt;alert(1)&lt;/script&gt; Estate');
    expect(html).toContain('West &lt;Gate&gt;');
    expect(html).toContain('Use A&amp;B\nthen ring the bell.');
    expect(html).toContain('Guest &quot;A&quot;');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/<script|https?:\/\//i);
  });
});

describe('SVG export preparation', () => {
  it('preserves authored map coordinates while changing raster dimensions', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 80');
    svg.setAttribute('style', 'transform: scale(2)');
    const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    point.setAttribute('cx', '50');
    point.setAttribute('cy', '40');
    svg.appendChild(point);

    const clone = cloneAndNormalizeSvg(svg, 300, 240, '0 0 100 80');
    expect(clone.getAttribute('viewBox')).toBe('0 0 100 80');
    expect(clone.getAttribute('width')).toBe('300');
    expect(clone.getAttribute('height')).toBe('240');
    expect(clone.getAttribute('style')).toBeNull();
    expect(clone.querySelector('circle')).toHaveAttribute('cx', '50');
  });

  it('removes explicitly marked editor-only map artifacts from the export clone', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const authored = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    authored.setAttribute('data-authored-pin', 'true');
    const editorGuide = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    editorGuide.setAttribute('data-map-export-exclude', 'true');
    editorGuide.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'polyline'));
    svg.append(authored, editorGuide);

    const clone = cloneAndNormalizeSvg(svg, 100, 80, '0 0 100 80');
    expect(clone.querySelector('[data-authored-pin="true"]')).not.toBeNull();
    expect(clone.querySelector('[data-map-export-exclude="true"]')).toBeNull();
    expect(svg.querySelector('[data-map-export-exclude="true"]')).not.toBeNull();
  });

  it('renders an optional classification footer outside the authored map area', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 80');
    const context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textBaseline: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    };
    const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadedImage);

    const result = await renderSvgToCanvas(svg, {
      scale: 1,
      padding: 10,
      footerText: 'STAFF MASTER | Exported 9/7/2026',
    });

    expect(result.width).toBe(120);
    expect(result.height).toBe(172);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 10, 10, 100, 80);
    const footerLines = context.fillText.mock.calls.map(([text]) => text);
    expect(footerLines.join(' ')).toBe('STAFF MASTER | Exported 9/7/2026');
    expect(context.fillText.mock.calls.every((call) => call.length === 3)).toBe(true);
    contextSpy.mockRestore();
  });

  it('renders an artifact title above rather than over authored map coordinates', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 80');
    const context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textBaseline: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadedImage);

    const result = await renderSvgToCanvas(svg, {
      scale: 1,
      padding: 10,
      headerText: 'Rose & Pine Estate',
    });

    expect(result).toEqual(expect.objectContaining({ width: 120, height: 162 }));
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 10, 72, 100, 80);
    expect(context.fillText).toHaveBeenCalledWith('Rose & Pine', 10, 10);
    expect(context.fillText).toHaveBeenCalledWith('Estate', 10, 35);
  });

  it('renders every supplemental guidance entry below the authored map', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 180 80');
    const context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textBaseline: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadedImage);

    const result = await renderSvgToCanvas(svg, {
      scale: 1,
      padding: 10,
      supplementalSections: [{
        heading: 'If the venue activates its rain plan',
        entries: [
          'Ceremony Garden → Grand Ballroom — Enter through the east doors.',
          'South Lawn → Gallery',
        ],
      }],
      footerText: 'Guest portal preview',
    });

    expect(result.height).toBeGreaterThan(132);
    const renderedText = context.fillText.mock.calls.map(([text]) => text).join(' ');
    expect(renderedText).toContain('If the venue activates its rain plan');
    expect(renderedText).toContain('Ceremony Garden → Grand Ballroom — Enter through the east doors.');
    expect(renderedText).toContain('South Lawn → Gallery');
    expect(renderedText).toContain('Guest portal preview');
  });

  it('scales supplemental and provenance typography with adaptive raster width', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 80');
    const context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textBaseline: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadedImage);

    const result = await renderSvgToCanvas(svg, {
      scale: 20,
      padding: 10,
      supplementalSections: [{
        heading: 'Walkways & access notes',
        entries: ['Garden promenade — Keep the east gate clear.'],
      }],
      footerText: 'Saved canonical map | Staff master',
    });

    expect(result.width).toBe(2_020);
    expect(result.height).toBe(1_856);
    expect(context.font).toBe('600 26px sans-serif');
    expect(context.lineWidth).toBe(2);
  });

  it('fails explicitly rather than truncating guidance that exceeds safe canvas limits', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 80');
    const context = {
      font: '',
      measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);

    await expect(renderSvgToCanvas(svg, {
      scale: 1,
      supplementalSections: [{
        heading: 'Rain plan',
        entries: Array.from({ length: 1_000 }, (_, index) =>
          `Plan ${index}: ${'Follow venue signs. '.repeat(20)}`,
        ),
      }],
    })).rejects.toThrow(/too large.*Narrow the preview scope/i);
  });

  it('embeds a remote raster image instead of silently deleting it', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', 'https://cdn.example.test/property.png');
    svg.appendChild(image);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    } as Response));

    await inlineSvgImages(svg);
    expect(svg.querySelector('image')).not.toBeNull();
    expect(image.getAttribute('href')).toMatch(/^data:image\/png;base64,/);
  });

  it('fails explicitly when a remote image cannot be embedded', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', 'https://blocked.example.test/property.png');
    svg.appendChild(image);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

    await expect(inlineSvgImages(svg)).rejects.toThrow(/could not be loaded for export/i);
    expect(svg.querySelector('image')).not.toBeNull();
  });
});

describe('buildPdfFromJpeg', () => {
  it('produces a structurally valid single-page PDF with correct xref offsets', () => {
    const jpeg = jpegBytes(100);
    const pdf = buildPdfFromJpeg(jpeg, 800, 600);
    const text = new TextDecoder().decode(pdf);

    // Header / trailer / EOF
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.includes('%%EOF')).toBe(true);
    expect(text.includes('/Type /Page')).toBe(true);
    expect(text.includes('/Width 800')).toBe(true);
    expect(text.includes('/Height 600')).toBe(true);
    expect(text.includes('/Filter /DCTDecode')).toBe(true);

    // xref points must be numeric and within range; startxref should point at
    // the xref table.
    const startxrefMatch = /startxref\n(\d+)\n%%EOF/.exec(text);
    expect(startxrefMatch).toBeTruthy();
    const startxref = Number(startxrefMatch![1]);
    expect(startxref).toBeGreaterThan(0);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');

    const xrefBlock = text.slice(startxref, text.indexOf('trailer', startxref));
    const lines = xrefBlock.trimEnd().split('\n');
    expect(lines[0]).toBe('xref');
    expect(lines[1]).toBe('0 6');
    expect(lines).toHaveLength(8); // header + range + one free entry + five objects
    expect(lines[2]).toBe('0000000000 65535 f ');
    for (let objectNumber = 1; objectNumber <= 5; objectNumber += 1) {
      const offset = Number(lines[objectNumber + 2].slice(0, 10));
      expect(text.slice(offset, offset + `${objectNumber} 0 obj`.length)).toBe(`${objectNumber} 0 obj`);
    }
  });

  it('embeds the full jpeg bytes in the image stream', () => {
    const jpeg = jpegBytes(256);
    const pdf = buildPdfFromJpeg(jpeg, 200, 100);
    // Find the jpeg bytes inside the pdf (they appear between stream and
    // endstream of the image object).
    const bytes = Array.from(pdf);
    const start = bytes.indexOf(jpeg[0]);
    expect(start).toBeGreaterThan(0);
    // The jpeg sequence should be present.
    expect(pdf.slice(start, start + jpeg.length)).toEqual(jpeg);
  });
});

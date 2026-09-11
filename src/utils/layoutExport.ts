/**
 * Floor-plan layout export: renders the on-canvas SVG to a high-res PNG and to
 * a single-page PDF (dependency-free — the PDF embeds a JPEG of the plan).
 *
 * The FloorPlanCanvas is an <svg>; we clone it, normalize it for export, draw
 * it to an offscreen canvas, and produce:
 *  - PNG  via canvas.toBlob('image/png')
 *  - PDF  via a minimal PDF generator that embeds the JPEG as a DCTDecode image
 *
 * Images: data URLs pass through. Blob, signed-storage, and remote image URLs
 * are fetched and embedded before rasterization. Export fails explicitly when an
 * image cannot be embedded, rather than silently producing an incomplete map.
 */

export interface ExportSupplementalSection {
  heading: string;
  entries: readonly string[];
}

export interface AccessibleHtmlArtifactEntry {
  heading: string;
  details?: readonly string[];
}

export interface AccessibleHtmlArtifactSection {
  heading: string;
  entries: readonly AccessibleHtmlArtifactEntry[];
}

export interface AccessibleHtmlArtifactOptions {
  title: string;
  summary?: string;
  metadata?: readonly { label: string; value: string }[];
  sections?: readonly AccessibleHtmlArtifactSection[];
}

export interface ExportOptions {
  /** Multiplier on the SVG's intrinsic pixel size (default 2 for crisp output). */
  scale?: number;
  /** White padding around the plan, in export pixels (default 24). */
  padding?: number;
  /** Optional visible artifact title rendered outside, above, the authored map. */
  headerText?: string;
  /** Optional structured guidance rendered below the authored map. */
  supplementalSections?: readonly ExportSupplementalSection[];
  /** Optional classification/provenance line rendered into the raster itself. */
  footerText?: string;
}

const ENCODED_HEADER = '%PDF-1.4\n';

export function cloneAndNormalizeSvg(
  svg: SVGSVGElement,
  widthPx: number,
  heightPx: number,
  fallbackViewBox: string,
): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Export from the SVG's authored coordinate system, not from CSS pan/zoom.
  // Pixel dimensions control raster resolution; preserving the original viewBox
  // keeps map coordinates and aspect ratio correct.
  clone.removeAttribute('style');
  clone.setAttribute('width', String(widthPx));
  clone.setAttribute('height', String(heightPx));
  clone.setAttribute('viewBox', svg.getAttribute('viewBox') || fallbackViewBox);
  clone.setAttribute('preserveAspectRatio', svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  // Editable map canvases share the mounted SVG with export controls. Remove
  // transient waypoints, route-order guides, focus rings, and other explicitly
  // marked editor chrome from the clone without mutating the live editor.
  clone.querySelectorAll('[data-map-export-exclude="true"]').forEach((node) => node.remove());
  return clone;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Could not encode an image for export.'));
    reader.onerror = () => reject(new Error('Could not encode an image for export.'));
    reader.readAsDataURL(blob);
  });
}

export async function inlineSvgImages(svg: SVGSVGElement): Promise<void> {
  const images = Array.from(svg.querySelectorAll('image'));
  await Promise.all(images.map(async (image) => {
    const href = image.getAttribute('href') || image.getAttribute('xlink:href') || '';
    if (!href || href.startsWith('data:')) return;

    let response: Response;
    try {
      response = await fetch(href, { credentials: 'same-origin' });
    } catch {
      throw new Error('The map image could not be loaded for export. Upload it to the venue map instead of using a blocked external URL.');
    }
    if (!response.ok) {
      throw new Error(`The map image could not be loaded for export (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(blob.type)) {
      throw new Error('The map image has an unsupported file type for export. Use PNG, JPEG, WebP, or GIF.');
    }
    if (blob.size > 12 * 1024 * 1024) {
      throw new Error('The map image is too large to embed in an export.');
    }
    const dataUrl = await blobToDataUrl(blob);
    image.setAttribute('href', dataUrl);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUrl);
  }));
}

function svgToXmlString(svg: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

const MAX_EXPORT_CANVAS_DIMENSION = 16_384;
const MAX_EXPORT_CANVAS_PIXELS = 64_000_000;

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const measure = (value: string) => ctx.measureText(value).width;
  const wrapParagraph = (paragraph: string): string[] => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines: string[] = [];
    let line = '';

    const appendToken = (token: string) => {
      if (measure(token) <= maxWidth) {
        const candidate = line ? `${line} ${token}` : token;
        if (!line || measure(candidate) <= maxWidth) {
          line = candidate;
        } else {
          lines.push(line);
          line = token;
        }
        return;
      }

      if (line) {
        lines.push(line);
        line = '';
      }
      let chunk = '';
      for (const character of Array.from(token)) {
        const candidate = `${chunk}${character}`;
        if (chunk && measure(candidate) > maxWidth) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk = candidate;
        }
      }
      line = chunk;
    };

    words.forEach(appendToken);
    if (line) lines.push(line);
    return lines;
  };

  return text.replace(/\r\n?/g, '\n').split('\n').flatMap(wrapParagraph);
}

interface PreparedSupplementalSection {
  headingLines: string[];
  entryLines: string[][];
  height: number;
}

interface ExportTypographyMetrics {
  scale: number;
  headerFontSize: number;
  headerLineHeight: number;
  headingFontSize: number;
  bodyFontSize: number;
  lineHeight: number;
  horizontalInset: number;
  entryIndent: number;
  sectionVerticalInset: number;
  headingGap: number;
  entryGap: number;
}

function exportTypographyMetrics(contentWidth: number): ExportTypographyMetrics {
  // Keep approximately print-readable type as the adaptive raster width grows.
  // A 1,000 px content width is the baseline; small exports retain the existing
  // minimum rather than shrinking, while panoramic exports scale proportionally.
  const scale = Math.max(1, contentWidth / 1_000);
  return {
    scale,
    headerFontSize: 20 * scale,
    headerLineHeight: 25 * scale,
    headingFontSize: 14 * scale,
    bodyFontSize: 13 * scale,
    lineHeight: 18 * scale,
    horizontalInset: 14 * scale,
    entryIndent: 16 * scale,
    sectionVerticalInset: 12 * scale,
    headingGap: 6 * scale,
    entryGap: 4 * scale,
  };
}

function prepareSupplementalSections(
  ctx: CanvasRenderingContext2D,
  sections: readonly ExportSupplementalSection[],
  contentWidth: number,
  typography: ExportTypographyMetrics,
): PreparedSupplementalSection[] {
  return sections.flatMap((section) => {
    const heading = section.heading.trim();
    const entries = section.entries.map((entry) => entry.trim()).filter(Boolean);
    if (!heading || entries.length === 0) return [];
    ctx.font = `700 ${typography.headingFontSize}px sans-serif`;
    const headingLines = wrapCanvasText(
      ctx,
      heading,
      contentWidth - typography.horizontalInset * 2,
    );
    ctx.font = `400 ${typography.bodyFontSize}px sans-serif`;
    const entryLines = entries.map((entry) => wrapCanvasText(
      ctx,
      entry,
      contentWidth - typography.horizontalInset * 2 - typography.entryIndent,
    ));
    const headingHeight = headingLines.length * typography.lineHeight;
    const entriesHeight = entryLines.reduce(
      (total, lines) => total + lines.length * typography.lineHeight,
      0,
    ) + Math.max(0, entryLines.length - 1) * typography.entryGap;
    return [{
      headingLines,
      entryLines,
      height: typography.sectionVerticalInset
        + headingHeight
        + typography.headingGap
        + entriesHeight
        + typography.sectionVerticalInset,
    }];
  });
}

/**
 * Render the given SVG (normalized) to an offscreen canvas and return it.
 */
export async function renderSvgToCanvas(
  svg: SVGSVGElement,
  options: ExportOptions = {},
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const scale = options.scale ?? 2;
  const padding = options.padding ?? 24;

  // Intrinsic plan size in SVG user units (the venue canvas dimensions).
  const rawW = Math.max(1, svg.viewBox.baseVal?.width || svg.clientWidth || 480);
  const rawH = Math.max(1, svg.viewBox.baseVal?.height || svg.clientHeight || 320);

  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Export scale must be greater than zero.');
  if (!Number.isFinite(padding) || padding < 0) throw new Error('Export padding cannot be negative.');

  const contentWidth = Math.max(1, Math.round(rawW * scale));
  const contentHeight = Math.max(1, Math.round(rawH * scale));
  const headerText = options.headerText?.trim() || '';
  const footerText = options.footerText?.trim() || '';
  const width = contentWidth + padding * 2;
  if (width > MAX_EXPORT_CANVAS_DIMENSION) {
    throw new Error('The map is too wide to export safely. Reduce its dimensions or export scale.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 1;
  const sizingContext = canvas.getContext('2d');
  if (!sizingContext) throw new Error('Canvas 2D context unavailable.');
  const typography = exportTypographyMetrics(contentWidth);
  sizingContext.font = `700 ${typography.headerFontSize}px sans-serif`;
  const headerLines = headerText
    ? wrapCanvasText(sizingContext, headerText, Math.max(1, contentWidth))
    : [];
  const headerHeight = headerLines.length > 0
    ? headerLines.length * typography.headerLineHeight + 12 * typography.scale
    : 0;
  const supplementalSections = prepareSupplementalSections(
    sizingContext,
    options.supplementalSections || [],
    Math.max(64, contentWidth),
    typography,
  );
  sizingContext.font = `600 ${typography.bodyFontSize}px sans-serif`;
  const footerLines = footerText
    ? wrapCanvasText(sizingContext, footerText, Math.max(1, contentWidth))
    : [];
  const footerGap = footerLines.length > 0
    ? Math.max(8 * typography.scale, padding / 2)
    : 0;
  const footerHeight = footerLines.length > 0
    ? footerLines.length * 16 * typography.scale + 16 * typography.scale
    : 0;
  const supplementalGap = supplementalSections.length > 0 ? 12 * typography.scale : 0;
  const supplementalSectionGap = 8 * typography.scale;
  const supplementalHeight = supplementalSections.reduce(
    (total, section) => total + section.height,
    0,
  ) + Math.max(0, supplementalSections.length - 1) * supplementalSectionGap;
  const height = Math.ceil(
    headerHeight + contentHeight + padding * 2
      + supplementalGap + supplementalHeight + footerGap + footerHeight,
  );
  if (
    height > MAX_EXPORT_CANVAS_DIMENSION
    || width * height > MAX_EXPORT_CANVAS_PIXELS
  ) {
    throw new Error('This map and its guidance are too large for one safe export. Narrow the preview scope and try again.');
  }

  const clone = cloneAndNormalizeSvg(svg, contentWidth, contentHeight, `0 0 ${rawW} ${rawH}`);
  await inlineSvgImages(clone);
  const xml = svgToXmlString(clone);
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // White background.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (headerLines.length > 0) {
        ctx.fillStyle = '#1f2937';
        ctx.font = `700 ${typography.headerFontSize}px sans-serif`;
        ctx.textBaseline = 'top';
        let headerTop = padding;
        headerLines.forEach((line) => {
          ctx.fillText(line, padding, headerTop);
          headerTop += typography.headerLineHeight;
        });
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = Math.max(1, typography.scale);
        ctx.beginPath();
        ctx.moveTo(padding, padding + headerHeight - 6 * typography.scale);
        ctx.lineTo(width - padding, padding + headerHeight - 6 * typography.scale);
        ctx.stroke();
      }
      const mapTop = padding + headerHeight;
      ctx.drawImage(img, padding, mapTop, contentWidth, contentHeight);
      let contentBottom = mapTop + contentHeight;
      if (supplementalSections.length > 0) {
        let sectionTop = contentBottom + supplementalGap;
        supplementalSections.forEach((section, sectionIndex) => {
          ctx.fillStyle = '#eff6ff';
          ctx.fillRect(padding, sectionTop, contentWidth, section.height);
          ctx.strokeStyle = '#bfdbfe';
          ctx.lineWidth = Math.max(1, typography.scale);
          ctx.beginPath();
          ctx.moveTo(padding, sectionTop);
          ctx.lineTo(width - padding, sectionTop);
          ctx.lineTo(width - padding, sectionTop + section.height);
          ctx.lineTo(padding, sectionTop + section.height);
          ctx.lineTo(padding, sectionTop);
          ctx.stroke();

          const textLeft = padding + typography.horizontalInset;
          let textTop = sectionTop + typography.sectionVerticalInset;
          ctx.fillStyle = '#172554';
          ctx.font = `700 ${typography.headingFontSize}px sans-serif`;
          ctx.textBaseline = 'top';
          section.headingLines.forEach((line) => {
            ctx.fillText(line, textLeft, textTop);
            textTop += typography.lineHeight;
          });
          textTop += typography.headingGap;
          ctx.font = `400 ${typography.bodyFontSize}px sans-serif`;
          section.entryLines.forEach((lines, entryIndex) => {
            ctx.fillText('•', textLeft, textTop);
            lines.forEach((line) => {
              ctx.fillText(line, textLeft + typography.entryIndent, textTop);
              textTop += typography.lineHeight;
            });
            if (entryIndex < section.entryLines.length - 1) textTop += typography.entryGap;
          });

          sectionTop += section.height;
          if (sectionIndex < supplementalSections.length - 1) {
            sectionTop += supplementalSectionGap;
          }
        });
        contentBottom += supplementalGap + supplementalHeight;
      }
      if (footerText) {
        const footerTop = contentBottom + footerGap;
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = Math.max(1, typography.scale);
        ctx.beginPath();
        ctx.moveTo(padding, footerTop);
        ctx.lineTo(width - padding, footerTop);
        ctx.stroke();
        ctx.fillStyle = '#374151';
        ctx.font = `600 ${typography.bodyFontSize}px sans-serif`;
        ctx.textBaseline = 'top';
        let footerTextTop = footerTop + 8 * typography.scale;
        footerLines.forEach((line) => {
          ctx.fillText(line, padding, footerTextTop);
          footerTextTop += 16 * typography.scale;
        });
      }
      resolve({ canvas, width, height });
    };
    img.onerror = () => reject(new Error('Could not render the layout image.'));
    img.src = svgDataUrl;
  });
}

function escapeAccessibleHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build a self-contained semantic text companion for a visual map artifact. */
export function buildAccessibleHtmlArtifact(options: AccessibleHtmlArtifactOptions): string {
  const title = options.title.trim() || 'Venue Map';
  const metadata = (options.metadata || []).filter(
    (item) => item.label.trim() && item.value.trim(),
  );
  const sections = (options.sections || []).flatMap((section) => {
    const entries = section.entries.filter((entry) => entry.heading.trim());
    return section.heading.trim() && entries.length > 0 ? [{ ...section, entries }] : [];
  });
  const metadataHtml = metadata.length > 0
    ? `<dl class="metadata">${metadata.map((item) => `<div><dt>${escapeAccessibleHtml(item.label)}</dt><dd>${escapeAccessibleHtml(item.value)}</dd></div>`).join('')}</dl>`
    : '';
  const summaryHtml = options.summary?.trim()
    ? `<p class="summary">${escapeAccessibleHtml(options.summary)}</p>`
    : '';
  const sectionsHtml = sections.length > 0
    ? sections.map((section) => `
      <section>
        <h2>${escapeAccessibleHtml(section.heading)}</h2>
        <ul>${section.entries.map((entry) => `
          <li>
            <h3>${escapeAccessibleHtml(entry.heading)}</h3>
            ${(entry.details || []).filter((detail) => detail.trim()).map((detail) => `<p>${escapeAccessibleHtml(detail)}</p>`).join('')}
          </li>`).join('')}
        </ul>
      </section>`).join('')
    : '<p>No audience-visible map locations or guidance are available in this artifact.</p>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeAccessibleHtml(title)} — Accessible Venue Map</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; color: #1f2937; background: #f8fafc; }
    body { max-width: 58rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
    main { background: #fff; border: 1px solid #d1d5db; border-radius: .75rem; padding: clamp(1rem, 3vw, 2rem); }
    h1 { margin: 0; color: #4a1942; font-size: clamp(1.6rem, 4vw, 2.4rem); overflow-wrap: anywhere; }
    h2 { margin: 2rem 0 .75rem; border-bottom: 2px solid #99f6e4; padding-bottom: .35rem; font-size: 1.3rem; }
    h3 { margin: 0 0 .25rem; font-size: 1.05rem; }
    p { margin: .2rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .summary { margin-top: .75rem; font-size: 1.05rem; }
    .metadata { display: grid; gap: .5rem; margin: 1.25rem 0; }
    .metadata div { display: grid; grid-template-columns: minmax(8rem, 12rem) 1fr; gap: .75rem; }
    dt { font-weight: 700; }
    dd { margin: 0; overflow-wrap: anywhere; }
    ul { display: grid; gap: .75rem; margin: 0; padding: 0; list-style: none; }
    li { border: 1px solid #d1fae5; border-radius: .5rem; padding: .75rem; break-inside: avoid; }
    .notice { border-left: .3rem solid #0f766e; padding-left: .75rem; }
    @media (max-width: 34rem) { .metadata div { grid-template-columns: 1fr; gap: 0; } }
    @media print { :root, body { background: #fff; } body { max-width: none; padding: 0; } main { border: 0; padding: 0; } }
  </style>
</head>
<body>
  <main>
    <h1>${escapeAccessibleHtml(title)}</h1>
    <p class="notice">Accessible text companion to the visual Venue Map. Spatial relationships are listed as map coordinates and ordered walkway stops.</p>
    ${summaryHtml}
    ${metadataHtml}
    ${sectionsHtml}
  </main>
</body>
</html>`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadAccessibleHtmlArtifact(
  filename: string,
  options: AccessibleHtmlArtifactOptions,
): void {
  const html = buildAccessibleHtmlArtifact(options);
  triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), `${filename}.html`);
}

/** Export the layout as a PNG file. */
export async function downloadLayoutPng(
  svg: SVGSVGElement,
  filename: string,
  options: ExportOptions = {},
): Promise<void> {
  const { canvas } = await renderSvgToCanvas(svg, options);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed.'))), 'image/png');
  });
  triggerDownload(blob, `${filename}.png`);
}

// ── Minimal PDF generator (single page, embedded JPEG) ──────────────────────

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Build a minimal single-page PDF embedding a JPEG image.
 * Only used for floor-plan export; not a general-purpose writer.
 */
export function buildPdfFromJpeg(jpegBytes: Uint8Array, imgW: number, imgH: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    pos += bytes.length;
  };
  const objStart = () => {
    offsets.push(pos);
  };

  push(ascii(ENCODED_HEADER));

  // Object 1 — Catalog
  objStart();
  push(ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
  // Object 2 — Pages
  objStart();
  push(ascii('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'));
  // Object 3 — Page
  objStart();
  push(
    ascii(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${imgW} ${imgH}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    ),
  );
  // Object 4 — Image XObject (JPEG)
  objStart();
  push(
    ascii(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    ),
  );
  push(jpegBytes);
  push(ascii('\nendstream\nendobj\n'));
  // Object 5 — Content stream
  objStart();
  const content = `q ${imgW} 0 0 ${imgH} 0 0 cm /Im0 Do Q`;
  push(
    ascii(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`),
  );

  const xrefPos = pos;
  const xrefEntries = offsets.map(
    (offset) => `${String(offset).padStart(10, '0')} 00000 n `,
  );
  push(
    ascii(
      `xref\n0 6\n0000000000 65535 f \n${xrefEntries.join('\n')}\n` +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`,
    ),
  );

  return concat(chunks);
}

/** Export the layout as a PDF file. */
export async function downloadLayoutPdf(
  svg: SVGSVGElement,
  filename: string,
  options: ExportOptions = {},
): Promise<void> {
  const { canvas } = await renderSvgToCanvas(svg, options);

  // JPEG for PDF embedding (DCTDecode).
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = jpegDataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const pdf = buildPdfFromJpeg(bytes, canvas.width, canvas.height);
  const blob = new Blob([pdf as unknown as BlobPart], { type: 'application/pdf' });
  triggerDownload(blob, `${filename}.pdf`);
}

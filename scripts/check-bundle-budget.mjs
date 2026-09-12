#!/usr/bin/env node
/**
 * Bundle budget gate (Review #247, P2-H remediation).
 *
 * Why
 * ---
 * The single-file bundle grew 409 kB → 481 kB → 557 kB gzip across Reviews
 * #173 → #180 → #245 with nothing in CI to stop the trend, and the split
 * build's admin chunk is 750+ kB raw. This script fails CI when a build
 * crosses its budget so growth becomes a deliberate, reviewed decision
 * (raise the budget in the same commit that justifies it — never silently).
 *
 * Usage
 *   node scripts/check-bundle-budget.mjs single   # after `npm run build`
 *   node scripts/check-bundle-budget.mjs split    # after `npm run build:split`
 *
 * Budgets are bytes. Current Review #280 sizes (2026-09-11):
 *   single-file: dist/index.html  631.52 kB gzip  (budget 650 kB)
 *   split build: largest chunk    735.37 kB raw   (budget 820 kB)
 * The single-file ratchet intentionally accounts for Design Studio geometry,
 * guided identity repair, and catalog revision/replacement safeguards added in
 * Review #280; it retains roughly 18 kB of gzip headroom.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const BUDGETS = {
  /** Max gzipped size of the single-file dist/index.html. */
  singleFileGzipBytes: 650 * 1024,
  /** Max raw size of any single chunk in the split build. */
  maxChunkRawBytes: 820 * 1024,
};

/**
 * @param {Array<{name: string, rawBytes: number, gzipBytes: number}>} entries
 * @param {'single' | 'split'} mode
 * @param {{singleFileGzipBytes: number, maxChunkRawBytes: number}} [budgets]
 */
export function evaluateBudgets(entries, mode, budgets = BUDGETS) {
  const failures = [];
  const report = [];
  const fmt = (bytes) => `${(bytes / 1024).toFixed(2)} kB`;

  for (const entry of entries) {
    report.push(`${entry.name}: ${fmt(entry.rawBytes)} raw / ${fmt(entry.gzipBytes)} gzip`);
    if (mode === 'single') {
      if (entry.gzipBytes > budgets.singleFileGzipBytes) {
        failures.push(
          `${entry.name} is ${fmt(entry.gzipBytes)} gzip, over the ${fmt(budgets.singleFileGzipBytes)} budget.`,
        );
      }
    } else if (entry.rawBytes > budgets.maxChunkRawBytes) {
      failures.push(
        `${entry.name} is ${fmt(entry.rawBytes)} raw, over the ${fmt(budgets.maxChunkRawBytes)} per-chunk budget.`,
      );
    }
  }

  return { ok: failures.length === 0, failures, report };
}

function measureFile(path, name) {
  const raw = readFileSync(path);
  return { name, rawBytes: raw.length, gzipBytes: gzipSync(raw).length };
}

function run(mode) {
  const dist = join(process.cwd(), 'dist');

  if (mode === 'single') {
    const indexPath = join(dist, 'index.html');
    if (!existsSync(indexPath)) {
      console.error('dist/index.html not found — run `npm run build` first.');
      process.exit(1);
    }
    const entries = [measureFile(indexPath, 'dist/index.html (single-file)')];
    const result = evaluateBudgets(entries, 'single');
    result.report.forEach((line) => console.log(line));
    if (!result.ok) {
      result.failures.forEach((line) => console.error(`BUNDLE BUDGET EXCEEDED: ${line}`));
      console.error(
        'If this growth is intentional, raise BUDGETS in scripts/check-bundle-budget.mjs in the same commit and say why.',
      );
      process.exit(1);
    }
    console.log('Single-file bundle within budget.');
    return;
  }

  if (mode === 'split') {
    const assetsDir = join(dist, 'assets');
    if (!existsSync(assetsDir)) {
      console.error('dist/assets not found — run `npm run build:split` first.');
      process.exit(1);
    }
    const entries = readdirSync(assetsDir)
      .filter((name) => name.endsWith('.js'))
      .map((name) => measureFile(join(assetsDir, name), `dist/assets/${name}`))
      .sort((a, b) => b.rawBytes - a.rawBytes);
    const result = evaluateBudgets(entries, 'split');
    // Report the largest chunks; small ones are noise.
    result.report.slice(0, 8).forEach((line) => console.log(line));
    if (!result.ok) {
      result.failures.forEach((line) => console.error(`BUNDLE BUDGET EXCEEDED: ${line}`));
      console.error(
        'If this growth is intentional, raise BUDGETS in scripts/check-bundle-budget.mjs in the same commit and say why.',
      );
      process.exit(1);
    }
    console.log('Split-build chunks within budget.');
    return;
  }

  console.error('Usage: node scripts/check-bundle-budget.mjs single|split');
  process.exit(1);
}

const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('check-bundle-budget.mjs') ||
    process.argv[1].endsWith('check-bundle-budget'));
if (isDirectRun && process.argv[2]) {
  run(process.argv[2]);
}

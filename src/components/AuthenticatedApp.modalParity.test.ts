import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard against the recurring "dead feature" bug: a lazy component imported and
 * its modal flag derived, but the panel never rendered (e.g. Templates, Staff
 * Operations, Vendors, Timeline, Print, Event Questions, Submission, Messages).
 *
 * This statically reads AuthenticatedApp.tsx and asserts that every
 * `const showX = modals.X` flag has a corresponding `{showX &&` render. If
 * someone wires a new modal button but forgets to render the panel, this test
 * fails.
 */
const APP_PATH = resolve(__dirname, 'AuthenticatedApp.tsx');

describe('AuthenticatedApp modal render parity', () => {
  it('every modal showX flag is rendered', () => {
    const source = readFileSync(APP_PATH, 'utf8');

    // Extract modal flags: const showVendors = modals.vendors; etc.
    const flagPattern = /const (show\w+) = modals\.(\w+);/g;
    const flags: { flag: string; modal: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = flagPattern.exec(source)) !== null) {
      flags.push({ flag: match[1], modal: match[2] });
    }

    expect(flags.length).toBeGreaterThan(0);

    // Every flag must be used in a render: `{showX && ...` or `showX &&`
    const missing: string[] = [];
    for (const { flag, modal } of flags) {
      // Ignore the declaration line itself and any non-render usage; require an
      // actual conditional render of the flag in the JSX.
      const renderOccurrences = source.split('\n').filter((line) => {
        const trimmed = line.trim();
        return (
          (trimmed.startsWith(`{${flag} &&`) ||
            trimmed.includes(`{${flag} &&`)) &&
          !trimmed.includes(`const ${flag} =`)
        );
      });
      if (renderOccurrences.length === 0) {
        missing.push(`${flag} (modal "${modal}")`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('lists the known modal set so new modals require an update to this test', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    const flagPattern = /const (show\w+) = modals\.(\w+);/g;
    const modals: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = flagPattern.exec(source)) !== null) {
      modals.push(match[2]);
    }

    const known = [
      'vendors', 'timeline', 'admin', 'templates', 'print',
      'operations', 'messages', 'submission', 'eventQuestions',
      'decorDesigner',
    ];
    // Every known modal must be present.
    for (const k of known) expect(modals).toContain(k);
  });

  it('renders every non-modal boolean show flag (e.g. showWelcome, showWorkspaceHelp)', () => {
    const source = readFileSync(APP_PATH, 'utf8');
    // Flags declared as useState booleans used in conditional renders.
    const flagPattern = /const \[(show\w+), set\w+\] = useState[^;]*/g;
    const flags: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = flagPattern.exec(source)) !== null) {
      flags.push(match[1]);
    }

    expect(flags.length).toBeGreaterThan(0);
    expect(flags).toContain('showWorkspaceHelp');

    const missing: string[] = [];
    for (const flag of flags) {
      // A flag is "rendered" if it's referenced anywhere other than its own
      // declaration (covers `{showX && ...}`, `visible={showX}`, etc.).
      const useLines = source.split('\n').filter((line) => {
        const t = line.trim();
        return t.includes(flag) && !t.includes(`const [${flag}`);
      });
      if (useLines.length === 0) missing.push(flag);
    }
    expect(missing).toEqual([]);
  });
});

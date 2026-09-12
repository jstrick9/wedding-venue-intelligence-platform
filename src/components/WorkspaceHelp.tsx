import { getConfig } from '../config';

interface WorkspaceHelpProps {
  onClose: () => void;
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Ctrl/Cmd', 'Z'], label: 'Undo' },
  { keys: ['Ctrl/Cmd', 'Shift', 'Z'], label: 'Redo' },
  { keys: ['Ctrl/Cmd', 'Y'], label: 'Redo' },
  { keys: ['Delete', 'Backspace'], label: 'Delete selected item' },
  { keys: ['Ctrl/Cmd', 'D'], label: 'Duplicate selected item' },
  { keys: ['P'], label: 'Toggle properties panel' },
  { keys: ['?'], label: 'Open this shortcut guide' },
  { keys: ['Esc'], label: 'Deselect / close' },
  { keys: ['Enter', 'Space'], label: 'Select focused canvas item' },
  { keys: ['← ↑ → ↓'], label: 'Nudge selected item (Shift = 1 ft)' },
  { keys: ['Ctrl/Cmd', '+ mouse wheel'], label: 'Zoom (anchored to cursor)' },
  { keys: ['Shift', 'drag'], label: 'Pan the canvas' },
  { keys: ['Ctrl/Cmd', '1'], label: 'Reset view to venue' },
  { keys: ['Ctrl/Cmd', '0'], label: 'Reset view to canvas' },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center gap-0.5 rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700">
      {children}
    </kbd>
  );
}

/**
 * Keyboard-shortcuts / workspace help modal. The Help buttons across the app
 * set a flag that was never rendered, so this makes that flag useful.
 */
export function WorkspaceHelp({ onClose }: WorkspaceHelpProps) {
  const config = getConfig();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 text-white flex items-center justify-between" style={{ backgroundColor: config.primaryColor }}>
          <h2 className="text-lg font-bold">⌨️ Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="rounded-full p-1.5 hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-2.5 max-h-[70vh] overflow-y-auto">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700">{s.label}</span>
              <span className="flex items-center gap-1 shrink-0">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </div>
          ))}
          <div className="pt-3 border-t border-gray-200 text-xs text-gray-500">
            Tip: You can drag or select tables and venue items from Layout Tools, then place them on the canvas. Venue layouts show configured seating and venue maximums; guest assignment stays in the Couple Portal.
          </div>
        </div>
      </div>
    </div>
  );
}

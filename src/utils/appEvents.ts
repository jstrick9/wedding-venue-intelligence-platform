/**
 * Centralized, typed application event bus.
 *
 * Why this exists
 * ---------------
 * Components used to call `window.dispatchEvent(new CustomEvent('spm_*'))` directly
 * and other components subscribed via raw `window.addEventListener('spm_*', ...)`.
 * Because both sides were stringly typed, it was impossible for the compiler to
 * tell us when a dispatcher had no listener — that gap caused the
 * "Open Decor Designer" button to silently do nothing for an entire release.
 *
 * Rules
 * -----
 *  - Add every cross-component `window` event to {@link AppEventMap}.
 *  - Use {@link emit} to dispatch and {@link on} to subscribe — never raw
 *    `window.dispatchEvent` / `window.addEventListener` for `spm_*` events.
 *  - Detail payloads are typed; `void` means "no payload".
 *
 * The runtime behavior is intentionally unchanged from the previous raw
 * `CustomEvent` approach so that legacy listeners (in tests, third-party
 * extensions, etc.) keep working during incremental migration.
 */

/**
 * Reasons a `spm_data_changed` event may fire.
 *
 * This is a strict union of the canonical persistence domains from the backup /
 * entity registry (`src/utils/backupDomains.ts`) plus the two control values
 * (`all`, `backend_hydrated`). Keeping it strict means the typed event bus can no
 * longer carry an arbitrary domain string that silently fails to match the
 * backend pushDomain lookup — the class of split-brain bug where admin edits
 * ("chairs", "spacing", "venue-map", "couples", "couple-chat") were emitted with
 * names that did not match any registry key and were never mirrored to Supabase.
 *
 * If you add a new persistent domain, add it to `BACKUP_DOMAINS` AND to this
 * union so the bus, the backup registry, and the entity repository stay aligned.
 */
export type DataChangedSource = 'local' | 'backend';

export type DataChangedType =
  | 'all'
  | 'backend_hydrated'
  | 'config'
  | 'venues'
  | 'tableSpecs'
  | 'fixtureTypes'
  | 'guidelines'
  | 'templates'
  | 'users'
  | 'linenColors'
  | 'chairSpecs'
  | 'wallStyles'
  | 'spacingSettings'
  | 'alignmentSettings'
  | 'indoorFeatureTemplates'
  | 'outdoorFeatureTemplates'
  | 'savedLayouts'
  | 'decorItems'
  | 'decorCategories'
  | 'decorArrangements'
  | 'decorPackages'
  | 'eventRoles'
  | 'eventQuestions'
  | 'eventAnswers'
  | 'eventSubmissions'
  | 'directMessages'
  | 'coupleChatRead'
  | 'communicationTemplates'
  | 'operationsSettings'
  | 'securitySettings'
  | 'orgInvites'
  | 'portalConfig'
  | 'portalGuests'
  | 'coupleEvents'
  | 'coupleAnswers'
  | 'coupleSubmissions'
  | 'coupleMessages'
  | 'coupleGuests'
  | 'couplePortalConfigs'
  | 'venueMapConfigs'
  | 'venueRules'
  | 'venueWeather'
  | 'coupleChecklists'
  | 'coupleVendors'
  | 'coupleSetupTasks'
  | 'weddingPackages'
  | 'packageAddOns'
  | 'coupleGuestEvents'
  | 'venueCalendarEvents'
  | 'rsvpSubmissions'
  | 'staffTasks'
  | 'staffAreas'
  | 'staffShifts'
  | 'vendors'
  | 'vendorCategories'
  | 'vendorPayments'
  | 'timelines'
  | 'rbacRoles'
  | 'rbacGroups'
  | 'rbacAudit';


/** Payload for the `spm_storage_error` event emitted by the versioned storage layer. */
export interface StorageErrorDetail {
  /** localStorage key that triggered the error. */
  key: string;
  /** Human-readable error message. */
  error: string;
  /** Whether the failure happened during a `save` or `load` operation. */
  action: 'save' | 'load';
  /** ISO 8601 timestamp of the failure. */
  timestamp: string;
}

/** Payload for the `spm_cloud_sync_error` event emitted by the backend-sync hooks. */
export interface CloudSyncErrorDetail {
  /** What was being synced: `'entities'` (catalog domains), `'layouts'`, or a specific domain key. */
  domain: 'entities' | 'layouts' | (string & {});
  /** Human-readable error message. */
  error: string;
  /** ISO 8601 timestamp of the failure. */
  timestamp: string;
}

/** Snapshot pushed by the layout to the undo/redo stack. */
export interface UndoSnapshot {
  tables: unknown[];
  fixtures: unknown[];
  decor: unknown[];
  ceremonyRows?: unknown[];
  timestamp: number;
}

/**
 * The single source of truth for every `spm_*` event flowing through `window`.
 * Add new events here; the compiler will then guide every emitter & subscriber.
 */
export interface AppEventMap {
  /** Open the floating Vendor panel modal. */
  spm_open_vendors: void;
  /** Open the floating Timeline panel modal. */
  spm_open_timeline: void;
  /** Open the Operations Studio panel. */
  spm_open_ops: void;
  /** Open the Portal Chat & Direct Messages panel. */
  spm_open_chat: void;
  /** Open the Decor Designer; optionally preload an existing arrangement. */
  spm_open_decor_designer: { arrangementId?: string } | void;
  /** Open the workspace help / shortcuts modal. */
  spm_open_workspace_help: void;
  /** Some persisted store mutated; subscribers should refresh from `localStorage`. */
  spm_data_changed: { type: DataChangedType; source?: DataChangedSource } | void;
  /** A new undo snapshot is available for the undo/redo stack. */
  spm_push_undo_snapshot: UndoSnapshot;
  /** The working layout was replaced (venue switch / load-layout / load-template);
   *  undo history must be cleared so Undo can't restore a different layout. */
  spm_clear_undo_history: void;
/**
 * The versioned storage layer hit a save/load error (e.g. quota exceeded,
 * corrupt JSON). Subscribers (e.g. a global toast) should surface it to the user.
 */
  spm_storage_error: StorageErrorDetail;
  /**
   * A cloud (Supabase) sync push failed after a local write succeeded. The
   * user's change is safe locally but did NOT reach the shared backend —
   * subscribers must surface it (Review #245 P2-F: never fail silently).
   */
  spm_cloud_sync_error: CloudSyncErrorDetail;
  /** Navigate AdminPanel directly to a specific category tab. */
  spm_open_admin_tab: string;
  /** Navigate VenueDashboard directly to an inline section (ops, vendors, timeline, etc.). */
  spm_dashboard_open_section: string;
  /** Return VenueDashboard to the home section. */
  spm_dashboard_go_home: void;
}

export type AppEventName = keyof AppEventMap;

/**
 * Strongly-typed dispatcher. The compiler verifies that the payload shape
 * matches what {@link AppEventMap} declares for the given event name.
 *
 * @example
 *   emit('spm_open_decor_designer', { arrangementId: 'abc' });
 *   emit('spm_open_vendors');
 */
export function emit<K extends AppEventName>(
  ...args: AppEventMap[K] extends void
    ? [name: K]
    : [name: K, detail: AppEventMap[K]]
): void {
  const [name, detail] = args as [K, AppEventMap[K] | undefined];
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Strongly-typed subscriber. Returns an unsubscribe function — useful inside
 * `useEffect` cleanups to avoid `removeEventListener` boilerplate.
 *
 * @example
 *   useEffect(() => on('spm_open_decor_designer', (detail) => {
 *     setEditingArrangementId(detail?.arrangementId);
 *     setShowDecorDesigner(true);
 *   }), []);
 */
export function on<K extends AppEventName>(
  name: K,
  handler: (detail: AppEventMap[K] extends void ? undefined : AppEventMap[K]) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    handler(detail as never);
  };
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

/**
 * Convenience wrapper for the most common `spm_data_changed` pattern.
 * Equivalent to `emit('spm_data_changed', { type })` but reads better at the
 * many call sites in `useLayoutState.ts` / `data/venueData.ts`.
 */
export function emitDataChanged(
  type: DataChangedType = 'all',
  source?: DataChangedSource,
): void {
  emit('spm_data_changed', source ? { type, source } : { type });
}
